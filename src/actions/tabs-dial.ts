import { action } from "@elgato/streamdeck";
import { Dial } from "./dial";
import { tabsSegment, type FaceSource } from "./faces";

@action({ UUID: "com.mtbhuskies.herdr-deck.tabs" })
export class TabsDial extends Dial {
	protected segment(src: FaceSource) {
		return tabsSegment(src);
	}
	protected turn(ticks: number) {
		return this.bridge.cycleTab(ticks > 0 ? 1 : -1);
	}
	protected press() {
		return this.bridge.raise();
	}
}
