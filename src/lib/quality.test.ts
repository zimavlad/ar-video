import { describe, expect, it } from 'vitest';
import { FrameGuard } from './quality';

describe('FrameGuard', () => {
	it('швидкі кадри не чіпає', () => {
		let slow = 0;
		const guard = new FrameGuard(() => slow++);
		for (let i = 0; i < 600; i++) guard.push(1 / 60);
		expect(slow).toBe(0);
	});

	it('стабільно повільні кадри — один сигнал', () => {
		let slow = 0;
		const guard = new FrameGuard(() => slow++);
		for (let i = 0; i < 600; i++) guard.push(1 / 15);
		expect(slow).toBe(1);
	});

	it('розігрів і поодинокі ривки не рахуються', () => {
		let slow = 0;
		const guard = new FrameGuard(() => slow++);
		for (let i = 0; i < 30; i++) guard.push(0.1); // перші 3 с важкі
		for (let i = 0; i < 600; i++) guard.push(i % 10 ? 1 / 60 : 0.08);
		expect(slow).toBe(0);
	});
});
