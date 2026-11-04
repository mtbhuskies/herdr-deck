import { agentKey, type Agent } from "../herdr/types";
import { attentionRank, needsAttention } from "./status";

export const KEYS_PER_PAGE = 8;
/** After a turn of dial 1, 2 or 3, the deck stops following Herdr's focus for this long. */
export const FOLLOW_LOCK_MS = 10_000;

const wrap = (n: number, size: number) => ((n % size) + size) % size;

/**
 * What the deck shows: the agents in Herdr's order, which one the ring is
 * on, which page is visible, and how long each agent has held its status.
 *
 * The selection is held by agent identity, never by index, so agents
 * appearing or closing elsewhere in the list do not move the ring.
 */
export class DeckModel {
	agents: Agent[] = [];
	page = 0;

	private selected: string | undefined;
	private lastTurn = -Infinity;
	private seen = new Map<string, { status: string; since: number }>();

	constructor(private readonly now: () => number = Date.now) {}

	get pageCount(): number {
		return Math.max(1, Math.ceil(this.agents.length / KEYS_PER_PAGE));
	}

	update(agents: Agent[]): void {
		this.agents = agents;
		const t = this.now();

		const present = new Set<string>();
		for (const a of agents) {
			const key = agentKey(a);
			present.add(key);
			const prior = this.seen.get(key);
			if (!prior || prior.status !== a.status) this.seen.set(key, { status: a.status, since: t });
		}
		for (const key of this.seen.keys()) if (!present.has(key)) this.seen.delete(key);

		const focused = agents.find((a) => a.focused);
		const locked = t - this.lastTurn < FOLLOW_LOCK_MS;
		if (focused && !locked) {
			this.show(focused);
		} else if (this.selected === undefined || !present.has(this.selected)) {
			const fallback = focused ?? agents[0];
			if (fallback) this.show(fallback);
			else this.selected = undefined;
		}
		this.page = Math.min(this.page, this.pageCount - 1);
	}

	selectedKey(): string | undefined {
		return this.selected;
	}

	selectedIndex(): number {
		return this.selected === undefined ? -1 : this.agents.findIndex((a) => agentKey(a) === this.selected);
	}

	agentAtSlot(slot: number): Agent | undefined {
		return this.agents[this.page * KEYS_PER_PAGE + slot];
	}

	/** Milliseconds since this agent's current status was first seen. */
	since(a: Agent): number {
		const entry = this.seen.get(agentKey(a));
		return entry ? this.now() - entry.since : 0;
	}

	turnSelection(ticks: number): void {
		if (this.agents.length === 0) return;
		const from = Math.max(0, this.selectedIndex());
		this.show(this.agents[wrap(from + ticks, this.agents.length)]);
		this.lastTurn = this.now();
	}

	turnPage(ticks: number): void {
		this.page = wrap(this.page + ticks, this.pageCount);
		this.lastTurn = this.now();
	}

	resetPage(): void {
		this.page = 0;
	}

	/** Agents needing attention, most urgent first; the agent list itself is never reordered. */
	attentionList(): Agent[] {
		return this.agents
			.filter((a) => needsAttention(a.status))
			.map((a, order) => ({ a, order, rank: attentionRank(a.status), since: this.since(a) }))
			.sort((x, y) => x.rank - y.rank || y.since - x.since || x.order - y.order)
			.map((x) => x.a);
	}

	turnAttention(ticks: number): void {
		const list = this.attentionList();
		if (list.length === 0) return;
		const at = list.findIndex((a) => agentKey(a) === this.selected);
		const next = at < 0 ? (ticks > 0 ? 0 : list.length - 1) : wrap(at + ticks, list.length);
		this.show(list[next]);
		this.lastTurn = this.now();
	}

	/** A press: the ring goes to this agent and the deck follows Herdr again. */
	select(a: Agent): void {
		this.show(a);
		this.lastTurn = -Infinity;
	}

	private show(a: Agent): void {
		this.selected = agentKey(a);
		const index = this.selectedIndex();
		if (index >= 0) this.page = Math.floor(index / KEYS_PER_PAGE);
	}
}
