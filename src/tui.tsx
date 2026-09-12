/** @jsxImportSource @opentui/solid */
import { createSignal, createMemo, createEffect, onMount, onCleanup, For, Show } from "solid-js";
import { RGBA, type BoxRenderable } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/solid";
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui";
import { config, writeTimeZone } from "./config";
import { Store, day } from "./store";
import { compact, overview } from "./overview";

const tokens = (v: unknown) => v == null ? "—" : compact(Number(v));
const clean = (v: unknown) => String(v ?? "").replace(/[\x00-\x1f\x7f-\x9f]/g," ");
const breakdown = (r: Record<string,any>) => `Input ${tokens(r.input)}  Output ${tokens(r.output)}${r.cache ? `  Cache ${tokens(r.cache)}` : ""}`;
const ZONES = ["UTC","Asia/Shanghai","Asia/Tokyo","Asia/Singapore","Europe/London","Europe/Berlin","America/New_York","America/Chicago","America/Los_Angeles","Australia/Sydney"];
const MODES = ["Daily","Weekly"];
function Panel(props:{api:TuiPluginApi;close:()=>void}) {
  const api = props.api, cfg = config(), colors = api.theme.current;
  const fill = (level: number) => {
    if (level <= 0) return colors.textMuted;
    if (level >= 4) return colors.primary;
    const t = 0.15 + level * 0.2;
    return RGBA.fromValues(
      colors.backgroundPanel.r + (colors.primary.r - colors.backgroundPanel.r) * t,
      colors.backgroundPanel.g + (colors.primary.g - colors.backgroundPanel.g) * t,
      colors.backgroundPanel.b + (colors.primary.b - colors.backgroundPanel.b) * t,
      1,
    );
  };
  const dimensions = useTerminalDimensions();
  const padding = () => dimensions().width < 60 ? 2 : 4;
  const width = () => Math.max(1, Math.min(60, dimensions().width - 2) - padding() * 2);
  const stacked = () => width() < 51;
  const leftWidth = () => stacked() ? width() : width() - 31;
  const rightWidth = () => stacked() ? width() : width() - leftWidth() - 2;
  const tileWidth = () => (mode() === 1 ? (width() >= 52 ? 4 : 3) : (rightWidth() >= 29 ? 4 : 3));
  const [tab,setTab] = createSignal(0);
  const [zone,setZone] = createSignal(cfg.timeZone);
  const [setting,setSetting] = createSignal<number>();
  const [mode,setMode] = createSignal(0);
  const [selected,setSelected] = createSignal<number>();
  const [confirmReset,setConfirmReset] = createSignal(false);
  const [data,setData] = createSignal<ReturnType<Store["view"]>>(), [error,setError] = createSignal("");
  function refresh() {
    let db: Store | undefined;
    try { db=new Store(cfg.dataDir,zone(),true); setData(db.view()); setError(""); }
    catch(e) { setError(String(e)); }
    finally { db?.close(); }
  }
  function cycleZone(dir: 1|-1) {
    const list = ZONES.includes(zone()) ? ZONES : [zone(), ...ZONES];
    const next = list[(list.indexOf(zone())+dir+list.length)%list.length];
    try { writeTimeZone(next); setZone(next); refresh(); }
    catch(e) { setError(String(e)); }
  }
  function doReset() {
    if (!confirmReset()) { setConfirmReset(true); return; }
    let db: Store | undefined;
    try { db=new Store(cfg.dataDir,zone(),false); db.reset(); setConfirmReset(false); setError(""); }
    catch(e) { setError(String(e)); }
    finally { db?.close(); refresh(); }
  }
  refresh();const timer=setInterval(refresh,2000);onCleanup(()=>clearInterval(timer));
  const rows=()=>tab()===1?data()?.models:data()?.devices;
  const chart=createMemo(()=>overview(data()?.days ?? [],day(Date.now(),zone()),mode(),mode()===1?width():rightWidth()));
  const cell = () => {
    const i = selected(), last = (mode()===1?chart().columns:chart().values.length) - 1, cur = Math.max(0, Math.min(last, chart().currentIndex));
    return i == null || i < 0 || i > last ? cur : i;
  };
  const facts = createMemo(() => {
    const v = data(), c = chart();
    let pi = 0;
    for (let i = 1; i < c.values.length; i++) if ((c.values[i] ?? 0) > (c.values[pi] ?? 0)) pi = i;
    const pval = c.values[pi] ?? 0;
    const peak = v && v.days.length > 0 && pval > 0 ? { label: (c.labels[pi] ?? "").slice(5), value: compact(pval) } : null;
    const inp = v?.summary?.input, cac = v?.summary?.cache;
    const rate = typeof inp === "number" && typeof cac === "number" && inp + cac > 0 ? `${(cac / (inp + cac) * 100).toFixed(1)}%` : null;
    const lastAt = v?.days?.reduce((max, d) => d.last > max ? d.last : max, 0) ?? 0;
    const diff = lastAt > 0 ? Math.max(0, Date.now() - lastAt) : -1;
    const m = Math.floor(diff / 60000);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    const active = diff < 0 ? "—" : m < 1 ? "just now" : m < 60 ? `${m}m ago` : h < 24 ? `${h}h ago` : `${d}d ago`;
    const activeDays = c.values.filter(x => (x ?? 0) > 0).length;
    const windowTotal = c.values.reduce((sum, x) => sum + (x ?? 0), 0);
    const avg = activeDays > 0 ? compact(Math.round(windowTotal / activeDays)) : "—";
    return { peak, rate, active, avg };
  });
  const pick = RGBA.fromValues(
    colors.backgroundPanel.r + (colors.primary.r - colors.backgroundPanel.r) * 0.22,
    colors.backgroundPanel.g + (colors.primary.g - colors.backgroundPanel.g) * 0.22,
    colors.backgroundPanel.b + (colors.primary.b - colors.backgroundPanel.b) * 0.22,
    1,
  );
  useKeyboard(key=>{
    const name=key.name;
    if(name==="escape"){
      key.preventDefault();key.stopPropagation();
      if(tab()===3&&confirmReset()){setConfirmReset(false);return;}
      props.close();return;
    }
    if(name==="tab"){
      key.preventDefault();key.stopPropagation();setConfirmReset(false);setSetting(undefined);
      if(tab()===0&&key.shift){setMode(mode()^1);setSelected(undefined);return;}
      setTab((tab()+1)%4);return;
    }
    if(tab()===0&&(name==="left"||name==="right"||name==="up"||name==="down")){
      key.preventDefault();key.stopPropagation();
      if(mode()===1){
        if(name==="up"||name==="down") return;
        const next=cell()+(name==="left"?-1:1);
        if(next>=0&&next<chart().columns) setSelected(next);
        return;
      }
      const at=cell(), cols=chart().columns, next=at+(name==="left"?-1:name==="right"?1:name==="up"?-cols:cols);
      if(mode()===0&&((name==="left"&&at%cols===0)||(name==="right"&&at%cols===cols-1))) return;
      if(next>=0&&next<chart().values.length) setSelected(next);
      return;
    }
    if(tab()!==3) return;
    if(name==="up"||name==="down"){key.preventDefault();key.stopPropagation();setConfirmReset(false);const at=setting();setSetting(at==null?(name==="down"?0:1):at^1);return;}
    if(setting()===0&&(name==="left"||name==="right")){key.preventDefault();key.stopPropagation();cycleZone(name==="right"?1:-1);return;}
    if(setting()===1&&(name==="return"||name==="enter")){key.preventDefault();key.stopPropagation();doReset();}
  });
  const height = () => {
    // Reserve the host's padding row and one screen row above and below.
    const available = Math.max(4, dimensions().height - 3);
    const period = 7 * 2;
    const content = stacked() ? 14 + period : Math.max(9, period);
    return Math.min(available, content + 7);
  };
  let panel!: BoxRenderable;
  onMount(() => {
    // The host dialog API has no placement option. Offset this dialog's shell
    // from the host's H/4 origin, including its one-row top padding.
    const shell = panel.parent;
    if (!shell) return;
    const originalTop = shell.top;
    createEffect(() => {
      shell.top = Math.floor((dimensions().height - height() - 1) / 2) - Math.round(dimensions().height / 4);
    });
    onCleanup(() => { shell.top = originalTop; });
  });
  return <box ref={panel} id="usage-panel" flexDirection="column" height={height()} flexShrink={0} paddingLeft={padding()} paddingRight={padding()} paddingBottom={1} backgroundColor={colors.backgroundPanel}>
    <box flexDirection="row" height={1} flexShrink={0} gap={1}>
      <box flexDirection="row" left={-1} flexGrow={1} minWidth={0} gap={width()<48?1:2}>
        <For each={width()<38?["Stats","Models","Devices","Setup"]:["Overview","Models","Devices","Settings"]}>{(v,i)=><text id={`usage-tab-${i()}`} fg={tab()===i()?colors.primary:colors.textMuted} bg={tab()===i()?pick:undefined} wrapMode="none" truncate onMouseUp={()=>{setTab(i());setSetting(undefined);setConfirmReset(false);}}>{tab()===i()?<b>{` ${v} `}</b>:` ${v} `}</text>}</For>
      </box>
      <text flexShrink={0} fg={colors.textMuted} onMouseUp={props.close}>esc</text>
    </box>
    <Show when={tab()===0}>
      <box flexDirection="row" height={1} flexShrink={0} marginTop={1} gap={width()<38?1:2}>
        <box flexDirection="row" width={mode()===1?undefined:(stacked()?undefined:leftWidth())} flexShrink={0} gap={width()<38?1:2}>
          <For each={MODES}>{(v,i)=><text id={`usage-mode-${i()}`} fg={mode()===i()?colors.primary:colors.textMuted} onMouseUp={()=>{setMode(i());setSelected(undefined);}} wrapMode="none">{mode()===i()?<b>{v}</b>:v}</text>}</For>
        </box>
        <box id="usage-period-head" flexDirection="row" width={mode()===1?undefined:(stacked()?undefined:rightWidth())} paddingLeft={mode()===1?0:(stacked()?0:2)} flexGrow={1} minWidth={0} gap={1}>
          <text id="usage-period-title" fg={colors.textMuted} flexShrink={0} wrapMode="none">{cell()===chart().currentIndex?chart().title:(mode()===1?`Week of ${chart().labels[cell()]}`:chart().labels[cell()])}</text>
          <text id="usage-period-value" fg={colors.primary} flexGrow={1} wrapMode="none" truncate><b>{compact((mode()===1?chart().weekValues:chart().values)[cell()]??0)}</b></text>
        </box>
      </box>
    </Show>
    <scrollbox id="usage-scroll" marginTop={1} flexGrow={1} minHeight={0} focused={true} scrollX={false} scrollbarOptions={{visible:false}}>
      <Show when={error()}><text fg={colors.error}>Database unread (enable the Server plugin first if none exists). {clean(error())}</text></Show>
      <Show when={tab()===3}>
        <box id="usage-settings" flexGrow={1} minHeight={0} justifyContent="center" alignItems="center">
          <box flexDirection="column" gap={1}>
            <box id="usage-setting-0" flexDirection="row" height={1} flexShrink={0} gap={1} onMouseUp={()=>{setSetting(0);setConfirmReset(false);}}>
              <text id="usage-setting-0-label" fg={setting()===0?colors.primary:colors.textMuted} flexShrink={0} wrapMode="none">{setting()===0?<b>Timezone</b>:"Timezone"}</text>
              <text fg={colors.text} wrapMode="none" truncate>{zone()}</text>
            </box>
            <box id="usage-setting-1" flexDirection="row" height={1} flexShrink={0} gap={1} onMouseUp={()=>{if(setting()===1)doReset();else setSetting(1);}}>
              <text id="usage-setting-1-label" fg={setting()===1?(confirmReset()?colors.error:colors.primary):colors.textMuted} flexShrink={0} wrapMode="none">{setting()===1?<b>Reset</b>:"Reset"}</text>
              <text fg={setting()===1&&confirmReset()?colors.error:colors.textMuted} wrapMode="none" truncate>{confirmReset()?"enter again to confirm":"clear all usage"}</text>
            </box>
          </box>
        </box>
      </Show>
      <Show when={data()}>{d=><box flexDirection="column" gap={1}>
        <Show when={tab()===0}>
          <box id="usage-overview" flexDirection="column" flexShrink={0}>
            <box flexDirection={stacked()?"column":"row"} flexShrink={0} gap={mode()===1?0:2}>
              <Show when={mode()===0}>
                <box id="usage-totals" flexDirection="column" width={leftWidth()} flexShrink={0} gap={1}>
                  <box flexDirection="row" height={1} flexShrink={0} gap={1}>
                    <text fg={colors.textMuted} flexShrink={0} wrapMode="none">Total tokens</text>
                    <text fg={colors.text} flexGrow={1} wrapMode="none" truncate><b>{compact(d().summary.total ?? 0)}</b></text>
                  </box>
                  <box flexDirection="row" height={1} flexShrink={0} gap={1}>
                    <text fg={colors.textMuted} flexShrink={0} wrapMode="none">Input</text>
                    <text fg={colors.text} flexGrow={1} wrapMode="none" truncate>{tokens(d().summary.input)}</text>
                  </box>
                  <box flexDirection="row" height={1} flexShrink={0} gap={1}>
                    <text fg={colors.textMuted} flexShrink={0} wrapMode="none">Output</text>
                    <text fg={colors.text} flexGrow={1} wrapMode="none" truncate>{tokens(d().summary.output)}</text>
                  </box>
                  <box flexDirection="row" height={1} flexShrink={0} gap={1}>
                    <text fg={colors.textMuted} flexShrink={0} wrapMode="none">Cache</text>
                    <text fg={colors.text} flexGrow={1} wrapMode="none" truncate>{tokens(d().summary.cache)}{(() => { const r = facts().rate; return r ? ` (${r})` : ""; })()}</text>
                  </box>
                  <box flexDirection="row" height={1} flexShrink={0} gap={1}>
                    <text fg={colors.textMuted} flexShrink={0} wrapMode="none">Peak</text>
                    <text fg={colors.text} flexGrow={1} wrapMode="none" truncate>{(() => { const p = facts().peak; return p ? `${p.label} ${p.value}` : "—"; })()}</text>
                  </box>
                  <box flexDirection="row" height={1} flexShrink={0} gap={1}>
                    <text fg={colors.textMuted} flexShrink={0} wrapMode="none">Daily avg</text>
                    <text fg={colors.text} flexGrow={1} wrapMode="none" truncate>{facts().avg}</text>
                  </box>
                  <box flexDirection="row" height={1} flexShrink={0} gap={1}>
                    <text fg={colors.textMuted} flexShrink={0} wrapMode="none">Active</text>
                    <text fg={colors.text} flexGrow={1} wrapMode="none" truncate>{facts().active}</text>
                  </box>
                </box>
              </Show>
              <box id="usage-period" flexDirection="column" width={mode()===1?width():rightWidth()} flexShrink={0}>
                <Show when={!chart().empty} fallback={<box height={3} flexShrink={0}><text fg={colors.textMuted}>No usage yet</text></box>}>
                  <box id="usage-trend" flexDirection="row" flexWrap="wrap" left={mode()===1?-1:0} paddingLeft={mode()===1?0:(tileWidth()===4?1:0)} width={chart().columns*tileWidth()+(mode()===1?0:(tileWidth()===4?1:0))} height={chart().rows*2} flexShrink={0}>
                    <box id="usage-selection" position="absolute" left={(cell()%chart().columns)*tileWidth()+(mode()===1?0:(tileWidth()===4?1:0))} top={mode()===1?0:Math.floor(cell()/chart().columns)*2} width={3} height={mode()===1?chart().rows*2-1:1} backgroundColor={pick}/>
                    <For each={chart().trend}>{(level,i)=><box width={tileWidth()} height={2} flexShrink={0} onMouseUp={()=>setSelected(mode()===1?i()%chart().columns:i())}>
                      <text marginLeft={1} width={1} height={1} flexShrink={0} wrapMode="none" fg={fill(level)} bg={cell()===(mode()===1?i()%chart().columns:i())?pick:undefined}>{level?"●":"○"}</text>
                    </box>}</For>
                  </box>
                </Show>
              </box>
            </box>
          </box>
        </Show>
        <Show when={tab()===1||tab()===2}>
          <For each={rows()}>{r=><box flexDirection="column" flexShrink={0}>
            <text fg={colors.text} wrapMode="none" truncate>{clean(r.label)}</text>
            <box flexDirection="row" gap={1}>
              <text fg={colors.primary} flexGrow={1} minWidth={0} wrapMode="none" truncate>{"█".repeat(Math.max(1,Math.round((r.total||0)/Math.max(1,d().summary.total||0)*20)))}</text>
              <text fg={colors.text} flexShrink={0}>{tokens(r.total)} ({((r.total||0)/Math.max(1,d().summary.total||0)*100).toFixed(1)}%)</text>
            </box>
            <text fg={colors.textMuted}>{breakdown(r)}</text>
            <Show when={tab()===2}><text fg={colors.textMuted}>Last {new Date(r.last).toLocaleString("en-US",{timeZone:zone()})}</text></Show>
          </box>}</For>
          <Show when={!rows()?.length}><text fg={colors.textMuted}>No usage in this view.</text></Show>
        </Show>
      </box>}</Show>
    </scrollbox>
    <Show when={tab()===0||tab()===3}>
      <box id="usage-footer" flexDirection="row" height={1} flexShrink={0} marginTop={1} gap={width()<48?1:2}>
        <text fg={colors.textMuted} wrapMode="none" truncate flexShrink={0}>{width()<30?"Tab":"Tab tabs"}</text>
        <Show when={tab()===0} fallback={
          <box flexDirection="row" flexGrow={1} minWidth={0} height={1} gap={width()<48?1:2}>
            <text fg={colors.textMuted} wrapMode="none" truncate flexShrink={0}>{width()<51?"↑↓ ←→":"↑↓ row · ←→ zone"}</text>
            <text fg={colors.textMuted} wrapMode="none" truncate flexShrink={1}>{confirmReset()?(width()<51?"Enter Esc":"Enter confirm · Esc cancel"):(width()<51?"Enter Esc":"Enter reset · Esc close")}</text>
          </box>
        }>
          <text fg={colors.textMuted} wrapMode="none" truncate flexShrink={0}>{width()<51?"S-Tab D/W":"S-Tab Daily/Weekly"}</text>
          <text fg={colors.textMuted} wrapMode="none" truncate flexShrink={1}>{mode()===1?(width()<51?"←→ Esc":"←→ week · Esc close"):(width()<51?"←↑↓→ Esc":"←↑↓→ move · Esc close")}</text>
        </Show>
      </box>
    </Show>
  </box>;
}
export const tui:TuiPlugin = async api=>{
  let opened = false;
  api.keymap.registerLayer({commands:[{name:"opencode-usage-stats-plugin.open",title:"Usage stats",category:"Plugin",namespace:"palette",slashName:"usage",run(){
    // OpenCode's Commands palette uses the default medium dialog (60 columns).
    // Set it after replace because the host resets the stack size during replace.
    api.ui.dialog.replace(()=> <Panel api={api} close={()=>api.ui.dialog.clear()}/>,()=>{opened=false;});
    opened = true;
    api.ui.dialog.setSize("medium");
  }}]});
  api.lifecycle.onDispose(()=>{if(opened)api.ui.dialog.clear();});
};
export default {id:"opencode-usage-stats-plugin.tui",tui} satisfies TuiPluginModule;
