// Plays the Stream Deck app for one short session: launches the built plugin
// with registration parameters, accepts its websocket, answers its settings
// request, shows it one key and one dial, and records what it sends back.
// It fails unless the plugin registers, asks for its settings, and draws a key
// and a dial strip: everything short of real hardware.
// Usage: node scripts/fake-deck.mjs [socketPath]
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { WebSocketServer } from "ws";

const socketPath = process.argv[2] ?? "/nonexistent.sock";
const wss = new WebSocketServer({ port: 0, host: "127.0.0.1" });
await new Promise((r) => wss.on("listening", r));
const port = wss.address().port;
const seen = [];
const info = {
	application: { font: "", language: "en", platform: "mac", platformVersion: "15.0", version: "7.1.0.0" },
	plugin: { uuid: "com.mtbhuskies.herdr-deck", version: "0.1.0.0" },
	devicePixelRatio: 2,
	colors: {},
	devices: [{ id: "dev1", name: "Stream Deck +", size: { columns: 4, rows: 2 }, type: 7 }],
};

wss.on("connection", (ws) => {
	ws.on("message", (raw) => {
		const msg = JSON.parse(raw.toString());
		seen.push(msg.event + (msg.payload?.image ? " (image)" : "") + (msg.payload?.canvas ? " (canvas)" : ""));
		if (msg.event === "registerPlugin") {
			const appear = (action, context, controller, coordinates) =>
				ws.send(JSON.stringify({ event: "willAppear", action, context, device: "dev1", payload: { controller, coordinates, isInMultiAction: false, settings: {} } }));
			setTimeout(() => {
				appear("com.mtbhuskies.herdr-deck.agent", "key0", "Keypad", { column: 0, row: 0 });
				appear("com.mtbhuskies.herdr-deck.attention", "dial2", "Encoder", { column: 2, row: 0 });
			}, 300);
		}
		if (msg.event === "getGlobalSettings") {
			ws.send(JSON.stringify({ event: "didReceiveGlobalSettings", payload: { settings: { socketPath } } }));
		}
	});
});

const child = spawn(process.execPath, ["--no-experimental-detect-module", resolve("com.mtbhuskies.herdr-deck.sdPlugin/bin/plugin.js"),
	"-port", String(port), "-pluginUUID", "com.mtbhuskies.herdr-deck", "-registerEvent", "registerPlugin", "-info", JSON.stringify(info)], { cwd: resolve("com.mtbhuskies.herdr-deck.sdPlugin"), stdio: ["ignore", "pipe", "pipe"] });
let output = "";
child.stdout.on("data", (d) => (output += d));
child.stderr.on("data", (d) => (output += d));

setTimeout(() => {
	child.kill("SIGKILL");
	wss.close();
	const wanted = ["registerPlugin", "getGlobalSettings", "setImage (image)", "setFeedback (canvas)"];
	const missing = wanted.filter((e) => !seen.includes(e));
	if (missing.length) {
		console.error(`fake-deck: plugin never sent ${missing.join(", ")}; saw ${[...new Set(seen)].join(", ") || "nothing"}`);
		console.error(output.split("\n").slice(-15).join("\n"));
		console.error("Check com.mtbhuskies.herdr-deck.sdPlugin/logs/ for the plugin's own log.");
		process.exit(1);
	}
	console.log("fake-deck: plugin registered, read settings, drew a key and a dial");
	process.exit(0);
}, 3500);
