import { describe, expect, it } from 'vitest';
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { poseFromCorners, type Point } from './homography';

const f = 900;
const cx = 195;
const cy = 422;

/** Проєкція кутів QR (TL, TR, BR, BL) для заданої пози — як їх побачить детектор */
function project(pose: Matrix4): Point[] {
	return [
		[-0.5, 0.5],
		[0.5, 0.5],
		[0.5, -0.5],
		[-0.5, -0.5]
	].map(([x, y]) => {
		const p = new Vector3(x, y, 0).applyMatrix4(pose);
		return { x: cx + (f * p.x) / -p.z, y: cy - (f * p.y) / -p.z };
	});
}

function pose(position: Vector3, rotation: Euler) {
	return new Matrix4().compose(position, new Quaternion().setFromEuler(rotation), new Vector3(1, 1, 1));
}

describe('poseFromCorners', () => {
	const cases: [string, Matrix4][] = [
		['QR прямо перед камерою', pose(new Vector3(0, 0, -8), new Euler(0, 0, 0))],
		['QR на столі під кутом', pose(new Vector3(0.6, -1.2, -7), new Euler(-1.0, 0.2, 0.1))],
		['QR повернутий і збоку кадру', pose(new Vector3(-1.5, 0.8, -10), new Euler(0.3, -0.5, 1.2))]
	];

	for (const [name, truth] of cases) {
		it(name, () => {
			const found = poseFromCorners(project(truth), f, cx, cy)!;
			expect(found).not.toBeNull();
			const a = new Vector3();
			const b = new Vector3();
			const qa = new Quaternion();
			const qb = new Quaternion();
			truth.decompose(a, qa, new Vector3());
			found.decompose(b, qb, new Vector3());
			expect(b.distanceTo(a)).toBeLessThan(1e-6);
			expect(qa.angleTo(qb)).toBeLessThan(1e-6);
		});
	}

	it('нормаль QR дивиться на камеру', () => {
		const found = poseFromCorners(project(cases[1][1]), f, cx, cy)!;
		const normal = new Vector3(0, 0, 1).transformDirection(found);
		const toCamera = new Vector3().setFromMatrixPosition(found).negate().normalize();
		expect(normal.dot(toCamera)).toBeGreaterThan(0);
	});

	it('вироджені кути — null, а не NaN', () => {
		const p = { x: 10, y: 10 };
		expect(poseFromCorners([p, p, p, p], f, cx, cy)).toBeNull();
	});
});
