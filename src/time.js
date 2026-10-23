// Format instants as ISO 8601 with an explicit Europe/Berlin UTC offset:
//   2026-10-23T16:00:00.000+02:00   (CEST, summer)
//   2026-01-15T16:00:00.000+01:00   (CET, winter)
//
// Why not plain UTC ("…Z"): LLM clients naively chop everything after the
// digits and read the value as local time, so 14:00Z gets reported as 14:00
// while it is really 16:00 in Germany — a two-hour "lag" the user sees.
// With the offset embedded, both naive and strict readers get the correct
// wall clock. DST is handled by Intl (Europe/Berlin), no hardcoded offset.

const BERLIN = 'Europe/Berlin';

const fmt = new Intl.DateTimeFormat('en-CA', {
	timeZone: BERLIN,
	year: 'numeric', month: '2-digit', day: '2-digit',
	hour: '2-digit', minute: '2-digit', second: '2-digit',
	hourCycle: 'h23',
});

/**
 * @param {string|number|Date} input ISO 8601 string, epoch milliseconds or Date
 *   (callers converting epoch SECONDS must pass `seconds * 1000`)
 * @returns {string|null} ISO 8601 in Europe/Berlin with offset, or null if invalid
 */
const berlinIso = (input) => {
	const d = new Date(input);
	if (Number.isNaN(d.getTime())) return null;

	const p = Object.fromEntries(fmt.formatToParts(d).map(x => [x.type, x.value]));
	// Berlin wall-clock, interpreted as UTC → its difference from the real
	// epoch is exactly the current UTC offset of Europe/Berlin.
	const wallMs = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
	const offsetMin = Math.round((wallMs - d.getTime()) / 60000);
	const sign = offsetMin >= 0 ? '+' : '-';
	const abs = Math.abs(offsetMin);
	const hh = String(Math.floor(abs / 60)).padStart(2, '0');
	const mm = String(abs % 60).padStart(2, '0');
	const millis = String(d.getUTCMilliseconds()).padStart(3, '0');
	return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}.${millis}${sign}${hh}:${mm}`;
};

export {berlinIso};
