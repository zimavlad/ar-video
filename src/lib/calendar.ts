/** Дата на екрані, подія в календар (.ics для iPhone, Google для Android) */

export interface EventInfo {
	title: string;
	start: string;
	end: string;
	timeZone: string;
	place: string;
	address: string;
	note: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 20261220T170000Z — формат дати в iCalendar і Google */
export function utcStamp(iso: string): string {
	const d = new Date(iso);
	return (
		`${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
		`T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
	);
}

/** Екранування тексту для iCalendar (RFC 5545, 3.3.11) */
function esc(text: string): string {
	return text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
}

export function ics(event: EventInfo, now = new Date()): string {
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//hat-invite//UK',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		'BEGIN:VEVENT',
		`UID:${utcStamp(event.start)}-hat-invite`,
		`DTSTAMP:${utcStamp(now.toISOString())}`,
		`DTSTART:${utcStamp(event.start)}`,
		`DTEND:${utcStamp(event.end)}`,
		`SUMMARY:${esc(event.title)}`,
		`LOCATION:${esc(`${event.place}, ${event.address}`)}`,
		`DESCRIPTION:${esc(event.note)}`,
		'BEGIN:VALARM',
		'TRIGGER:-PT3H',
		'ACTION:DISPLAY',
		`DESCRIPTION:${esc(event.title)}`,
		'END:VALARM',
		'END:VEVENT',
		'END:VCALENDAR'
	];
	return lines.join('\r\n') + '\r\n';
}

export function googleUrl(event: EventInfo): string {
	const params = new URLSearchParams({
		action: 'TEMPLATE',
		text: event.title,
		dates: `${utcStamp(event.start)}/${utcStamp(event.end)}`,
		location: `${event.place}, ${event.address}`,
		details: event.note
	});
	return `https://calendar.google.com/calendar/render?${params}`;
}

/** «20 грудня», «неділя», «19:00» — у часовому поясі події, а не телефона */
export function when(event: EventInfo): { day: string; weekday: string; time: string; numeric: string } {
	const d = new Date(event.start);
	const tz = event.timeZone;
	const day = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', timeZone: tz }).format(d);
	const weekday = new Intl.DateTimeFormat('uk-UA', { weekday: 'long', timeZone: tz }).format(d);
	const time = new Intl.DateTimeFormat('uk-UA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(d);
	const numeric = new Intl.DateTimeFormat('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: tz }).format(d);
	return { day, weekday, time, numeric };
}

export const isIOS = () =>
	/iPhone|iPad|iPod/.test(navigator.userAgent) ||
	(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/**
 * iPhone відкриває data:text/calendar одразу в Календарі з кнопкою «Додати»;
 * на Android надійніше Google Календар; на комп’ютері — звичайний файл.
 */
export function addToCalendar(event: EventInfo): void {
	const body = ics(event);
	if (isIOS()) {
		window.location.href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(body);
		return;
	}
	if (/Android/i.test(navigator.userAgent)) {
		window.open(googleUrl(event), '_blank', 'noopener');
		return;
	}
	const url = URL.createObjectURL(new Blob([body], { type: 'text/calendar' }));
	const a = document.createElement('a');
	a.href = url;
	a.download = 'invite.ics';
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 2000);
}
