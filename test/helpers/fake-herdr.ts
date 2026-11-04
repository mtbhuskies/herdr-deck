import { mkdtempSync } from "node:fs";
import { createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

type Request = { id: unknown; method: string; params?: Record<string, unknown> };

export interface FakeHerdr {
	path: string;
	received: Request[];
	/** Writes a line to every open subscription connection. */
	push(line: object): void;
	/** Writes raw text to every open subscription connection. */
	pushRaw(text: string): void;
	close(): Promise<void>;
}

/**
 * A stand-in Herdr on a temporary Unix socket. Each connection gets one reply
 * from `handler`, the same one-request-per-connection shape as the real one;
 * `events.subscribe` connections are acknowledged and kept open for `push`.
 */
export async function startFakeHerdr(
	handler: (req: Request) => object | "silent",
	opts: { splitReplies?: boolean } = {},
): Promise<FakeHerdr> {
	const path = join(mkdtempSync(join(tmpdir(), "herdr-")), "herdr.sock");
	const received: Request[] = [];
	const subscribers: Socket[] = [];
	const sockets = new Set<Socket>();

	const server = createServer((socket) => {
		sockets.add(socket);
		socket.on("close", () => sockets.delete(socket));
		socket.on("error", () => {});
		let buffer = "";
		socket.on("data", (chunk) => {
			buffer += chunk.toString();
			const newline = buffer.indexOf("\n");
			if (newline < 0) return;
			const req = JSON.parse(buffer.slice(0, newline)) as Request;
			buffer = buffer.slice(newline + 1);
			received.push(req);
			if (req.method === "events.subscribe") {
				subscribers.push(socket);
				socket.write(JSON.stringify({ id: req.id, result: { ok: true } }) + "\n");
				return;
			}
			const reply = handler(req);
			if (reply === "silent") return;
			const text = JSON.stringify({ id: req.id, ...reply }) + "\n";
			if (opts.splitReplies) {
				const half = Math.floor(text.length / 2);
				socket.write(text.slice(0, half));
				setTimeout(() => socket.write(text.slice(half)), 20);
			} else {
				socket.write(text);
			}
		});
	});
	await new Promise<void>((resolve) => server.listen(path, resolve));

	return {
		path,
		received,
		push: (line) => subscribers.forEach((s) => s.write(JSON.stringify(line) + "\n")),
		pushRaw: (text) => subscribers.forEach((s) => s.write(text)),
		close: () =>
			new Promise<void>((resolve) => {
				sockets.forEach((s) => s.destroy());
				server.close(() => resolve());
			}),
	};
}
