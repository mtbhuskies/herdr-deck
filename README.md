# Herdr Deck

Your Herdr agents on a Stream Deck+. Each key is one agent, coloured by what
it's doing, with the agent's name at the top and its status at the bottom. Press a key to switch Herdr to that agent and bring Terminal to
the front.

| Colour | Means |
|---|---|
| Red, pulsing | blocked: the agent needs you |
| Blue | done: finished, and you haven't looked yet |
| Amber | working |
| Green | idle: finished and seen |

These are the same colours as Micro Manager on the Work Louder pad.

Herdr itself calls a finished agent idle, not done, whenever its pane is the
focused one, even if no window is open to see it. So the deck checks the Mac
when an agent finishes. If Terminal isn't the app in front, or its front tab
isn't the one running Herdr, the key shows **done** (blue) until you go to
that agent, or until it starts working again. This mark exists only on the
deck.

## The dials

| Dial | Turn | Press | Touch strip |
|---|---|---|---|
| 1 · Agents | switch agent: the ring moves as you turn, and when you stop, Herdr switches to it and Terminal comes forward | go to the ringed agent | its name, status, and how long it's been that way |
| 2 · Pages | flip pages of 8 agents | back to page 1 | a dot per agent, so a blocked agent on another page still shows |
| 3 · Needs you | step through only the agents that need you | go to the most urgent (blocked first, then unread; longest-waiting first) | how many are blocked, unread, working |
| 4 · Tabs | cycle tabs in the focused Herdr workspace | bring Terminal to the front | which tab you're on |

The ring and the page follow whichever agent is focused in Herdr. The exception
is the 10 seconds after you turn dial 2 or 3: during that time they stay where
you put them.

## Install

On the Mac:

```bash
gh release download latest -R mtbhuskies/herdr-deck -p '*.streamDeckPlugin' --clobber
open com.mtbhuskies.herdr-deck.streamDeckPlugin
```

The Stream Deck app asks to install it, and installs the **Herdr Deck**
profile for your Stream Deck+ along with it: Agent on all 8 keys, and
**Agents**, **Pages**, **Needs you** and **Tabs** on dials 1 to 4. Switch to
it from the profile menu, then:

1. Click any key or dial and set **Herdr socket** to the socket your Herdr is
   on. For a Herdr reached through an SSH tunnel, use the tunnel's local end, such as `~/.herdr-remote.sock`.
   The setting is shared by every key and dial.

To lay it out by hand instead (on another profile, say), drag **Agent** from
the **Herdr Deck** category onto the keys, and the four dials onto the dials.
Each key works out which agent it shows from where it sits.

The bundled profile is `com.mtbhuskies.herdr-deck.sdPlugin/profiles/herdr-deck.streamDeckProfile`.
To change it, export your profile from the Stream Deck app and replace that
file. Herdr Deck keeps its settings, the launch command included, outside the
profile, so an export never carries them. A test checks the file holds only
Herdr Deck actions with empty settings.

Leave **Terminal app** as `com.apple.Terminal` unless Herdr is running in
another terminal (Ghostty is `com.mitchellh.ghostty`).

**Launch command** (optional) is what a press runs when no Terminal window
is running Herdr, for example `herdr --remote user@server`. With it set:

- a press brings the Terminal tab running Herdr to the front;
- if no tab is running Herdr, Terminal opens (or opens a new window) and runs
  the command;
- a key with no agent on it, or any key while Herdr can't be reached, still
  does this, so any key gets Herdr back.

The first time it runs, macOS asks whether Stream Deck may control Terminal.
Allow it. If you said no by accident, turn it back on in System Settings →
Privacy & Security → Automation. The launch command works with Terminal.app
only. With another terminal app, presses just bring that app forward.

## Check it on the device

After installing, or after any change, run through this checklist:

- [ ] Every key with an agent is lit in that agent's colour. Keys without an
      agent are dark.
- [ ] A blocked agent's key pulses.
- [ ] Pressing a key switches Herdr to that agent and brings Terminal to the
      front. The white ring moves to that key.
- [ ] Turning dial 1 moves the ring. About a quarter of a second after you
      stop, Herdr switches to that agent and Terminal comes to the front.
- [ ] With more than 8 agents, turning dial 2 flips the page and the strip
      shows `page 2 of 2`.
- [ ] Pressing dial 3 goes to a blocked agent if there is one. With nothing
      blocked or unread, the dial 1 strip shows `all quiet` for 2 seconds.
- [ ] Turning dial 4 cycles Herdr tabs, and its strip shows `tab N of M`.
- [ ] With a launch command set, close the Terminal window running Herdr and
      press a key. Terminal opens a window running the command.
- [ ] Start an agent working, switch to another app, and let it finish. Its
      key turns blue, and stays blue until you press it.
- [ ] Stop the tunnel with `launchctl kill TERM gui/$(id -u)/herdr-tunnel`.
      Within a few seconds the keys go grey and the dial 1 strip says
      `Herdr not reachable`. When launchd brings the tunnel back, the deck
      recovers without you doing anything.

## Build from source

You need Node 20 or newer.

```bash
npm install
npm test            # unit tests
npm run build       # bundles into com.mtbhuskies.herdr-deck.sdPlugin/bin
npm run validate    # checks the manifest
npm run pack        # writes dist/com.mtbhuskies.herdr-deck.streamDeckPlugin
```

For live development on the Mac, link the plugin folder into the Stream Deck
app with `npx streamdeck link com.mtbhuskies.herdr-deck.sdPlugin`, then rebuild
and restart it with `npx streamdeck restart com.mtbhuskies.herdr-deck`.

Every push to `main` runs the tests and publishes the packed plugin as the
`latest` release.

## How it talks to Herdr

The plugin talks to Herdr through its Unix socket API, the same way Micro
Manager does: `agent.list` for the agents (in Herdr's own order, never
re-sorted), `agent.focus` with the pane id, and `tab.list` with `tab.focus`
for tabs. Event subscriptions trigger a refresh within about 100 ms, and a
poll every 2.5 seconds catches anything a dropped tunnel swallowed.

Design and plan: `docs/superpowers/specs/` and `docs/superpowers/plans/`.
