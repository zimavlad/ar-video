import {
	AdditiveBlending,
	CanvasTexture,
	Color,
	DirectionalLight,
	Group,
	HemisphereLight,
	Matrix4,
	Mesh,
	MeshBasicMaterial,
	PlaneGeometry,
	Plane,
	Quaternion,
	Sprite,
	SpriteMaterial,
	MeshStandardMaterial,
	Vector2,
	Vector3,
	type PerspectiveCamera,
	type Scene,
	type WebGLRenderer
} from 'three';
import { glowTexture } from './fabric';
import { Particles } from './fx';
import { cardFrame, hatPose, type CardFrame, type HatPose } from './pose';
import type { Hat } from './types';
import type { MouthShape } from '$lib/voice';

export type Tier = 'high' | 'low';

/**
 * Спільна сцена капелюха для AR і для запасного режиму.
 *
 *   fxSpace   — поза капелюха над листівкою (згладжена), масштаб = висота капелюха
 *     hatSpace — поява: виринає вздовж нормалі листівки й докручується
 *       bob    — дихання, хитання, нахил на наголосах
 *         hat.root
 *   cardSpace — площина QR: тінь і світний «портал»
 *
 * Капелюх «вилазить» з паперу завдяки площині відсікання по листівці;
 * коли виліз — площину відводимо, щоб нічого не обрізалось.
 */
export class Stage {
	private fxSpace = new Group();
	private hatSpace = new Group();
	private bob = new Group();
	private cardSpace = new Group();
	private card: CardFrame = { center: new Vector3(), normal: new Vector3(0, 0, 1), up: new Vector3(0, 1, 0), width: 1 };
	private cardQuat = new Quaternion();
	private raw: CardFrame = { center: new Vector3(), normal: new Vector3(), up: new Vector3(), width: 1 };
	private rawQuat = new Quaternion();
	private pose: HatPose = { position: new Vector3(), quaternion: new Quaternion(), stand: 0 };
	private hasCard = false;
	private clip = new Plane();
	private sparks: Particles;
	private smoke: Particles;
	private shadow: Mesh;
	private portal: Mesh;
	private lights: Group;

	private time = 0;
	private emergeAt = -1;
	private talk = 0;
	private mouth = 0;
	private wide = 0.5;
	/** світіння «торкнись мене» 0..1, поки людина не торкнулась */
	private beckon = 0;
	private halo: Sprite;
	private blinkAt = 3;
	private awake = 0;
	private sparkDebt = 0;
	/** чекає дотику: очі заплющені, дихає повільно, світиться */
	private sleeping = true;
	private tier: Tier;

	/** ширина листівки, у висотах капелюха */
	constructor(
		private scene: Scene,
		private camera: PerspectiveCamera,
		private renderer: WebGLRenderer,
		readonly hat: Hat,
		tier: Tier,
		private hatScale = 0.78
	) {
		this.tier = tier;
		renderer.localClippingEnabled = true;
		this.clip.set(new Vector3(0, 0, 1), 1e9);
		for (const m of hat.materials) m.clippingPlanes = [this.clip];

		this.lights = new Group();
		const hemi = new HemisphereLight(0xfff1dc, 0x2a2030, 1.4);
		const key = new DirectionalLight(0xffe2b8, 2.4);
		key.position.set(-1.5, 2.5, 2);
		const rim = new DirectionalLight(0x9fb8ff, 1.3);
		rim.position.set(1.5, 1.2, -2);
		this.lights.add(hemi, key, rim);
		scene.add(this.lights);

		this.bob.add(hat.root);
		this.hatSpace.add(this.bob);
		this.fxSpace.add(this.hatSpace);
		this.fxSpace.visible = false;
		this.cardSpace.visible = false;
		scene.add(this.fxSpace, this.cardSpace);

		const soft = glowTexture(64);
		this.sparks = new Particles(tier === 'high' ? 160 : 60, {
			color: '#ffd27a',
			map: glowTexture(32, 0.25),
			additive: true,
			lift: 0.35,
			drag: 1.6,
			grow: 0.4
		});
		this.smoke = new Particles(tier === 'high' ? 30 : 12, {
			color: '#c9bcd8',
			map: soft,
			lift: 0.12,
			drag: 2.2,
			grow: 3.2,
			fadeIn: 0.15,
			opacity: 0.55
		});
		this.fxSpace.add(this.sparks.points, this.smoke.points);

		this.shadow = new Mesh(
			new PlaneGeometry(1, 1),
			new MeshBasicMaterial({ map: soft, color: 0x000000, transparent: true, opacity: 0, depthWrite: false })
		);
		this.portal = new Mesh(
			new PlaneGeometry(1, 1),
			new MeshBasicMaterial({
				map: ringTexture(),
				color: new Color('#ffcf6b'),
				transparent: true,
				opacity: 0,
				blending: AdditiveBlending,
				depthWrite: false
			})
		);
		this.cardSpace.add(this.shadow, this.portal);

		// м’яке сяйво за капелюхом, поки він чекає дотику
		this.halo = new Sprite(
			new SpriteMaterial({ map: soft, color: new Color('#ffc768'), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false })
		);
		this.halo.position.set(0, 0.5, -0.7);
		this.halo.renderOrder = -1;
		this.fxSpace.add(this.halo);
	}

