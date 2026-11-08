const { performance } = require("node:perf_hooks");
// Algorithm microbenchmark: JS host timings are not Roblox frame-time measurements.
for (const size of [1000, 5000, 10000]) {
	const blocks = [];
	let start = performance.now();
	let scanned = 0;
	for (let i = 0; i < size; i++) {
		let count = 0;
		for (const block of blocks) {
			scanned++;
			if (block === i % 32) count++;
		}
		blocks.push(i % 32);
	}
	const scanMs = performance.now() - start;
	const counts = new Map();
	start = performance.now();
	for (let i = 0; i < size; i++) counts.set(i % 32, (counts.get(i % 32) || 0) + 1);
	console.log(
		JSON.stringify({
			blocks: size,
			scanVisits: scanned,
			counterUpdates: size,
			scanMs,
			counterMs: performance.now() - start,
		}),
	);
}
