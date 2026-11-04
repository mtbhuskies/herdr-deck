import type { Action } from "@elgato/streamdeck";
import { keySvg, stripSvg, toDataUrl, type KeyFace, type Segment } from "../render/svg";

/**
 * Sends an image or strip only when it differs from what that instance last
 * showed. Redraws fire on every poll, and most of them change nothing.
 */
export class Painter {
	private last = new Map<string, string>();

	forget(id: string): void {
		this.last.delete(id);
	}

	key(action: Action<any>, face: KeyFace): void {
		if (!action.isKey()) return;
		const url = toDataUrl(keySvg(face));
		if (this.last.get(action.id) === url) return;
		this.last.set(action.id, url);
		void action.setImage(url);
	}

	strip(action: Action<any>, segment: Segment): void {
		if (!action.isDial()) return;
		const url = toDataUrl(stripSvg(segment));
		if (this.last.get(action.id) === url) return;
		this.last.set(action.id, url);
		void action.setFeedback({ canvas: url });
	}
}
