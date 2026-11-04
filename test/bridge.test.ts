import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Bridge, nextTab, type HerdrApi } from "../src/bridge";
import { HerdrError } from "../src/herdr/client";
import { parseAgent, parseTab, type Agent, type Tab } from "../src/herdr/types";

const SETTINGS = { socketPath: "/tmp/herdr.sock", terminalBundleId: "com.apple.Terminal", launchCommand: "" };

const agent = (pane: string, status = "idle", focused = false): Agent => parseAgent({ pane_id: pane, agent_status: status, focused });
const tab = (id: string, ws: string, n: number, focused = false): Tab => parseTab({ tab_id: id, workspace_id: ws, number: n, focused });

class FakeApi implements HerdrApi {
	agents: Agent[] = [agent("p1"), agent("p2")];
	tabs: Tab[] = [tab("t1", "w1", 1, true), tab("t2", "w1", 2)];
	failing = false;
	calls: string[] = [];
	subs: { subs: object[]; onEvent: (e: Record<string, unknown>) => void; onClose: (e?: Error) => void; stopped: boolean }[] = [];

	async listAgents() {
		this.calls.push("agent.list");
		if (this.failing) throw new HerdrError("unreachable", "cannot reach Herdr");
		return this.agents;
	}
	async focusAgent(a: Agent) {
		this.calls.push(`agent.focus ${a.paneId}`);
	}
	async listTabs() {
		this.calls.push("tab.list");
		return this.tabs;
	}
	async focusTab(id: string) {
		this.calls.push(`tab.focus ${id}`);
	}
	subscribe(subs: object[], onEvent: (e: Record<string, unknown>) => void, onClose: (e?: Error) => void) {
		const entry = { subs, onEvent, onClose, stopped: false };
		this.subs.push(entry);
		return { stop: () => (entry.stopped = true) };
	}
	lists() {
		return this.calls.filter((c) => c === "agent.list").length;
	}
	lifecycle() {
		return this.subs.filter((s) => !s.stopped && (s.subs[0] as { type: string }).type === "pane.created");
	}
	paneStreams() {
		return this.subs.filter((s) => !s.stopped && (s.subs[0] as { type: string }).type === "pane.agent_status_changed").map((s) => (s.subs[0] as { pane_id: string }).pane_id);
	}
}

let api: FakeApi;
let raised: string[];
let launches: string[];
let watching: boolean;
let watchChecks: number;
let bridge: Bridge;
let paths: string[];

beforeEach(() => {
	vi.useFakeTimers();
	api = new FakeApi();
	raised = [];
	launches = [];
	watching = true;
	watchChecks = 0;
	paths = [];
	bridge = new Bridge({
		client: (path) => {
			paths.push(path);
			return api;
		},
		isWatching: async () => {
			watchChecks++;
			return watching;
		},
		raise: async (id, launchCommand) => {
			raised.push(id);
			launches.push(launchCommand);
		},
	});
});
afterEach(() => {
	bridge.stop();
	vi.useRealTimers();
});

test("start lists agents and fires onChange", async () => {
	const changes = vi.fn();
	bridge.onChange(changes);
	bridge.start(SETTINGS);
	await vi.advanceTimersByTimeAsync(0);
	expect(paths).toEqual(["/tmp/herdr.sock"]);
	expect(bridge.model.agents.map((a) => a.paneId)).toEqual(["p1", "p2"]);
	expect(bridge.reachable).toBe(true);
	expect(changes).toHaveBeenCalled();
});

test("an event triggers one refresh after 100 ms even if three arrive together", async () => {
	bridge.start(SETTINGS);
	await vi.advanceTimersByTimeAsync(0);
	const before = api.lists();
	const life = api.lifecycle()[0];
	life.onEvent({}); life.onEvent({}); life.onEvent({});
	await vi.advanceTimersByTimeAsync(99);
	expect(api.lists()).toBe(before);
	await vi.advanceTimersByTimeAsync(1);
	expect(api.lists()).toBe(before + 1);
});

test("poll refreshes every 2500 ms", async () => {
	bridge.start(SETTINGS);
	await vi.advanceTimersByTimeAsync(0);
	const before = api.lists();
	await vi.advanceTimersByTimeAsync(2500);
	expect(api.lists()).toBe(before + 1);
	await vi.advanceTimersByTimeAsync(2500);
	expect(api.lists()).toBe(before + 2);
});

test("a failing list marks unreachable, then recovers on a later poll", async () => {
	api.failing = true;
	bridge.start(SETTINGS);
	await vi.advanceTimersByTimeAsync(0);
	expect(bridge.reachable).toBe(false);
	expect(bridge.lastError).toBe("cannot reach Herdr");
	api.failing = false;
	await vi.advanceTimersByTimeAsync(2500);
	expect(bridge.reachable).toBe(true);
	expect(bridge.lastError).toBeUndefined();
});

