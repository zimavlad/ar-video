/**
 * Голос-заглушка: macOS `say` (українська Леся) → ffmpeg → static/media/invite.mp3.
 * Текст береться з config.speech.lines. Капелюх — старий чоловік, тому голос
 * сильно опускаємо, додаємо тремтіння й легку луну. Це заглушка: справжній
 * голос — свій invite.mp3 (див. README).
 *
 *   npm run voice
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config } from '../src/lib/config.ts';

const out = new URL('../static/' + config.assets.audio, import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'voice-'));
const aiff = join(dir, 'voice.aiff');

// паузи між репліками — вбудована команда say
const text = config.speech.lines.join(' [[slnc 420]] ');

try {
	execFileSync('say', ['-v', config.speech.voice, '-r', String(config.speech.rate), '-o', aiff, text]);
	// Українського чоловічого голосу в macOS немає — опускаємо Лесю разом із
	// формантами (asetrate) і повертаємо темп. Плюс легке тремтіння голосу.
	const pitch = config.speech.pitch;
	execFileSync('ffmpeg', [
		'-y', '-loglevel', 'error', '-i', aiff,
		'-af', [
			`asetrate=22050*${pitch}`, 'aresample=22050', `atempo=${(1 / pitch).toFixed(4)}`,
			'vibrato=f=5.2:d=0.06',
			'lowpass=f=6500',
			'aecho=0.8:0.5:40:0.18',
			// пів секунди тиші на початку: капелюх спершу «вилазить»
			'adelay=500',
			'loudnorm=I=-16:TP=-1.5',
			// loudnorm внутрішньо працює на 192 кГц — повертаємо частоту
			'aresample=22050'
		].join(','),
		'-ac', '1', '-ar', '22050', '-b:a', '48k', out
	]);
	const duration = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString().trim();
	console.log(`${out}  ${Number(duration).toFixed(1)} с`);
} finally {
	rmSync(dir, { recursive: true, force: true });
}
