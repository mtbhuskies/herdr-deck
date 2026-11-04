import * as herdr from "./herdr/client";
import type { Subscription } from "./herdr/client";
import { agentKey, type Agent, type Tab } from "./herdr/types";
import { DeckModel } from "./model/deck";
import type { Settings } from "./settings";

export const DEBOUNCE_MS = 100;
export const POLL_MS = 2500;
export const RESUBSCRIBE_MS = 3000;
export const PULSE_MS = 800;
export const NOTICE_MS = 2000;
/** Dial 1 goes to the agent it lands on once the turning stops for this long. */
export const SETTLE_MS = 250;

/** Herdr, bound to one socket path. */
export interface HerdrApi {
	listAgents(): Promise<Agent[]>;
	focusAgent(a: Agent): Promise<void>;
	listTabs(): Promise<Tab[]>;
	focusTab(tabId: string): Promise<void>;
	subscribe(subscriptions: object[], onEvent: (e: Record<string, unknown>) => void, onClose: (err?: Error) => void): Subscription;
}

export function socketClient(socketPath: string): HerdrApi {
	return {
		listAgents: () => herdr.listAgents(socketPath),
		focusAgent: (a) => herdr.focusAgent(socketPath, a),
		listTabs: () => herdr.listTabs(socketPath),
		focusTab: (id) => herdr.focusTab(socketPath, id),
		subscribe: (subs, onEvent, onClose) => herdr.subscribe(socketPath, subs, onEvent, onClose),
	};
}

/**
 * The focused tab's workspace, in the order Herdr shows its tabs. That is the
 * order `tab.list` returns them in; `number` is an id, and once tabs have
 * closed and opened it no longer matches position, so it is never sorted on.
 */
function workspaceTabs(tabs: Tab[]): { focused: Tab; siblings: Tab[] } | undefined {
	const focused = tabs.find((t) => t.focused);
	if (!focused) return undefined;
	return { focused, siblings: tabs.filter((t) => t.workspaceId === focused.workspaceId) };
}

/** The tab after (or before) the focused one, within its workspace. */
export function nextTab(tabs: Tab[], direction: 1 | -1): Tab | undefined {
	const found = workspaceTabs(tabs);
	if (!found) return undefined;
	const { focused, siblings } = found;
	if (siblings.length < 2) return undefined;
	const at = siblings.indexOf(focused);
	return siblings[(at + direction + siblings.length) % siblings.length];
}

const LIFECYCLE = [{ type: "pane.created" }, { type: "pane.closed" }, { type: "pane.exited" }, { type: "pane.agent_detected" }];

/**
 * Keeps the deck model in step with Herdr and carries out what the keys and
 * dials ask for. Events are the fast path; the poll is the safety net,
 * because an event stream through an SSH tunnel can die without a word.
 */
export class Bridge {
	readonly model: DeckModel;
	reachable = false;
	lastError: string | undefined;
	tabs: { index: number; count: number } | undefined;
	pulseOn = false;
	/** A short-lived message for the strip, such as "all quiet". */
	notice: string | undefined;
	settings: Settings | undefined;

	private api: HerdrApi | undefined;
	private running = false;
	private listeners = new Set<() => void>();
	private lifecycle: Subscription | undefined;
	private paneStreams = new Map<string, Subscription>();
	private timers = new Set<ReturnType<typeof setTimeout>>();
	private poll: ReturnType<typeof setInterval> | undefined;
	private pulse: ReturnType<typeof setInterval> | undefined;
	private debounce: ReturnType<typeof setTimeout> | undefined;
	private noticeTimer: ReturnType<typeof setTimeout> | undefined;
	private settleTimer: ReturnType<typeof setTimeout> | undefined;
	private refreshing = false;
	/** Each agent's status as Herdr last reported it, before the unread mark. */
	private rawStatus = new Map<string, string>();
	/** Agents that finished while you were not watching, shown as done until you go to them. */
	private unread = new Set<string>();
	private refreshAgain = false;

