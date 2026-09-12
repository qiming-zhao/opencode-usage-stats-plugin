import { test, expect, afterAll } from "bun:test";
import { mkdirSync, mkdtempSync } from "node:fs";
import { resolve, join } from "node:path";
import { Store, day } from "../src/store";
import { capture } from "../src/collector";

const base=resolve(import.meta.dir,"../test-data");mkdirSync(base,{recursive:true});
const opened:Store[]=[];
function fresh(){const s=new Store(mkdtempSync(join(base,"case-")));opened.push(s);return s;}
afterAll(()=>{for(const s of opened)s.close();});
const tokens={input:100,output:20,reasoning:10,cache:{read:200,write:30},total:360};
function step(s:Store,part="p1",device="PC-A",at=Date.parse("2026-09-10T00:00:00Z")){
  return capture(s,{type:"message.part.updated",properties:{part:{id:part,type:"step-finish",sessionID:"s1",messageID:"m1",tokens}}},device,at);
}
test("step snapshots deduplicate across instances and devices; message totals are not counted",()=>{
  const s=fresh();step(s);step(s,"p1","PC-B");
  capture(s,{type:"message.updated",properties:{info:{id:"m1",sessionID:"s1",role:"assistant",providerID:"anthropic",modelID:"claude"}}},"PC-A");
  expect(s.view().summary.total).toBe(130);
  expect(s.view().summary.input).toBe(100);
  expect(s.view().summary.output).toBe(30);
  expect(s.view().summary.cache).toBe(230);
  expect(s.view().devices[0].label).toBe("PC-A");expect(s.view().models[0].label).toBe("anthropic / claude");
});
test("multiple tool steps and session events do not affect usage aggregates",()=>{
  const s=fresh();step(s);step(s,"p2");
  expect(s.view().summary.total).toBe(260);
  capture(s,{type:"session.updated",properties:{}},"PC-A");
  capture(s,{type:"session.deleted",properties:{}},"PC-A");
  expect(s.view().summary.total).toBe(260);
});
test("missing usage ignored; invalid counters stay missing; text not stored",()=>{
  const s=fresh();
  capture(s,{type:"message.part.updated",properties:{part:{id:"x",type:"text",sessionID:"s",messageID:"m"}}},"PC-A");
  s.step({session:"s",message:"m",part:"p",device:"PC-A",at:Date.now(),tokens:{input:-2,output:NaN,reasoning:10}});
  expect(s.view().summary.total).toBe(10);expect(s.view().summary.input).toBeNull();
});
test("aggregate views and timezone boundaries",()=>{
  const s=fresh();step(s,"p1","PC-A",Date.parse("2026-09-09T15:59:59Z"));step(s,"p2","PC-B",Date.parse("2026-09-09T16:00:00Z"));
  s.message("m1","s1","p","m");
  expect(s.view().summary.total).toBe(260);
  expect(s.view().days.length).toBe(2);
  expect(day(Date.parse("2026-09-09T16:00:00Z"),"Asia/Shanghai")).toBe("2026-09-10");
  const utc=new Store(s.dir,"UTC",true);
  expect(utc.view().days.length).toBe(1);
  expect(utc.view().days[0].label).toBe("2026-09-09");
  utc.close();
});
test("daily view preserves more than a year of history",()=>{
  const s=fresh();
  s.db.transaction(()=>{
    for(let i=0;i<400;i++) step(s,`history-${i}`,"PC-A",Date.UTC(2024,0,1+i));
  })();
  const view=s.view();
  expect(view.days).toHaveLength(400);
  expect(view.days.at(-1)!.label).toBe("2024-01-01");
  expect(view.days.reduce((sum,row)=>sum+row.total,0)).toBe(view.summary.total);
});
test("same-machine connections see durable commits and report lock contention",()=>{
  const s=fresh(),other=new Store(s.dir);opened.push(other);
  step(s);step(other);expect(other.view().summary.total).toBe(130);
  s.db.exec("BEGIN IMMEDIATE");
  try{expect(()=>step(other,"locked")).toThrow();}finally{s.db.exec("ROLLBACK");}
  step(other,"unlocked");expect(s.view().summary.total).toBe(260);
});
test("readonly reopening and reset",()=>{
  const s=fresh();step(s);s.message("m1","s1","p","m");
  const read=new Store(s.dir,"Asia/Shanghai",true);expect(read.view().summary.total).toBe(130);read.close();
  s.reset();
  expect(s.view().summary.total).toBe(0);
  expect(s.view().models.length).toBe(0);
  step(s,"p2");
  expect(s.view().summary.total).toBe(130);
});
test("session identifiers remain internal dedup keys",()=>{
  const s=fresh();
  for(let i=0;i<26;i++){
    s.step({session:`s${i}`,message:`m${i}`,part:`p${i}`,device:"PC",at:100+i,tokens});
  }
  expect(s.view().summary.total).toBe(26*130);
});
test("incompatible schema is replaced",async ()=>{
  const s=fresh();step(s);s.db.exec("PRAGMA user_version=1");s.close();
  await new Promise(r=>setTimeout(r,50));
  const rebuilt=new Store(s.dir);opened.push(rebuilt);
  expect((rebuilt.db.query("PRAGMA user_version").get() as any).user_version).toBe(2);
  expect(rebuilt.view().summary.total).toBe(0);
  step(rebuilt);
  expect(rebuilt.view().summary.total).toBe(130);
});
test("future schema is replaced",async ()=>{
  const s=fresh();s.db.exec("PRAGMA user_version=99");s.close();
  await new Promise(r=>setTimeout(r,50));
  const rebuilt=new Store(s.dir);opened.push(rebuilt);
  expect((rebuilt.db.query("PRAGMA user_version").get() as any).user_version).toBe(2);
});

test("two-bucket totals use reported total when available",()=>{
  const s=fresh();s.message("m","s","test-provider","gemini");
  const add=(part:string,t:typeof tokens)=>s.step({session:"s",message:"m",part,device:"PC",at:Date.now(),tokens:t});
  add("gemini",{input:31354,output:0,reasoning:299,cache:{read:0,write:0},total:31415});
  let view=s.view();
  expect(view.summary.total).toBe(31415);
  expect(view.summary.input).toBe(31354);
  expect(view.summary.output).toBe(61);
  expect(view.models[0].total).toBe(31415);
  add("opposite",{input:100,output:0,reasoning:0,cache:{read:0,write:0},total:338});
  view=s.view();
  expect(view.summary.total).toBe(31753);
  const other=new Store(mkdtempSync(join(base,"case-")));opened.push(other);
  other.step({session:"s2",message:"m2",part:"missing",device:"OTHER",at:Date.now(),tokens:{input:10,total:50}});
  other.step({session:"s2",message:"m2",part:"no-total",device:"OTHER",at:Date.now(),tokens:{input:10,output:0,reasoning:0,cache:{read:0,write:0}}});
  view=other.view();
  expect(view.summary.total).toBe(20);
  expect(view.summary.input).toBe(20);
  expect(view.summary.output).toBe(0);
});