test("a closed lifecycle stream is resubscribed after 3000 ms", async () => {
	bridge.start(SETTINGS);
	await vi.advanceTimersByTimeAsync(0);
	api.lifecycle()[0].onClose(new Error("tunnel dropped"));
	api.lifecycle()[0].stopped = true;
	expect(api.lifecycle()).toHaveLength(0);
	await vi.advanceTimersByTimeAsync(2999);
	expect(api.lifecycle()).toHaveLength(0);
	await vi.advanceTimersByTimeAsync(1);
	expect(api.lifecycle()).toHaveLength(1);
});

test("per-pane status streams are opened for new panes and stopped for gone ones", async () => {
	bridge.start(SETTINGS);
	await vi.advanceTimersByTimeAsync(0);
	expect(api.paneStreams().sort()).toEqual(["p1", "p2"]);
	api.agents = [agent("p2"), agent("p3")];
	await vi.advanceTimersByTimeAsync(2500);
	expect(api.paneStreams().sort()).toEqual(["p2", "p3"]);
});

test("goTo focuses by pane id, raises the configured terminal, and selects", async () => {
	bridge.start(SETTINGS);
	await vi.advanceTimersByTimeAsync(0);
	await bridge.goTo(bridge.model.agents[1]);
	expect(api.calls).toContain("agent.focus p2");
	expect(raised).toEqual(["com.apple.Terminal"]);
	expect(bridge.model.selectedKey()).toBe("p2");
});

test("goToAttention picks blocked before done; with none it sets notice 'all quiet'", async () => {
	api.agents = [agent("d", "done"), agent("b", "blocked")];
	bridge.start(SETTINGS);
	await vi.advanceTimersByTimeAsync(0);
	await bridge.goToAttention();
	expect(api.calls).toContain("agent.focus b");

	api.agents = [agent("i", "idle")];
	await vi.advanceTimersByTimeAsync(2500);
	await bridge.goToAttention();
	expect(bridge.notice).toBe("all quiet");
	await vi.advanceTimersByTimeAsync(2000);
	expect(bridge.notice).toBeUndefined();
});

test("tabs reports the focused tab's position in Herdr's order", async () => {
	api.tabs = [tab("a", "w1", 1), tab("e", "w1", 5, true), tab("c", "w1", 3), tab("z", "w2", 1)];
	bridge.start(SETTINGS);
	await vi.advanceTimersByTimeAsync(0);
	expect(bridge.tabs).toEqual({ index: 2, count: 3 });
});

test("cycleTab focuses the next tab in the focused workspace", async () => {
	bridge.start(SETTINGS);
	await vi.advanceTimersByTimeAsync(0);
	await bridge.cycleTab(1);
	expect(api.calls).toContain("tab.focus t2");
});

test("nextTab follows Herdr's own tab order, not tab numbers", () => {
	// Herdr lists tabs in the order it shows them; `number` is an id, and after
	// tabs close and open it is out of order (here 1, 5, 3).
	const tabs = [tab("w1:t1", "w1", 1, true), tab("w1:t5", "w1", 5), tab("w1:t3", "w1", 3), tab("w6:t1", "w6", 1)];
	expect(nextTab(tabs, 1)?.tabId).toBe("w1:t5");
	expect(nextTab(tabs, -1)?.tabId).toBe("w1:t3");
	const fromLast = tabs.map((t) => ({ ...t, focused: t.tabId === "w1:t3" }));
	expect(nextTab(fromLast, 1)?.tabId).toBe("w1:t1");
});

test("nextTab with a single tab in the workspace, or none focused, is undefined", () => {
	expect(nextTab([tab("a", "w1", 1, true), tab("z", "w2", 1)], 1)).toBeUndefined();
	expect(nextTab([tab("a", "w1", 1)], 1)).toBeUndefined();
});

test("blocked agents make the pulse toggle every 800 ms; none means steady", async () => {
	api.agents = [agent("b", "blocked")];
	bridge.start(SETTINGS);
	await vi.advanceTimersByTimeAsync(0);
	const first = bridge.pulseOn;
	await vi.advanceTimersByTimeAsync(800);
	expect(bridge.pulseOn).toBe(!first);
	api.agents = [agent("i", "idle")];
	await vi.advanceTimersByTimeAsync(2500);
	await vi.advanceTimersByTimeAsync(800);
	expect(bridge.pulseOn).toBe(false);
});

test("applySettings restarts against the new socket path", async () => {
	bridge.start(SETTINGS);
	await vi.advanceTimersByTimeAsync(0);
	bridge.applySettings({ ...SETTINGS, socketPath: "/tmp/other.sock" });
	await vi.advanceTimersByTimeAsync(0);
	expect(paths).toEqual(["/tmp/herdr.sock", "/tmp/other.sock"]);
	expect(api.lifecycle()).toHaveLength(1);
});

test("turning the agents dial goes to the agent once the turning settles", async () => {
	api.agents = [agent("p1", "idle", true), agent("p2"), agent("p3"), agent("p4")];
	bridge.start(SETTINGS);
	await vi.advanceTimersByTimeAsync(0);
	bridge.turnAgents(1);
	await vi.advanceTimersByTimeAsync(100);
	bridge.turnAgents(1);
	expect(bridge.model.selectedKey()).toBe("p3");
	await vi.advanceTimersByTimeAsync(249);
	expect(api.calls.filter((c) => c.startsWith("agent.focus"))).toEqual([]);
	await vi.advanceTimersByTimeAsync(1);
	expect(api.calls.filter((c) => c.startsWith("agent.focus"))).toEqual(["agent.focus p3"]);
	expect(raised).toEqual(["com.apple.Terminal"]);
});

