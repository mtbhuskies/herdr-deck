/** Status colours, identical to Micro Manager's so an agent looks the same on both devices. */
export const COLORS = {
	blocked: "#FF2D2D",
	working: "#FFA000",
	// Finished and not yet looked at.
	done: "#00B0FF",
	// Finished and seen.
	idle: "#00C853",
	unknown: "#00C853",
} as const;

export function colorFor(status: string): string {
	return (COLORS as Record<string, string>)[status] ?? COLORS.unknown;
}

export function needsAttention(status: string): boolean {
	return status === "blocked" || status === "done";
}

/** Lower is more urgent; agents that need nothing rank last. */
export function attentionRank(status: string): number {
	if (status === "blocked") return 0;
	if (status === "done") return 1;
	return Infinity;
}
