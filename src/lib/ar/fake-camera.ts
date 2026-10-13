import QRCode from 'qrcode';

/**
 * Лише для розробки (?fakecam у dev): «камера», що показує QR, який
 * трохи хитається й нахиляється. Перевірити трекінг без телефона.
 */
export async function fakeCamera(text: string): Promise<MediaStream> {
	const qr = document.createElement('canvas');
	await QRCode.toCanvas(qr, text, { width: 360, margin: 2 });
	const canvas = document.createElement('canvas');
	canvas.width = 720;
	canvas.height = 1280;
	const ctx = canvas.getContext('2d')!;
	let t = 0;
	setInterval(() => {
		t += 1 / 30;
		ctx.fillStyle = '#4d463f';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.save();
		ctx.translate(360 + Math.sin(t * 0.7) * 40, 760 + Math.cos(t * 0.5) * 30);
		ctx.rotate(Math.sin(t * 0.4) * 0.25);
		// стиск по вертикалі імітує нахил QR, що лежить на столі
		ctx.scale(1, 0.75 + 0.15 * Math.sin(t * 0.3));
		ctx.drawImage(qr, -qr.width / 2, -qr.height / 2);
		ctx.restore();
	}, 33);
	return canvas.captureStream(30);
}
