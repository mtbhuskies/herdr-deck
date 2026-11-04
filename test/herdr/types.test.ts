import { expect, test } from "vitest";
import { agentKey, displayName, parseAgent, parseTab } from "../../src/herdr/types";

test("parseAgent maps snake_case and defaults", () => {
	const a = parseAgent({ pane_id: "w1:p1", agent_status: "blocked", foreground_cwd: "/home/r/MyProject" });
	expect(a).toMatchObject({ paneId: "w1:p1", status: "blocked", agent: "agent", focused: false, foregroundCwd: "/home/r/MyProject" });
	expect(parseAgent({}).status).toBe("unknown");
	expect(parseAgent({ focused: true, agent: "claude" })).toMatchObject({ focused: true, agent: "claude" });
});

test("parseTab maps snake_case", () => {
	expect(parseTab({ tab_id: "t1", workspace_id: "w1", number: 2, focused: true })).toEqual({ tabId: "t1", workspaceId: "w1", number: 2, focused: true });
	expect(parseTab({})).toEqual({ tabId: "", workspaceId: "", number: 0, focused: false });
});

test("agentKey prefers pane id, falls back to terminal id", () => {
	expect(agentKey(parseAgent({ pane_id: "w1:p1", terminal_id: "t9" }))).toBe("w1:p1");
	expect(agentKey(parseAgent({ terminal_id: "t9" }))).toBe("t9");
	expect(agentKey(parseAgent({}))).toBe("");
});

test("displayName uses foreground_cwd, then cwd, then agent; home is '~ home'", () => {
	expect(displayName(parseAgent({ foreground_cwd: "/home/r/wiki", cwd: "/home/r" }), "/home/r")).toBe("wiki");
	expect(displayName(parseAgent({ cwd: "/home/r/ops" }), "/home/r")).toBe("ops");
	expect(displayName(parseAgent({ agent: "claude" }), "/home/r")).toBe("claude");
	expect(displayName(parseAgent({ cwd: "/home/r" }), "/home/r")).toBe("~ home");
	expect(displayName(parseAgent({ foreground_cwd: "", cwd: "/home/r/x" }), "/home/r")).toBe("x");
});

test("displayName treats any remote home directory as '~ home'", () => {
	expect(displayName(parseAgent({ cwd: "/home/someone" }), "/Users/me")).toBe("~ home");
	expect(displayName(parseAgent({ cwd: "/home/someone/" }), "/Users/me")).toBe("~ home");
	expect(displayName(parseAgent({ cwd: "/Users/someone" }), "/Users/me")).toBe("~ home");
	expect(displayName(parseAgent({ cwd: "/home" }), "/Users/me")).toBe("home");
});
