# herdr-deck — design

Date: 2026-11-03
Repo: new private GitHub repo `mtbhuskies/herdr-deck` (this document goes in
`docs/superpowers/specs/` there).

## Intent

A Stream Deck+ plugin that shows Herdr agents the way Micro Manager shows them
on the Work Louder pad: one key per agent, the key's colour is the agent's
status, and pressing the key takes you to that agent.

The user currently runs a "HERDR Plus" Stream Deck profile from a third-party
Herdr plugin. It does too much: split, detach, rename, resize. They want only
three things: **which agents exist, what state each is in, and which ones need
attention**. Pressing a key switches Herdr to that agent and brings Terminal to
the front.

Success: the user can glance at the deck and see at once if anything is
blocked or finished-and-unread, and one press gets them there.

## Goals

- One key per agent, coloured by status.
- Press a key: focus that agent in Herdr, and bring Terminal.app to the front.
- More than 8 agents are handled with pages, and an agent on a hidden page
  that needs attention is still visible.
- Use the touch strip and the dials for a small set of genuinely useful
  controls (below). The user approved the mockup at
  https://claude.ai/artifact/4BsQ95ULRQaLPnz7ehpFBP as "perfect"; it is the
  visual reference.

## Non-goals

- Any pane/tab management: split, detach, rename, resize, close, create.
- Sending text or keystrokes to agents.
- Supporting several Herdr servers at once (one socket per plugin instance).
- Stream Deck models other than the Stream Deck+ (it may work on others; not a
  requirement).
- Windows support.

## Anti-goals (it fails even if it works)

- The deck gets busy or full of text. Keys must read at a glance from colour
  alone; text on them is secondary.
- A key shows stale status (an agent that has gone away still lit, or a status
  that lags by more than a couple of seconds).
- Pressing a key moves Herdr's focus somewhere you can't see, without Terminal
  coming forward.
- Colours that differ from Micro Manager's for the same status.

## Environment and constraints

- Host: a Mac, running the Elgato Stream Deck app with a
  Stream Deck+ (8 LCD keys in 2 rows of 4, 4 dials that turn, press and
  touch, and an 800×100 touch strip split into one 200×100 segment per dial).
- Herdr may run on a **remote Linux server**. The Mac reaches it either
  with `herdr --remote` or through an SSH tunnel (kept up by a launchd
  agent) that exposes the socket locally, for example at
  `~/.herdr-remote.sock`. The plugin talks only to a local Unix socket path,
  so it does not care that Herdr is remote.
- Herdr's own terminal UI is shown in **Terminal.app** (bundle id
  `com.apple.Terminal`) on the Mac. The user said so directly. Note that
  Micro Manager's code defaults to Ghostty (`com.mitchellh.ghostty`); do
  **not** copy that default.
- Micro Manager (the Work Louder pad app) may be running at the same time,
  against the same Herdr. They must not interfere. Both only read, plus
  focus calls, so this is naturally fine.

## Herdr socket protocol (as used by Micro Manager, verified against Herdr 0.7.x)

- Newline-delimited JSON over a Unix socket.
- **One request per connection**: open, write one line, read one line,
  close. A second request on the same connection never gets a reply.
- Request: `{"id": "<string>", "method": "...", "params": {...}}`. The `id`
  **must be a string**; an integer is rejected with `invalid_request`.
- Reply: `{"id": ..., "result": {...}}` or `{"id": ..., "error": {"code",
  "message"}}`.
- `agent.list` → `result.agents`: array of objects with `pane_id`,
  `terminal_id`, `tab_id`, `workspace_id`, `agent` (e.g. "claude"),
  `agent_status`, `cwd`, `foreground_cwd`, `focused` (bool).
  The order is the server's (workspace, tab, pane), the same as Herdr's own
  sidebar. **Do not re-sort.**
- `agent.focus` with `{"target": <pane_id>}`. It resolves **pane ids only**;
  a terminal id returns `agent_not_found`. Fall back to `terminal_id` only if
  `pane_id` is missing.
- `tab.list` (optional `workspace_id`) → `result.tabs`: `tab_id`,
  `workspace_id`, `number`, `focused`.
