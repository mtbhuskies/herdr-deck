import { expect, test } from "vitest";
import { attentionRank, colorFor, COLORS, needsAttention } from "../../src/model/status";

test("colours match Micro Manager", () => {
	expect(COLORS).toEqual({ blocked: "#FF2D2D", working: "#FFA000", done: "#00B0FF", idle: "#00C853", unknown: "#00C853" });
	expect(colorFor("blocked")).toBe("#FF2D2D");
	expect(colorFor("wat")).toBe("#00C853");
});

test("only blocked and done need attention, blocked first", () => {
	expect(["blocked", "done", "working", "idle", "unknown"].map(needsAttention)).toEqual([true, true, false, false, false]);
	expect(attentionRank("blocked")).toBe(0);
	expect(attentionRank("done")).toBe(1);
	expect(attentionRank("working")).toBe(Infinity);
});
