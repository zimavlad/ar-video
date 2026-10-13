import type { Tier } from '$lib/hat/stage';

/**
 * Рівень якості: кількість частинок, щільність пікселів, деталізація капелюха.
 * Стартуємо з оцінки заліза, а під час показу FrameGuard ще й міряє кадри
 * і знижує рівень, якщо телефон не встигає.
 * ?low=1 у посиланні — примусово простий режим (для перевірки).
 */
export function detectTier(): Tier {
	if (new URLSearchParams(location.search).has('low')) return 'low';
	const cores = navigator.hardwareConcurrency ?? 4;
	const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
	// iPhone не повідомляє пам’ять, а ядер у Safari завжди показує небагато —
	// його судимо лише за реальними кадрами
	const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
	if (!ios && (cores <= 4 || memory <= 3)) return 'low';
	return 'high';
}

/** Ковзне вікно часу кадру; спрацьовує один раз, коли стабільно повільніше ~22 fps */
export class FrameGuard {
	private frames: number[] = [];
	private warm = 0;
	private fired = false;

	constructor(private onSlow: () => void) {}

	push(dt: number) {
		if (this.fired) return;
		this.warm += dt;
		if (this.warm < 2.5 || dt <= 0 || dt > 0.5) return; // розігрів і вкладка у фоні
		this.frames.push(dt);
		if (this.frames.length < 60) return;
		const sorted = [...this.frames].sort((a, b) => a - b);
		this.frames = [];
		if (sorted[30] > 1 / 22) {
			this.fired = true;
			this.onSlow();
		}
	}
}