	constructor(
		private readonly deps: {
			client: (socketPath: string) => HerdrApi;
			raise: (bundleId: string, launchCommand: string) => Promise<void>;
			/** Whether you are looking at Herdr on the Mac right now. */
			isWatching?: (bundleId: string) => Promise<boolean>;
			now?: () => number;
		},
	) {
		this.model = new DeckModel(deps.now ?? Date.now);
	}

	onChange(cb: () => void): () => void {
		this.listeners.add(cb);
		return () => this.listeners.delete(cb);
	}

	/** Tells every listener to redraw; actions call it after turning the model. */
	changed(): void {
		for (const cb of this.listeners) cb();
	}

	start(settings: Settings): void {
		this.stop();
		this.settings = settings;
		this.api = this.deps.client(settings.socketPath);
		this.running = true;
		this.subscribeLifecycle();
		this.poll = setInterval(() => void this.refresh(), POLL_MS);
		this.pulse = setInterval(() => this.tickPulse(), PULSE_MS);
		void this.refresh();
	}

	stop(): void {
		this.running = false;
		clearInterval(this.poll);
		clearInterval(this.pulse);
		clearTimeout(this.debounce);
		clearTimeout(this.noticeTimer);
		clearTimeout(this.settleTimer);
		this.debounce = undefined;
		for (const t of this.timers) clearTimeout(t);
		this.timers.clear();
		this.lifecycle?.stop();
		this.lifecycle = undefined;
		for (const s of this.paneStreams.values()) s.stop();
		this.paneStreams.clear();
		this.rawStatus.clear();
		this.unread.clear();
	}

	applySettings(settings: Settings): void {
		this.start(settings);
	}

	// MARK: Actions

	async goTo(a: Agent): Promise<void> {
		if (!this.api || !this.settings) return;
		try {
			await this.api.focusAgent(a);
			await this.deps.raise(this.settings.terminalBundleId, this.settings.launchCommand);
			this.unread.delete(agentKey(a));
			this.model.select(a);
		} catch (err) {
			this.lastError = (err as Error).message;
		}
		this.changed();
		this.schedule();
	}

	/**
	 * Dial 1: the ring moves with every click, and once the turning settles
	 * Herdr switches to that agent and Terminal comes forward. Waiting means a
	 * spin across several agents switches once, not once per click.
	 */
	turnAgents(ticks: number): void {
		this.model.turnSelection(ticks);
		clearTimeout(this.settleTimer);
		this.settleTimer = setTimeout(() => {
			this.settleTimer = undefined;
			void this.goToSelected();
		}, SETTLE_MS);
	}

	/**
	 * A key press. A key with an agent goes to it; an empty key, or any key
	 * while Herdr is out of reach, still brings Terminal up, which is how you
	 * get Herdr back when its window is closed.
	 */
	async pressSlot(slot: number): Promise<void> {
		const target = this.reachable ? this.model.agentAtSlot(slot) : undefined;
		if (target) return this.goTo(target);
		await this.raise();
	}

	async goToSelected(): Promise<void> {
		const index = this.model.selectedIndex();
		if (index >= 0) await this.goTo(this.model.agents[index]);
	}

	async goToAttention(): Promise<void> {
		const target = this.model.attentionList()[0];
		if (target) return this.goTo(target);
		this.notice = "all quiet";
		clearTimeout(this.noticeTimer);
		this.noticeTimer = setTimeout(() => {
			this.notice = undefined;
			this.changed();
		}, NOTICE_MS);
		this.changed();
	}

	async cycleTab(direction: 1 | -1): Promise<void> {
		if (!this.api) return;
		try {
			const next = nextTab(await this.api.listTabs(), direction);
			if (next) await this.api.focusTab(next.tabId);
		} catch (err) {
			this.lastError = (err as Error).message;
		}
		this.schedule();
	}

	async raise(): Promise<void> {
		if (this.settings) await this.deps.raise(this.settings.terminalBundleId, this.settings.launchCommand);
	}

