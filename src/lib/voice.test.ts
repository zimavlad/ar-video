import { describe, expect, it } from 'vitest';
import { alignCues, brightness, cueAt, cues, envelope, levels, sample } from './voice';

function tone(seconds: number, rate: number, loud: (t: number) => number) {
	const out = new Float32Array(Math.round(seconds * rate));
	for (let i = 0; i < out.length; i++) out[i] = Math.sin((i / rate) * 2 * Math.PI * 180) * loud(i / rate);
	return out;
}

describe('envelope', () => {
	const rate = 22050;
	// пів секунди тиші, секунда голосу, пів секунди тиші
	const env = envelope(tone(2, rate, (t) => (t > 0.5 && t < 1.5 ? 0.6 : 0)), rate);

	it('тиша — рот закритий, голос — відкритий', () => {
		expect(sample(env, 0.25)).toBe(0);
		expect(sample(env, 1.0)).toBeGreaterThan(0.9);
	});

	it('атака миттєва, спад плавний (рот не клацає)', () => {
		expect(sample(env, 0.52)).toBeGreaterThan(0.8);
		const after = sample(env, 1.55);
		expect(after).toBeGreaterThan(0.05);
		expect(after).toBeLessThan(0.9);
		expect(sample(env, 1.95)).toBeLessThan(0.02);
	});

	it('значення в межах 0..1', () => {
		for (const v of env) {
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThanOrEqual(1);
		}
	});

	it('за межами файлу не падає', () => {
		expect(sample(env, -1)).toBe(0);
		expect(sample(env, 99)).toBeLessThan(0.02);
		expect(sample(new Float32Array(), 1)).toBe(0);
	});
});

describe('cues', () => {
	const lines = ['Ага, ось і ти!', 'Я чекав.', 'Тебе запрошено на Вечір старих чарів.'];
	const list = cues(lines, 10, 0.5, 0.4);

	it('займають увесь файл від паузи на початку до кінця', () => {
		expect(list[0].start).toBeCloseTo(0.5, 5);
		expect(list.at(-1)!.end).toBeCloseTo(10, 5);
	});

	it('довша репліка триває довше', () => {
		const length = (i: number) => list[i].end - list[i].start;
		expect(length(2)).toBeGreaterThan(length(0));
		expect(length(0)).toBeGreaterThan(length(1));
	});

	it('субтитр тримається в паузі й зникає наприкінці', () => {
		expect(cueAt(list, 0.2)).toBeNull();
		expect(cueAt(list, list[0].end + 0.2)?.text).toBe(lines[0]);
		expect(cueAt(list, 12)).toBeNull();
	});
});

describe('alignCues', () => {
	const rate = 8000;
	/** голос за списком відрізків [від, до] у секундах */
	function speech(total: number, parts: [number, number][]) {
		return tone(total, rate, (t) => (parts.some(([a, b]) => t >= a && t < b) ? 0.5 : 0));
	}

	it('межі стають на справжні паузи, а не на мікропаузу в розтягнутому слові', () => {
		// «Ага-а… ось і ти!» розтягнуте, з паузою 0.12 с всередині; далі три репліки
		const audio = speech(9, [
			[0.5, 1.4],
			[1.52, 2.5],
			[2.9, 3.7],
			[4.3, 6.6],
			[7.1, 8.6]
		]);
		const list = alignCues(['Ага-а… ось і ти!', 'Я чекав.', 'Тебе запрошено на вечір.', 'До зустрічі.'], levels(audio, rate))!;
		expect(list.map((c) => Math.round(c.start * 10) / 10)).toEqual([0.5, 2.9, 4.3, 7.1]);
		expect(list.at(-1)!.end).toBeCloseTo(8.6, 1);
	});

	it('пауз менше, ніж реплік — null (тоді пропорційно)', () => {
		const audio = speech(4, [[0.5, 3.5]]);
		expect(alignCues(['Раз.', 'Два.'], levels(audio, rate))).toBeNull();
	});

	it('одна репліка — увесь голос', () => {
		const audio = speech(3, [[0.4, 2.6]]);
		const [cue] = alignCues(['Привіт.'], levels(audio, rate))!;
		expect(cue.start).toBeCloseTo(0.4, 1);
		expect(cue.end).toBeCloseTo(2.6, 1);
	});
});

describe('brightness', () => {
	const rate = 22050;
	const noise = (n: number) => Float32Array.from({ length: n }, () => Math.random() * 2 - 1);

	it('низький тон — «кругла» голосна, шум — «широкий» шиплячий', () => {
		const vowel = brightness(tone(1, rate, () => 0.5), rate);
		const hiss = brightness(noise(rate), rate);
		expect(sample(vowel, 0.8)).toBeLessThan(0.1);
		expect(sample(hiss, 0.8)).toBeGreaterThan(0.9);
	});
});
