import { homedir } from "node:os";
import { agentKey, displayName } from "../herdr/types";
import { KEYS_PER_PAGE, type DeckModel } from "../model/deck";
import { COLORS, colorFor } from "../model/status";
import type { KeyFace, Segment } from "../render/svg";
import type { Settings } from "../settings";

/** The parts of the bridge a face is drawn from. */
export interface FaceSource {
	model: DeckModel;
	reachable: boolean;
	pulseOn: boolean;
	notice: string | undefined;
	tabs: { index: number; count: number } | undefined;
	settings: Settings | undefined;
}

const home = homedir();

function age(ms: number): string {
	const s = Math.floor(ms / 1000);
	if (s < 60) return `${s}s`;
	if (s < 3600) return `${Math.floor(s / 60)}m`;
	return `${Math.floor(s / 3600)}h`;
}

export function slotFace(src: FaceSource, slot: number): KeyFace {
	if (!src.reachable) return { kind: "offline" };
	const a = src.model.agentAtSlot(slot);
	if (!a) return { kind: "empty" };
	return {
		kind: "agent",
		name: displayName(a, home),
		status: a.status,
		selected: agentKey(a) === src.model.selectedKey(),
		dim: a.status === "blocked" && src.pulseOn,
	};
}

export function agentsSegment(src: FaceSource): Segment {
	if (!src.reachable) return { title: "Selected", headline: "Herdr not reachable", detail: src.settings?.socketPath ?? "" };
	const index = src.model.selectedIndex();
	if (index < 0) return { title: "Selected", headline: "No agents", detail: src.notice };
	const a = src.model.agents[index];
	return {
		title: "Selected",
		headline: displayName(a, home),
		detail: src.notice ?? `${a.status} · ${age(src.model.since(a))}`,
	};
}

export function pagesSegment(src: FaceSource): Segment {
	const { model } = src;
	return {
		title: "Page",
		headline: `page ${model.page + 1} of ${model.pageCount}`,
		dots: model.agents.map((a, i) => ({ color: colorFor(a.status), dim: Math.floor(i / KEYS_PER_PAGE) !== model.page })),
	};
}

export function attentionSegment(src: FaceSource): Segment {
	const count = (status: string) => src.model.agents.filter((a) => a.status === status).length;
	const blocked = count("blocked");
	const unread = count("done");
	const headline = blocked ? `${blocked} blocked` : unread ? `${unread} unread` : "all quiet";
	const statuses = ["blocked", "done", "working", "idle"] as const;
	return {
		title: "Needs you",
		headline,
		detail: statuses
			.filter((s) => count(s) > 0)
			.map((s) => `${count(s)} ${s === "done" ? "unread" : s}`)
			.join(" · "),
		dots: statuses.map((s) => ({ color: COLORS[s], dim: count(s) === 0 })),
	};
}

export function tabsSegment(src: FaceSource): Segment {
	return {
		title: "Herdr tab",
		headline: src.tabs ? `tab ${src.tabs.index} of ${src.tabs.count}` : "—",
		detail: "turn to cycle",
	};
}