	/** Сира поза листівки з трекера; null — листівки в кадрі немає (тримаємо останню) */
	setCard(matrix: Matrix4 | null, dt: number) {
		if (!matrix) return;
		cardFrame(matrix, this.raw);
		matrix.decompose(tmpV, this.rawQuat, tmpS);
		if (!this.hasCard) {
			this.card.center.copy(this.raw.center);
			this.card.width = this.raw.width;
			this.cardQuat.copy(this.rawQuat);
			this.hasCard = true;
		} else {
			// кути вже пройшли фільтр One Euro; поворот гасимо сильніше за позицію —
			// саме кут нахилу найбільше тремтить на маленькому QR
			const k = 1 - Math.exp(-dt * 12);
			this.card.center.lerp(this.raw.center, k);
			this.card.width += (this.raw.width - this.card.width) * k;
			this.cardQuat.slerp(this.rawQuat, 1 - Math.exp(-dt * 5));
		}
		this.card.normal.set(0, 0, 1).applyQuaternion(this.cardQuat);
		this.card.up.set(0, 1, 0).applyQuaternion(this.cardQuat);
	}

	get ready() {
		return this.hasCard;
	}

	get emerged() {
		return this.emergeAt >= 0;
	}

	emerge() {
		if (this.emergeAt >= 0) return;
		this.emergeAt = this.time;
		this.fxSpace.visible = true;
		this.cardSpace.visible = true;
		this.puff(1);
	}

	/** Іскри й димок біля основи: при появі й на «Ще раз» */
	puff(strength: number) {
		const p = new Vector3();
		const v = new Vector3();
		const sparks = Math.round((this.tier === 'high' ? 90 : 35) * strength);
		for (let i = 0; i < sparks; i++) {
			const a = Math.random() * Math.PI * 2;
			const r = 0.25 + Math.random() * 0.4;
			p.set(Math.sin(a) * r, 0.02, Math.cos(a) * r);
			// по спіралі вгору
			v.set(Math.cos(a) * 0.5 + Math.sin(a) * 0.3, 0.6 + Math.random() * 1.4, -Math.sin(a) * 0.5 + Math.cos(a) * 0.3);
			this.sparks.emit(p, v, 0.8 + Math.random() * 1.1, 0.025 + Math.random() * 0.03);
		}
		const puffs = Math.round((this.tier === 'high' ? 22 : 9) * strength);
		for (let i = 0; i < puffs; i++) {
			const a = (i / puffs) * Math.PI * 2 + Math.random() * 0.3;
			p.set(Math.sin(a) * 0.35, 0.03, Math.cos(a) * 0.35);
			v.set(Math.sin(a) * 0.9, 0.15 + Math.random() * 0.35, Math.cos(a) * 0.9);
			this.smoke.emit(p, v, 1.3 + Math.random() * 0.8, 0.22 + Math.random() * 0.12);
		}
	}

	/** Дотик «розбудити»: розплющує очі, трохи іскор */
	wake() {
		if (!this.sleeping) return;
		this.sleeping = false;
		this.blinkAt = this.time + 2;
		if (this.emergeAt >= 0) this.puff(0.35);
	}

	setTier(tier: Tier) {
		this.tier = tier;
	}

