/**
 * Фільтр One Euro (Casiez та ін., 2012): сильно згладжує, коли рука
 * нерухома (тремтіння кутів QR на 1–3 пікселі зникає), і майже не
 * відстає, коли рухаєш телефоном — частота зрізу росте зі швидкістю.
 */
export class OneEuro {
	private x: number | null = null;
	private dx = 0;

	/**
	 * @param minCutoff Гц у спокої: менше — спокійніше, але повільніше
	 * @param beta наскільки швидкість відкриває фільтр (одиниці значення за секунду)
	 */
	constructor(
		private minCutoff = 1.2,
		private beta = 0.01,
		private dCutoff = 1
	) {}

	private static alpha(cutoff: number, dt: number) {
		const tau = 1 / (2 * Math.PI * cutoff);
		return 1 / (1 + tau / dt);
	}

	reset() {
		this.x = null;
		this.dx = 0;
	}

	filter(value: number, dt: number): number {
		if (this.x === null || dt <= 0) {
			this.x = value;
			return value;
		}
		const rawDx = (value - this.x) / dt;
		this.dx += OneEuro.alpha(this.dCutoff, dt) * (rawDx - this.dx);
		const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
		this.x += OneEuro.alpha(cutoff, dt) * (value - this.x);
		return this.x;
	}
}
