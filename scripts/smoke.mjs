// Loads the packed plugin the way the Stream Deck app does: from its own
// folder, outside this repo, with Node's ES-module guessing turned off (the
// app's Node 20 does not guess). A missing "type": "module" or a bad import
// fails here instead of silently on the device.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const packed = resolve("dist/com.mtbhuskies.herdr-deck.streamDeckPlugin");
const dir = mkdtempSync(join(tmpdir(), "herdr-deck-smoke-"));
execFileSync("unzip", ["-q", packed, "-d", dir]);

const run = spawnSync(process.execPath, ["--no-experimental-detect-module", join(dir, "com.mtbhuskies.herdr-deck.sdPlugin/bin/plugin.js")], {
	cwd: dir,
	timeout: 5000,
	encoding: "utf8",
});
const output = `${run.stdout}${run.stderr}`;
if (/SyntaxError|Failed to load|Cannot find (module|package)|ERR_/.test(output)) {
	console.error("smoke: the packed plugin does not load\n" + output);
	process.exit(1);
}
console.log("smoke: packed plugin loads");