	/**
	 * @param mouth відкритість рота з голосу
	 * @param talking голос грає
	 */
	update(dt: number, mouth: MouthShape, talking: boolean) {
		this.time += dt;
		const t = this.time;

		this.talk += ((talking ? 1 : 0) - this.talk) * (1 - Math.exp(-dt * 3));
		this.mouth += (mouth.open - this.mouth) * (1 - Math.exp(-dt * 30));
		this.wide += (mouth.wide - this.wide) * (1 - Math.exp(-dt * 18));
		this.beckon += ((this.sleeping ? 1 : 0) - this.beckon) * (1 - Math.exp(-dt * 3));

		if (!this.hasCard || this.emergeAt < 0) {
			this.sparks.update(dt);
			this.smoke.update(dt);
			return;
		}

		// поза над листівкою
		const size = this.card.width * this.hatScale;
		this.camera.getWorldPosition(camPos);
		camUp.set(0, 1, 0).applyQuaternion(this.camera.getWorldQuaternion(camQ));
		hatPose(this.card, camPos, camUp, size, 0.62, this.pose);
		this.fxSpace.position.copy(this.pose.position);
		this.fxSpace.quaternion.copy(this.pose.quaternion);
		this.fxSpace.scale.setScalar(size);

		// поява: 1.6 с, з перельотом і докручуванням
		const e = Math.min(1, (t - this.emergeAt) / 1.6);
		const rise = easeOutBack(e);
		localN.copy(this.card.normal).applyQuaternion(invQ.copy(this.pose.quaternion).invert());
		this.hatSpace.position.copy(localN).multiplyScalar(-(1 - rise) * 1.25);
		this.hatSpace.quaternion.setFromAxisAngle(Y, (1 - easeOutCubic(e)) * -1.4);
		const pop = 0.55 + 0.45 * easeOutBack(Math.min(1, e * 1.3));
		this.hatSpace.scale.set(pop, pop * (1 + 0.12 * Math.sin(e * Math.PI)), pop);

		if (e < 1) {
			// площина паперу трохи нижче листівки, щоб криси не різались на дотику
			this.clip.setFromNormalAndCoplanarPoint(this.card.normal, tmpV.copy(this.card.center).addScaledVector(this.card.normal, -0.003 * this.card.width));
		} else {
			this.clip.set(this.card.normal, 1e9);
		}

		// дихання, хитання, нахил на наголосах
		const deep = this.sleeping ? 1.6 : 1;
		const breath = Math.sin((t * Math.PI * 2) / (this.sleeping ? 4.6 : 3.6));
		this.bob.scale.set(1 - 0.012 * deep * breath, 1 + 0.024 * deep * breath, 1 - 0.012 * deep * breath);
		this.bob.rotation.z = 0.045 * Math.sin(t * 0.7) + 0.02 * Math.sin(t * 1.9);
		this.bob.rotation.x = -0.06 * this.talk * this.mouth + 0.025 * Math.sin(t * 0.5);
		this.bob.rotation.y = 0.08 * Math.sin(t * 0.33) * (1 - 0.5 * this.talk);

		// кліпання
		let blink = this.sleeping ? 1 : 0;
		if (!this.sleeping && t > this.blinkAt) {
			const k = (t - this.blinkAt) / 0.17;
			blink = k < 1 ? Math.sin(k * Math.PI) : 0;
			if (k >= 1) this.blinkAt = t + 2.2 + Math.random() * 3.5;
		}
		this.awake += ((e > 0.55 && !this.sleeping ? 1 : 0) - this.awake) * (1 - Math.exp(-dt * 4));

		this.hat.update({ time: t, dt, mouth: this.mouth, wide: this.wide, talk: this.talk, blink, awake: this.awake });

		// «торкнись мене»: пульсує сяйво, тканина ледь жевріє, іскри кружляють
		const pulse = 0.5 + 0.5 * Math.sin(t * 2.6);
		const glow = this.beckon * easeOutCubic(e);
		(this.halo.material as SpriteMaterial).opacity = glow * (0.22 + 0.18 * pulse);
		this.halo.scale.setScalar(2.2 + 0.3 * pulse);
		for (const m of this.hat.materials) {
			const standard = m as MeshStandardMaterial;
			if (!standard.isMeshStandardMaterial) continue;
			standard.emissive.setRGB(1, 0.62, 0.25);
			standard.emissiveIntensity = glow * (0.015 + 0.035 * pulse);
		}
		if (glow > 0.05 && Math.random() < dt * (this.tier === 'high' ? 6 : 2)) {
			const a = Math.random() * Math.PI * 2;
			tmpV.set(Math.sin(a) * 0.62, 0.1 + Math.random() * 0.8, Math.cos(a) * 0.62);
			tmpS.set(Math.cos(a) * 0.25, 0.15 + Math.random() * 0.2, -Math.sin(a) * 0.25);
			this.sparks.emit(tmpV, tmpS, 1.4 + Math.random(), 0.02 + Math.random() * 0.02);
		}

		// поки говорить — зрідка іскра з-під крисів
		this.sparkDebt += dt * this.talk * (this.tier === 'high' ? 10 : 3) * (0.3 + this.mouth);
		while (this.sparkDebt > 1) {
			this.sparkDebt -= 1;
			const a = Math.random() * Math.PI * 2;
			tmpV.set(Math.sin(a) * 0.55, 0.05, Math.cos(a) * 0.55);
			tmpS.set(Math.sin(a) * 0.1, 0.4 + Math.random() * 0.5, Math.cos(a) * 0.1);
			this.sparks.emit(tmpV, tmpS, 1 + Math.random(), 0.018 + Math.random() * 0.02);
		}

		// тінь і портал лежать на папері під капелюхом
		this.cardSpace.position.copy(this.card.center);
		this.cardSpace.quaternion.copy(this.cardQuat);
		this.cardSpace.scale.setScalar(this.card.width);
		tmpV.copy(this.pose.position).sub(this.card.center).applyQuaternion(invQ.copy(this.cardQuat).invert()).divideScalar(this.card.width);
		// висить перед листівкою — тінь падає нижче й ширше
		const s = this.hatScale;
		this.shadow.position.set(tmpV.x, tmpV.y - 0.1 * (1 - this.pose.stand) * s, 0.002);
		this.shadow.scale.set(s * 1.5, s * (0.9 + 0.5 * this.pose.stand), 1);
		(this.shadow.material as MeshBasicMaterial).opacity = 0.42 * easeOutCubic(e) * (0.6 + 0.4 * this.pose.stand);
		this.portal.position.set(tmpV.x, tmpV.y, 0.003);
		const ring = easeOutCubic(Math.min(1, e * 1.4));
		this.portal.scale.setScalar(s * (0.4 + 1.3 * ring));
		(this.portal.material as MeshBasicMaterial).opacity = Math.sin(Math.min(1, e * 1.2) * Math.PI) * 0.9;

		// розмір частинок: пікселі на одиницю fxSpace на відстані 1
		this.renderer.getDrawingBufferSize(buffer);
		const ppu = this.camera.projectionMatrix.elements[5] * (buffer.y / 2) * size;
		this.sparks.setScale(ppu);
		this.smoke.setScale(ppu);
		this.sparks.update(dt);
		this.smoke.update(dt);
	}

