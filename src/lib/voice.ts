/**
 * Голос капелюха і рот, що за ним рухається.
 *
 * Замість AnalyserNode рахуємо обвідну гучності заздалегідь, з декодованого
 * файлу, і читаємо її за audio.currentTime. Так рот не залежить від
 * кадрової частоти, можна зазирнути трохи вперед (рот відкривається
 * разом зі звуком, а не після), і працює будь-який підкладений invite.mp3.
 *
 * Грає звичайний <audio>, а не Web Audio: на iPhone з перемикачем
 * беззвучного режиму Web Audio мовчить, а медіа-елемент — ні.
 */

export const ENVELOPE_FPS = 60;

/** Гучність по кадрах 1/fps, нормалізована за 95-м перцентилем (без згладжування) */
export function levels(samples: Float32Array, sampleRate: number, fps = ENVELOPE_FPS): Float32Array {
	const hop = Math.max(1, Math.round(sampleRate / fps));
	const frames = Math.ceil(samples.length / hop);
	const rms = new Float32Array(frames);
	for (let f = 0; f < frames; f++) {
		let sum = 0;
		const from = f * hop;
		const to = Math.min(samples.length, from + hop);
		for (let i = from; i < to; i++) sum += samples[i] * samples[i];
		rms[f] = Math.sqrt(sum / Math.max(1, to - from));
	}
	const sorted = Array.from(rms).sort((a, b) => a - b);
	const ceiling = sorted[Math.floor(sorted.length * 0.95)] || 1;
	for (let f = 0; f < frames; f++) rms[f] = Math.min(1, rms[f] / ceiling);
	return rms;
}

/** Обвідна рота 0..1: шумовий поріг, швидка атака, повільний спад */
export function envelope(samples: Float32Array, sampleRate: number, fps = ENVELOPE_FPS): Float32Array {
	return mouthCurve(levels(samples, sampleRate, fps), fps);
}

export function mouthCurve(level: Float32Array, fps = ENVELOPE_FPS): Float32Array {
	const floor = 0.12;
	const out = new Float32Array(level.length);
	const release = Math.exp(-1 / (0.09 * fps));
	let value = 0;
	for (let f = 0; f < level.length; f++) {
		const gated = Math.max(0, (level[f] - floor) / (1 - floor));
		// квадратний корінь: тихі склади теж трохи відкривають рот
		const target = Math.sqrt(gated);
		value = target > value ? target : value * release + target * (1 - release);
		out[f] = value;
	}
	return out;
}

/** Значення обвідної в момент t (секунди) з лінійною інтерполяцією */
export function sample(env: Float32Array, t: number, fps = ENVELOPE_FPS): number {
	if (!env.length || t < 0) return 0;
	const x = t * fps;
	const i = Math.floor(x);
	if (i >= env.length - 1) return env[env.length - 1] ?? 0;
	const k = x - i;
	return env[i] * (1 - k) + env[i + 1] * k;
}

export interface Cue {
	start: number;
	end: number;
	text: string;
}

/**
 * Субтитри без розмітки часу: репліки займають час пропорційно довжині.
 * lead — тиша на початку файлу, gap — пауза між репліками (як у scripts/voice.ts).
 */
export function cues(lines: string[], duration: number, lead = 0.5, gap = 0.42): Cue[] {
	const weights = lines.map((line) => line.length + 6);
	const total = weights.reduce((a, b) => a + b, 0);
	const speaking = Math.max(0.1, duration - lead - gap * Math.max(0, lines.length - 1));
	let at = lead;
	return lines.map((text, i) => {
		const length = (weights[i] / total) * speaking;
		const cue = { start: at, end: at + length, text };
		at += length + gap;
		return cue;
	});
}

export function cueAt(list: Cue[], t: number): Cue | null {
	// субтитр тримається до початку наступного, щоб не блимав у паузах
	for (let i = list.length - 1; i >= 0; i--) if (t >= list[i].start) return t <= list[i].end + 0.6 ? list[i] : null;
	return null;
}

