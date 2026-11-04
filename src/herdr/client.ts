import { createConnection, type Socket } from "node:net";
import { parseAgent, parseTab, type Agent, type Tab } from "./types";

/**
 * Client for the Herdr socket API: newline-delimited JSON over a Unix socket.
 *
 * The server answers exactly one request per connection and then stops
 * listening, so every request opens its own short-lived connection. The one
 * exception is `events.subscribe`, which takes over its connection and pushes
 * events until the client hangs up.
 */

export type HerdrErrorCode = "unreachable" | "timeout" | "api" | "bad_response" | "closed";

export class HerdrError extends Error {
	constructor(
		readonly code: HerdrErrorCode,
		message: string,
	) {
		super(message);
		this.name = "HerdrError";
	}
}

type Json = Record<string, unknown>;

let counter = 0;

/** Splits a byte stream into lines, holding a partial line until it completes. */
function lineReader(onLine: (line: string) => void): (chunk: Buffer) => void {
	let buffer = "";
	return (chunk) => {
		buffer += chunk.toString("utf8");
		let newline: number;
		while ((newline = buffer.indexOf("\n")) >= 0) {
			const line = buffer.slice(0, newline).trim();
			buffer = buffer.slice(newline + 1);
			if (line) onLine(line);
		}
	};
}

export function request(socketPath: string, method: string, params: object = {}, timeoutMs = 5000): Promise<Json> {
	return new Promise((resolve, reject) => {
		let settled = false;
		let connected = false;
		const socket: Socket = createConnection({ path: socketPath });
		const finish = (err: HerdrError | undefined, value?: Json) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			socket.destroy();
			if (err) reject(err);
			else resolve(value!);
		};
		const timer = setTimeout(() => finish(new HerdrError("timeout", `${method} timed out after ${timeoutMs} ms`)), timeoutMs);

		socket.on("connect", () => {
			connected = true;
			const id = `hd_${++counter}`;
			socket.write(JSON.stringify({ id, method, params }) + "\n");
		});
		socket.on(
			"data",
			lineReader((line) => {
				let reply: Json;
				try {
					reply = JSON.parse(line);
				} catch {
					return finish(new HerdrError("bad_response", `unreadable reply to ${method}`));
				}
				const error = reply.error as Json | undefined;
				if (error) return finish(new HerdrError("api", String(error.message ?? "api error")));
				finish(undefined, (reply.result as Json) ?? {});
			}),
		);
		socket.on("error", (e) =>
			finish(connected ? new HerdrError("closed", e.message) : new HerdrError("unreachable", `cannot reach Herdr at ${socketPath}: ${e.message}`)),
		);
		socket.on("close", () => finish(new HerdrError("closed", `Herdr closed the connection during ${method}`)));
	});
}

export async function listAgents(socketPath: string): Promise<Agent[]> {
	const result = await request(socketPath, "agent.list");
	const raw = Array.isArray(result.agents) ? (result.agents as Json[]) : [];
	return raw.map(parseAgent);
}

/** `agent.focus` resolves pane ids only; the terminal id is a fallback for a Herdr without them. */
export async function focusAgent(socketPath: string, a: Agent): Promise<void> {
	await request(socketPath, "agent.focus", { target: a.paneId ?? a.terminalId ?? "" });
}

export async function listTabs(socketPath: string): Promise<Tab[]> {
	const result = await request(socketPath, "tab.list");
	const raw = Array.isArray(result.tabs) ? (result.tabs as Json[]) : [];
	return raw.map(parseTab);
}

export async function focusTab(socketPath: string, tabId: string): Promise<void> {
	await request(socketPath, "tab.focus", { tab_id: tabId });
}

export interface Subscription {
	stop(): void;
}

/**
 * Opens a dedicated event stream. The first line back acknowledges the
 * subscription; every line after it is an event. `onClose` fires once, when
 * the stream ends for any reason other than `stop()`.
 */
export function subscribe(
	socketPath: string,
	subscriptions: object[],
	onEvent: (event: Json) => void,
	onClose: (err?: Error) => void,
): Subscription {
	let stopped = false;
	let closed = false;
	let acknowledged = false;
	const socket = createConnection({ path: socketPath });
	const close = (err?: Error) => {
		if (stopped || closed) return;
		closed = true;
		onClose(err);
	};

	socket.on("connect", () => {
		socket.write(JSON.stringify({ id: "hd_sub", method: "events.subscribe", params: { subscriptions } }) + "\n");
	});
	socket.on(
		"data",
		lineReader((line) => {
			if (stopped) return;
			if (!acknowledged) {
				acknowledged = true;
				return;
			}
			try {
				onEvent(JSON.parse(line));
			} catch {
				// A garbled event only costs a refresh; the safety poll covers it.
			}
		}),
	);
	socket.on("error", (e) => close(e));
	socket.on("close", () => close());

	return {
		stop() {
			stopped = true;
			socket.destroy();
		},
	};
}
