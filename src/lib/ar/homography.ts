import { Matrix4 } from 'three';

/**
 * Поза квадрата (QR-коду) з чотирьох кутів на екрані.
 *
 * Гомографія площина → зображення (DLT на 4 точках), далі розклад на
 * поворот і зсув. Фокусна відстань телефона невідома — беремо типову;
 * капелюх рендериться тією ж камерою, тож на екрані він точно сидить на
 * кутах QR, а неточність фокуса дає лише трохи іншу перспективу.
 *
 * Одиниця — ширина QR. Результат у координатах three.js: камера в нулі,
 * дивиться в −Z; локальні осі якоря: X праворуч по QR, Y угору по QR,
 * Z з QR до глядача.
 */

export interface Point {
	x: number;
	y: number;
}

/** Розв’язок 8×8 методом Гауса з вибором головного елемента */
function solve(a: number[][], b: number[]): number[] | null {
	const n = b.length;
	for (let col = 0; col < n; col++) {
		let pivot = col;
		for (let row = col + 1; row < n; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
		if (Math.abs(a[pivot][col]) < 1e-12) return null;
		[a[col], a[pivot]] = [a[pivot], a[col]];
		[b[col], b[pivot]] = [b[pivot], b[col]];
		for (let row = col + 1; row < n; row++) {
			const k = a[row][col] / a[col][col];
			for (let c = col; c < n; c++) a[row][c] -= k * a[col][c];
			b[row] -= k * b[col];
		}
	}
	const x = new Array(n).fill(0);
	for (let row = n - 1; row >= 0; row--) {
		let sum = b[row];
		for (let c = row + 1; c < n; c++) sum -= a[row][c] * x[c];
		x[row] = sum / a[row][row];
	}
	return x;
}

/** Кути квадрата на площині (вісь Y униз, як на зображенні): TL, TR, BR, BL */
const PLANE: Point[] = [
	{ x: -0.5, y: -0.5 },
	{ x: 0.5, y: -0.5 },
	{ x: 0.5, y: 0.5 },
	{ x: -0.5, y: 0.5 }
];

/**
 * @param corners кути QR у пікселях екрана: верхній лівий, верхній правий, нижній правий, нижній лівий
 * @param f фокусна відстань у пікселях екрана
 * @param cx центр екрана
 */
export function poseFromCorners(corners: Point[], f: number, cx: number, cy: number, out = new Matrix4()): Matrix4 | null {
	if (corners.length !== 4) return null;
	const a: number[][] = [];
	const b: number[] = [];
	for (let i = 0; i < 4; i++) {
		const { x: X, y: Y } = PLANE[i];
		const x = (corners[i].x - cx) / f;
		const y = (corners[i].y - cy) / f;
		a.push([X, Y, 1, 0, 0, 0, -x * X, -x * Y]);
		b.push(x);
		a.push([0, 0, 0, X, Y, 1, -y * X, -y * Y]);
		b.push(y);
	}
	const h = solve(a, b);
	if (!h) return null;

	// стовпці гомографії ∝ [r1 r2 t] (камера: x праворуч, y униз, z уперед)
	const h1 = [h[0], h[3], h[6]];
	const h2 = [h[1], h[4], h[7]];
	const h3 = [h[2], h[5], 1];
	const norm = (v: number[]) => Math.hypot(v[0], v[1], v[2]);
	let lambda = 2 / (norm(h1) + norm(h2));
	if (h3[2] * lambda < 0) lambda = -lambda; // QR перед камерою
	const r1 = h1.map((v) => v * lambda);
	let r2 = h2.map((v) => v * lambda);
	const t = h3.map((v) => v * lambda);

	// ортонормуємо: шум кутів дає трохи неортогональні осі
	const n1 = norm(r1);
	for (let i = 0; i < 3; i++) r1[i] /= n1;
	const d = r1[0] * r2[0] + r1[1] * r2[1] + r1[2] * r2[2];
	r2 = r2.map((v, i) => v - d * r1[i]);
	const n2 = norm(r2);
	for (let i = 0; i < 3; i++) r2[i] /= n2;
	const r3 = [r1[1] * r2[2] - r1[2] * r2[1], r1[2] * r2[0] - r1[0] * r2[2], r1[0] * r2[1] - r1[1] * r2[0]];

	// у three: F·R·F і F·t, де F = diag(1, −1, −1)
	out.set(
		r1[0], -r2[0], -r3[0], t[0],
		-r1[1], r2[1], r3[1], -t[1],
		-r1[2], r2[2], r3[2], -t[2],
		0, 0, 0, 1
	);
	return out;
}