	// MARK: Freshness

	private schedule(): void {
		if (!this.running || this.debounce) return;
		this.debounce = setTimeout(() => {
			this.debounce = undefined;
			void this.refresh();
		}, DEBOUNCE_MS);
	}

	private async refresh(): Promise<void> {
		if (!this.running || !this.api) return;
		if (this.refreshing) {
			this.refreshAgain = true;
			return;
		}
		this.refreshing = true;
		const api = this.api;
		try {
			const agents = await this.markUnread(await api.listAgents());
			if (api !== this.api) return;
			this.model.update(agents);
			this.reachable = true;
			this.lastError = undefined;
			this.reconcilePaneStreams(agents);
			try {
				this.tabs = tabPosition(await api.listTabs());
			} catch {
				this.tabs = undefined;
			}
		} catch (err) {
			if (api !== this.api) return;
			this.reachable = false;
			this.lastError = (err as Error).message;
		} finally {
			this.refreshing = false;
		}
		this.changed();
		if (this.refreshAgain) {
			this.refreshAgain = false;
			void this.refresh();
		}
	}

	/**
	 * Herdr calls a finished agent idle rather than done whenever its pane is
	 * focused, even with no window attached to see it. So when an agent goes
	 * from working to idle, the Mac is asked whether you are watching Herdr;
	 * if not, the deck shows it as done until you go to it or it works again.
	 */
	private async markUnread(agents: Agent[]): Promise<Agent[]> {
		const finished: string[] = [];
		for (const a of agents) {
			const key = agentKey(a);
			const before = this.rawStatus.get(key);
			if (a.status !== "idle") this.unread.delete(key);
			else if (before === "working") finished.push(key);
		}
		this.rawStatus = new Map(agents.map((a) => [agentKey(a), a.status]));
		for (const key of this.unread) if (!this.rawStatus.has(key)) this.unread.delete(key);

		if (finished.length && this.deps.isWatching && this.settings) {
			const watching = await this.deps.isWatching(this.settings.terminalBundleId).catch(() => true);
			if (!watching) for (const key of finished) this.unread.add(key);
		}
		return agents.map((a) => (this.unread.has(agentKey(a)) ? { ...a, status: "done" } : a));
	}

	private subscribeLifecycle(): void {
		if (!this.running || !this.api) return;
		this.lifecycle = this.api.subscribe(
			LIFECYCLE,
			() => this.schedule(),
			() => {
				this.lifecycle = undefined;
				if (!this.running) return;
				const t = setTimeout(() => {
					this.timers.delete(t);
					this.subscribeLifecycle();
				}, RESUBSCRIBE_MS);
				this.timers.add(t);
			},
		);
	}

	/** One stream per agent pane: a subscription cannot be widened after it starts. */
	private reconcilePaneStreams(agents: Agent[]): void {
		if (!this.api) return;
		const wanted = new Set(agents.map((a) => a.paneId).filter((p): p is string => !!p));
		for (const [pane, stream] of this.paneStreams) {
			if (!wanted.has(pane)) {
				stream.stop();
				this.paneStreams.delete(pane);
			}
		}
		for (const pane of wanted) {
			if (this.paneStreams.has(pane)) continue;
			const stream = this.api.subscribe(
				[{ type: "pane.agent_status_changed", pane_id: pane }],
				() => this.schedule(),
				() => this.paneStreams.delete(pane),
			);
			this.paneStreams.set(pane, stream);
		}
	}

	private tickPulse(): void {
		const anyBlocked = this.model.agents.some((a) => a.status === "blocked");
		if (anyBlocked) this.pulseOn = !this.pulseOn;
		else if (this.pulseOn) this.pulseOn = false;
		else return;
		this.changed();
	}
}

function tabPosition(tabs: Tab[]): { index: number; count: number } | undefined {
	const found = workspaceTabs(tabs);
	if (!found) return undefined;
	return { index: found.siblings.indexOf(found.focused) + 1, count: found.siblings.length };
}