- `tab.focus` with `{"tab_id": ...}`.
- `events.subscribe` with `{"subscriptions": [{"type": ...}, ...]}` takes
  over its connection. The first line back is an acknowledgement; every line
  after it is a pushed event. Each subscription stream needs its own
  connection. Event types Micro Manager uses: `pane.created`, `pane.closed`,
  `pane.exited`, `pane.agent_detected`, and per pane
  `{"type": "pane.agent_status_changed", "pane_id": ...}`.
- Micro Manager's reference implementation:
  `Sources/WLKit/HerdrClient.swift` in `mtbhuskies/micro-manager`.

### Statuses and colours (identical to Micro Manager)

| Status | Colour | Effect on the key |
|---|---|---|
| `blocked` | `#FF2D2D` red | breathing / flashing |
| `working` | `#FFA000` amber | solid |
| `done` (finished, not yet looked at) | `#00B0FF` blue | solid |
| `idle` (finished and seen) | `#00C853` green | solid |
| anything else / unknown | `#00C853` green | solid |

Attention priority (for "needs you"): `blocked` first, then `done`.

## The design (as approved)

### Keys: one agent each

- Agents fill keys in Herdr's order: agent 1 on the top-left key, reading left
  to right, top to bottom. Page 1 is agents 1–8, page 2 is 9–16, and so on.
- Each key face: the whole key filled with the status colour; the project
  name (last path component of `foreground_cwd`, else `cwd`, else the `agent`
  field; the home directory shows as `~ home`) large and bold at the top, on
  up to two lines and sized to fit; the status word bold at the bottom. All
  text is white with a black outline, like the Stream Deck's own titles. No
  agent number. *(Changed 2026-11-04 at the user's request after trying it
  on the device: name at the top, both texts more readable.)*
- `blocked` keys pulse (alternate between full and dimmed colour about every
  0.8 s).
- A white ring marks the **selected** agent (see Dial 1). The selection
  follows Herdr's focused agent, and the page follows it too, **except** for
  10 seconds after the user last turned Dial 1, 2 or 3; during that window the
  ring and the page stay where the user put them. Any press (a key, or Dial
  1/3 press) focuses an agent, so the ring and Herdr agree again at once.
  *(Builder's call, settled in review: never following again would go stale,
  and following immediately would fight the dial.)*
- A key with no agent is dark and shows nothing.
- **Press**: `agent.focus` on that agent, then bring Terminal.app to the
  front, and move the selection to it.

### Dial 1: Agents

- Turn: move the selection ring one agent per detent, wrapping at the ends.
  Moving onto an agent on another page flips to that page. When the turning
  stops for 250 ms, go to the ringed agent (focus it in Herdr, bring Terminal
  forward), so a fast spin switches once. *(Changed 2026-11-04 at the user's
  request.)*
- Press: same as pressing that agent's key.
- Strip segment: the selected agent's full name, a status dot and word, and
  how long it has been in that status (e.g. `working · 4m`). Time in status is
  tracked by the plugin from when it first saw that status; it resets when the
  plugin starts.

### Dial 2: Pages

- Turn: next or previous page, wrapping.
- Press: back to page 1.
- Strip segment: `page 1 of 2`, then one small dot per agent in its status
  colour, with dots for agents not on the current page dimmed. That way a
  blocked agent on a hidden page is still visible.
- With 8 or fewer agents there is one page; turning does nothing.

### Dial 3: Needs you

- Press: jump to the agent that most needs attention (blocked first, then
  done; within a status, the one that has been waiting longest), with the same
  effect as pressing its key. If nothing needs attention, do nothing apart
  from a brief "all quiet" on the strip.
- Turn: step through only the agents that need attention, moving the
  selection (without focusing until pressed).
- Strip segment: a headline (`2 blocked`, else `1 unread`, else `all quiet`)
  and a count per status with coloured dots.

### Dial 4: Tabs

- Turn: cycle the tabs of the focused Herdr workspace (clockwise = next,
  counter-clockwise = previous), using `tab.list` + `tab.focus`, the same as
  Micro Manager's tab key. With a single tab, do nothing.
- Press: bring Terminal.app to the front without changing the agent.
- Strip segment: `tab N of M` for the focused workspace.

