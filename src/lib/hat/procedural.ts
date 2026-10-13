import {
	AdditiveBlending,
	BufferAttribute,
	BufferGeometry,
	Color,
	DoubleSide,
	Group,
	Mesh,
	MeshStandardMaterial,
	Quaternion,
	Sprite,
	SpriteMaterial,
	Vector3,
	type Material
} from 'three';
import { fabricTexture, glowTexture } from './fabric';
import type { Hat, HatInput } from './types';

/**
 * Процедурний капелюх. Висота ≈ 1, основа в нулі, обличчям до +Z.
 *
 * Конус — кільця вершин уздовж хребта, який щокадру перегинається
 * (дихання, хитання, заломлений кінчик). Обличчя — не наліпки, а
 * деформація самої тканини: рот і очниці западають і темнішають, губи,
 * повіки, мішки під очима й брови випинаються.
 *
 * Сітка нерівномірна: спереду, де обличчя, вершин у кілька разів густіше,
 * ніж на спині, — інакше на око припадало п’ять вершин і воно було
 * кутастою плямою.
 */

const H = 1.0;
const BASE_Y = 0.035;
const R0 = 0.29;
const BRIM_IN = 0.24;
const BRIM_OUT = 0.62;

const MOUTH_T = 0.235;
const MOUTH_W = 0.62; // напівширина рота, радіани по колу
const MOUTH_H = 0.045; // одиниця висоти рота по t
const EYE_T = 0.405;
const EYE_A = 0.4;
const EYE_W = 0.2;
const EYE_H = 0.03;

/** колір тканини всередині рота й очниць */
const MOUTH_EDGE = [0.36, 0.12, 0.09];
const MOUTH_DEEP = [0.09, 0.025, 0.02];
const SOCKET = [0.06, 0.04, 0.035];

const gauss = (x: number) => Math.exp(-x * x);
const smooth = (a: number, b: number, x: number) => {
	const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
	return t * t * (3 - 2 * t);
};

/** Розподіл кривини по хребту: різкий залом і плавне провисання кінчика */
function curvature(t: number) {
	return 2.6 * gauss((t - 0.56) / 0.045) + smooth(0.6, 1, t) * 1.3;
}

/** Висота кільця: половина кілець — на смугу обличчя 0.12…0.5 */
function ringT(s: number) {
	if (s < 0.12) return s;
	if (s < 0.62) return 0.12 + ((s - 0.12) / 0.5) * 0.38;
	return 0.5 + ((s - 0.62) / 0.38) * 0.5;
}
function ringS(t: number) {
	if (t < 0.12) return t;
	if (t < 0.5) return 0.12 + ((t - 0.12) / 0.38) * 0.5;
	return 0.62 + ((t - 0.5) / 0.5) * 0.38;
}

/** Кут стовпця: нуль спереду, ±π на спині, спереду густіше */
const WARP = 1.55;
function columnA(x: number) {
	return Math.PI * Math.sign(x) * Math.pow(Math.abs(x), WARP);
}
function columnX(a: number) {
	return Math.sign(a) * Math.pow(Math.abs(a) / Math.PI, 1 / WARP);
}

