import { expect, test } from "vitest";
import { DEFAULTS, resolveSettings } from "../src/settings";

test("resolveSettings fills defaults and expands ~", () => {
	expect(DEFAULTS).toEqual({ socketPath: "~/.config/herdr/herdr.sock", terminalBundleId: "com.apple.Terminal", launchCommand: "" });
	expect(resolveSettings(undefined, "/Users/h")).toEqual({ socketPath: "/Users/h/.config/herdr/herdr.sock", terminalBundleId: "com.apple.Terminal", launchCommand: "" });
	expect(resolveSettings({ socketPath: "~/.herdr-remote.sock" }, "/Users/h").socketPath).toBe("/Users/h/.herdr-remote.sock");
	expect(resolveSettings({ socketPath: "/tmp/x.sock", terminalBundleId: "com.mitchellh.ghostty" }, "/Users/h")).toEqual({
		socketPath: "/tmp/x.sock",
		terminalBundleId: "com.mitchellh.ghostty",
		launchCommand: "",
	});
});

test("empty or blank settings fall back to defaults", () => {
	expect(resolveSettings({ socketPath: "  ", terminalBundleId: "" }, "/Users/h")).toEqual(resolveSettings(undefined, "/Users/h"));
});

test("the launch command is trimmed and kept verbatim otherwise", () => {
	expect(resolveSettings({ launchCommand: "  herdr --remote user@server  " }, "/Users/h").launchCommand).toBe("herdr --remote user@server");
});
