import type { Plugin, PluginModule } from "@opencode-ai/plugin";
import { config } from "./config";
import { Store } from "./store";
import { capture, type UsageEvent } from "./collector";

export const server: Plugin = async ({ client }) => {
  const cfg = config();
  let store: Store | undefined, queue = Promise.resolve(), closed = false, lastNotice = 0;
  const warn = async (error: unknown) => {
    if (Date.now() - lastNotice < 10000) return;
    lastNotice = Date.now();
    const message = `Usage stats were not fully saved: ${error instanceof Error ? error.message : String(error)}. No local retry queue; check Drive and the database.`;
    await client.tui.showToast({body:{title:"OpenCode Usage",message,variant:"error",duration:10000}}).catch(()=>{});
    await client.app.log({body:{service:"opencode-usage-stats-plugin",level:"error",message}}).catch(()=>{});
  };
  async function retry<T>(fn:()=>T): Promise<T> {
    for (let i=0;;i++) {
      try { return fn(); } catch (error) {
        if (i >= 3 || !/locked|busy/i.test(String(error))) throw error;
        await Bun.sleep(50 * (i+1));
      }
    }
  }
  const ensure = () => store ??= new Store(cfg.dataDir,cfg.timeZone);
  try { await retry(ensure); } catch(error) { await warn(error); }
  return {
    event: async ({event}) => {
      if (closed || !["message.updated","message.part.updated"].includes(event.type)) return;
      if (event.type === "message.part.updated" && event.properties.part.type !== "step-finish") return;
      const at = Date.now();
      queue = queue.then(async () => {
        const db = await retry(ensure);
        const step = await retry(()=>capture(db,event as UsageEvent,cfg.device,at));
        if (!step) return;
        // Only fetch model metadata for the observed step. Never import session history.
        const result = await client.session.message({path:{id:step.session,messageID:step.message},signal:AbortSignal.timeout(3000)});
        const info = result.data?.info;
        if (info?.role === "assistant") await retry(()=>db.message(info.id, info.sessionID, info.providerID, info.modelID));
      }).catch(warn);
      await queue;
    },
    dispose: async () => { closed = true; await queue; store?.close(); store=undefined; }
  };
};
export default { id:"opencode-usage-stats-plugin.server",server } satisfies PluginModule;
