const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const root = path.resolve(__dirname, "..");
const staging = fs.mkdtempSync(path.join(root, ".asset-export-"));
const stagedGame = path.join(staging, "game");
const game = path.join(root, "game");
const backup = path.join(staging, "backup");
try {
	fs.cpSync(game, stagedGame, { recursive: true });
	const manifest = JSON.parse(fs.readFileSync(path.join(root, "lune/structure.json"), "utf8"));
	function rewrite(node) {
		if (!node || typeof node !== "object") return;
		for (const [key, value] of Object.entries(node)) {
			if (["path", "root", "props"].includes(key) && typeof value === "string") {
				const target = path.resolve(root, value);
				const relative = path.relative(game, target);
				if (relative.startsWith("..") || path.isAbsolute(relative))
					throw Error("Export target outside game directory");
				node[key] = path.join(stagedGame, relative).replaceAll("\\", "/");
			} else rewrite(value);
		}
	}
	rewrite(manifest);
	const manifestPath = path.join(staging, "manifest.json");
	fs.writeFileSync(manifestPath, JSON.stringify(manifest));
	const result = spawnSync("lune", ["run", "savechanges", manifestPath], { cwd: root, stdio: "inherit" });
	if (result.error) throw result.error;
	if (result.status !== 0) throw Error("Asset extraction failed; original assets preserved");
	if (process.argv.includes("--verify-only")) {
		console.log("Verified real extraction at " + stagedGame);
	} else {
		fs.renameSync(game, backup);
		try {
			fs.renameSync(stagedGame, game);
		} catch (error) {
			fs.renameSync(backup, game);
			throw error;
		}
		console.log("Assets exported. Previous assets retained at " + backup);
	}
} catch (error) {
	console.error(error);
	process.exitCode = 1;
}
