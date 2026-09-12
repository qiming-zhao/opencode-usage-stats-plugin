import { Store } from "../src/store";
const store=new Store(process.argv[2]);
store.step({session:"committed",message:"m",part:"p",device:"PC",at:Date.now(),tokens:{input:42}});
store.db.exec("BEGIN IMMEDIATE");
store.step({session:"unfinished",message:"m2",part:"p2",device:"PC",at:Date.now(),tokens:{input:999}});
console.log("transaction-ready");
await new Promise(()=>{});
