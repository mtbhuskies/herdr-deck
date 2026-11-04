import { expect, test } from "vitest";
import { agentsSegment, attentionSegment, pagesSegment, slotFace, tabsSegment, type FaceSource } from "../../src/actions/faces";
import { parseAgent, type Agent } from "../../src/herdr/types";
import { DeckModel } from "../../src/model/deck";

let t = 0;
const agent = (pane: string, status = "idle", cwd = `/home/r/${pane}`, focused = false): Agent =>
	parseAgent({ pane_id: pane, agent_status: status, cwd, focused });

function source(agents: Agent[], over: Partial<FaceSource> = {}): FaceSource {
	const model = new DeckModel(() => t);
	model.update(agents);
	return { model, reachable: true, pulseOn: false, notice: undefined, tabs: undefined, settings: { socketPath: "/Users/h/.herdr-remote.sock", terminalBundleId: "com.apple.Terminal", launchCommand: "" }, ...over };
}

test("agent slot shows name, status and the ring", () => {
	const src = source([agent("wiki", "working", "/home/r/wiki", true), agent("ops")]);
	expect(slotFace(src, 0)).toEqual({ kind: "agent", name: "wiki", status: "working", selected: true, dim: false });
	expect(slotFace(src, 1)).toMatchObject({ name: "ops", selected: false });
	expect(slotFace(src, 2)).toEqual({ kind: "empty" });
});

test("page 2 shows agents 9 and 10", () => {
	const src = source(Array.from({ length: 10 }, (_, i) => agent(`p${i}`)));
	src.model.turnPage(1);
	expect(slotFace(src, 1)).toMatchObject({ kind: "agent", name: "p9" });
});

test("offline bridge gives offline faces and the not-reachable segment with the socket path", () => {
	const src = source([agent("a")], { reachable: false });
	expect(slotFace(src, 0)).toEqual({ kind: "offline" });
	expect(agentsSegment(src)).toMatchObject({ headline: "Herdr not reachable", detail: "/Users/h/.herdr-remote.sock" });
});

test("blocked agent's face dims when pulseOn", () => {
	expect(slotFace(source([agent("b", "blocked")], { pulseOn: true }), 0)).toMatchObject({ dim: true });
	expect(slotFace(source([agent("i", "idle")], { pulseOn: true }), 0)).toMatchObject({ dim: false });
});

test("agents segment shows the selected agent and how long it has held its status", () => {
	t = 0;
	const src = source([agent("wiki", "working")]);
	t = 4 * 60_000 + 5000;
	expect(agentsSegment(src)).toMatchObject({ title: "Selected", headline: "wiki", detail: "working · 4m" });
	t = 30_000;
	expect(agentsSegment(src).detail).toBe("working · 30s");
	t = 2 * 3_600_000 + 60_000;
	expect(agentsSegment(src).detail).toBe("working · 2h");
	t = 0;
});

test("agents segment shows 'No agents' with zero agents", () => {
	expect(agentsSegment(source([]))).toMatchObject({ headline: "No agents" });
});

test("a notice replaces the agents detail", () => {
	expect(agentsSegment(source([agent("a")], { notice: "all quiet" })).detail).toBe("all quiet");
});

test("pages segment dims dots off the current page", () => {
	const src = source(Array.from({ length: 10 }, (_, i) => agent(`p${i}`, i === 9 ? "blocked" : "idle")));
	const seg = pagesSegment(src);
	expect(seg.headline).toBe("page 1 of 2");
	expect(seg.dots).toHaveLength(10);
	expect(seg.dots![0]).toEqual({ color: "#00C853", dim: false });
	expect(seg.dots![9]).toEqual({ color: "#FF2D2D", dim: true });
});

test("attention headline: 2 blocked > 1 unread > all quiet", () => {
	expect(attentionSegment(source([agent("a", "blocked"), agent("b", "blocked"), agent("c", "done")])).headline).toBe("2 blocked");
	expect(attentionSegment(source([agent("c", "done"), agent("w", "working")])).headline).toBe("1 unread");
	const quiet = attentionSegment(source([agent("i", "idle")]));
	expect(quiet.headline).toBe("all quiet");
	expect(quiet.title).toBe("Needs you");
	expect(quiet.dots).toHaveLength(4);
});

test("tabs segment shows the position or a dash", () => {
	expect(tabsSegment(source([], { tabs: { index: 2, count: 3 } }))).toEqual({ title: "Herdr tab", headline: "tab 2 of 3", detail: "turn to cycle" });
	expect(tabsSegment(source([])).headline).toBe("—");
});
