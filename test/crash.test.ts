import { test,expect } from "bun:test";
import { mkdirSync,mkdtempSync } from "node:fs";
import { join,resolve } from "node:path";
import { Store } from "../src/store";
test("terminated writer preserves committed usage and rolls back unfinished transaction",async()=>{
  const root=resolve(import.meta.dir,"../test-data");mkdirSync(root,{recursive:true});
  const dir=mkdtempSync(join(root,"crash-"));
  const child=Bun.spawn([process.execPath,resolve(import.meta.dir,"crash-worker.ts"),dir],{stdout:"pipe",stderr:"pipe"});
  try {
    const reader=child.stdout.getReader();const {value}=await reader.read();reader.releaseLock();
    expect(new TextDecoder().decode(value)).toContain("transaction-ready");
    child.kill();await child.exited;
    const recovered=new Store(dir);
    try{expect(recovered.view().summary.total).toBe(42);}finally{recovered.close();}
  }finally{child.kill();}
},10000);