interface Gap {
	start: number;
	end: number;
	/** частка мовлення (без пауз) до цієї паузи */
	before: number;
}

/**
 * Субтитри за справжніми паузами в записі.
 *
 * Пропорційна розкладка не знає, що актор розтягнув «Ага-а…» на дві
 * секунди, а адресу проговорив швидко. Тут шукаємо паузи (гучність
 * нижче порогу ≥ minGap) і вибираємо з них межі між репліками так, щоб
 * частка мовлення до кожної межі була найближча до частки тексту.
 * Довшим паузам — помітний бонус: актор може розтягнути слово («Ага-а…»)
 * з мікропаузою всередині, а справжня межа речень зазвичай довша.
 * Якщо пауз менше, ніж треба меж, повертає null — тоді пропорційно.
 */
export function alignCues(lines: string[], level: Float32Array, fps = ENVELOPE_FPS, quiet = 0.08, minGap = 0.09): Cue[] | null {
	if (lines.length === 0) return [];
	const loud = (f: number) => level[f] >= quiet;
	let first = 0;
	while (first < level.length && !loud(first)) first++;
	let last = level.length - 1;
	while (last > first && !loud(last)) last--;
	if (first >= last) return null;

	const gaps: Gap[] = [];
	let spoken = 0;
	let run = -1;
	for (let f = first; f <= last; f++) {
		if (loud(f)) {
			if (run >= 0 && (f - run) / fps >= minGap) gaps.push({ start: run / fps, end: f / fps, before: spoken });
			run = -1;
			spoken++;
		} else if (run < 0) run = f;
	}
	const total = spoken;
	for (const g of gaps) g.before /= total;

	const need = lines.length - 1;
	if (gaps.length < need) return null;

	const weights = lines.map((line) => line.length + 6);
	const sum = weights.reduce((a, b) => a + b, 0);
	const targets: number[] = [];
	for (let k = 0, acc = 0; k < need; k++) targets.push((acc += weights[k]) / sum);

	const cost = (k: number, g: number) => (gaps[g].before - targets[k]) ** 2 - 0.03 * Math.min(0.6, gaps[g].end - gaps[g].start);
	// best[k][g]: найменша сума для меж 0..k, де межа k — пауза g
	const best: number[][] = [];
	const from: number[][] = [];
	for (let k = 0; k < need; k++) {
		best.push(new Array(gaps.length).fill(Infinity));
		from.push(new Array(gaps.length).fill(-1));
		for (let g = k; g < gaps.length - (need - 1 - k); g++) {
			if (k === 0) {
				best[0][g] = cost(0, g);
				continue;
			}
			for (let p = k - 1; p < g; p++) {
				const value = best[k - 1][p] + cost(k, g);
				if (value < best[k][g]) {
					best[k][g] = value;
					from[k][g] = p;
				}
			}
		}
	}
	const chosen: number[] = [];
	if (need > 0) {
		let g = best[need - 1].indexOf(Math.min(...best[need - 1]));
		for (let k = need - 1; k >= 0; k--) {
			chosen.unshift(g);
			g = from[k][g];
		}
	}

	return lines.map((text, i) => ({
		start: i === 0 ? first / fps : gaps[chosen[i - 1]].end,
		end: i === need ? (last + 1) / fps : gaps[chosen[i]].start,
		text
	}));
}

/**
 * «Яскравість» звуку 0..1 по кадрах: частота переходів через нуль.
 * Голосні (а, о, у) — низька, шиплячі й «і/е/с» — висока. Рот від неї
 * стає ширшим і пласкішим або круглішим — дешева заміна візем.
 */
export function brightness(samples: Float32Array, sampleRate: number, fps = ENVELOPE_FPS): Float32Array {
	const hop = Math.max(1, Math.round(sampleRate / fps));
	const frames = Math.ceil(samples.length / hop);
	const out = new Float32Array(frames);
	let value = 0;
	const k = 1 - Math.exp(-1 / (0.06 * fps));
	for (let f = 0; f < frames; f++) {
		const from = f * hop;
		const to = Math.min(samples.length, from + hop);
		let crossings = 0;
		for (let i = from + 1; i < to; i++) if (samples[i - 1] < 0 !== samples[i] < 0) crossings++;
		const perSecond = (crossings / Math.max(1, to - from)) * sampleRate;
		const x = Math.min(1, Math.max(0, (perSecond - 1200) / 2800));
		value += (x * x * (3 - 2 * x) - value) * k;
		out[f] = value;
	}
	return out;
}

