import { action } from "@elgato/streamdeck";
import { Dial } from "./dial";
import { attentionSegment, type FaceSource } from "./faces";

@action({ UUID: "com.mtbhuskies.herdr-deck.attention" })
export class AttentionDial extends Dial {
	protected segment(src: FaceSource) {
		return attentionSegment(src);
	}
	protected turn(ticks: number) {
		this.bridge.model.turnAttention(ticks);
	}
	protected press() {
		return this.bridge.goToAttention();
	}
}
