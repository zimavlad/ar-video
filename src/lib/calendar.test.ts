import { describe, expect, it } from 'vitest';
import { googleUrl, ics, utcStamp, when } from './calendar';
import { config } from './config';

const event = config.event;

describe('calendar', () => {
	it('час події переводиться в UTC', () => {
		expect(utcStamp('2026-12-20T19:00:00+02:00')).toBe('20261220T170000Z');
	});

	it('ics валідний і з екранованими комами', () => {
		const body = ics({ ...event, address: 'вул. Ярославська, 12' }, new Date('2026-10-01T00:00:00Z'));
		expect(body.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
		expect(body).toContain('DTSTART:20261220T170000Z');
		expect(body).toContain('DTEND:20261220T210000Z');
		expect(body).toContain('Ярославська\\, 12');
		expect(body.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
	});

	it('Google-посилання містить проміжок часу', () => {
		expect(googleUrl(event)).toContain('dates=20261220T170000Z%2F20261220T210000Z');
	});

	it('дата на екрані — у поясі події', () => {
		const w = when(event);
		expect(w.day).toBe('20 грудня');
		expect(w.time).toBe('19:00');
		expect(w.weekday).toBe('неділя');
	});
});
