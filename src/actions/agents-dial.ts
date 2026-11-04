import { action } from "@elgato/streamdeck";
import { Dial } from "./dial";
import { agentsSegment, type FaceSource } from "./faces";

@action({ UUID: "com.mtbhuskies.herdr-deck.agents" })
export class AgentsDial extends Dial {
	protected segment(src: FaceSource) {
		return agentsSegment(src);
	}
	protected turn(ticks: number) {
		this.bridge.turnAgents(ticks);
	}
	protected press() {
		return this.bridge.goToSelected();
	}
}
