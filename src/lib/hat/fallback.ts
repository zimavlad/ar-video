import { Matrix4, PerspectiveCamera, Quaternion, SRGBColorSpace, Scene, Vector3, WebGLRenderer } from 'three';
import { glowTexture } from './fabric';
import { Particles } from './fx';
import type { Tier } from './stage';

/**
 * Запасна сцена без камери: капелюх на темному тлі, той самий голос і рух.
 * Якір — невидима «підлога», капелюх вилазить з неї так само, як із QR.
 * Тло — CSS під прозорим полотном. Камеру можна трохи покрутити пальцем.
 */

export interface FallbackHost {
	scene: Scene;
	camera: PerspectiveCamera;
	renderer: WebGLRenderer;
	/** поза якоря для Stage.setCard: підлога, ширина = 1 / hatScale (капелюх заввишки 1) */
	anchor: Matrix4;
	tick: (dt: number) => void;
	stop: () => void;
}

export function startFallback(container: HTMLElement, tier: Tier, hatScale: number): FallbackHost {
	const renderer = new WebGLRenderer({ antialias: tier === 'high', alpha: true });
	renderer.outputColorSpace = SRGBColorSpace;
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier === 'high' ? 2 : 1.25));
	renderer.setClearColor(0x000000, 0);
	Object.assign(renderer.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', touchAction: 'none' });
	container.appendChild(renderer.domElement);

	const scene = new Scene();
	const camera = new PerspectiveCamera(34, 1, 0.05, 50);

	const width = 1 / hatScale;
	const anchor = new Matrix4().compose(
		new Vector3(0, 0, 0),
		new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2),
		new Vector3(width, width, width)
	);

	// пил у промені світла
	const dust = new Particles(tier === 'high' ? 70 : 25, {
		color: '#ffdca0',
		map: glowTexture(32, 0.3),
		additive: true,
		lift: 0.004,
		drag: 0.2,
		fadeIn: 0.3
	});
	scene.add(dust.points);
	const emitDust = () => {
		const p = new Vector3((Math.random() - 0.5) * 2.4, Math.random() * 1.6, (Math.random() - 0.5) * 1.6);
		const v = new Vector3((Math.random() - 0.5) * 0.05, 0.02 + Math.random() * 0.03, (Math.random() - 0.5) * 0.05);
		dust.emit(p, v, 5 + Math.random() * 5, 0.006 + Math.random() * 0.01);
	};
	for (let i = 0; i < dust.capacity; i++) emitDust();

	let yaw = 0;
	let yawTarget = 0;
	let dragFrom: number | null = null;
	let time = 0;
	const onDown = (e: PointerEvent) => (dragFrom = e.clientX);
	const onMove = (e: PointerEvent) => {
		if (dragFrom === null) return;
		yawTarget = Math.max(-0.7, Math.min(0.7, yawTarget - ((e.clientX - dragFrom) / window.innerWidth) * 1.6));
		dragFrom = e.clientX;
	};
	const onUp = () => (dragFrom = null);
	renderer.domElement.addEventListener('pointerdown', onDown);
	window.addEventListener('pointermove', onMove);
	window.addEventListener('pointerup', onUp);

	const fit = () => {
		const w = container.clientWidth || window.innerWidth;
		const h = container.clientHeight || window.innerHeight;
		renderer.setSize(w, h, false);
		camera.aspect = w / h;
		camera.updateProjectionMatrix();
	};
	fit();
	const observer = new ResizeObserver(fit);
	observer.observe(container);

	const target = new Vector3(0, 0.5, 0);
	const tick = (dt: number) => {
		time += dt;
		yaw += (yawTarget - yaw) * (1 - Math.exp(-dt * 4));
		if (dragFrom === null) yawTarget *= Math.exp(-dt * 0.4);
		const a = yaw + 0.14 * Math.sin(time * 0.21);
		// у вузькому портреті відходимо далі, щоб влазили криси
		const distance = camera.aspect < 0.7 ? 3.9 : 3;
		camera.position.set(Math.sin(a) * distance, 1.1 + 0.05 * Math.sin(time * 0.3), Math.cos(a) * distance);
		camera.lookAt(target);
		dust.setScale(camera.projectionMatrix.elements[5] * (renderer.domElement.height / 2));
		dust.update(dt);
		if (Math.random() < dt * dust.capacity * 0.12) emitDust();
	};
	tick(0);

	return {
		scene,
		camera,
		renderer,
		anchor,
		tick,
		stop: () => {
			renderer.setAnimationLoop(null);
			observer.disconnect();
			renderer.domElement.removeEventListener('pointerdown', onDown);
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
			dust.dispose();
			renderer.dispose();
			renderer.domElement.remove();
		}
	};
}
