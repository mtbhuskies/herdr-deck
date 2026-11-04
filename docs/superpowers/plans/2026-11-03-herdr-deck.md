# herdr-deck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Stream Deck+ plugin that shows Herdr agents as status-coloured keys, with four dials for agents, pages, "needs you" and tabs, and that brings Terminal.app forward when you jump to an agent.

**Architecture:** All logic lives in plain TypeScript modules that never import the Stream Deck SDK: the Herdr socket client, the deck state model, and the SVG renderers. These are unit-tested on Linux. A thin layer of SDK action classes subscribes to one shared `Bridge` and pushes images and touch-strip feedback. If the SDK's API drifts, only `src/actions/` changes.

**Tech Stack:** TypeScript 5, Node 20 (the Stream Deck app's runtime), `@elgato/streamdeck` 3.0.4, `@elgato/cli` 1.10.4, Rollup, and Vitest.

**Spec:** `docs/superpowers/specs/2026-11-03-herdr-deck-design.md`

## Global Constraints

- Plugin UUID `com.mtbhuskies.herdr-deck`. The folder is `com.mtbhuskies.herdr-deck.sdPlugin/` and the entry point is `bin/plugin.js`.
- Action UUIDs: `com.mtbhuskies.herdr-deck.agent` (Keypad), and `.agents`, `.pages`, `.attention`, `.tabs` (Encoder).
- Herdr request ids are **strings**. Make one request per connection. `agent.focus` takes `{"target": pane_id}` and falls back to `terminal_id` only when `pane_id` is missing.
- Keep agents in the server's order. **Never re-sort.**
- Colours: blocked `#FF2D2D` (pulses), working `#FFA000`, done `#00B0FF`, idle `#00C853`, and unknown or anything else `#00C853`. Attention order: blocked, then done. Within a status, the one waiting longest comes first.
- 8 agent keys per page, in reading order (left to right, top to bottom).
- Default settings: `socketPath` = `~/.config/herdr/herdr.sock`, `terminalBundleId` = `com.apple.Terminal`. Expand `~`.
- Timings: event debounce 100 ms, safety poll 2500 ms, request timeout 5000 ms, reconnect retry 3000 ms, blocked pulse 800 ms, and follow-focus lock 10000 ms after any turn of dial 1, 2 or 3.
- Never launch the terminal. Raise it only if it's already running.
- Unreachable Herdr: every agent key is dark grey (`#3A3E47`), and the Agents strip segment shows `Herdr not reachable` with the socket path.
- Platform: macOS only (`OS: [{Platform: "mac", MinimumVersion: "12"}]`). The code is developed and tested on Linux.
- Every task's code must keep these passing: `npm test`, `npm run build`, and `npx streamdeck validate com.mtbhuskies.herdr-deck.sdPlugin`.

## Review Focus

1. **The selected agent disappears.** For example, the ring is on agent 9 on page 2 and that pane closes. The ring should move to Herdr's focused agent, or failing that to the first agent, and the page should clamp to one that exists. Tested in Task 3.
2. **A Herdr reply arrives split across socket chunks, or an event chunk holds two lines.** Every line should parse exactly once. Tested in Task 2.
3. **The tunnel is up but Herdr never replies, or a stream closes mid-run.** The request should time out at 5000 ms and the deck should go "not reachable" and later recover, rather than freezing. Tested in Tasks 2 and 5.
4. **A very long project name**, for example `acme-platform-api`, or a name with `&` or `<`. It should be ellipsised or wrapped inside the key and XML-escaped, never cut off mid-glyph or producing broken SVG. Tested in Task 4.
5. **Zero agents.** All keys should be dark, the Agents strip should say `No agents`, and dial turns should do nothing and not throw. Tested in Tasks 3 and 4.

---

## File Structure

```
herdr-deck/
  package.json  tsconfig.json  rollup.config.mjs  vitest.config.ts  .gitignore  README.md
  src/
    herdr/types.ts       Agent, Tab, parseAgent, parseTab, displayName
    herdr/client.ts      request(), subscribe() over a Unix socket
    model/status.ts      colours, attention ranking
    model/deck.ts        DeckModel: agents, selection, page, follow lock, time-in-status
    render/svg.ts        keySvg(), stripSvg(), toDataUrl()
    bridge.ts            Bridge: polling, events, health, actions → Herdr
    terminal.ts          raiseTerminal(bundleId)
    settings.ts          Settings type, defaults, expandHome()
    actions/agent-key.ts actions/agents-dial.ts actions/pages-dial.ts
    actions/attention-dial.ts actions/tabs-dial.ts
    plugin.ts            entry: settings → Bridge → register actions
  test/                  *.test.ts mirroring src/
  com.mtbhuskies.herdr-deck.sdPlugin/
    manifest.json  layouts/strip.json  ui/settings.html  ui/sdpi-components.js  imgs/…
  .github/workflows/release.yml
```

---

### Task 1: Scaffold, Herdr types and names

**Files:**
- Create: `package.json`, `tsconfig.json`, `rollup.config.mjs`, `vitest.config.ts`, `.gitignore`, `src/herdr/types.ts`, `test/herdr/types.test.ts`, `com.mtbhuskies.herdr-deck.sdPlugin/manifest.json`, placeholder icons under `imgs/`

**Interfaces:**
- Produces:
  - `interface Agent { paneId?: string; terminalId?: string; tabId?: string; workspaceId?: string; agent: string; status: string; cwd?: string; foregroundCwd?: string; focused: boolean }`
  - `interface Tab { tabId: string; workspaceId: string; number: number; focused: boolean }`
  - `parseAgent(json: Record<string, unknown>): Agent`. It maps `pane_id`, `terminal_id`, `tab_id`, `workspace_id`, `agent` (default `"agent"`), `agent_status` (default `"unknown"`), `cwd`, `foreground_cwd` and `focused` (default false).
  - `parseTab(json): Tab`
  - `agentKey(a: Agent): string` = `paneId ?? terminalId ?? ""`. This is the identity used everywhere else.
  - `displayName(a: Agent, home: string): string`
  - Scripts: `npm test` (vitest run), `npm run build` (rollup → `com.mtbhuskies.herdr-deck.sdPlugin/bin/plugin.js`), `npm run pack` (`streamdeck pack com.mtbhuskies.herdr-deck.sdPlugin --output dist --force`).

- [ ] **Step 1:** Set up `package.json`. Pin dependencies at `@elgato/streamdeck@3.0.4`, and devDependencies at `@elgato/cli@1.10.4`, `typescript`, `rollup`, `@rollup/plugin-typescript`, `@rollup/plugin-node-resolve`, `@rollup/plugin-commonjs`, `vitest`. Use `"type": "module"` and an ESM Rollup output. Run `npm install`.
- [ ] **Step 2:** Write `manifest.json` with the UUIDs from Global Constraints. Use `SDKVersion: 2`, `Software.MinimumVersion: "6.5"`, `Nodejs.Version: "20"`, `CodePath: "bin/plugin.js"` and `PropertyInspectorPath: "ui/settings.html"`. The four encoder actions use `Controllers: ["Encoder"]` with `Encoder.layout: "layouts/strip.json"` and `TriggerDescription` text taken from the spec. Use simple SVG icons. Run `npx streamdeck validate com.mtbhuskies.herdr-deck.sdPlugin`. Expected: no errors (it may complain about files later tasks will create; if so, add empty stubs).
- [ ] **Step 3:** Write the failing tests in `test/herdr/types.test.ts`:

```ts
test("parseAgent maps snake_case and defaults", () => {
  const a = parseAgent({ pane_id: "w1:p1", agent_status: "blocked", foreground_cwd: "/home/r/MyProject" });
  expect(a).toMatchObject({ paneId: "w1:p1", status: "blocked", agent: "agent", focused: false });
  expect(parseAgent({}).status).toBe("unknown");
});
test("agentKey prefers pane id, falls back to terminal id", () => {
  expect(agentKey(parseAgent({ pane_id: "w1:p1", terminal_id: "t9" }))).toBe("w1:p1");
  expect(agentKey(parseAgent({ terminal_id: "t9" }))).toBe("t9");
});
test("displayName uses foreground_cwd, then cwd, then agent; home is '~ home'", () => {
  expect(displayName(parseAgent({ foreground_cwd: "/home/r/wiki", cwd: "/home/r" }), "/home/r")).toBe("wiki");
  expect(displayName(parseAgent({ cwd: "/home/r/ops" }), "/home/r")).toBe("ops");
  expect(displayName(parseAgent({ agent: "claude" }), "/home/r")).toBe("claude");
  expect(displayName(parseAgent({ cwd: "/home/r" }), "/home/r")).toBe("~ home");
  expect(displayName(parseAgent({ foreground_cwd: "", cwd: "/home/r/x" }), "/home/r")).toBe("x");
});
```

- [ ] **Step 4:** Run `npm test`. Expected: FAIL (module not found).
- [ ] **Step 5:** Implement `src/herdr/types.ts`. Empty strings count as missing. `home` is the **remote** user's home, which the plugin can't know, so `displayName` also treats any path matching `/home/<name>` or `/Users/<name>` with exactly two segments as home. Add that case to the test.
- [ ] **Step 6:** Run `npm test && npm run build`. Expected: PASS, and `bin/plugin.js` exists. `src/plugin.ts` can be an empty `streamDeck.connect()` for now.
- [ ] **Step 7:** Commit `chore: scaffold plugin; feat: Herdr agent types`.

---

### Task 2: Herdr socket client

**Files:**
- Create: `src/herdr/client.ts`, `test/herdr/client.test.ts`, `test/helpers/fake-herdr.ts`

**Interfaces:**
- Consumes: `parseAgent`, `parseTab` (Task 1)
- Produces:
  - `class HerdrError extends Error { code: string }`. Codes: `"unreachable"`, `"timeout"`, `"api"`, `"bad_response"`, `"closed"`.
  - `request(socketPath: string, method: string, params?: object, timeoutMs = 5000): Promise<Record<string, unknown>>`. It resolves with `result` and rejects `api` when the reply has `error` (message = `error.message`).
  - `listAgents(socketPath): Promise<Agent[]>`, `focusAgent(socketPath, a: Agent): Promise<void>`, `listTabs(socketPath): Promise<Tab[]>`, `focusTab(socketPath, tabId): Promise<void>`
  - `subscribe(socketPath: string, subscriptions: object[], onEvent: (e: Record<string, unknown>) => void, onClose: (err?: Error) => void): { stop(): void }`. The first line after connecting is the acknowledgement and is ignored. The subscription envelope uses id `"hd_sub"`.
  - `fake-herdr.ts`: `startFakeHerdr(handler: (req) => object | "silent", opts?: { splitReplies?: boolean }): Promise<{ path: string; close(): Promise<void>; received: object[]; push(line: object): void }>`. It listens on a temp Unix socket path and records each request. With `splitReplies`, it writes each reply in two chunks with a delay between them.

- [ ] **Step 1:** Write failing tests:
  - `request sends a string id and one line, then resolves result`. Assert `typeof received[0].id === "string"` and `received[0].method === "agent.list"`.
  - `request rejects api with Herdr's message`. The fake replies `{error:{code:"x",message:"nope"}}`; expect `HerdrError` with code `api` and message `nope`.
  - `request reassembles a reply split across chunks` (`splitReplies: true`). Review Focus 2.
  - `request times out` against a `"silent"` handler with `timeoutMs: 200`; expect code `timeout`. Review Focus 3.
  - `request on a missing socket rejects unreachable`.
  - `focusAgent targets pane id, falls back to terminal id`. Assert `params.target`.
  - `subscribe skips the ack and delivers each line once, including two lines in one chunk`. Review Focus 2.
  - `subscribe calls onClose when the server goes away`.
- [ ] **Step 2:** Run `npm test test/herdr/client.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement with `node:net` `createConnection({ path })`, using a line buffer that splits on `\n` and keeps the trailing partial line. Generate ids as `hd_<counter>`. Close the connection once the first reply line arrives.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat: Herdr socket client`.

---

### Task 3: Deck model

**Files:**
- Create: `src/model/status.ts`, `src/model/deck.ts`, `test/model/status.test.ts`, `test/model/deck.test.ts`

**Interfaces:**
- Consumes: `Agent`, `agentKey`, `Tab` (Task 1)
- Produces:
  - `status.ts`:
    - `COLORS: Record<"blocked"|"working"|"done"|"idle"|"unknown", string>`
    - `colorFor(status: string): string`. Unrecognised statuses get `#00C853`.
    - `needsAttention(status): boolean`, true for blocked or done.
    - `attentionRank(status): number`: blocked 0, done 1, otherwise `Infinity`.
  - `deck.ts`, `class DeckModel`, built with `constructor(now: () => number = Date.now)`:
    - `update(agents: Agent[]): void`. It replaces the list, updates time-in-status, and re-resolves the selection (below).
    - `readonly agents: Agent[]`, `page: number`, `pageCount: number` (`max(1, ceil(n/8))`)
    - `selectedKey(): string | undefined`, `selectedIndex(): number` (-1 if none)
    - `agentAtSlot(slot: 0..7): Agent | undefined`, the agent at `page*8 + slot`
    - `since(a: Agent): number`, ms since that agent's current status was first seen
    - `turnSelection(ticks: number): void`. It moves by ticks with wrap-around, sets the page to the selection's page, and starts the follow lock.
    - `turnPage(ticks: number): void`. Wraps, starts the follow lock, and leaves the selection where it is.
    - `resetPage(): void` sets `page = 0`.
    - `attentionList(): Agent[]`. Agents needing attention, sorted by `attentionRank`, then by longest `since` first. This is the one place sorting is allowed, and it never touches `agents` itself.
    - `turnAttention(ticks): void`. Steps the selection through `attentionList()` and starts the follow lock. Does nothing if the list is empty.
    - `select(a: Agent): void`. Sets the selection and its page and **clears** the follow lock. Used by every press.
    - Selection resolution on `update`: if the follow lock has expired (`now - lastTurn >= 10000`) and an agent is `focused`, select it and show its page. Otherwise keep the selected key if it still exists. If it's gone, use the focused agent, else the first, else none. Always clamp `page` to `pageCount - 1`.

- [ ] **Step 1:** Write failing tests with a fake clock (`let t = 0; const m = new DeckModel(() => t)`):
  - `colours match Micro Manager`. Check all five values from Global Constraints, plus `colorFor("wat") === "#00C853"`.
  - `ten agents make two pages; slot 0 on page 1 is agent 9`
  - `selection follows Herdr focus when not locked`
  - `turning dial 1 locks follow for 10 s, then focus wins again` (advance `t` by 9999, then 10000)
  - `turnSelection wraps and flips page` (from index 7, +1 → index 8, page 1; from 0, -1 → last)
  - `select clears the lock so focus is followed on the next update`
  - `selected agent vanishing falls back to focused, then first; page clamps` (Review Focus 1)
  - `attentionList is blocked first, then done, longest-waiting first, and does not reorder agents`
  - `since resets when status changes and holds while it doesn't`
  - `zero agents: no selection, pageCount 1, turns are no-ops` (Review Focus 5)
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Store the selection as an `agentKey`, never an index, so agents shifting order don't move the ring. Keep time-in-status in a `Map<key, {status, since}>`, and prune keys that are no longer present.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: deck model`.

---

### Task 4: SVG rendering

**Files:**
- Create: `src/render/svg.ts`, `test/render/svg.test.ts`

**Interfaces:**
- Consumes: `colorFor` (Task 3), `displayName` (Task 1)
- Produces:
  - `type KeyFace = { kind: "agent"; name: string; status: string; number: number; selected: boolean; dim: boolean } | { kind: "empty" } | { kind: "offline" }`
  - `keySvg(face: KeyFace): string`. A 144×144 SVG. For `agent`: full-bleed status colour (darkened about 55% when `dim`, which drives the blocked pulse), the name centred in dark text (at most 2 lines, about 11 characters per line, the last line ellipsised), the status word in small caps at the bottom, the number top-right, and a 6 px white inset ring when `selected`. `empty` is `#24272E` with no text. `offline` is `#3A3E47`.
  - `type Segment = { title: string; headline: string; detail?: string; dots?: { color: string; dim: boolean }[] }`
  - `stripSvg(seg: Segment): string`, 200×100 in the mockup's style: an uppercase grey title, a white headline (ellipsised to fit), a detail line, and a row of dots.
  - `toDataUrl(svg: string): string` = `data:image/svg+xml;charset=utf8,` + encodeURIComponent.
  - `escapeXml(s: string): string`

- [ ] **Step 1:** Write failing tests:
  - `agent key fills with the status colour` (`#FF2D2D` appears for blocked)
  - `selected key has a white ring; unselected has none`
  - `long names wrap to two lines and ellipsise`. `"acme-platform-api-and-more"` gives two `<tspan>` elements, and the last ends in `…` (Review Focus 4).
  - `names are XML-escaped`. `"a&b<c"` gives `a&amp;b&lt;c`, and the output parses with a minimal check: no raw `&` followed by a non-entity (Review Focus 4).
  - `empty and offline faces have no text`
  - `strip segment renders title, headline and one circle per dot`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement with template strings. Use a system sans font stack (`-apple-system, Helvetica, sans-serif`) and no external fonts.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: key and strip renderers`.

---

### Task 5: Bridge, terminal and settings

**Files:**
- Create: `src/bridge.ts`, `src/terminal.ts`, `src/settings.ts`, `test/bridge.test.ts`, `test/settings.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 3 and 4.
- Produces:
  - `settings.ts`:
    - `interface Settings { socketPath: string; terminalBundleId: string }`
    - `DEFAULTS`
    - `resolveSettings(raw: Partial<Settings> | undefined, home: string): Settings`. Applies defaults, expands a leading `~`, and turns empty strings back into defaults.
  - `terminal.ts`, `raiseTerminal(bundleId: string, run = execFileAsync): Promise<void>`. Runs `osascript -e 'application id "<id>" is running'`. Only if that prints `true`, runs `open -b <id>`. Errors are swallowed and logged. The bundle id is validated against `/^[A-Za-z0-9.-]+$/` before it's interpolated.
  - `bridge.ts`, `class Bridge`:
    - Construction: `constructor(deps: { client: HerdrApi; raise: (id: string) => Promise<void>; now?: () => number; timers?: TimerApi })`, where `HerdrApi` = `{ listAgents, focusAgent, listTabs, focusTab, subscribe }` bound to a path.
    - `start(settings: Settings): void`, `stop(): void`, `applySettings(s: Settings): void`. Applying settings restarts against the new path.
    - `readonly model: DeckModel`, `reachable: boolean`, `lastError?: string`, `tabs: { index: number; count: number } | undefined`
    - `onChange(cb: () => void): () => void`. Fires after any state change that would change what's drawn.
    - `pulseOn: boolean`. Toggles every 800 ms while any agent is blocked, then fires change.
    - Actions: `goTo(a: Agent): Promise<void>` (focus, then raise, then `model.select`); `goToSelected()`; `goToAttention()` (first of `attentionList`; if none, sets a transient `notice = "all quiet"` for 2 s); `cycleTab(direction: 1 | -1)`; `raise()`.
    - Each refresh calls `listAgents`, then `listTabs`, and sets `tabs` to the focused tab's position (1-based) and the number of tabs in its workspace. A failed `listTabs` sets `tabs = undefined` but does not affect `reachable`.
    - Freshness: subscribe to `pane.created`, `pane.closed`, `pane.exited`, `pane.agent_detected`, plus one `pane.agent_status_changed` stream per agent pane. Reconcile those streams after each list. Each event triggers a debounced (100 ms) refresh. Also poll every 2500 ms. A failed list sets `reachable = false` and `lastError`, and retries on the next poll. A lifecycle stream that closes is resubscribed after 3000 ms.
  - `nextTab(tabs: Tab[], direction: 1 | -1): Tab | undefined`, exported from `bridge.ts`. It works on the focused tab's workspace, sorted by `number`, and wraps. It returns undefined when there's no focused tab or only one tab.

- [ ] **Step 1:** Write failing tests using a fake `HerdrApi` and fake timers (`vi.useFakeTimers()`):
  - `resolveSettings expands ~ and fills defaults`
  - `start lists agents and fires onChange`
  - `an event triggers one refresh after 100 ms even if three arrive together`
  - `poll refreshes every 2500 ms`
  - `a failing list marks unreachable, then recovers on a later poll` (Review Focus 3)
  - `goTo focuses by pane id, raises the configured terminal, and selects`
  - `goToAttention picks blocked before done; with none it sets notice "all quiet"`
  - `nextTab wraps both directions within the focused workspace; single tab → undefined`
  - `per-pane status streams are opened for new panes and stopped for gone ones`
  - `raiseTerminal does not call open when the app is not running`
  - `raiseTerminal rejects a bundle id with quotes`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: bridge, terminal raise, settings`.

---

### Task 6: Stream Deck actions, property inspector, entry point

**Files:**
- Create: `src/actions/agent-key.ts`, `src/actions/agents-dial.ts`, `src/actions/pages-dial.ts`, `src/actions/attention-dial.ts`, `src/actions/tabs-dial.ts`, `src/actions/faces.ts`, `test/actions/faces.test.ts`, `src/plugin.ts`, `com.mtbhuskies.herdr-deck.sdPlugin/layouts/strip.json`, `com.mtbhuskies.herdr-deck.sdPlugin/ui/settings.html`, `com.mtbhuskies.herdr-deck.sdPlugin/ui/sdpi-components.js`

**Interfaces:**
- Consumes: `Bridge` (Task 5), `keySvg`, `stripSvg`, `toDataUrl` (Task 4)
- Produces:
  - `faces.ts`. Pure functions, so the face logic is testable without the SDK:
    - `slotFace(bridge, slot: number): KeyFace`. Returns offline when unreachable. A blocked agent gets `dim = bridge.pulseOn`.
    - `agentsSegment(bridge): Segment`. Title `Selected`. The headline is the name, and the detail is `<status> · <Nm|Ns|Nh>`. With no agents it shows `No agents`. When unreachable, the headline is `Herdr not reachable` and the detail is the socket path. The bridge's transient `notice`, when set, replaces the detail.
    - `pagesSegment(bridge): Segment`. Headline `page N of M`, one dot per agent, dimmed when the agent is off the current page.
    - `attentionSegment(bridge): Segment`. Title `Needs you`. The headline is `N blocked`, else `N unread`, else `all quiet`, followed by four count dots.
    - `tabsSegment(bridge): Segment`. Title `Herdr tab`, headline `tab N of M` (or `—`), detail `turn to cycle`.
  - `layouts/strip.json`: `{ "id": "herdr-strip", "items": [{ "key": "canvas", "type": "pixmap", "rect": [0, 0, 200, 100] }] }`. Each dial calls `setFeedback({ canvas: toDataUrl(stripSvg(seg)) })`.
  - Agent key: its slot comes from `action.coordinates`, as `row * 4 + column`. Keys on other rows or devices just use that formula modulo 8.

- [ ] **Step 1:** Write failing tests in `test/actions/faces.test.ts`, with a stub bridge object:
  - `offline bridge gives offline faces and the not-reachable segment with the socket path`
  - `blocked agent's face dims when pulseOn`
  - `agents segment shows "No agents" with zero agents` (Review Focus 5)
  - `pages segment dims dots off the current page`
  - `attention headline: 2 blocked > 1 unread > all quiet`
- [ ] **Step 2:** Run. Expected: FAIL. **Step 3:** Implement `faces.ts`. **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Implement the SDK actions. Each is a `SingletonAction` registered with `@action({ UUID })`. Each tracks its visible instances in `onWillAppear`/`onWillDisappear`, subscribes to `bridge.onChange`, and redraws only when the data URL differs from the last one sent to that instance.
  - Agent key: `onKeyDown` → `bridge.goTo(agentAtSlot)`.
  - Agents dial: `onDialRotate(ev.payload.ticks)` → `model.turnSelection`, and `onDialDown`/`onTouchTap` → `goToSelected`.
  - Pages dial: rotate → `turnPage`, press → `resetPage`.
  - Attention dial: rotate → `turnAttention`, press or tap → `goToAttention`.
  - Tabs dial: rotate → `cycleTab(sign(ticks))`, press → `raise`.
- [ ] **Step 6:** In `plugin.ts`, read global settings with `streamDeck.settings.getGlobalSettings()`, apply `resolveSettings`, and start the Bridge. Handle `onDidReceiveGlobalSettings` → `applySettings`. Register the actions, then call `streamDeck.connect()`.
- [ ] **Step 7:** In `ui/settings.html`, use sdpi-components v4, vendored as `ui/sdpi-components.js` (downloaded once and committed; the PI must work offline). Use two `<sdpi-textfield global setting="socketPath">` and `setting="terminalBundleId"` fields, with the defaults as placeholders. Every action's manifest entry points at this same PI.
- [ ] **Step 8:** Run `npm test && npm run build && npx streamdeck validate com.mtbhuskies.herdr-deck.sdPlugin`. Expected: all pass, with no validation errors.
- [ ] **Step 9:** Smoke test on Linux: run `node com.mtbhuskies.herdr-deck.sdPlugin/bin/plugin.js` without Stream Deck. Expected: it exits with the SDK's "missing registration parameters" error, not an import or syntax error. That's enough to show the bundle loads.
- [ ] **Step 10:** Commit `feat: Stream Deck actions and settings`.

---

### Task 7: Packaging, release workflow, README, GitHub repo

**Files:**
- Create: `.github/workflows/release.yml`, `README.md`

- [ ] **Step 1:** Write `release.yml`. It runs on push to `main` and `workflow_dispatch`, on `ubuntu-latest` with Node 20, and runs `npm ci`, `npm test`, `npm run build`, `npx streamdeck validate …`, then `npm run pack`. It then deletes and recreates release `latest` with `gh release` and attaches `dist/com.mtbhuskies.herdr-deck.streamDeckPlugin`. Use `permissions: contents: write`.
- [ ] **Step 2:** Run `npm run pack` locally. Expected: `dist/com.mtbhuskies.herdr-deck.streamDeckPlugin` exists. `unzip -l` lists `manifest.json` and `bin/plugin.js`.
- [ ] **Step 3:** Write the README:
  - **Install:** `gh release download latest -R mtbhuskies/herdr-deck -p '*.streamDeckPlugin'`, then double-click the file.
  - **Lay it out:** drag "Agent" onto all 8 keys, and Agents, Pages, Needs you and Tabs onto dials 1–4.
  - **Settings:** open any action and set the socket path to `~/.herdr-remote.sock`.
  - **Build from source:** the build and pack commands.
  - **On-device checklist**, from the spec: keys light in the right colours; a press focuses and raises Terminal; each dial does its job; stopping the tunnel (`launchctl kill TERM gui/$(id -u)/herdr-tunnel`) shows `Herdr not reachable` and recovers on its own.
  - Bundling a ready-made profile is **left out** (see the deviation note below).
- [ ] **Step 4:** Commit `ci: release the plugin on every push; docs: README`.
- [ ] **Step 5:** Create the private repo and push: `gh repo create mtbhuskies/herdr-deck --private --source . --push`. Expected: the push succeeds and the Actions run publishes release `latest` with the `.streamDeckPlugin` attached. Check with `gh release view latest -R mtbhuskies/herdr-deck`.

---

## Deviation from the spec

The spec, in its "my calls" section, says the plugin ships a Stream Deck+ profile with the layout pre-placed. Profile files have to be exported from the Stream Deck app, and their format isn't documented well enough to generate them on Linux with confidence. This plan replaces that with a one-time, roughly two-minute drag-and-drop layout described in the README. Once the user has laid it out on the Mac, they can export the profile, and adding it to the plugin's `Profiles` manifest entry becomes a small follow-up.
