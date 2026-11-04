/** Global plugin settings, edited in the property inspector. */
export interface Settings {
	socketPath: string;
	terminalBundleId: string;
	/**
	 * Run in a new Terminal window when no window is running Herdr, such as
	 * `herdr --remote user@server`. Empty means only ever raise Terminal.
	 */
	launchCommand: string;
}

export const DEFAULTS: Settings = {
	socketPath: "~/.config/herdr/herdr.sock",
	terminalBundleId: "com.apple.Terminal",
	launchCommand: "",
};

export function resolveSettings(raw: Partial<Settings> | undefined, home: string): Settings {
	const pick = (value: unknown, fallback: string) => (typeof value === "string" && value.trim() !== "" ? value.trim() : fallback);
	const socketPath = pick(raw?.socketPath, DEFAULTS.socketPath);
	return {
		socketPath: socketPath === "~" || socketPath.startsWith("~/") ? home + socketPath.slice(1) : socketPath,
		terminalBundleId: pick(raw?.terminalBundleId, DEFAULTS.terminalBundleId),
		launchCommand: pick(raw?.launchCommand, DEFAULTS.launchCommand),
	};
}
