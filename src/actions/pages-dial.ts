import { action } from "@elgato/streamdeck";
import { Dial } from "./dial";
import { pagesSegment, type FaceSource } from "./faces";

@action({ UUID: "com.mtbhuskies.herdr-deck.pages" })
export class PagesDial extends Dial {
	protected segment(src: FaceSource) {
		return pagesSegment(src);
	}
	protected turn(ticks: number) {
		this.bridge.model.turnPage(ticks);
	}
	protected press() {
		this.bridge.model.resetPage();
	}
}
