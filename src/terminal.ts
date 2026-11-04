import { execFile } from "node:child_process";
import { promisify } from "node:util";

type Run = (cmd: string, args: string[]) => Promise<{ stdout: string }>;

const execFileAsync: Run = promisify(execFile);

const TERMINAL_APP = "com.apple.Terminal";

/**
 * Brings forward the Terminal tab that is running Herdr; when there is none,
 * opens a window running the launch command. The command arrives as the
 * script's argument, never spliced into its text, so nothing in it can break
 * out of the AppleScript. When Terminal was not running, launching it opens a
 * window of its own, so the command goes into that one instead of a second.
 */
const LAUNCH_OR_RAISE = [
	"on run argv",
	"set launchCommand to item 1 of argv",
	`set wasRunning to application id "${TERMINAL_APP}" is running`,
	`tell application id "${TERMINAL_APP}"`,
	"if wasRunning then",
	"repeat with w in windows",
	"repeat with t in tabs of w",
	'if (processes of t) contains "herdr" then',
	"set selected of t to true",
	"set index of w to 1",
	"activate",
	'return "raised"',
	"end if",
	"end repeat",
	"end repeat",
	"do script launchCommand",
	"else",
	"activate",
	"repeat 50 times",
	"if (count of windows) > 0 then exit repeat",
	"delay 0.1",
	"end repeat",
	"if (count of windows) > 0 then",
	"do script launchCommand in window 1",
	"else",
	"do script launchCommand",
	"end if",
	"end if",
	"activate",
	"end tell",
	'return "launched"',
	"end run",
];

/**
 * Brings the terminal Herdr is shown in to the front. With a launch command
 * and Terminal.app, a missing Herdr window is opened rather than left closed;
 * otherwise nothing is ever launched, only raised if already running.
 */
export async function raiseTerminal(bundleId: string, launchCommand = "", run: Run = execFileAsync): Promise<void> {
	// The id goes into an AppleScript string, so allow only what bundle ids contain.
	if (!/^[A-Za-z0-9.-]+$/.test(bundleId)) {
		console.error(`herdr-deck: refusing odd terminal bundle id ${JSON.stringify(bundleId)}`);
		return;
	}
	const command = launchCommand.trim();
	if (command && bundleId === TERMINAL_APP) {
		try {
			await run("osascript", [...LAUNCH_OR_RAISE.flatMap((line) => ["-e", line]), command]);
		} catch (err) {
			console.error(`herdr-deck: could not open Terminal: ${(err as Error).message}`);
		}
		return;
	}
	try {
		const { stdout } = await run("osascript", ["-e", `application id "${bundleId}" is running`]);
		if (stdout.trim() !== "true") return;
		await run("open", ["-b", bundleId]);
	} catch (err) {
		console.error(`herdr-deck: could not raise ${bundleId}: ${(err as Error).message}`);
	}
}

/**
 * Whether you are looking at Herdr: the terminal is the app in front and, for
 * Terminal.app, its front tab is the one running herdr. The bundle id is the
 * script's argument, never spliced into its text.
 */
const WATCHING = [
	"on run argv",
	"set bundleId to item 1 of argv",
	'if not (application id bundleId is running) then return "no"',
	'if not (frontmost of application id bundleId) then return "no"',
	`if bundleId is "${TERMINAL_APP}" then`,
	`tell application id "${TERMINAL_APP}"`,
	'if (count of windows) is 0 then return "no"',
	'if (processes of selected tab of front window) contains "herdr" then return "yes"',
	"end tell",
	'return "no"',
	"end if",
	'return "yes"',
	"end run",
];

/**
 * When it cannot tell (no permission, an odd bundle id), it answers yes: a
 * wrong yes leaves an agent green, as Herdr reported it, while a wrong no
 * would turn agents blue for no reason.
 */
export async function isWatching(bundleId: string, run: Run = execFileAsync): Promise<boolean> {
	if (!/^[A-Za-z0-9.-]+$/.test(bundleId)) return true;
	try {
		const { stdout } = await run("osascript", [...WATCHING.flatMap((line) => ["-e", line]), bundleId]);
		return stdout.trim() !== "no";
	} catch {
		return true;
	}
}
