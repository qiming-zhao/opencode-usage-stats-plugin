// Built entrypoint smoke test; all runtime files remain in this project's test-data.
import { resolve } from "node:path";
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
const root=resolve(import.meta.dir,"..");
const configFile=resolve(root,"stats.config.json");
const original=readFileSync(configFile,"utf8");
const dataDir=resolve(root,"test-data","server-smoke");mkdirSync(dataDir,{recursive:true});
writeFileSync(configFile,JSON.stringify({dataDir,timeZone:"Asia/Shanghai"}));
try {
  const entry = "../dist/server.mjs";
  const {default:plugin}=await import(entry);
  const notices:string[]=[];
  const hooks=await plugin.server({client:{
    tui:{showToast:async(o:any)=>{notices.push(o.body.message);}},app:{log:async()=>{}},
    session:{message:async()=>({data:{info:{id:"m",sessionID:"s",role:"assistant",providerID:"test",modelID:"fixture"}}})}
  }});
  await hooks.event({event:{type:"message.part.updated",properties:{part:{type:"step-finish",id:"p",messageID:"m",sessionID:"s",tokens:{input:12,output:3,reasoning:0,cache:{read:0,write:0}}}}}});
  await hooks.dispose();
  if(notices.length)throw new Error(notices.join("\n"));
  const {Store}=await import("../src/store");const store=new Store(dataDir);
  if(store.view().summary.total!==15 || store.view().models[0].label!=="test / fixture")throw new Error("smoke result mismatch");
  store.close();console.log("Built server smoke passed");
} finally {writeFileSync(configFile,original);}
