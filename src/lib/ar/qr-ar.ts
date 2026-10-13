import { Matrix4, PerspectiveCamera, SRGBColorSpace, Scene, WebGLRenderer } from 'three';
import { poseFromCorners, type Point } from './homography';
import { OneEuro } from './one-euro';
import type { QrResponse } from './qr-worker';
import type { Tier } from '$lib/hat/stage';

/**
 * AR поверх відео з камери, якір — QR-код із запрошення.
 *
 * Відео лежить на весь екран (object-fit: cover), над ним прозоре полотно
 * three. Кожен кадр (коли детектор вільний) шукаємо QR: на Android —
 * вбудованим BarcodeDetector, де його нема (iPhone) — jsQR у воркері.
 * Чотири кути QR → поза (homography.ts) → Stage тримає капелюх.
 * QR зник — капелюх лишається там, де був, доки знову не знайдемо.
 */

/** типове поле зору основної камери телефона по довшій стороні кадру */
const LONG_SIDE_FOV = (64 * Math.PI) / 180;
/** з такою довшою стороною кадр іде в jsQR: швидко, а QR на відстані руки ще читається */
const DETECT_SIDE = 640;
/** скільки QR може не знаходитись, доки вважаємо його загубленим */
const LOST_AFTER_MS = 700;
/** відео трохи збільшене, щоб сховати розмиті краї; кути QR перераховуємо з тим самим масштабом */
const ZOOM = 1.04;

export interface QrAr {
	scene: Scene;
	camera: PerspectiveCamera;
	renderer: WebGLRenderer;
	/** остання поза QR або null, якщо його давно не видно */
	pose: () => Matrix4 | null;
	stop: () => void;
}

export interface QrArOptions {
	container: HTMLElement;
	stream: MediaStream;
	tier: Tier;
	onFound: () => void;
	onLost: () => void;
}

interface Detector {
	detect: (source: HTMLVideoElement) => Promise<Point[] | null>;
	stop: () => void;
}

async function nativeDetector(): Promise<Detector | null> {
	const Native = (window as unknown as { BarcodeDetector?: any }).BarcodeDetector;
	if (!Native) return null;
	try {
		const formats: string[] = await Native.getSupportedFormats();
		if (!formats.includes('qr_code')) return null;
		const detector = new Native({ formats: ['qr_code'] });
		return {
			detect: async (video) => {
				const [code] = await detector.detect(video);
				return code?.cornerPoints?.length === 4 ? code.cornerPoints : null;
			},
			stop: () => undefined
		};
	} catch {
		return null;
	}
}

function workerDetector(): Detector {
	const worker = new Worker(new URL('./qr-worker.ts', import.meta.url), { type: 'module' });
	const canvas = document.createElement('canvas');
	const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
	return {
		detect: (video) =>
			new Promise((resolve) => {
				const vw = video.videoWidth;
				const vh = video.videoHeight;
				const k = Math.min(1, DETECT_SIDE / Math.max(vw, vh));
				canvas.width = Math.round(vw * k);
				canvas.height = Math.round(vh * k);
				ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
				const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
				worker.onmessage = (event: MessageEvent<QrResponse>) =>
					resolve(event.data.corners?.map((p) => ({ x: p.x / k, y: p.y / k })) ?? null);
				worker.postMessage({ data: image.data, width: image.width, height: image.height }, [image.data.buffer]);
			}),
		stop: () => worker.terminate()
	};
}