test("turning the agents dial with no agents does nothing", async () => {
	api.agents = [];
	bridge.start(SETTINGS);
	await vi.advanceTimersByTimeAsync(0);
	bridge.turnAgents(1);
	await vi.advanceTimersByTimeAsync(500);
	expect(api.calls.filter((c) => c.startsWith("agent.focus"))).toEqual([]);
	expect(raised).toEqual([]);
});

test("pressing a key and the tabs dial hand the launch command to the terminal raise", async () => {
	bridge.start({ ...SETTINGS, launchCommand: "herdr --remote user@server" });
	await vi.advanceTimersByTimeAsync(0);
	await bridge.goTo(bridge.model.agents[0]);
	await bridge.raise();
	expect(launches).toEqual(["herdr --remote user@server", "herdr --remote user@server"]);
});

test("pressing a key with an agent goes to it; an empty key just opens or raises Terminal", async () => {
	bridge.start({ ...SETTINGS, launchCommand: "herdr --remote user@server" });
	await vi.advanceTimersByTimeAsync(0);
	await bridge.pressSlot(1);
	expect(api.calls).toContain("agent.focus p2");
	await bridge.pressSlot(5);
	expect(api.calls.filter((c) => c.startsWith("agent.focus"))).toHaveLength(1);
	expect(launches).toEqual(["herdr --remote user@server", "herdr --remote user@server"]);
});

test("pressing a key while Herdr is unreachable still opens or raises Terminal", async () => {
	api.failing = true;
	bridge.start({ ...SETTINGS, launchCommand: "herdr --remote user@server" });
	await vi.advanceTimersByTimeAsync(0);
	await bridge.pressSlot(0);
	expect(launches).toEqual(["herdr --remote user@server"]);
});

// Herdr marks a finished agent idle, not done, whenever its pane is focused,
// even with no window attached. The deck covers for that from the Mac side.
test("an agent that finishes while you are not watching shows as done until you go to it", async () => {
	api.agents = [agent("p1", "working", true), agent("p2")];
	bridge.start(SETTINGS);
	await vi.advanceTimersByTimeAsync(0);
	watching = false;
	api.agents = [agent("p1", "idle", true), agent("p2")];
	await vi.advanceTimersByTimeAsync(2500);
	expect(bridge.model.agents.map((a) => a.status)).toEqual(["done", "idle"]);
	expect(bridge.model.attentionList().map((a) => a.paneId)).toEqual(["p1"]);
	await vi.advanceTimersByTimeAsync(2500);
	expect(bridge.model.agents[0].status).toBe("done");

	await bridge.goTo(bridge.model.agents[0]);
	await vi.advanceTimersByTimeAsync(2500);
	expect(bridge.model.agents[0].status).toBe("idle");
});

test("an agent that finishes while you are watching stays idle", async () => {
	api.agents = [agent("p1", "working", true)];
	bridge.start(SETTINGS);
	await vi.advanceTimersByTimeAsync(0);
	api.agents = [agent("p1", "idle", true)];
	await vi.advanceTimersByTimeAsync(2500);
	expect(bridge.model.agents[0].status).toBe("idle");
});

test("an unread agent that starts working again drops its unread mark", async () => {
	api.agents = [agent("p1", "working")];
	bridge.start(SETTINGS);
	await vi.advanceTimersByTimeAsync(0);
	watching = false;
	api.agents = [agent("p1", "idle")];
	await vi.advanceTimersByTimeAsync(2500);
	api.agents = [agent("p1", "working")];
	await vi.advanceTimersByTimeAsync(2500);
	watching = true;
	api.agents = [agent("p1", "idle")];
	await vi.advanceTimersByTimeAsync(2500);
	expect(bridge.model.agents[0].status).toBe("idle");
});

test("the Mac is only asked whether you are watching when an agent finishes", async () => {
	api.agents = [agent("p1", "working"), agent("p2", "idle")];
	bridge.start(SETTINGS);
	await vi.advanceTimersByTimeAsync(0);
	await vi.advanceTimersByTimeAsync(5000);
	expect(watchChecks).toBe(0);
	api.agents = [agent("p1", "idle"), agent("p2", "idle")];
	await vi.advanceTimersByTimeAsync(2500);
	expect(watchChecks).toBe(1);
	await vi.advanceTimersByTimeAsync(5000);
	expect(watchChecks).toBe(1);
});

test("an agent idle when the plugin starts is not marked unread", async () => {
	watching = false;
	api.agents = [agent("p1", "idle")];
	bridge.start(SETTINGS);
	await vi.advanceTimersByTimeAsync(2500);
	expect(bridge.model.agents[0].status).toBe("idle");
	expect(watchChecks).toBe(0);
});
