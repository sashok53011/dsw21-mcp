// Live test for the GTFS-RT backend: builds the static index (~18 MB via
// Range requests), verifies the DSW21 join, and queries realtime delays for a
// Dortmund stop. Requires network. Run: node test/gtfsrt-live.js

import {loadIndex} from '../src/gtfs/index.js';
import {queryDelays, queryAlerts, DEFAULT_FEED_URL} from '../src/gtfs/feed.js';
import {resolveGtfsStop} from '../src/tools/gtfs-rt.js';

const main = async () => {
	console.log('building/loading static GTFS index (agency /DSW21|Dortmunder/)…');
	const t0 = Date.now();
	const index = await loadIndex({force: true});
	console.log(`index ready in ${((Date.now() - t0) / 1000).toFixed(1)}s (cached=${index.cached})`);
	console.log('  agencyIds:', index.agencyIds);
	console.log('  routes:', Object.keys(index.routes).length, ' trips:', index.trips.size, ' stops:', index.stops.size);
	if (index.agencyIds.length === 0) throw new Error('DSW21 agency not found');

	// Sample a few indexed lines.
	const lines = [...new Set([...index.trips.values()].map(t => t.line).filter(Boolean))].slice(0, 15);
	console.log('  sample DSW21 lines:', lines.join(', '));

	// Resolve a couple of Dortmund stops.
	for (const name of ['Dortmund Hbf', 'Dortmund Kreuzstraße', 'Plazad l']) {
		const q = name.toLowerCase();
		const hit = [...index.stops.entries()].find(([, s]) => s.name && s.name.toLowerCase().includes(q));
		console.log(`  stop "${name}" ->`, hit ? `${hit[0]} ${hit[1].name}` : 'NOT FOUND');
	}

	// Resolve Dortmund Hbf (now to a whole id set: parent + platforms) and
	// query realtime delays.
	const dortmundHbf = resolveGtfsStop(index, 'Dortmund Hbf');
	if (!dortmundHbf) throw new Error('Dortmund Hbf not in index');
	console.log(`\nquerying GTFS-RT delays for Dortmund Hbf (primary=${dortmundHbf.primaryId}, idSet=${dortmundHbf.stopIds.size})…`);

	const res = await queryDelays({
		feedUrl: process.env.GTFS_RT_FEED_URL || DEFAULT_FEED_URL,
		index,
		stopIds: dortmundHbf.stopIds,
		windowMinutes: 120,
		minDelayMinutes: 0,
	});
	console.log('  feedTimestamp:', res.feedTimestamp && new Date(res.feedTimestamp * 1000).toISOString());
	console.log('  tripUpdates scanned:', res.totalEntities, ' matching stop:', res.records.length);

	const delayed = res.records.filter(r => r.delayMin > 0);
	console.log('  delayed at this stop:', delayed.length);
	console.log('  cancelled at this stop:', res.records.filter(r => r.cancelled).length);

	// Are the matching trips actually indexed as DSW21? (join correctness)
	const known = res.records.filter(r => index.trips.has(String(r.tripId)));
	const dswLines = [...new Set(known.map(r => r.line).filter(Boolean))];
	console.log('  records with tripId in DSW21 index:', known.length, '/', res.records.length);
	console.log('  DSW21 lines seen at Dortmund Hbf:', dswLines.join(', ') || '(none)');

	console.log('\nsample delayed records:');
	for (const r of res.records.filter(r => r.delayMin > 0).slice(0, 8)) {
		console.log(`   line ${r.line || '?'} trip ${r.tripId} headsign=${r.headsign || '-'} sched=${r.scheduledEpoch && new Date(r.scheduledEpoch * 1000).toISOString()} delay=${r.delayMin}min`);
	}

	// Also: query alerts for a few DSW21 trip ids.
	const sampleTrips = res.records.slice(0, 5).map(r => r.tripId);
	const alerts = await queryAlerts({feedUrl: DEFAULT_FEED_URL, index, tripIds: sampleTrips, limit: 5});
	console.log('\nservice alerts referencing those trips:', alerts.length);
	for (const a of alerts.slice(0, 3)) {
		console.log(`   cause=${a.cause} effect=${a.effect} informedTrips=${a.informedTrips} header=${a.header || '-'} desc=${(a.description || '-').slice(0, 80)}`);
	}

	// Assertions for the join.
	console.log('\n--- assertions ---');
	const okAgency = index.agencyIds.length > 0;
	console.log('DSW21 agency resolved:', okAgency);
	const okTrips = index.trips.size > 0;
	console.log('  DSW21 trips indexed:', okTrips, `(${index.trips.size})`);
	const okStop = Boolean(dortmundHbf);
	console.log('  Dortmund Hbf resolved:', okStop);
	const okFeed = res.feedTimestamp !== null;
	console.log('  feed decoded w/ timestamp:', okFeed);
	const okJoin = res.records.length > 0; // DSW21 delays at Dortmund Hbf were confirmed present
	console.log('  realtime records at stop:', res.records.length);

	if (!okAgency || !okTrips || !okStop || !okFeed || !okJoin) {
		console.error('LIVE TEST FAILED');
		process.exit(1);
	}
	console.log('\nlive GTFS-RT test passed ✓');
	process.exit(0);
};

main().catch((err) => {
	console.error('live GTFS-RT test failed:', err);
	process.exit(1);
});
