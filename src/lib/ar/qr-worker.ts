/// <reference lib="webworker" />
import jsQR from 'jsqr';

/** Пошук QR у кадрі поза головним потоком: інтерфейс і рендер не гальмують */

export interface QrRequest {
	data: Uint8ClampedArray;
	width: number;
	height: number;
}

export interface QrResponse {
	/** TL, TR, BR, BL у пікселях переданого кадру; null — QR не знайдено */
	corners: { x: number; y: number }[] | null;
}

self.onmessage = (event: MessageEvent<QrRequest>) => {
	const { data, width, height } = event.data;
	const code = jsQR(data, width, height, { inversionAttempts: 'dontInvert' });
	const response: QrResponse = {
		corners: code
			? [code.location.topLeftCorner, code.location.topRightCorner, code.location.bottomRightCorner, code.location.bottomLeftCorner]
			: null
	};
	self.postMessage(response);
};
