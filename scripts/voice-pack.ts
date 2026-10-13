/**
 * Стискає свій запис голосу (наприклад, з ElevenLabs) під сторінку:
 * моно, 48 kbps, рівна гучність, пів секунди тиші на початку.
 *
 *   npm run voice:pack -- ~/Downloads/hat.mp3
 */
import { execFileSync } from 'node:child_process';
import { config } from '../src/lib/config.ts';

const input = process.argv[2];
if (!input) {
	console.error('Вкажи файл: npm run voice:pack -- шлях/до/файлу.mp3');
	process.exit(1);
}
const out = new URL('../static/' + config.assets.audio, import.meta.url).pathname;

execFileSync('ffmpeg', [
	'-y', '-loglevel', 'error', '-i', input,
	'-af', ['adelay=500', 'loudnorm=I=-16:TP=-1.5', 'aresample=22050'].join(','),
	'-ac', '1', '-ar', '22050', '-b:a', '48k', out
]);
const duration = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString().trim();
console.log(`${out}  ${Number(duration).toFixed(1)} с`);
