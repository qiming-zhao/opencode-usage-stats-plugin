import { testRender, useTerminalDimensions } from "@opentui/solid";
import { jsx } from "@opentui/solid/jsx-runtime";
import { createComponent, createSignal, Show } from "solid-js";
import { RGBA } from "@opentui/core";
import { resolve, join } from "node:path";
import { writeFileSync, readFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { Store } from "../src/store";
const root=resolve(import.meta.dir,".."),file=resolve(root,"stats.config.json"),original=readFileSync(file,"utf8");
const dir=mkdtempSync(join(root,"test-data","tui-smoke-"));
writeFileSync(file,JSON.stringify({dataDir:dir,timeZone:"Asia/Shanghai"}));
let screen: Awaited<ReturnType<typeof testRender>> | undefined;
try {
  const store=new Store(dir);store.message("m","s","test","model");
  store.step({session:"s",message:"m",part:"p",device:"DESKTOP-FIXTURE",at:Date.now(),tokens:{input:24102255,output:27573,reasoning:0,cache:{read:0,write:0}}});
  store.message("long","s","test-provider","gemini-3.8-flash-high-with-a-very-long-model-name");
  for(let i=0;i<20;i++)store.step({session:"s",message:"long",part:`p${i}`,device:`DEVICE-${i}`,at:Date.now(),tokens:{input:100,output:20}});
  store.close();
  const entry="../dist/tui.mjs";const plugin=(await import(entry)).default;
  let command:any,dialogRender:()=>any=()=>null,dialogSize="",onClose:()=>void=()=>{};const disposers:(()=>void)[]=[];
  const [dialogOpen,setOpen]=createSignal(false);
  const dialog:any={get open(){return dialogOpen();},clear(){onClose();setOpen(false);},replace(render:()=>unknown,close:()=>void){onClose();onClose=close;dialogSize="medium";dialogRender=render;setOpen(true);},setSize(size:string){dialogSize=size;},get size(){return dialogSize;}};
  const api:any={
    route:{current:{name:"session",params:{sessionID:"original",prompt:{input:"draft"}}}},
    theme:{current:{primary:RGBA.fromHex("#8ab4f8"),accent:RGBA.fromHex("#7bdcb5"),text:RGBA.fromHex("#ffffff"),textMuted:RGBA.fromHex("#aaaaaa"),background:RGBA.fromHex("#000000"),backgroundPanel:RGBA.fromHex("#111111"),error:RGBA.fromHex("#ff0000"),warning:RGBA.fromHex("#ffff00")}},
    lifecycle:{onDispose:(f:()=>void)=>disposers.push(f)},keymap:{registerLayer:(r:any)=>{command=r.commands[0];}},
    ui:{dialog,toast:()=>{}}
  };
  await plugin.tui(api);
  if(command.slashName!=="usage")throw new Error("Slash command mismatch");command.run();
  if(!dialogOpen()||dialogSize!=="medium")throw new Error("Usage dialog did not use Commands size");
  // OpenCode 1.18.30 ui/dialog.tsx geometry: 60 columns, H/4 top,
  // W-2 max width, one padding row. Render this wrapper, never a full-screen panel.
  function Host(){
    const dim=useTerminalDimensions();
    return createComponent(Show,{keyed:true,get when(){return dialogOpen();},get children(){return jsx("box",{
      position:"absolute",left:0,top:0,alignItems:"center",
      get width(){return dim().width;},get height(){return dim().height;},get paddingTop(){return dim().height/4;},
      get children(){return jsx("box",{id:"host-dialog",width:60,get maxWidth(){return dim().width-2;},paddingTop:1,backgroundColor:api.theme.current.backgroundPanel,get children(){return dialogRender();}});}
    });}});
  }
  screen=await testRender(Host,{width:122,height:30});await screen.renderOnce();
  const find=(id:string):any=>{const visit=(node:any):any=>node.id===id?node:node.getChildren().map(visit).find(Boolean);return visit(screen!.renderer.root);};
  const capsule=RGBA.fromValues(api.theme.current.backgroundPanel.r+(api.theme.current.primary.r-api.theme.current.backgroundPanel.r)*0.22,api.theme.current.backgroundPanel.g+(api.theme.current.primary.g-api.theme.current.backgroundPanel.g)*0.22,api.theme.current.backgroundPanel.b+(api.theme.current.primary.b-api.theme.current.backgroundPanel.b)*0.22,1);
  const tabOn=(i:number)=>{const c=find(`usage-tab-${i}`).bg;return !!c&&c.r===capsule.r&&c.g===capsule.g&&c.b===capsule.b;};
  function geometry(width:number,height:number){
    const shell=find("host-dialog"),panel=find("usage-panel"),scroll=find("usage-scroll");
    if(shell.width!==Math.min(60,width-2)||shell.height!==panel.height+1||panel.height>height-3)throw new Error(`Incorrect dialog geometry: ${shell.width}x${shell.height}`);
    if(Math.abs(shell.y-(height-shell.height)/2)>1||Math.abs(shell.x-(width-shell.width)/2)>1)throw new Error(`Dialog is not centered: ${shell.x},${shell.y} ${shell.width}x${shell.height} in ${width}x${height}`);
    if(shell.y+shell.height>height||scroll.y+scroll.height>panel.y+panel.height-1)throw new Error("Dialog content overflow");
    const footer=find("usage-footer");
    if(footer&&(footer.height!==1||footer.y<=scroll.y||footer.y+footer.height>panel.y+panel.height))throw new Error("Footer misaligned or wrapped");
    const daily=find("usage-mode-0"),weekly=find("usage-mode-1"),head=find("usage-period-title");
    if(daily&&(daily.y!==panel.y+2||weekly.y!==daily.y||daily.y>=scroll.y||scroll.y+scroll.height>panel.y+panel.height-1))throw new Error("Mode selector is clipped or misaligned");
    if(daily&&head&&(head.y!==daily.y||head.y>=scroll.y))throw new Error("Period title is not on the mode row");
    if(daily&&daily.x!==find("usage-tab-0").x+1)throw new Error("Daily must align with Overview text, not its background");
    const period=find("usage-period"),totals=find("usage-totals"),trend=find("usage-trend");
    if(daily&&totals&&daily.x!==totals.x)throw new Error("Overview text and Daily must align with the summary's left edge");
    if(head&&trend&&totals&&period.x>totals.x){
      const firstDot=trend.getChildren().find((node:any)=>node.id!=="usage-selection").getChildren()[0];
      if(head.x!==firstDot.x)throw new Error("Period title must align with the first dot");
    }
  }
  geometry(122,30);
  const fittedHeight=find("usage-panel").height;
  for(const [w,h] of [[123,31],[123,33],[100,45]]) {
    screen.resize(w!,h!);await screen.renderOnce();geometry(w!,h!);
  }
  screen.resize(122,90);await screen.renderOnce();geometry(122,90);
  if(find("usage-panel").height!==fittedHeight||find("usage-scroll").scrollHeight>find("usage-scroll").height)throw new Error("Tall terminal stretches the dialog or clips calendar");
  writeFileSync(resolve(root,"test-data","tui-height-tall.txt"),screen.captureCharFrame());
  screen.resize(122,22);await screen.renderOnce();geometry(122,22);
  if(!screen.captureCharFrame().includes("Daily")||!screen.captureCharFrame().includes("Weekly"))throw new Error("Short terminal hides mode buttons");
  const shortScroll=find("usage-scroll");shortScroll.scrollTo(shortScroll.scrollHeight);await screen.renderOnce();geometry(122,22);
  writeFileSync(resolve(root,"test-data","tui-height-short.txt"),screen.captureCharFrame());
  screen.resize(122,30);await screen.renderOnce();find("usage-scroll").scrollTo(0);await screen.renderOnce();
  if(find("usage-period").x<=find("usage-totals").x||find("usage-period").y!==find("usage-totals").y)throw new Error("Overview columns misaligned");
  if(find("usage-period-head").x!==find("usage-period").x||find("usage-period-title").y!==find("usage-mode-0").y)throw new Error("Today is not aligned with Daily/Weekly");
  const getTiles=()=>find("usage-trend").getChildren().filter((node:any)=>node.id!=="usage-selection");
  const cells=getTiles();
  const localToday=new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Shanghai"});
  const [year,month,date]=localToday.split("-").map(Number);
  const weekday=(new Date(Date.UTC(year!,month!-1,date!)).getUTCDay()+6)%7;
  const tiles=cells;
  const todayIndex=weekday*7+6;
  let frame=screen.captureCharFrame();
  if(!frame.includes("24.13M")||frame.includes("24,132,228")||!frame.includes("Total tokens")||!frame.includes("Input")||!frame.includes("Output")||!frame.includes("Cache")||!frame.includes("Today 24.13M")||!frame.includes("Peak")||!frame.includes("Daily avg")||!frame.includes("Active")||!frame.includes("Cache 0 (0.0%)")||!frame.includes("Tab tabs")||!frame.includes("←↑↓→ move · Esc close")||frame.includes("This month")||!frame.includes("esc"))throw new Error("Overview render failed\n"+frame);
  if(!frame.includes("○")||!frame.includes("●")||/┌─┐|└─┘|▗▄▖|▝▀▘|▐|▌|🔳|🔲/.test(frame))throw new Error("Single-line activity dots missing or old tiles remain");
  if(tiles.length!==49||find("usage-trend").height!==14||tiles[7].y!==tiles[0].y+2||tiles[48].x+3>find("usage-period").x+find("usage-period").width)throw new Error("Daily must be a 7 by 7 grid");
  if(find("usage-trend").width!==29||tiles.some((tile:any,i:number)=>tile.x!==tiles[0].x+(i%7)*4||tile.y!==tiles[0].y+Math.floor(i/7)*2))throw new Error("Calendar dot spacing failed");
  const totals=find("usage-totals").getChildren();
  if(totals.length!==7||totals.some((row:any,i:number)=>row.getChildren()[0].y!==tiles[i*7].getChildren()[0].y))throw new Error("Activity dots must align with all seven summary text rows");
  if(frame.includes(" → ")||frame.includes("8 weeks"))throw new Error("Removed range labels remain");
  if(find("usage-selection").width!==3||find("usage-selection").height!==1||find("usage-selection").x!==tiles[todayIndex].x||find("usage-selection").y!==tiles[todayIndex].y||/\[[○●]\]/.test(frame)||tiles[todayIndex].getChildren()[0].bg!==find("usage-selection").backgroundColor||tiles[todayIndex].getChildren()[0].fg!==api.theme.current.primary||tiles.slice(todayIndex+1).some((tile:any)=>tile.getChildren()[0].fg!==api.theme.current.textMuted))throw new Error("Rectangle selection or dot color failed");
  if(tiles.some((tile:any,i:number)=>tile.width!==4||tile.height!==2||tile.getChildren()[0].width!==1||tile.getChildren()[0].height!==1||tile.getChildren()[0].x!==tile.x+1||tile.getChildren()[0].bg.a!==(i===todayIndex?1:0)))throw new Error("Activity dots must be single-line with only the selected background filled");
  if(find("usage-mode-0").fg!==api.theme.current.primary)throw new Error("Daily selected background missing");
  if(find("usage-scroll").scrollHeight>find("usage-scroll").height)throw new Error("Calendar should fit without scrolling");
  writeFileSync(resolve(root,"test-data","tui-overview.txt"),frame);
  if(!frame.includes("Overview")||frame.includes("▸ Overview"))throw new Error("Navigation style failed");
  if(!tabOn(0)||tabOn(1)||tabOn(2)||tabOn(3))throw new Error("Overview tab capsule missing");
  screen.mockInput.pressArrow("right");await screen.renderOnce();
  if(find("usage-selection").x!==tiles[todayIndex].x||find("usage-selection").y!==tiles[todayIndex].y)throw new Error("Daily right edge must not wrap to the next weekday");
  screen.mockInput.pressArrow("left");await screen.renderOnce();
  const movedTile=getTiles()[todayIndex-1];
  if(find("usage-selection").x!==movedTile.x||find("usage-selection").y!==movedTile.y)throw new Error("Arrow did not move cell selection");
  geometry(122,30);
  if(movedTile.getChildren()[0].bg!==find("usage-selection").backgroundColor||movedTile.getChildren()[0].fg!==api.theme.current.textMuted||getTiles()[todayIndex].getChildren()[0].bg.a!==0)throw new Error("Selection background must move and retain the empty dot's muted color");
  const dateLabel=(daysAgo:number)=>new Date(Date.UTC(year!,month!-1,date!)-daysAgo*86400000).toISOString().slice(0,10);
  if(!screen.captureCharFrame().includes(dateLabel(7)))throw new Error("Daily left must select the same weekday one week earlier");
  for(let i=0;i<7;i++)screen.mockInput.pressArrow("left");
  await screen.renderOnce();
  if(find("usage-selection").x!==getTiles()[weekday*7].x||find("usage-selection").y!==getTiles()[weekday*7].y||!screen.captureCharFrame().includes(dateLabel(42)))throw new Error("Daily left edge must stop in the oldest week");
  for(let i=0;i<7;i++)screen.mockInput.pressArrow("up");
  await screen.renderOnce();
  if(find("usage-selection").x!==getTiles()[0].x||getTiles()[0].getChildren()[0].bg!==find("usage-selection").backgroundColor)throw new Error("First-column selection background is clipped");
  if(find("usage-selection").y!==getTiles()[0].y||!screen.captureCharFrame().includes(dateLabel(42+weekday)))throw new Error("Daily upper edge must stop on Monday");
  screen.mockInput.pressArrow("down");await screen.renderOnce();
  if(!screen.captureCharFrame().includes(dateLabel(41+weekday)))throw new Error("Daily down must select the next day in the same week");
  for(let i=0;i<7;i++)screen.mockInput.pressArrow("down");
  for(let i=0;i<7;i++)screen.mockInput.pressArrow("right");
  await screen.renderOnce();
  if(find("usage-selection").x!==getTiles()[48].x||find("usage-selection").y!==getTiles()[48].y)throw new Error("Daily lower and right edges must stop at current Sunday");
  screen.mockInput.pressTab({shift:true});await screen.renderOnce();frame=screen.captureCharFrame();
  if(find("usage-panel").height!==fittedHeight)throw new Error("Weekly changed dialog size");
  if(!frame.includes("This week")||frame.includes("8 weeks")||find("usage-mode-1").fg!==api.theme.current.primary)throw new Error("Overview mode failed\n"+frame);
  if(find("usage-totals"))throw new Error("Weekly must hide usage-totals");
  geometry(122,30);
  const weekTiles=getTiles().map((tile:any)=>tile.getChildren()[0]);
  if(weekTiles.length!==91||find("usage-trend").height!==14)throw new Error("Weekly must display 13x7 dots");
  const firstWeeklyDot=getTiles()[0].getChildren()[0];
  if(firstWeeklyDot.x!==find("usage-mode-0").x)throw new Error("Weekly leftmost dot must align with Daily");
  if(find("usage-selection").width!==3||find("usage-selection").height!==13||find("usage-selection").x!==getTiles()[12].x||find("usage-selection").y!==getTiles()[12].y)throw new Error("Weekly column highlight failed");
  const col12Dots=Array.from({length:7},(_,row)=>getTiles()[row*13+12].getChildren()[0]);
  if(col12Dots.some((dot:any)=>dot.bg!==find("usage-selection").backgroundColor))throw new Error("Weekly must highlight entire column");
  screen.mockInput.pressArrow("up");await screen.renderOnce();
  if(find("usage-selection").x!==getTiles()[12].x)throw new Error("Weekly up must not change week selection");
  screen.mockInput.pressArrow("right");await screen.renderOnce();
  if(find("usage-selection").x!==getTiles()[12].x)throw new Error("Weekly right on current week must stop at current week");
  screen.mockInput.pressArrow("left");await screen.renderOnce();
  if(find("usage-selection").x!==getTiles()[11].x)throw new Error("Weekly left must select previous week");
  if(!screen.captureCharFrame().includes("Week of"))throw new Error("Weekly historical week title must include Week of");
  screen.mockInput.pressArrow("right");await screen.renderOnce();
  if(find("usage-selection").x!==getTiles()[12].x)throw new Error("Weekly right must return to current week");
  writeFileSync(resolve(root,"test-data","tui-weekly.txt"),frame);
  screen.mockInput.pressTab({shift:true});await screen.renderOnce();frame=screen.captureCharFrame();
  if(find("usage-mode-2")||frame.includes("Cumulative"))throw new Error("Removed mode remains visible");
  if(!frame.includes("Today"))throw new Error("Overview mode did not cycle to daily");
  screen.mockInput.pressTab({shift:true});await screen.renderOnce();
  if(!screen.captureCharFrame().includes("This week"))throw new Error("Shift+Tab did not wrap to weekly");
  screen.mockInput.pressTab({shift:true});await screen.renderOnce();frame=screen.captureCharFrame();
  if(!frame.includes("Today"))throw new Error("Shift+Tab did not return to daily");
  const panelRender=dialogRender;
  for(const key of ["t","d","m","1","2","3"]){screen.mockInput.pressKey(key);await screen.renderOnce();if(dialogRender!==panelRender||dialogSize!=="medium"||screen.captureCharFrame()!==frame)throw new Error("Removed shortcut still active: "+key);}
  screen.mockInput.pressTab();await screen.renderOnce();frame=screen.captureCharFrame();
  if(find("usage-panel").height!==fittedHeight)throw new Error("Models changed dialog size");
  if(!frame.includes("test / model"))throw new Error("Model tab failed\n"+frame);
  if(!tabOn(1)||tabOn(0)||tabOn(2)||tabOn(3))throw new Error("Models tab capsule missing");
  geometry(122,30);
  writeFileSync(resolve(root,"test-data","tui-models.txt"),frame);
  screen.mockInput.pressTab();await screen.renderOnce();frame=screen.captureCharFrame();
  if(find("usage-panel").height!==fittedHeight)throw new Error("Devices changed dialog size");
  if(!frame.includes("DESKTOP-FIXTURE")||!frame.includes("24.13M (100.0%)")&&!frame.includes("24.13M (99.9%)"))throw new Error("Device tab failed\n"+frame);
  if(!tabOn(2)||tabOn(1))throw new Error("Devices tab capsule missing");
  geometry(122,30);
  writeFileSync(resolve(root,"test-data","tui-devices.txt"),frame);
  const scroll=find("usage-scroll");scroll.scrollTo(scroll.scrollHeight);await screen.renderOnce();
  if(scroll.scrollTop<=0)throw new Error("Long list cannot scroll");geometry(122,30);
  screen.mockInput.pressTab();await screen.renderOnce();frame=screen.captureCharFrame();
  if(find("usage-panel").height!==fittedHeight)throw new Error("Settings changed dialog size");
  if(!frame.includes("Settings")||!frame.includes("Timezone")||!frame.includes("Asia/Shanghai")||!frame.includes("Reset")||!frame.includes("clear all usage")||frame.includes("▸")||!frame.includes("↑↓ row · ←→ zone")||!frame.includes("Enter reset · Esc close"))throw new Error("Settings tab failed\n"+frame);
  if(!tabOn(3)||tabOn(0)||tabOn(2))throw new Error("Settings tab capsule missing");
  if(find("usage-setting-0-label").fg!==api.theme.current.textMuted||find("usage-setting-1-label").fg!==api.theme.current.textMuted)throw new Error("Settings default focus failed");
  {
    const s0=find("usage-setting-0"),s1=find("usage-setting-1"),scroll=find("usage-scroll");
    if(Math.abs((s0.x+s0.width/2)-(scroll.x+scroll.width/2))>1||Math.abs((s0.y+s1.y+s1.height)/2-(scroll.y+scroll.height/2))>1)throw new Error("Settings is not centered");
  }
  geometry(122,30);
  writeFileSync(resolve(root,"test-data","tui-settings.txt"),frame);
  screen.mockInput.pressArrow("down");await screen.renderOnce();
  if(find("usage-setting-0-label").fg!==api.theme.current.primary||find("usage-setting-1-label").fg!==api.theme.current.textMuted)throw new Error("Settings down did not select Timezone");
  screen.mockInput.pressArrow("down");await screen.renderOnce();frame=screen.captureCharFrame();
  if(find("usage-setting-0-label").fg!==api.theme.current.textMuted||find("usage-setting-1-label").fg!==api.theme.current.primary||frame.includes("enter again to confirm"))throw new Error("Settings focus failed\n"+frame);
  screen.mockInput.pressEnter();await screen.renderOnce();frame=screen.captureCharFrame();
  if(!frame.includes("enter again to confirm")||find("usage-setting-1-label").fg!==api.theme.current.error||!frame.includes("Enter confirm · Esc cancel")||!dialogOpen())throw new Error("Settings reset confirm failed\n"+frame);
  screen.mockInput.pressEscape();await Bun.sleep(30);await screen.renderOnce();frame=screen.captureCharFrame();
  if(!dialogOpen()||frame.includes("enter again to confirm")||find("usage-setting-1-label").fg!==api.theme.current.primary||find("usage-panel").height!==fittedHeight)throw new Error("Settings Esc did not cancel confirm\n"+frame);
  screen.mockInput.pressTab();await screen.renderOnce();
  if(!screen.captureCharFrame().includes("Total tokens"))throw new Error("Tab did not cycle back to overview");
  screen.resize(48,18);await screen.renderOnce();geometry(48,18);writeFileSync(resolve(root,"test-data","tui-narrow.txt"),screen.captureCharFrame());
  if(!screen.captureCharFrame().includes("24.13M")||!screen.captureCharFrame().includes("esc"))throw new Error("Narrow summary failed");
  const narrowScroll=find("usage-scroll");narrowScroll.scrollTo(narrowScroll.scrollHeight);await screen.renderOnce();
  if(!screen.captureCharFrame().includes("Weekly"))throw new Error("Narrow mode selector unreachable");
  screen.resize(36,30);await screen.renderOnce();geometry(36,30);
  const stackedScroll=find("usage-scroll");stackedScroll.scrollTo(0);await screen.renderOnce();
  if(find("usage-period").y<=find("usage-totals").y)throw new Error("Small overview did not stack");
  stackedScroll.scrollTo(stackedScroll.scrollHeight);await screen.renderOnce();
  if(!screen.captureCharFrame().includes("Weekly"))throw new Error("Stacked overview content unreachable");
  writeFileSync(resolve(root,"test-data","tui-stacked.txt"),screen.captureCharFrame());
  for(const [w,step] of [[55,4],[32,3]]) {
    screen.resize(w!,30);await screen.renderOnce();geometry(w!,30);
    const trend=find("usage-trend"),narrowTiles=getTiles();
    if(narrowTiles.length!==49||narrowTiles.some((tile:any,i:number)=>tile.x!==narrowTiles[0].x+(i%7)*step!||tile.y!==narrowTiles[0].y+Math.floor(i/7)*2)||trend.width>find("usage-period").width)throw new Error("Responsive calendar spacing or bounds failed");
    screen.mockInput.pressTab({shift:true});await screen.renderOnce();
    const selection=find("usage-selection"), lastColTile=getTiles()[getTiles().length/7-1];
    if(selection.width!==3||selection.height!==13||selection.x!==lastColTile.x||selection.x<trend.x||selection.x+selection.width>trend.x+trend.width)throw new Error("Narrow last-column rectangle is misaligned or overflows");
    screen.mockInput.pressTab({shift:true});await screen.renderOnce();
  }
  screen.mockInput.pressEscape();await Bun.sleep(30);
  if(dialogOpen()||find("usage-panel"))throw new Error("Usage dialog did not close/unmount");
  const updated=new Store(dir);
  updated.step({session:"s",message:"m",part:"reopen",device:"DESKTOP-FIXTURE",at:Date.now(),tokens:{input:100,output:20}});
  updated.close();
  command.run();await screen.renderOnce();
  screen.resize(122,30);await screen.renderOnce();
  if(!screen.captureCharFrame().includes("27.99K"))throw new Error("Reopening did not load latest usage");
  screen.mockInput.pressEscape();await Bun.sleep(30);
  const empty=new Store(dir);empty.reset();empty.close();command.run();await screen.renderOnce();
  if(!screen.captureCharFrame().includes("No usage yet"))throw new Error("Empty overview failed");
  screen.mockInput.pressEscape();await Bun.sleep(30);
  const history=new Store(dir);
  for(let i=0;i<60;i++)history.step({session:"history",message:"history",part:String(i),device:"TEST",at:Date.now()-(59-i)*86400000,tokens:{input:(i%7+1)*1000,output:100}});
  history.close();command.run();screen.resize(122,42);await screen.renderOnce();
  writeFileSync(resolve(root,"test-data","tui-daily-history.txt"),screen.captureCharFrame());
  screen.mockInput.pressTab({shift:true});await screen.renderOnce();
  writeFileSync(resolve(root,"test-data","tui-weekly-history.txt"),screen.captureCharFrame());
  geometry(122,42);screen.mockInput.pressEscape();await Bun.sleep(30);
  const sparse=new Store(dir);sparse.reset();
  sparse.step({session:"sparse",message:"sparse",part:"yesterday",device:"TEST",at:Date.now()-86400000,tokens:{input:30500000,output:0}});
  sparse.step({session:"sparse",message:"sparse",part:"today",device:"TEST",at:Date.now(),tokens:{input:1616473,output:70070}});
  sparse.close();command.run();screen.resize(122,30);await screen.renderOnce();frame=screen.captureCharFrame();
  if(frame.includes("32,186,543")||!frame.includes("32.19M")||!frame.includes("1.69M")||!frame.includes("Peak")||frame.includes(" → ")||!frame.includes("○"))throw new Error("Sparse daily summary failed\n"+frame);
  writeFileSync(resolve(root,"test-data","tui-f-sparse-daily.txt"),frame);
  screen.mockInput.pressTab({shift:true});await screen.renderOnce();
  writeFileSync(resolve(root,"test-data","tui-f-sparse-weekly.txt"),screen.captureCharFrame());
  geometry(122,30);screen.mockInput.pressEscape();await Bun.sleep(30);
  console.log("Native TUI render, tabs, resize, slash registration and return passed");
} finally {screen?.renderer.destroy();writeFileSync(file,original);}
