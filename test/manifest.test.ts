import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const manifest = JSON.parse(readFileSync("com.mtbhuskies.herdr-deck.sdPlugin/manifest.json", "utf8"));

// @elgato/streamdeck 3 refuses to connect when the manifest claims support
// for a Stream Deck older than its features need (7.1 for its settings
// events), and that refusal only shows on the device.
test("manifest requires the Stream Deck version the SDK needs", () => {
	expect(manifest.Software.MinimumVersion).toBe("7.1");
});

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const PLUGIN = "com.mtbhuskies.herdr-deck.sdPlugin";

test("the plugin bundles a Stream Deck+ profile that installs with it", () => {
	expect(manifest.Profiles).toEqual([{ Name: "profiles/herdr-deck", DeviceType: 7 }]);
	expect(existsSync(`${PLUGIN}/profiles/herdr-deck.streamDeckProfile`)).toBe(true);
});

// A re-exported profile carries every key's settings. Keep it to this plugin's
// actions with nothing set, so a launch command or a server never lands in git.
test("the bundled profile holds only Herdr Deck actions, with no settings", () => {
	const zip = `${PLUGIN}/profiles/herdr-deck.streamDeckProfile`;
	const names = execFileSync("unzip", ["-Z1", zip], { encoding: "utf8" }).split("\n").filter((n) => n.endsWith("manifest.json") || n === "package.json");
	const actions = names.flatMap((n) => {
		const json = JSON.parse(execFileSync("unzip", ["-p", zip, n], { encoding: "utf8" }));
		if (n === "package.json") {
			expect(json.RequiredPlugins).toEqual(["com.mtbhuskies.herdr-deck"]);
			return [];
		}
		return (json.Controllers ?? []).flatMap((c: { Actions: Record<string, unknown> | null }) => Object.values(c.Actions ?? {}));
	}) as { UUID: string; Settings: unknown }[];
	expect(actions).toHaveLength(12);
	for (const a of actions) {
		expect(a.UUID).toMatch(/^com\.mtbhuskies\.herdr-deck\./);
		expect(a.Settings).toEqual({});
	}
});
