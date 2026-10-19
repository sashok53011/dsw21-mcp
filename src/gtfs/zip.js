// Read individual entries out of a remote ZIP over HTTP Range requests,
// without downloading the whole archive.
//
// This is what lets us pull only agency.txt + routes.txt + trips.txt +
// stops.txt (~18 MB) out of the 236 MB gtfs.de "local transit" archive, and
// skip the 229 MB stop_times.txt we do not need (realtime delays already come
// from the GTFS-RT feed).
//
// Strategy: fetch the End Of Central Directory (EOCD) record from the tail,
// then the central directory, locate the wanted entries' local-header offsets,
// and Range-fetch + raw-inflate each entry's compressed payload.

import {inflateRawSync} from 'node:zlib';

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;

const rangeFetch = async (url, start, end) => {
	const res = await fetch(url, {
		headers: {Range: `bytes=${start}-${end}`},
		signal: AbortSignal.timeout(120_000),
	});
	if (res.status !== 206 && res.status !== 200) {
		throw new Error(`range fetch failed: HTTP ${res.status} for ${url} [${start}-${end}]`);
	}
	return Buffer.from(await res.arrayBuffer());
};

// List {name, compressedSize, uncompressedSize, localHeaderOffset} for every
// entry in the archive.
const listZipEntries = async (url, contentLength) => {
	// EOCD is at most 22 bytes + a comment (<=64KB). Read a generous tail.
	const tailSize = Math.min(contentLength, 66_000);
	const tailStart = contentLength - tailSize;
	const tail = await rangeFetch(url, tailStart, contentLength - 1);

	let eocd = -1;
	for (let i = tail.length - 22; i >= 0; i--) {
		if (tail.readUInt32LE(i) === EOCD_SIG) { eocd = i; break; }
	}
	if (eocd === -1) throw new Error('ZIP EOCD record not found (unsupported archive)');

	const count = tail.readUInt16LE(eocd + 10);
	const cdSize = tail.readUInt32LE(eocd + 12);
	const cdOffset = tail.readUInt32LE(eocd + 16);

	const cd = await rangeFetch(url, cdOffset, cdOffset + cdSize - 1);
	const entries = [];
	let p = 0;
	while (p + 46 <= cd.length && cd.readUInt32LE(p) === CEN_SIG) {
		const compressedSize = cd.readUInt32LE(p + 20);
		const uncompressedSize = cd.readUInt32LE(p + 24);
		const fnLen = cd.readUInt16LE(p + 28);
		const exLen = cd.readUInt16LE(p + 30);
		const cmLen = cd.readUInt16LE(p + 32);
		const localHeaderOffset = cd.readUInt32LE(p + 42);
		const name = cd.toString('utf8', p + 46, p + 46 + fnLen);
		entries.push({name, compressedSize, uncompressedSize, localHeaderOffset});
		p += 46 + fnLen + exLen + cmLen;
	}
	return entries;
};

// Download + inflate a single entry's text content.
const readZipEntryText = async (url, entry) => {
	// Local header: 30 fixed bytes, then filename + extra.
	const head = await rangeFetch(url, entry.localHeaderOffset, entry.localHeaderOffset + 29);
	if (head.readUInt32LE(0) !== LOC_SIG) {
		throw new Error(`bad local header for ${entry.name}`);
	}
	const fnLen = head.readUInt16LE(26);
	const exLen = head.readUInt16LE(28);
	const dataStart = entry.localHeaderOffset + 30 + fnLen + exLen;

	if (entry.compressedSize === 0) {
		// Data-descriptor (streamed) entry: sizes are in the descriptor after the
		// data. We cannot know the extent cheaply, so refuse rather than guess.
		throw new Error(`entry ${entry.name} uses a data descriptor; unsupported`);
	}

	const raw = await rangeFetch(url, dataStart, dataStart + entry.compressedSize - 1);
	return inflateRawSync(raw).toString('utf8');
};

export {
	listZipEntries,
	readZipEntryText,
	rangeFetch,
};
