import { RunService } from "@rbxts/services";
// One scheduler per execution context. Spread scans across frames and bound CPU time.
const jobs: { run: () => boolean | void; due: number }[] = [];
let cursor = 0;
let connection: RBXScriptConnection | undefined;
export function scheduleRadar(run: () => boolean | void): SignalConnection {
	const job = { run, due: os.clock() + math.random() * 0.1 };
	jobs.push(job);
	if (!connection)
		connection = RunService.Heartbeat.Connect(() => {
			const start = os.clock();
			let checked = 0,
				scanned = 0;
			while (checked++ < jobs.size() && scanned < 8 && os.clock() - start < 0.002) {
				if (cursor >= jobs.size()) cursor = 0;
				const entry = jobs[cursor++];
				if (!entry || entry.due > start) continue;
				entry.due = start + 0.1;
				scanned++;
				try {
					// Continue partial scans next frame; completed scans keep the 10 Hz cadence.
					if (entry.run() === true) entry.due = start;
				} catch (err) {
					warn(err);
				}
			}
		});
	return {
		Disconnect() {
			const index = jobs.indexOf(job);
			if (index >= 0) jobs.remove(index);
			if (jobs.size() === 0) {
				connection?.Disconnect();
				connection = undefined;
				cursor = 0;
			}
		},
	};
}
