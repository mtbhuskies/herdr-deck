/** One agent as Herdr's `agent.list` reports it. */
export interface Agent {
	paneId?: string;
	terminalId?: string;
	tabId?: string;
	workspaceId?: string;
	agent: string;
	status: string;
	cwd?: string;
	foregroundCwd?: string;
	focused: boolean;
}

export interface Tab {
	tabId: string;
	workspaceId: string;
	number: number;
	focused: boolean;
}

type Json = Record<string, unknown>;

/** Empty strings count as missing: Herdr sends "" for an unknown cwd. */
function str(value: unknown): string | undefined {
	return typeof value === "string" && value !== "" ? value : undefined;
}

export function parseAgent(json: Json): Agent {
	return {
		paneId: str(json.pane_id),
		terminalId: str(json.terminal_id),
		tabId: str(json.tab_id),
		workspaceId: str(json.workspace_id),
		agent: str(json.agent) ?? "agent",
		status: str(json.agent_status) ?? "unknown",
		cwd: str(json.cwd),
		foregroundCwd: str(json.foreground_cwd),
		focused: json.focused === true,
	};
}

export function parseTab(json: Json): Tab {
	return {
		tabId: str(json.tab_id) ?? "",
		workspaceId: str(json.workspace_id) ?? "",
		number: typeof json.number === "number" ? json.number : 0,
		focused: json.focused === true,
	};
}

/**
 * The identity used everywhere: `agent.focus` resolves pane ids only, so the
 * pane id is preferred and the terminal id is a fallback for a Herdr that
 * omits it.
 */
export function agentKey(a: Agent): string {
	return a.paneId ?? a.terminalId ?? "";
}

/**
 * What a person recognises the agent by: the last folder of where it is
 * working. Herdr usually runs on another machine, so its home directory is
 * not ours; any `/home/<name>` or `/Users/<name>` counts as home.
 */
export function displayName(a: Agent, home: string): string {
	const dir = a.foregroundCwd ?? a.cwd;
	if (!dir) return a.agent;
	const trimmed = dir.replace(/\/+$/, "");
	if (trimmed === home.replace(/\/+$/, "") || /^\/(home|Users)\/[^/]+$/.test(trimmed)) return "~ home";
	return trimmed.split("/").pop() || a.agent;
}
