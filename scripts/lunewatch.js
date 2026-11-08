const fs = require("fs");
const chokidar = require("chokidar");
const { exec } = require("child_process");
const path = "./place.rbxl";

let fileCreated = false;
/** @type {import('chokidar').FSWatcher | null} */
let watcher = undefined;

let running = false;
let pending = false;
function runCommand() {
	if (running) {
		pending = true;
		return;
	}
	running = true;
	console.log("[watcher] Detected change. Running: node scripts/save-assets.js");
	exec("node scripts/save-assets.js", (error, stdout, stderr) => {
		running = false;
		if (pending) {
			pending = false;
			runCommand();
		}
		if (error) {
			console.error(`[watcher] Error: ${error.message}`);
			return;
		}
		if (stderr) {
			console.error(`[watcher] Stderr: ${stderr}`);
			return;
		}
		console.log(`[watcher] Output:\n${stdout}`);
	});
}

function startWatching() {
	watcher = chokidar.watch(path, {
		persistent: true,
		ignoreInitial: true,
		awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 100 },
	});

	watcher.on("change", () => {
		runCommand();
	});

	watcher.on("add", () => {
		if (!fileCreated) {
			fileCreated = true;
			console.log("[watcher] place.rbxl created (initial). Skipping command...");
		}
	});

	console.log("[watcher] Started the watcher for place.rbxl");
}

function waitForFile() {
	if (fs.existsSync(path)) {
		console.log("[watcher] place.rbxl already exists. Waiting for next change...");
		fileCreated = true;
		startWatching();
		return;
	}

	console.log("[watcher] place.rbxl not found. Waiting for it to be created...");

	const interval = setInterval(() => {
		if (fs.existsSync(path)) {
			if (!fileCreated) {
				fileCreated = true;
				console.log("[watcher] place.rbxl created (initial). Skipping command...");
				startWatching();
			}
			clearInterval(interval);
		}
	}, 500);
}

waitForFile();
