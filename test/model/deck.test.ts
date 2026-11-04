import { beforeEach, expect, test } from "vitest";
import { parseAgent, type Agent } from "../../src/herdr/types";
import { DeckModel } from "../../src/model/deck";

let t = 0;
let m: DeckModel;
beforeEach(() => {
	t = 0;
	m = new DeckModel(() => t);
});

const agent = (pane: string, status = "idle", focused = false): Agent =>
	parseAgent({ pane_id: pane, agent_status: status, focused });
const ten = (focusedAt = -1) => Array.from({ length: 10 }, (_, i) => agent(`p${i}`, "idle", i === focusedAt));

test("ten agents make two pages; slot 0 on page 2 is agent 9", () => {
	m.update(ten());
	expect(m.pageCount).toBe(2);
	expect(m.agentAtSlot(0)?.paneId).toBe("p0");
	m.turnPage(1);
	expect(m.page).toBe(1);
	expect(m.agentAtSlot(0)?.paneId).toBe("p8");
	expect(m.agentAtSlot(2)).toBeUndefined();
});

test("selection follows Herdr focus when not locked", () => {
	m.update(ten(3));
	expect(m.selectedKey()).toBe("p3");
	m.update(ten(9));
	expect(m.selectedKey()).toBe("p9");
	expect(m.page).toBe(1);
});

test("turning dial 1 locks follow for 10 s, then focus wins again", () => {
	m.update(ten(0));
	m.turnSelection(2);
	expect(m.selectedKey()).toBe("p2");
	t = 9999;
	m.update(ten(0));
	expect(m.selectedKey()).toBe("p2");
	t = 10000;
	m.update(ten(0));
	expect(m.selectedKey()).toBe("p0");
});

test("turning pages locks follow too, and leaves the selection alone", () => {
	m.update(ten(0));
	m.turnPage(1);
	t = 5000;
	m.update(ten(0));
	expect(m.page).toBe(1);
	expect(m.selectedKey()).toBe("p0");
});

test("turnSelection wraps and flips page", () => {
	m.update(ten(7));
	m.turnSelection(1);
	expect(m.selectedIndex()).toBe(8);
	expect(m.page).toBe(1);
	m.update(ten(0));
	t = 20000;
	m.update(ten(0));
	m.turnSelection(-1);
	expect(m.selectedIndex()).toBe(9);
	m.turnSelection(1);
	expect(m.selectedIndex()).toBe(0);
	expect(m.page).toBe(0);
});

test("turnPage wraps and resetPage returns to page 1", () => {
	m.update(ten());
	m.turnPage(-1);
	expect(m.page).toBe(1);
	m.turnPage(1);
	expect(m.page).toBe(0);
	m.turnPage(1);
	m.resetPage();
	expect(m.page).toBe(0);
});

test("select clears the lock so focus is followed on the next update", () => {
	m.update(ten(0));
	m.turnSelection(4);
	m.select(m.agents[6]);
	expect(m.selectedKey()).toBe("p6");
	m.update(ten(1));
	expect(m.selectedKey()).toBe("p1");
});

test("selection is held by identity when agents shift order", () => {
	m.update([agent("a"), agent("b"), agent("c")]);
	m.turnSelection(1);
	expect(m.selectedKey()).toBe("b");
	m.update([agent("x"), agent("a"), agent("b"), agent("c")]);
	expect(m.selectedKey()).toBe("b");
	expect(m.selectedIndex()).toBe(2);
});

test("selected agent vanishing falls back to focused, then first; page clamps", () => {
	m.update(ten());
	m.turnSelection(9);
	expect(m.page).toBe(1);
	const without9 = ten(4).slice(0, 9);
	m.update(without9.slice(0, 8));
	expect(m.selectedKey()).toBe("p4");
	expect(m.page).toBe(0);
	m.turnSelection(3); // p7, locked
	m.update([agent("q0"), agent("q1")]);
	expect(m.selectedKey()).toBe("q0");
	expect(m.page).toBe(0);
});

test("attentionList is blocked first, then done, longest-waiting first, and does not reorder agents", () => {
	m.update([agent("d1", "done"), agent("w", "working"), agent("b1", "blocked")]);
	t = 1000;
	m.update([agent("d1", "done"), agent("w", "working"), agent("b1", "blocked"), agent("b2", "blocked"), agent("d2", "done")]);
	expect(m.attentionList().map((a) => a.paneId)).toEqual(["b1", "b2", "d1", "d2"]);
	expect(m.agents.map((a) => a.paneId)).toEqual(["d1", "w", "b1", "b2", "d2"]);
});

test("turnAttention steps through only agents needing attention", () => {
	m.update([agent("i", "idle", true), agent("d", "done"), agent("w", "working"), agent("b", "blocked")]);
	m.turnAttention(1);
	expect(m.selectedKey()).toBe("b");
	m.turnAttention(1);
	expect(m.selectedKey()).toBe("d");
	m.turnAttention(1);
	expect(m.selectedKey()).toBe("b");
	m.turnAttention(-1);
	expect(m.selectedKey()).toBe("d");
});

test("since resets when status changes and holds while it doesn't", () => {
	m.update([agent("a", "working")]);
	t = 4000;
	m.update([agent("a", "working")]);
	expect(m.since(m.agents[0])).toBe(4000);
	t = 5000;
	m.update([agent("a", "done")]);
	expect(m.since(m.agents[0])).toBe(0);
	t = 6500;
	expect(m.since(m.agents[0])).toBe(1500);
});

test("zero agents: no selection, pageCount 1, turns are no-ops", () => {
	m.update([]);
	expect(m.selectedKey()).toBeUndefined();
	expect(m.selectedIndex()).toBe(-1);
	expect(m.pageCount).toBe(1);
	expect(() => {
		m.turnSelection(1);
		m.turnPage(1);
		m.turnAttention(1);
		m.resetPage();
	}).not.toThrow();
	expect(m.page).toBe(0);
	expect(m.agentAtSlot(0)).toBeUndefined();
	expect(m.attentionList()).toEqual([]);
});