export function proceduralHat(detail: 'high' | 'low' = 'high'): Hat {
	const RINGS = detail === 'high' ? 110 : 72;
	const SEGS = detail === 'high' ? 88 : 56;
	const COLS = SEGS + 1;

	const tOf = Float32Array.from({ length: RINGS }, (_, r) => ringT(r / (RINGS - 1)));
	const aOf = Float32Array.from({ length: COLS }, (_, c) => columnA((2 * c) / SEGS - 1));

	// інтеграл кривини — щоб параметр bend означав повний кут згину
	let curvTotal = 0;
	for (let r = 0; r < RINGS - 1; r++) curvTotal += curvature(tOf[r]) * (tOf[r + 1] - tOf[r]);

	const root = new Group();
	root.name = 'hat';
	const fabric = fabricTexture(detail === 'high' ? 512 : 256);

	// ---------- конус ----------
	const count = RINGS * COLS;
	const positions = new Float32Array(count * 3);
	const colors = new Float32Array(count * 3);
	const uvs = new Float32Array(count * 2);
	const baseRadius = new Float32Array(count);
	const baseShade = new Float32Array(count);
	const sinA = aOf.map(Math.sin);
	const cosA = aOf.map(Math.cos);
	/** вершини, які рухає обличчя */
	const face: number[] = [];

	for (let r = 0; r < RINGS; r++) {
		const t = tOf[r];
		for (let c = 0; c < COLS; c++) {
			const i = r * COLS + c;
			const a = aOf[c];

			let radius = R0 * Math.pow(1 - t, 0.82) + 0.035 * Math.exp(-t / 0.035);
			// залом: тканина збирається складкою
			radius *= 1 + 0.13 * gauss((t - 0.56) / 0.035) * (0.7 + 0.3 * Math.sin(2 * a + 1));
			// горбки й зморшки старого фетру (спереду м’якше, щоб не заважали обличчю)
			const back = 0.5 - 0.5 * Math.cos(a);
			radius *= 1 + 0.035 * Math.sin(3 * a + 6 * t + 0.7) * 4 * t * (1 - t) * (0.4 + 0.6 * back);
			radius *= 1 + 0.02 * Math.sin(7 * a - 11 * t) * (0.2 + 0.8 * back);
			radius *= 1 + 0.04 * gauss((t - 0.32) / 0.025) * back + 0.03 * gauss((t - 0.5) / 0.02) * back;
			// стрічка
			const band = smooth(0.015, 0.03, t) * (1 - smooth(0.095, 0.11, t));
			radius += 0.012 * band;
			baseRadius[i] = radius;

			// темніше знизу й у складках, кінчик вигорілий
			let shade = 0.8 + 0.28 * t;
			shade *= 1 - 0.25 * gauss((t - 0.56) / 0.05);
			shade *= 1 - 0.45 * band;
			baseShade[i] = shade;

			uvs[i * 2] = (a / Math.PI + 1) / 2;
			uvs[i * 2 + 1] = t * 1.6;

			if (Math.abs(a) < 1.25 && t > 0.1 && t < 0.56) face.push(i);
		}
	}

	const index: number[] = [];
	for (let r = 0; r < RINGS - 1; r++) {
		for (let c = 0; c < SEGS; c++) {
			const a = r * COLS + c;
			const b = a + COLS;
			index.push(a, b, a + 1, b, b + 1, a + 1);
		}
	}

	const cone = new BufferGeometry();
	cone.setIndex(index);
	cone.setAttribute('position', new BufferAttribute(positions, 3));
	cone.setAttribute('color', new BufferAttribute(colors, 3));
	cone.setAttribute('uv', new BufferAttribute(uvs, 2));

	const coneMaterial = new MeshStandardMaterial({
		map: fabric,
		bumpMap: detail === 'high' ? fabric : null,
		bumpScale: 1.2,
		vertexColors: true,
		roughness: 0.93,
		metalness: 0,
		side: DoubleSide
	});
	root.add(new Mesh(cone, coneMaterial));

	// ---------- криси ----------
	const BR = detail === 'high' ? 10 : 6;
	const brimPos = new Float32Array(BR * COLS * 3);
	const brimUv = new Float32Array(BR * COLS * 2);
	const brimColor = new Float32Array(BR * COLS * 3);
	const brimIndex: number[] = [];
	for (let r = 0; r < BR; r++) {
		for (let c = 0; c < COLS; c++) {
			const i = r * COLS + c;
			brimUv[i * 2] = (aOf[c] / Math.PI + 1);
			brimUv[i * 2 + 1] = (r / (BR - 1)) * 0.4;
			const shade = 0.7 + 0.25 * (r / (BR - 1));
			brimColor[i * 3] = brimColor[i * 3 + 1] = brimColor[i * 3 + 2] = shade;
		}
	}
	for (let r = 0; r < BR - 1; r++) {
		for (let c = 0; c < SEGS; c++) {
			const a = r * COLS + c;
			const b = a + COLS;
			brimIndex.push(a, a + 1, b, b, a + 1, b + 1);
		}
	}
	const brim = new BufferGeometry();
	brim.setIndex(brimIndex);
	brim.setAttribute('position', new BufferAttribute(brimPos, 3));
	brim.setAttribute('uv', new BufferAttribute(brimUv, 2));
	brim.setAttribute('color', new BufferAttribute(brimColor, 3));
	root.add(new Mesh(brim, coneMaterial));

	// ---------- жаринки-зіниці в очницях ----------
	const emberMaterial = new SpriteMaterial({
		map: glowTexture(64, 0.3),
		color: new Color('#ffb04a'),
		blending: AdditiveBlending,
		depthWrite: false,
		transparent: true
	});
	const haloMaterial = new SpriteMaterial({
		map: glowTexture(64, 0),
		color: new Color('#ff8a2a'),
		blending: AdditiveBlending,
		depthWrite: false,
		transparent: true
	});
	const embers = [new Sprite(emberMaterial), new Sprite(emberMaterial)];
	const halos = [new Sprite(haloMaterial), new Sprite(haloMaterial)];
	[...embers, ...halos].forEach((s) => root.add(s));

	// ---------- кадр анімації ----------
	const spine = Array.from({ length: RINGS }, () => new Vector3());
	const dirs = Array.from({ length: RINGS }, () => new Vector3());
	/** рамка кожного кільця, перенесена вздовж хребта: вигин не повертає обличчя */
	const sides = Array.from({ length: RINGS }, () => new Vector3());
	const fronts = Array.from({ length: RINGS }, () => new Vector3());
	const bendDir = new Vector3();
	const UP = new Vector3(0, 1, 0);
	const X = new Vector3(1, 0, 0);
	const Z = new Vector3(0, 0, 1);
	const turn = new Quaternion();
	const radius = new Float32Array(count);
	const shade = new Float32Array(count);
	/** 0..1 — наскільки вершина «всередині» рота / очниці (для кольору) */
	const mouthIn = new Float32Array(count);
	const socketIn = new Float32Array(count);

	function buildSpine(bend: number, yaw: number, lean: number) {
		// yaw — куди падає кінчик (назад і вбік), обличчя лишається спереду
		bendDir.set(Math.sin(yaw), 0, -Math.cos(yaw));
		let angle = -lean;
		spine[0].set(0, BASE_Y, 0);
		for (let r = 0; r < RINGS; r++) {
			const dt = r < RINGS - 1 ? tOf[r + 1] - tOf[r] : 0;
			dirs[r].copy(UP).multiplyScalar(Math.cos(angle)).addScaledVector(bendDir, Math.sin(angle));
			turn.setFromUnitVectors(UP, dirs[r]);
			sides[r].copy(X).applyQuaternion(turn);
			fronts[r].copy(Z).applyQuaternion(turn);
			if (r > 0) spine[r].copy(spine[r - 1]).addScaledVector(dirs[r - 1], (tOf[r] - tOf[r - 1]) * H);
			angle += (bend * curvature(tOf[r]) * dt) / curvTotal;
		}
	}

	/** Обличчя: рот із щелепою, губи, щоки, очниці з повіками, мішки й брови */
	function shapeFace(input: HatInput) {
		radius.set(baseRadius);
		shade.set(baseShade);
		mouthIn.fill(0);
		socketIn.fill(0);

		const open = Math.min(1, input.mouth);
		const wide = input.wide;
		const mw = MOUTH_W * (0.86 + 0.28 * wide);
		const jaw = -0.5 * open; // нижня губа йде вниз сильніше за верхню
		// повіки: сплячі заплющені, прокинутий — широко, кліпання закриває
		const lid = (1 - input.blink) * (0.3 + 0.7 * input.awake);
		const browLift = 0.35 * input.talk * open - 0.4 * input.blink + 0.2 * input.awake;

		for (const i of face) {
			const r = Math.floor(i / COLS);
			const c = i - r * COLS;
			const t = tOf[r];
			const a = aOf[c];
			let dr = 0;
			let dark = 0;

			// ----- рот -----
			const du = a / mw;
			if (Math.abs(du) < 1.5) {
				const w = Math.max(0, 1 - du * du);
				const lip = 0.32 * du * du + 0.1 * du; // куточки вгору, одна трохи вища — хитра усмішка
				const d = (t - MOUTH_T) / MOUTH_H - lip - jaw;
				const h = (0.08 + open * (1.3 - 0.5 * wide)) * Math.pow(w, 0.65);
				if (Math.abs(d) < h) {
					const k = 1 - (d / h) * (d / h);
					dr -= (0.008 + open * 0.09) * Math.sqrt(k) * Math.sqrt(w);
					// колір входить плавно від краю, інакше на сітці край рота «зубчастий»
					mouthIn[i] = smooth(0, 0.45, k) * Math.min(1, 0.3 + open * 4);
				}
				// складка, коли рот закритий
				dr -= 0.011 * gauss(d / 0.2) * w;
				dark = Math.max(dark, 0.5 * gauss(d / 0.25) * w * (1 - Math.min(1, open * 3)));
				const ww = Math.pow(Math.max(0, 1 - (du / 1.12) ** 2), 0.8);
				dr += 0.026 * gauss((d - h - 0.3) / 0.36) * ww; // верхня губа
				dr += 0.034 * gauss((d + h + 0.34) / 0.4) * ww; // нижня, повніша
				dr += 0.014 * gauss((d + h + 1.4) / 0.5) * w; // підборіддя
				// щоки: носогубні складки, що йдуть від куточків угору
				const fold = Math.abs(du) - 1.12 - 0.12 * d;
				if (d > -2 && d < 3) dr += 0.02 * gauss(fold / 0.13) * gauss((d - 0.5) / 2.2);
			}

			// ----- очі -----
			for (const s of [-1, 1]) {
				const eu = (a - s * EYE_A) / EYE_W;
				if (Math.abs(eu) > 1.6) continue;
				const w = Math.max(0, 1 - eu * eu);
				const ww = Math.pow(Math.max(0, 1 - (eu / 1.2) ** 2), 0.8);
				// внутрішні куточки трохи нижче — мудрий і хитрий погляд
				const ev = (t - EYE_T) / EYE_H + 0.3 * eu * s;
				const h = lid * 0.9 * Math.pow(w, 0.7);
				if (Math.abs(ev) < h) {
					const k = 1 - (ev / h) * (ev / h);
					dr -= 0.03 * Math.sqrt(k) * Math.sqrt(w);
					socketIn[i] = Math.max(socketIn[i], smooth(0, 0.4, k));
				}
				// лінія вій, коли око заплющене
				dr -= 0.012 * gauss(ev / 0.22) * w;
				dark = Math.max(dark, 0.6 * gauss(ev / 0.22) * w * (1 - Math.min(1, lid * 2)));
				dr += 0.024 * gauss((ev - h - 0.38) / 0.34) * ww; // верхня повіка
				dr += 0.022 * gauss((ev + h + 0.48) / 0.4) * ww; // мішок під оком
				dr += 0.008 * gauss((ev + h + 1.2) / 0.25) * ww; // зморшка під мішком
				const wb = Math.pow(Math.max(0, 1 - (eu / 1.4) ** 2), 0.7);
				dr += 0.042 * gauss((ev - h - 1.55 - browLift) / 0.5) * wb; // важка брова
			}

			radius[i] += dr;
			shade[i] *= 1 - dark;
		}
	}

	/** Точка на поверхні за висотою t і кутом a (для жаринок в очах) */
	function surfacePoint(t: number, a: number, lift: number, out: Vector3) {
		const x = ringS(t) * (RINGS - 1);
		const k = Math.min(RINGS - 2, Math.floor(x));
		const f = x - k;
		out.copy(spine[k]).lerp(spine[k + 1], f);
		const side = sides[k];
		const front = fronts[k];
		const c = Math.round(((columnX(a) + 1) / 2) * SEGS);
		const rr = radius[k * COLS + c] * (1 - f) + radius[(k + 1) * COLS + c] * f;
		const sa = Math.sin(a);
		const ca = Math.cos(a);
		out.x += (side.x * sa + front.x * ca) * (rr + lift);
		out.y += (side.y * sa + front.y * ca) * (rr + lift);
		out.z += (side.z * sa + front.z * ca) * (rr + lift);
		return out;
	}

	function writeCone() {
		for (let r = 0; r < RINGS; r++) {
			const p = spine[r];
			const side = sides[r];
			const front = fronts[r];
			for (let c = 0; c < COLS; c++) {
				const i = r * COLS + c;
				const rr = radius[i];
				const sa = sinA[c];
				const ca = cosA[c];
				positions[i * 3] = p.x + (side.x * sa + front.x * ca) * rr;
				positions[i * 3 + 1] = p.y + (side.y * sa + front.y * ca) * rr;
				positions[i * 3 + 2] = p.z + (side.z * sa + front.z * ca) * rr;

				let cr = shade[i];
				let cg = shade[i];
				let cb = shade[i];
				const m = mouthIn[i];
				if (m > 0) {
					// від червонуватих країв до темної глибини
					const deep = Math.min(1, m * 1.3);
					const tr = MOUTH_EDGE[0] + (MOUTH_DEEP[0] - MOUTH_EDGE[0]) * deep;
					const tg = MOUTH_EDGE[1] + (MOUTH_DEEP[1] - MOUTH_EDGE[1]) * deep;
					const tb = MOUTH_EDGE[2] + (MOUTH_DEEP[2] - MOUTH_EDGE[2]) * deep;
					const k = Math.min(1, m * 2);
					cr += (tr - cr) * k;
					cg += (tg - cg) * k;
					cb += (tb - cb) * k;
				}
				const e = socketIn[i];
				if (e > 0) {
					cr += (SOCKET[0] - cr) * e;
					cg += (SOCKET[1] - cg) * e;
					cb += (SOCKET[2] - cb) * e;
				}
				colors[i * 3] = cr;
				colors[i * 3 + 1] = cg;
				colors[i * 3 + 2] = cb;
			}
		}
		cone.attributes.position.needsUpdate = true;
		cone.attributes.color.needsUpdate = true;
		cone.computeVertexNormals();
		// шов на спині: перший і останній стовпці — ті самі точки, нормалі усереднюємо
		const n = cone.attributes.normal.array as Float32Array;
		for (let r = 0; r < RINGS; r++) {
			const a = r * COLS * 3;
			const b = (r * COLS + SEGS) * 3;
			for (let k = 0; k < 3; k++) n[a + k] = n[b + k] = (n[a + k] + n[b + k]) / 2;
		}
	}

	function writeBrim(time: number) {
		for (let r = 0; r < BR; r++) {
			const u = r / (BR - 1);
			for (let c = 0; c < COLS; c++) {
				const i = r * COLS + c;
				const a = aOf[c];
				const rad = (BRIM_IN + (BRIM_OUT - BRIM_IN) * u) * (1 + 0.045 * Math.sin(3 * a + 0.4) * u * u);
				const y =
					0.03 -
					0.07 * u * u +
					0.06 * Math.cos(2 * a) * u * u * u + // боки загнуті вгору, перед і зад униз
					0.022 * Math.sin(2 * a + 1.1 + time * 0.7) * u * u;
				brimPos[i * 3] = Math.sin(a) * rad;
				brimPos[i * 3 + 1] = y;
				brimPos[i * 3 + 2] = Math.cos(a) * rad;
			}
		}
		brim.attributes.position.needsUpdate = true;
		brim.computeVertexNormals();
	}

	const tmp = new Vector3();
	function update(input: HatInput) {
		const time = input.time;
		const bend = 2.0 + 0.14 * Math.sin(time * 0.9) + 0.22 * input.talk * input.mouth;
		const yaw = 1.05 + 0.22 * Math.sin(time * 0.55) + 0.06 * Math.sin(time * 1.7);
		const lean = 0.05 * input.talk + 0.04 * input.mouth;
		buildSpine(bend, yaw, lean);
		shapeFace(input);
		writeCone();
		writeBrim(time);

		// жаринки сидять над дном очниць (rr уже з западиною), нижче за її краї і трохи «дивляться» навколо
		const lid = (1 - input.blink) * (0.3 + 0.7 * input.awake);
		const glow = input.awake * lid * (0.75 + 0.25 * input.mouth);
		const gaze = 0.035 * Math.sin(time * 0.6) + 0.015 * Math.sin(time * 2.3);
		for (let k = 0; k < 2; k++) {
			const s = k ? 1 : -1;
			surfacePoint(EYE_T + 0.002, s * EYE_A + gaze, 0.006, tmp);
			embers[k].position.copy(tmp);
			halos[k].position.copy(tmp);
			const size = 0.034 + 0.012 * input.mouth;
			embers[k].scale.set(size, size * Math.max(0.15, lid), 1);
			halos[k].scale.set(size * 2.8, size * 2.2 * Math.max(0.2, lid), 1);
			embers[k].visible = halos[k].visible = glow > 0.02;
		}
		emberMaterial.opacity = glow;
		haloMaterial.opacity = glow * 0.45;
	}

	update({ time: 0, dt: 0, mouth: 0, wide: 0.5, talk: 0, blink: 0, awake: 0 });

	const materials: Material[] = [coneMaterial, emberMaterial, haloMaterial];
	return {
		root,
		materials,
		update,
		dispose() {
			cone.dispose();
			brim.dispose();
			fabric.dispose();
			coneMaterial.dispose();
			emberMaterial.map?.dispose();
			emberMaterial.dispose();
			haloMaterial.map?.dispose();
			haloMaterial.dispose();
		}
	};
}