export async function startQrAr(options: QrArOptions): Promise<QrAr> {
	const { container, stream } = options;

	const video = document.createElement('video');
	video.muted = true;
	video.playsInline = true;
	video.autoplay = true;
	video.setAttribute('playsinline', '');
	video.srcObject = stream;
	// фон злегка розмитий: капелюх читається різкіше, а QR детектор бере з
	// сирих кадрів, на нього CSS-фільтр не впливає. Масштаб ховає розмиті краї
	Object.assign(video.style, {
		position: 'absolute',
		inset: '0',
		width: '100%',
		height: '100%',
		objectFit: 'cover',
		filter: options.tier === 'high' ? 'blur(5px) saturate(1.1) brightness(0.82)' : 'blur(3px) brightness(0.85)',
		transform: `scale(${ZOOM})`
	});
	container.appendChild(video);
	await video.play().catch(() => undefined);
	await new Promise<void>((resolve) => {
		if (video.videoWidth) return resolve();
		video.addEventListener('loadedmetadata', () => resolve(), { once: true });
	});

	const renderer = new WebGLRenderer({ antialias: options.tier === 'high', alpha: true });
	renderer.outputColorSpace = SRGBColorSpace;
	renderer.setClearColor(0x000000, 0);
	// урок AR_quest: повна щільність на dpr 3 разом із розпізнаванням гріє телефон
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, options.tier === 'high' ? 2 : 1.25));
	Object.assign(renderer.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
	container.appendChild(renderer.domElement);

	const scene = new Scene();
	const camera = new PerspectiveCamera(60, 1, 0.01, 1000);

	// відео обрізане під екран (cover): переводимо кути з пікселів кадру в пікселі екрана
	let W = 1;
	let H = 1;
	let scale = 1;
	let offsetX = 0;
	let offsetY = 0;
	let focal = 1;
	const fit = () => {
		W = container.clientWidth || window.innerWidth;
		H = container.clientHeight || window.innerHeight;
		const vw = video.videoWidth || W;
		const vh = video.videoHeight || H;
		scale = Math.max(W / vw, H / vh) * ZOOM;
		offsetX = (W - vw * scale) / 2;
		offsetY = (H - vh * scale) / 2;
		focal = (Math.max(vw, vh) / 2 / Math.tan(LONG_SIDE_FOV / 2)) * scale;
		camera.aspect = W / H;
		camera.fov = (2 * Math.atan(H / 2 / focal) * 180) / Math.PI;
		camera.updateProjectionMatrix();
		renderer.setSize(W, H, false);
	};
	fit();
	const observer = new ResizeObserver(fit);
	observer.observe(container);
	video.addEventListener('resize', fit);

	const detector = (await nativeDetector()) ?? workerDetector();
	const pose = new Matrix4();
	// по фільтру на кожну координату кожного кута: тремтіння детектора
	// множиться в повороті капелюха, тож гасимо його ще до розрахунку пози
	const filters = Array.from({ length: 8 }, () => new OneEuro(1.0, 0.008));
	let filteredAt = 0;
	let seenAt = 0;
	let found = false;
	let running = true;

	const loop = async () => {
		while (running) {
			if (video.readyState >= 2 && video.videoWidth) {
				let corners: Point[] | null = null;
				try {
					corners = await detector.detect(video);
				} catch {
					corners = null;
				}
				if (!running) break;
				const now = performance.now();
				if (corners) {
					if (now - seenAt > LOST_AFTER_MS) filters.forEach((f) => f.reset());
					const dt = Math.min(0.2, (now - filteredAt) / 1000);
					filteredAt = now;
					const screen = corners.map((p, i) => ({
						x: filters[i * 2].filter(p.x * scale + offsetX, dt),
						y: filters[i * 2 + 1].filter(p.y * scale + offsetY, dt)
					}));
					if (poseFromCorners(screen, focal, W / 2, H / 2, pose)) {
						seenAt = now;
						if (!found) {
							found = true;
							options.onFound();
						}
					}
				} else if (found && now - seenAt > LOST_AFTER_MS) {
					found = false;
					options.onLost();
				}
			}
			// віддаємо кадр рендеру; детектор сам задає темп (~15–30 разів на секунду)
			await new Promise((resolve) => requestAnimationFrame(resolve));
		}
	};
	loop();

	return {
		scene,
		camera,
		renderer,
		pose: () => (found ? pose : null),
		stop: () => {
			running = false;
			renderer.setAnimationLoop(null);
			observer.disconnect();
			detector.stop();
			stream.getTracks().forEach((track) => track.stop());
			renderer.dispose();
			renderer.domElement.remove();
			video.remove();
		}
	};
}
