import { expect, test } from "vitest";
import { raiseTerminal } from "../src/terminal";

const recorder = (running: string) => {
	const calls: [string, string[]][] = [];
	const run = async (cmd: string, args: string[]) => {
		calls.push([cmd, args]);
		return { stdout: cmd === "osascript" ? running : "" };
	};
	return { calls, run };
};

test("raiseTerminal opens the app by bundle id when it is running", async () => {
	const { calls, run } = recorder("true\n");
	await raiseTerminal("com.apple.Terminal", "", run);
	expect(calls).toEqual([
		["osascript", ["-e", 'application id "com.apple.Terminal" is running']],
		["open", ["-b", "com.apple.Terminal"]],
	]);
});

test("raiseTerminal does not call open when the app is not running", async () => {
	const { calls, run } = recorder("false\n");
	await raiseTerminal("com.apple.Terminal", "", run);
	expect(calls.map((c) => c[0])).toEqual(["osascript"]);
});

test("raiseTerminal rejects a bundle id with quotes", async () => {
	const { calls, run } = recorder("true\n");
	await raiseTerminal('com.apple.Terminal" to quit --', "", run);
	expect(calls).toEqual([]);
});

test("raiseTerminal swallows failures", async () => {
	await expect(raiseTerminal("com.apple.Terminal", "", async () => Promise.reject(new Error("boom")))).resolves.toBeUndefined();
});

test("with a launch command, Terminal gets one AppleScript that is handed the command as an argument", async () => {
	const { calls, run } = recorder("launched\n");
	await raiseTerminal("com.apple.Terminal", "herdr --remote user@server", run);
	expect(calls).toHaveLength(1);
	const [cmd, args] = calls[0];
	expect(cmd).toBe("osascript");
	// The command travels as argv, never spliced into the script, so quotes in it cannot break out.
	expect(args.at(-1)).toBe("herdr --remote user@server");
	const script = args.filter((_, i) => args[i - 1] === "-e").join("\n");
	expect(script).not.toContain("herdr --remote user@server");
	expect(script).toContain('processes of');
	expect(script).toContain('"herdr"');
	expect(script).toContain("do script");
});

test("a command with quotes still goes through as a single argument", async () => {
	const { calls, run } = recorder("launched\n");
	await raiseTerminal("com.apple.Terminal", `say "hi" && herdr`, run);
	expect(calls[0][1].at(-1)).toBe(`say "hi" && herdr`);
});

test("a blank launch command keeps the plain raise", async () => {
	const { calls, run } = recorder("true\n");
	await raiseTerminal("com.apple.Terminal", "   ", run);
	expect(calls.map((c) => c[0])).toEqual(["osascript", "open"]);
});

test("a launch command is ignored for terminals other than Terminal.app", async () => {
	const { calls, run } = recorder("true\n");
	await raiseTerminal("com.mitchellh.ghostty", "herdr --remote user@server", run);
	expect(calls).toEqual([
		["osascript", ["-e", 'application id "com.mitchellh.ghostty" is running']],
		["open", ["-b", "com.mitchellh.ghostty"]],
	]);
});

import { isWatching } from "../src/terminal";

test("isWatching asks AppleScript about the front app and its Herdr tab, passing the bundle id as an argument", async () => {
	const { calls, run } = recorder("yes\n");
	expect(await isWatching("com.apple.Terminal", run)).toBe(true);
	const [cmd, args] = calls[0];
	expect(cmd).toBe("osascript");
	expect(args.at(-1)).toBe("com.apple.Terminal");
	const script = args.filter((_, i) => args[i - 1] === "-e").join("\n");
	expect(script).toContain("frontmost");
	expect(script).toContain("selected tab of front window");
	expect(script).toContain('"herdr"');
});

test("isWatching is false when AppleScript says no", async () => {
	const { run } = recorder("no\n");
	expect(await isWatching("com.apple.Terminal", run)).toBe(false);
});

test("isWatching assumes you are watching when it cannot tell, so nothing turns blue by mistake", async () => {
	expect(await isWatching("com.apple.Terminal", async () => Promise.reject(new Error("not allowed")))).toBe(true);
	const { calls, run } = recorder("no\n");
	expect(await isWatching('bad" id', run)).toBe(true);
	expect(calls).toEqual([]);
});
