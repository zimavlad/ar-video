import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

/**
 * Процедурна «стара тканина»: фетр з плямами потертостей, дрібне плетіння
 * і кілька латок зі стібками. Безшовна по горизонталі — нею обгортається конус.
 */

function rng(seed: number) {
	return () => {
		seed = (seed * 1664525 + 1013904223) >>> 0;
		return seed / 4294967296;
	};
}

export function fabricTexture(size = 512): CanvasTexture {
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = size;
	const ctx = canvas.getContext('2d')!;
	const rand = rng(7);

	ctx.fillStyle = '#6a4e34';
	ctx.fillRect(0, 0, size, size);

	// усе, що малюємо, дублюємо через край, щоб шов на спині не було видно
	const wrap = (draw: (dx: number) => void) => [-size, 0, size].forEach(draw);

	// потертості й тіні
	for (let i = 0; i < 46; i++) {
		const x = rand() * size;
		const y = rand() * size;
		const r = size * (0.04 + rand() * 0.16);
		const light = rand() > 0.55;
		wrap((dx) => {
			const g = ctx.createRadialGradient(x + dx, y, 0, x + dx, y, r);
			g.addColorStop(0, light ? 'rgba(190,150,100,0.22)' : 'rgba(30,18,10,0.28)');
			g.addColorStop(1, 'rgba(0,0,0,0)');
			ctx.fillStyle = g;
			ctx.fillRect(x + dx - r, y - r, r * 2, r * 2);
		});
	}

	// латки зі стібками
	// обличчя — посередині текстури (u ≈ 0.5), тож латки лише на боках і спині
	const patches = [
		{ x: 0.12, y: 0.62, w: 0.16, h: 0.12, a: 0.18, c: '#4f3b28' },
		{ x: 0.84, y: 0.36, w: 0.12, h: 0.15, a: -0.25, c: '#56614c' },
		{ x: 0.24, y: 0.86, w: 0.14, h: 0.1, a: 0.08, c: '#7d5c3c' }
	];
	for (const p of patches) {
		ctx.save();
		ctx.translate(p.x * size, p.y * size);
		ctx.rotate(p.a);
		const w = p.w * size;
		const h = p.h * size;
		ctx.fillStyle = p.c;
		ctx.fillRect(-w / 2, -h / 2, w, h);
		ctx.strokeStyle = 'rgba(0,0,0,0.35)';
		ctx.lineWidth = size / 256;
		ctx.strokeRect(-w / 2, -h / 2, w, h);
		ctx.setLineDash([size / 90, size / 120]);
		ctx.strokeStyle = 'rgba(225,200,150,0.75)';
		ctx.lineWidth = size / 320;
		ctx.strokeRect(-w / 2 + size / 100, -h / 2 + size / 100, w - size / 50, h - size / 50);
		ctx.restore();
	}

	// плетіння: тонкі світлі й темні нитки
	ctx.setLineDash([]);
	for (let y = 0; y < size; y += 2) {
		ctx.strokeStyle = `rgba(${y % 4 ? '255,230,190' : '0,0,0'},${0.03 + rand() * 0.05})`;
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(0, y + 0.5);
		ctx.lineTo(size, y + 0.5);
		ctx.stroke();
	}
	for (let x = 0; x < size; x += 3) {
		ctx.strokeStyle = `rgba(0,0,0,${0.02 + rand() * 0.04})`;
		ctx.beginPath();
		ctx.moveTo(x + 0.5, 0);
		ctx.lineTo(x + 0.5, size);
		ctx.stroke();
	}

	// ворс
	const grain = ctx.getImageData(0, 0, size, size);
	for (let i = 0; i < grain.data.length; i += 4) {
		const n = (rand() - 0.5) * 22;
		grain.data[i] += n;
		grain.data[i + 1] += n;
		grain.data[i + 2] += n;
	}
	ctx.putImageData(grain, 0, 0);

	const texture = new CanvasTexture(canvas);
	texture.wrapS = RepeatWrapping;
	texture.colorSpace = SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

/** М’яка кругла пляма для іскор, диму, тіні й вогників в очах */
export function glowTexture(size = 64, hard = 0.0): CanvasTexture {
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = size;
	const ctx = canvas.getContext('2d')!;
	const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
	g.addColorStop(0, 'rgba(255,255,255,1)');
	g.addColorStop(Math.max(0.01, hard), 'rgba(255,255,255,0.8)');
	g.addColorStop(1, 'rgba(255,255,255,0)');
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, size, size);
	return new CanvasTexture(canvas);
}
