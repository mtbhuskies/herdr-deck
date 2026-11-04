import { SingletonAction, type DialDownEvent, type DialRotateEvent, type TouchTapEvent, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import type { Bridge } from "../bridge";
import type { Segment } from "../render/svg";
import { Painter } from "./draw";
import type { FaceSource } from "./faces";

/**
 * Shared shape of the four dials: each draws one strip segment from the
 * bridge and maps turn, press and tap onto bridge or model calls.
 */
export abstract class Dial extends SingletonAction {
	private painter = new Painter();

	constructor(protected readonly bridge: Bridge) {
		super();
		bridge.onChange(() => this.redraw());
	}

	protected abstract segment(src: FaceSource): Segment;
	protected abstract turn(ticks: number): void | Promise<void>;
	protected abstract press(): void | Promise<void>;

	override onWillAppear(ev: WillAppearEvent): void {
		this.painter.forget(ev.action.id);
		this.redraw();
	}

	override onWillDisappear(ev: WillDisappearEvent): void {
		this.painter.forget(ev.action.id);
	}

	override async onDialRotate(ev: DialRotateEvent): Promise<void> {
		await this.turn(ev.payload.ticks);
		this.bridge.changed();
	}

	override async onDialDown(_ev: DialDownEvent): Promise<void> {
		await this.press();
		this.bridge.changed();
	}

	override async onTouchTap(_ev: TouchTapEvent): Promise<void> {
		await this.press();
		this.bridge.changed();
	}

	private redraw(): void {
		const segment = this.segment(this.bridge);
		for (const instance of this.actions) this.painter.strip(instance, segment);
	}
}
