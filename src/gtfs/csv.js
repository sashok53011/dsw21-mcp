// Minimal CSV parser for GTFS .txt files: handles quoted fields with
// embedded commas and doubled quotes ("").

const parseCsvLine = (line) => {
	const out = [];
	let i = 0;
	const n = line.length;
	while (i <= n) {
		if (line[i] === '"') { // quoted field
			let j = i + 1;
			let field = '';
			while (j < n) {
				const ch = line[j];
				if (ch === '"') {
					if (line[j + 1] === '"') { field += '"'; j += 2; continue; }
					j++;
					break;
				}
				field += ch;
				j++;
			}
			out.push(field);
			// skip to delimiter
			while (j < n && line[j] !== ',') j++;
			i = j + 1;
		} else {
			const j = line.indexOf(',', i);
			if (j === -1) { out.push(line.slice(i)); break; }
			out.push(line.slice(i, j));
			i = j + 1;
		}
	}
	return out;
};

// Yield parsed rows (arrays) for a CSV text, header-aware.
// onRow(headerArray, rowArray) — return false to stop iteration.
const forEachCsvRow = (text, onRow) => {
	let start = 0;
	let header = null;
	const len = text.length;
	while (start < len) {
		let end = text.indexOf('\n', start);
		if (end === -1) end = len;
		let line = text.slice(start, end);
		if (line.endsWith('\r')) line = line.slice(0, -1);
		start = end + 1;
		if (!line) continue;
		const row = parseCsvLine(line);
		if (header === null) {
			header = row;
			if (onRow(null, header) === false) return;
			continue;
		}
		if (onRow(header, row) === false) return;
	}
};

export {
	parseCsvLine,
	forEachCsvRow,
};
