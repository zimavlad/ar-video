import { describe, expect, it } from 'vitest';
import { OneEuro } from './one-euro';

describe('OneEuro', () => {
	it('гасить тремтіння нерухомої точки', () => {
		const filter = new OneEuro(1.2, 0.01);
		let worst = 0;
		for (let i = 0; i < 200; i++) {
			const out = filter.filter(100 + (i % 2 ? 2 : -2), 1 / 20);
			if (i > 40) worst = Math.max(worst, Math.abs(out - 100));
		}
		expect(worst).toBeLessThan(0.8); // було ±2 px
	});

	it('за швидким рухом іде майже без відставання', () => {
		const filter = new OneEuro(1.2, 0.01);
		let out = 0;
		for (let i = 0; i <= 20; i++) out = filter.filter(i * 40, 1 / 20); // 800 px/с
		expect(800 - out).toBeLessThan(60);
	});

	it('після reset бере значення одразу', () => {
		const filter = new OneEuro();
		filter.filter(10, 0.05);
		filter.reset();
		expect(filter.filter(500, 0.05)).toBe(500);
	});
});
