import { action, SingletonAction, type KeyAction, type KeyDownEvent, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import type { Bridge } from "../bridge";
import { KEYS_PER_PAGE } from "../model/deck";
import { Painter } from "./draw";
import { slotFace } from "./faces";

/** Which agent a key shows comes from where it sits: reading order, eight to a page. */
function slotOf(key: KeyAction<any>): number {
	const at = key.coordinates;
	return at ? (at.row * 4 + at.column) % KEYS_PER_PAGE : 0;
}

@action({ UUID: "com.mtbhuskies.herdr-deck.agent" })
export class AgentKey extends SingletonAction {
	private painter = new Painter();

	constructor(private readonly bridge: Bridge) {
		super();
		bridge.onChange(() => this.redraw());
	}

	override onWillAppear(ev: WillAppearEvent): void {
		this.painter.forget(ev.action.id);
		this.redraw();
	}

	override onWillDisappear(ev: WillDisappearEvent): void {
		this.painter.forget(ev.action.id);
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		await this.bridge.pressSlot(slotOf(ev.action));
	}

	private redraw(): void {
		for (const instance of this.actions) {
			if (instance.isKey()) this.painter.key(instance, slotFace(this.bridge, slotOf(instance)));
		}
	}
}