### Bringing Terminal forward

Activate the Terminal.app that is already running (for example
`open -b com.apple.Terminal`, or AppleScript `tell application "Terminal" to
activate`). Never launch a new window. The bundle id is a setting with
`com.apple.Terminal` as its default, so another terminal can be used later.

### Launch command (added 2026-11-04 at the user's request)

An optional **launch command** setting, for example
`herdr --remote user@server`. With it set and Terminal.app as the terminal, a
press brings forward the Terminal tab whose processes include `herdr`; if
there is none, it opens Terminal (or a new window) running the command. A key
with no agent, or any key while Herdr is unreachable, does the same. The
command is handed to AppleScript as an argument, never spliced into the
script. Empty (the default) keeps the original raise-only behaviour.

### Unread when you weren't watching (added 2026-11-04 at the user's request)

Herdr reports a finished agent as `idle` when its pane is focused, even with
no client attached (seen when the user quit Terminal and the agent finished
unseen). So when an agent goes from `working` to `idle`, the plugin asks the
Mac, once, whether you are watching: the terminal is frontmost and, for
Terminal.app, its front tab runs `herdr`. If not, the deck treats the agent
as `done` (blue, counted under "needs you") until you go to it or it leaves
`idle`. When the plugin can't tell, it assumes you are watching.

### Settings

Global plugin settings (one set for the whole plugin), edited in a small
property inspector:

- Herdr socket path. Default `~/.config/herdr/herdr.sock`; the user sets
  `~/.herdr-remote.sock`. `~` is expanded.
- Terminal bundle id. Default `com.apple.Terminal`.

### Connection health

- If the socket can't be reached or Herdr returns an error, every agent key
  goes dark grey, and the Dial 1 strip segment shows `Herdr not reachable` and
  the socket path. Retry every few seconds; recover on its own when the
  tunnel comes back.
- No other error UI.

### Freshness

- Keep the event subscriptions open and re-run `agent.list` after any event
  (debounced ~100 ms). Also poll `agent.list` every ~2.5 s as a safety net,
  since an SSH-tunnelled event stream can die silently. This is what Micro
  Manager does.
- Redraw only keys and segments that changed.

## How it gets made (my calls, not discussed with the user)

- A native Elgato Stream Deck plugin in TypeScript, using the official SDK
  (`@elgato/streamdeck`) and Node runtime that the Stream Deck app provides,
  scaffolded with the Elgato CLI (`@elgato/cli`). Distributed as a
  `.streamDeckPlugin` file the user double-clicks.
- The profile: the plugin ships a Stream Deck+ profile with the 8 keys and 4
  dials already placed, so installing it gives the whole layout in one step.
  Plugin actions: **Agent slot** (key), **Agents**, **Pages**, **Needs you**
  and **Tabs** (dials, with touch-strip layouts).
- Key images and strip segments are drawn as SVG data URLs at runtime.
- Where it's built and tested: the builder works on a Linux machine with no
  Stream Deck, no Stream Deck app and no Terminal.app. So the plugin is built
  and unit-tested there, and a GitHub Actions workflow in the private repo
  packs the `.streamDeckPlugin` and attaches it to a GitHub release on every
  push to `main`, the same way micro-manager publishes its app. The user
  downloads it on the Mac (or runs `gh release download`) and double-clicks
  it. On-device checks are a short written checklist in the README that the
  user runs: keys light, press focuses and raises Terminal, each dial does
  its job, and pulling the tunnel shows "Herdr not reachable" then recovers.
  The repo should also build with `npm run build` on the Mac for anyone who
  wants to develop there.
- Unit tests (Vitest or similar) for the parts with logic: page/slot mapping,
  attention ordering, time-in-status tracking, tab cycling, name derivation,
  and the Herdr request/response framing against a fake socket server.

## Left to the builder

- Internal structure, file layout and naming.
- Exact typography, sizes and spacing on keys and strip, provided keys stay
  readable from colour alone and match the mockup in spirit.
- How slot keys know their position (from their coordinates on the deck is
  the obvious way).
- Debounce and retry timings within the ranges above.
- The README: install steps, setting the socket path, and how to rebuild.
