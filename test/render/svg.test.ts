import { expect, test } from "vitest";
import { escapeXml, keySvg, stripSvg, toDataUrl } from "../../src/render/svg";

const face = (over: Partial<{ name: string; status: string; selected: boolean; dim: boolean }> = {}) =>
	({ kind: "agent", name: "wiki", status: "working", selected: false, dim: false, ...over }) as const;

/** No bare `&` that is not the start of an entity: the SVG would not parse. */
const wellEscaped = (svg: string) => !/&(?!amp;|lt;|gt;|quot;|apos;)/.test(svg);

/** Every <text> element with its own position and size, top to bottom. */
const texts = (svg: string) =>
	[...svg.matchAll(/<text ([^>]*)>([^<]*)<\/text>/g)].map((m) => ({
		text: m[2],
		x: Number(/\bx="([\d.]+)"/.exec(m[1])?.[1]),
		y: Number(/\by="([\d.]+)"/.exec(m[1])?.[1]),
		size: Number(/font-size="([\d.]+)"/.exec(m[1])?.[1]),
		fill: /\bfill="([^"]+)"/.exec(m[1])?.[1],
		stroke: /\bstroke="([^"]+)"/.exec(m[1])?.[1],
	}));
/** The white text a person reads; each has a black outline copy underneath. */
const labels = (svg: string) => texts(svg).filter((t) => !t.stroke);

test("agent key fills with the status colour", () => {
	const svg = keySvg(face({ status: "blocked" }));
	expect(svg).toContain('width="144"');
	expect(svg).toContain("#FF2D2D");
});

// The Stream Deck app's SVG renderer places only positioned <text> elements;
// <tspan> lines and letter-spacing are not drawn reliably, so neither is used.
test("every line of text is its own positioned element", () => {
	const svg = keySvg(face({ name: "acme-platform-api" }));
	expect(svg).not.toContain("<tspan");
	expect(svg).not.toContain("letter-spacing");
	for (const t of texts(svg)) {
		expect(Number.isFinite(t.x)).toBe(true);
		expect(Number.isFinite(t.y)).toBe(true);
	}
});

test("the name sits at the top, large and bold; the status at the bottom", () => {
	const svg = keySvg(face({ name: "wiki", status: "working" }));
	const [name, status] = labels(svg);
	expect(name).toMatchObject({ text: "wiki" });
	expect(name.y).toBeLessThan(50);
	expect(name.size).toBeGreaterThanOrEqual(22);
	expect(status).toMatchObject({ text: "WORKING" });
	expect(status.y).toBeGreaterThan(115);
	expect(status.size).toBeGreaterThanOrEqual(17);
	expect(labels(svg)).toHaveLength(2);
});

test("a dimmed key no longer uses the full colour", () => {
	expect(keySvg(face({ status: "blocked", dim: true }))).not.toContain("#FF2D2D");
});

// Like the Stream Deck's own titles: white text on a black outline, readable on every status colour.
test("text is white, drawn over a black outline of the same text", () => {
	for (const status of ["blocked", "working", "done", "idle"]) {
		const all = texts(keySvg(face({ name: "dailyGmailTriage", status })));
		const outlines = all.filter((t) => t.stroke);
		const white = labels(keySvg(face({ name: "dailyGmailTriage", status })));
		expect(white.map((t) => t.fill)).toEqual(["#FFFFFF", "#FFFFFF", "#FFFFFF"]);
		expect(outlines.map((t) => [t.text, t.x, t.y, t.stroke])).toEqual(white.map((t) => [t.text, t.x, t.y, "#000000"]));
		// Each outline is drawn before (underneath) its white copy.
		for (let i = 0; i < all.length; i += 2) expect([all[i].stroke, all[i + 1].stroke]).toEqual(["#000000", undefined]);
	}
});

test("selected key has a white ring; unselected has none", () => {
	expect(keySvg(face({ selected: true }))).toContain('stroke="#FFFFFF"');
	expect(keySvg(face())).not.toContain('stroke="#FFFFFF"');
});

test("long names wrap to two lines and ellipsise", () => {
	const lines = labels(keySvg(face({ name: "acme-platform-api-and-more" }))).slice(0, 2).map((t) => t.text);
	expect(lines[0]).toBe("acme-");
	expect(lines[1].endsWith("…")).toBe(true);
	expect(lines.every((l) => l.length <= 10)).toBe(true);
});

test("long lines shrink so they fit inside the key; short names stay large", () => {
	for (const name of ["BigProject-Backend", "WWWWWWWWWW", "acme-billing-service"]) {
		for (const t of labels(keySvg(face({ name }))).slice(0, -1)) {
			// Bold Helvetica averages about 0.62 em a character; leave the ring's 6 px clear.
			expect(t.text.length * t.size * 0.62).toBeLessThanOrEqual(128);
		}
	}
	expect(labels(keySvg(face({ name: "wiki" })))[0].size).toBe(24);
});

test("camel-case names break at a word boundary", () => {
	expect(labels(keySvg(face({ name: "dailyGmailTriage" }))).slice(0, 2).map((t) => t.text)).toEqual(["dailyGmail", "Triage"]);
});

test("short names stay on one line", () => {
	expect(labels(keySvg(face({ name: "wiki" })))).toHaveLength(2);
});

test("names are XML-escaped", () => {
	const svg = keySvg(face({ name: "a&b<c" }));
	expect(svg).toContain("a&amp;b&lt;c");
	expect(wellEscaped(svg)).toBe(true);
	expect(escapeXml(`"'<>&`)).toBe("&quot;&apos;&lt;&gt;&amp;");
});

test("empty and offline faces have no text", () => {
	for (const kind of ["empty", "offline"] as const) {
		const svg = keySvg({ kind });
		expect(svg).not.toContain("<text");
	}
	expect(keySvg({ kind: "empty" })).toContain("#24272E");
	expect(keySvg({ kind: "offline" })).toContain("#3A3E47");
});

test("strip segment renders title, headline and one circle per dot", () => {
	const svg = stripSvg({ title: "Page", headline: "page 1 of 2", detail: "x & y", dots: [{ color: "#FF2D2D", dim: false }, { color: "#00C853", dim: true }] });
	expect(svg).toContain('width="200"');
	expect(svg).toContain(">PAGE<");
	expect(svg).toContain(">page 1 of 2<");
	expect(svg.match(/<circle/g)).toHaveLength(2);
	expect(svg).not.toContain("letter-spacing");
	expect(wellEscaped(svg)).toBe(true);
});

test("a long strip headline is ellipsised", () => {
	const svg = stripSvg({ title: "Selected", headline: "acme-billing-service-with-a-very-long-name" });
	expect(svg).toMatch(/>[^<]{1,20}…</);
});

test("toDataUrl encodes as an svg data URL", () => {
	expect(toDataUrl("<svg>#</svg>")).toBe("data:image/svg+xml;charset=utf8,%3Csvg%3E%23%3C%2Fsvg%3E");
});
