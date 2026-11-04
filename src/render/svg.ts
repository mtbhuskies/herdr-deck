import { colorFor } from "../model/status";

/**
 * Key and touch-strip images, drawn as SVG. A key has to read from across the
 * desk by colour alone, so the colour fills the whole key and the text sits
 * on it, small and dark.
 */

export type KeyFace =
	| { kind: "agent"; name: string; status: string; selected: boolean; dim: boolean }
	| { kind: "empty" }
	| { kind: "offline" };

export interface Segment {
	title: string;
	headline: string;
	detail?: string;
	dots?: { color: string; dim: boolean }[];
}

const KEY = 144;
const EMPTY = "#24272E";
const OFFLINE = "#3A3E47";
// The Stream Deck app draws these with its own SVG renderer, which does not
// know -apple-system and places only positioned <text> elements: no <tspan>
// lines, no letter-spacing.
const FONT = "Helvetica, Arial, sans-serif";
const LINE = 10;

export function escapeXml(s: string): string {
	return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
}

export function toDataUrl(svg: string): string {
	return "data:image/svg+xml;charset=utf8," + encodeURIComponent(svg);
}

function ellipsise(s: string, max: number): string {
	return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

/** The darkened colour a blocked key pulses down to. */
function dimmed(hex: string): string {
	const n = parseInt(hex.slice(1), 16);
	const part = (shift: number) => Math.round(((n >> shift) & 0xff) * 0.45);
	return "#" + [16, 8, 0].map((s) => part(s).toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** At most two lines, breaking after a separator or before a camel-case capital where one fits. */
function wrapName(name: string): string[] {
	if (name.length <= LINE) return [name];
	let cut = -1;
	for (let i = 1; i <= LINE; i++) {
		if ("-_. ".includes(name[i - 1])) cut = i;
		else if (/[a-z]/.test(name[i - 1]) && /[A-Z]/.test(name[i] ?? "")) cut = i;
	}
	if (cut <= 0) cut = LINE;
	return [name.slice(0, cut), ellipsise(name.slice(cut), LINE)];
}

export function keySvg(face: KeyFace): string {
	const open = `<svg xmlns="http://www.w3.org/2000/svg" width="${KEY}" height="${KEY}" viewBox="0 0 ${KEY} ${KEY}">`;
	if (face.kind !== "agent") {
		return `${open}<rect width="${KEY}" height="${KEY}" fill="${face.kind === "empty" ? EMPTY : OFFLINE}"/></svg>`;
	}

	const base = colorFor(face.status);
	const fill = face.dim ? dimmed(base) : base;
	// White on a black outline, like the Stream Deck's own titles: readable on
	// every status colour and on the dark frame of a blocked key's pulse. The
	// outline is a stroked copy underneath, not paint-order, which the Stream
	// Deck renderer may not support.
	const text = (y: number, size: number, content: string) => {
		const at = `x="72" y="${y}" text-anchor="middle" font-family="${FONT}" font-size="${size}" font-weight="700"`;
		const body = escapeXml(content);
		return (
			`<text ${at} fill="#000000" stroke="#000000" stroke-width="${Math.max(4, Math.round(size / 4))}" stroke-linejoin="round">${body}</text>` +
			`<text ${at} fill="#FFFFFF">${body}</text>`
		);
	};
	const lines = wrapName(face.name);
	// As large as the longest line allows: bold Helvetica averages ~0.62 em a character.
	const size = Math.min(24, Math.floor(128 / (0.62 * Math.max(...lines.map((l) => l.length)))));
	const names = lines.map((line, i) => text(36 + i * (size + 4), size, line)).join("");
	const ring = face.selected ? `<rect x="3" y="3" width="138" height="138" rx="10" fill="none" stroke="#FFFFFF" stroke-width="6"/>` : "";

	return open + `<rect width="${KEY}" height="${KEY}" fill="${fill}"/>` + ring + names + text(126, 18, face.status.toUpperCase()) + `</svg>`;
}

export function stripSvg(seg: Segment): string {
	const dots = (seg.dots ?? [])
		.slice(0, 13)
		.map((d, i) => `<circle cx="${20 + i * 13}" cy="86" r="4.5" fill="${d.color}"${d.dim ? ' fill-opacity="0.4"' : ""}/>`)
		.join("");
	const detail = seg.detail
		? `<text x="16" y="70" font-family="${FONT}" font-size="12" fill="#D9DCE2">${escapeXml(ellipsise(seg.detail, 28))}</text>`
		: "";
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">` +
		`<rect width="200" height="100" fill="#0D0E11"/>` +
		`<text x="16" y="22" font-family="${FONT}" font-size="11" fill="#7D8492">${escapeXml(seg.title.toUpperCase())}</text>` +
		`<text x="16" y="48" font-family="${FONT}" font-size="18" font-weight="600" fill="#FFFFFF">${escapeXml(ellipsise(seg.headline, 18))}</text>` +
		detail +
		dots +
		`</svg>`
	);
}