export interface MouthShape {
	/** відкритість 0..1 */
	open: number;
	/** 0 — кругла «о/у», 1 — широка «і/е/с» */
	wide: number;
}

export class Voice {
	readonly audio: HTMLAudioElement;
	private env: Float32Array | null = null;
	private level: Float32Array | null = null;
	private bright: Float32Array | null = null;
	private unlocked = false;
	/** зазираємо вперед: рендер відстає від звуку десь на кадр-два */
	lookahead = 0.06;

	constructor(private src: string) {
		this.audio = new Audio(src);
		this.audio.preload = 'auto';
		this.audio.setAttribute('playsinline', '');
	}

	/** Рахує обвідну у фоні; без неї рот рухається за запасною формулою */
	async analyse(): Promise<void> {
		try {
			const buffer = await (await fetch(this.src)).arrayBuffer();
			const Offline = window.OfflineAudioContext ?? (window as any).webkitOfflineAudioContext;
			// 44.1 кГц: старіші Safari не створюють офлайн-контекст з іншою частотою
			const ctx: OfflineAudioContext = new Offline(1, 44100, 44100);
			const audio = await ctx.decodeAudioData(buffer);
			const samples = audio.getChannelData(0);
			this.level = levels(samples, audio.sampleRate);
			this.env = mouthCurve(this.level);
			this.bright = brightness(samples, audio.sampleRate);
		} catch {
			this.env = null;
		}
	}

	private session() {
		try {
			if (navigator.audioSession) navigator.audioSession.type = 'playback';
		} catch {
			/* необов’язково */
		}
	}

	get isUnlocked() {
		return this.unlocked;
	}

	/**
	 * Дотик, коли говорити ще рано (QR не в кадрі): запускаємо й одразу
	 * зупиняємо — iOS після цього дозволяє грати цей елемент без дотику.
	 * На початку файлу пів секунди тиші, тож нічого не чути.
	 * Викликати СИНХРОННО в обробнику дотику.
	 */
	unlock(): void {
		if (this.unlocked) return;
		this.unlocked = true;
		this.session();
		const a = this.audio;
		a.play()
			.then(() => {
				a.pause();
				a.currentTime = 0;
			})
			.catch(() => (this.unlocked = false));
	}

	/**
	 * Почати з початку. Під дотиком викликати синхронно, без await перед ним:
	 * iOS рахує жест лише в тому ж кроці подій.
	 */
	start(): Promise<boolean> {
		this.session();
		this.unlocked = true;
		this.audio.currentTime = 0;
		return this.audio.play().then(
			() => true,
			() => {
				this.unlocked = false;
				return false;
			}
		);
	}

	get playing(): boolean {
		return !this.audio.paused && !this.audio.ended;
	}

	get time(): number {
		return this.audio.currentTime;
	}

	get duration(): number {
		return Number.isFinite(this.audio.duration) ? this.audio.duration : 0;
	}

	/** Субтитри: за паузами в записі, а якщо не вийшло — пропорційно довжині */
	cues(lines: string[]): Cue[] {
		return (this.level && alignCues(lines, this.level)) || cues(lines, this.duration);
	}

	/** Форма рота зараз */
	mouth(): MouthShape {
		if (!this.playing) return { open: 0, wide: 0.5 };
		const t = this.audio.currentTime + this.lookahead;
		if (this.env) return { open: sample(this.env, t), wide: this.bright ? sample(this.bright, t) : 0.5 };
		// запасний варіант: склади ~5 на секунду
		return { open: Math.max(0, Math.sin(t * 31) * 0.5 + Math.sin(t * 13) * 0.5), wide: 0.5 + 0.4 * Math.sin(t * 7) };
	}
}
