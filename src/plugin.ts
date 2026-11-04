import streamDeck from "@elgato/streamdeck";
import { homedir } from "node:os";
import { AgentKey } from "./actions/agent-key";
import { AgentsDial } from "./actions/agents-dial";
import { AttentionDial } from "./actions/attention-dial";
import { PagesDial } from "./actions/pages-dial";
import { TabsDial } from "./actions/tabs-dial";
import { Bridge, socketClient } from "./bridge";
import { resolveSettings, type Settings } from "./settings";
import { isWatching, raiseTerminal } from "./terminal";

const bridge = new Bridge({ client: socketClient, raise: raiseTerminal, isWatching });

streamDeck.actions.registerAction(new AgentKey(bridge));
streamDeck.actions.registerAction(new AgentsDial(bridge));
streamDeck.actions.registerAction(new PagesDial(bridge));
streamDeck.actions.registerAction(new AttentionDial(bridge));
streamDeck.actions.registerAction(new TabsDial(bridge));

streamDeck.settings.onDidReceiveGlobalSettings<Partial<Settings>>((ev) => {
	bridge.applySettings(resolveSettings(ev.settings, homedir()));
});

await streamDeck.connect();
bridge.start(resolveSettings(await streamDeck.settings.getGlobalSettings<Partial<Settings>>(), homedir()));
