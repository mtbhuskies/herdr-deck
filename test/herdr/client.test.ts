import { afterEach, expect, test } from "vitest";
import { focusAgent, focusTab, HerdrError, listAgents, listTabs, request, subscribe } from "../../src/herdr/client";
import { parseAgent } from "../../src/herdr/types";
import { startFakeHerdr, type FakeHerdr } from "../helpers/fake-herdr";

let fake: FakeHerdr | undefined;
afterEach(async () => {
	await fake?.close();
	fake = undefined;
});

const until = async (check: () => boolean, ms = 1000) => {
	const end = Date.now() + ms;
	while (!check()) {
		if (Date.now() > end) throw new Error("timed out waiting");
		await new Promise((r) => setTimeout(r, 5));
	}
};

test("request sends a string id and one line, then resolves result", async () => {
	fake = await startFakeHerdr(() => ({ result: { agents: [] } }));
	const result = await request(fake.path, "agent.list");
	expect(result).toEqual({ agents: [] });
	expect(typeof fake.received[0].id).toBe("string");
	expect(fake.received[0].method).toBe("agent.list");
	expect(fake.received[0].params).toEqual({});
});

test("request rejects api with Herdr's message", async () => {
	fake = await startFakeHerdr(() => ({ error: { code: "x", message: "nope" } }));
	const err = await request(fake.path, "agent.list").catch((e) => e);
	expect(err).toBeInstanceOf(HerdrError);
	expect(err.code).toBe("api");
	expect(err.message).toBe("nope");
});

test("request reassembles a reply split across chunks", async () => {
	fake = await startFakeHerdr(() => ({ result: { agents: [{ pane_id: "w1:p1" }] } }), { splitReplies: true });
	expect(await request(fake.path, "agent.list")).toEqual({ agents: [{ pane_id: "w1:p1" }] });
});

test("request times out", async () => {
	fake = await startFakeHerdr(() => "silent");
	const err = await request(fake.path, "agent.list", {}, 200).catch((e) => e);
	expect(err).toBeInstanceOf(HerdrError);
	expect(err.code).toBe("timeout");
});

test("request on a missing socket rejects unreachable", async () => {
	const err = await request("/nonexistent/herdr.sock", "agent.list").catch((e) => e);
	expect(err).toBeInstanceOf(HerdrError);
	expect(err.code).toBe("unreachable");
});

test("listAgents and listTabs parse their results in server order", async () => {
	fake = await startFakeHerdr((req) =>
		req.method === "agent.list"
			? { result: { agents: [{ pane_id: "b" }, { pane_id: "a" }] } }
			: { result: { tabs: [{ tab_id: "t1", workspace_id: "w1", number: 1, focused: true }] } },
	);
	expect((await listAgents(fake.path)).map((a) => a.paneId)).toEqual(["b", "a"]);
	expect((await listTabs(fake.path))[0]).toEqual({ tabId: "t1", workspaceId: "w1", number: 1, focused: true });
});

test("focusAgent targets pane id, falls back to terminal id", async () => {
	fake = await startFakeHerdr(() => ({ result: {} }));
	await focusAgent(fake.path, parseAgent({ pane_id: "w1:p1", terminal_id: "t1" }));
	await focusAgent(fake.path, parseAgent({ terminal_id: "t2" }));
	await focusTab(fake.path, "tab9");
	expect(fake.received.map((r) => [r.method, r.params])).toEqual([
		["agent.focus", { target: "w1:p1" }],
		["agent.focus", { target: "t2" }],
		["tab.focus", { tab_id: "tab9" }],
	]);
});

test("subscribe skips the ack and delivers each line once, including two lines in one chunk", async () => {
	fake = await startFakeHerdr(() => ({ result: {} }));
	const events: unknown[] = [];
	const sub = subscribe(fake.path, [{ type: "pane.created" }], (e) => events.push(e), () => {});
	await until(() => fake!.received.length === 1);
	expect(fake.received[0]).toMatchObject({ id: "hd_sub", method: "events.subscribe", params: { subscriptions: [{ type: "pane.created" }] } });
	fake.pushRaw('{"n":1}\n{"n":2}\n{"n"');
	fake.pushRaw(":3}\n");
	await until(() => events.length === 3);
	expect(events).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
	sub.stop();
});

test("subscribe calls onClose when the server goes away", async () => {
	fake = await startFakeHerdr(() => ({ result: {} }));
	let closed = false;
	subscribe(fake.path, [{ type: "pane.created" }], () => {}, () => (closed = true));
	await until(() => fake!.received.length === 1);
	await fake.close();
	fake = undefined;
	await until(() => closed);
});

test("subscribe on a missing socket calls onClose", async () => {
	let closed = false;
	subscribe("/nonexistent/herdr.sock", [], () => {}, () => (closed = true));
	await until(() => closed);
});