	dispose() {
		this.scene.remove(this.fxSpace, this.cardSpace, this.lights);
		this.hat.dispose();
		this.sparks.dispose();
		this.smoke.dispose();
		for (const mesh of [this.shadow, this.portal]) {
			mesh.geometry.dispose();
			const material = mesh.material as MeshBasicMaterial;
			material.map?.dispose();
			material.dispose();
		}
	}
}

const Y = new Vector3(0, 1, 0);
const tmpV = new Vector3();
const tmpS = new Vector3();
const camPos = new Vector3();
const camUp = new Vector3();
const camQ = new Quaternion();
const localN = new Vector3();
const invQ = new Quaternion();
const buffer = new Vector2();

function easeOutBack(x: number) {
	const c1 = 1.70158;
	const c3 = c1 + 1;
	return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function easeOutCubic(x: number) {
	return 1 - Math.pow(1 - x, 3);
}

function ringTexture(size = 128): CanvasTexture {
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = size;
	const ctx = canvas.getContext('2d')!;
	const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
	g.addColorStop(0, 'rgba(255,255,255,0.18)');
	g.addColorStop(0.55, 'rgba(255,255,255,0.1)');
	g.addColorStop(0.72, 'rgba(255,255,255,1)');
	g.addColorStop(0.8, 'rgba(255,255,255,0.25)');
	g.addColorStop(1, 'rgba(255,255,255,0)');
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, size, size);
	return new CanvasTexture(canvas);
}
