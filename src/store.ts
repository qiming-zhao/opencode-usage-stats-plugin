import { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

export type Tokens = { input?: number; output?: number; reasoning?: number; total?: number; cache?: { read?: number; write?: number } };
export type Step = { session: string; message: string; part: string; device: string; at: number; tokens: Tokens };
export const count = (v: unknown): number | null => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
export const day = (at: number, zone: string) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);

export class Store {
  db: Database;
  file: string;
  constructor(public dir: string, public zone = "Asia/Shanghai", readonly = false) {
    this.file = join(dir, "stats.sqlite");
    if (!readonly) mkdirSync(dir, { recursive: true });
    this.db = new Database(this.file, readonly ? { readonly: true } : { create: true });
    try {
      this.db.exec("PRAGMA busy_timeout=100; PRAGMA foreign_keys=ON; PRAGMA temp_store=MEMORY;");
      const version = (this.db.query("PRAGMA user_version").get() as { user_version: number }).user_version;
      if (readonly) {
        if (version !== 2) throw new Error("Usage database is not initialized");
      } else {
        if (version !== 0 && version !== 2) {
          try {
            this.db.close();
            rmSync(this.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
            mkdirSync(this.dir, { recursive: true });
            this.db = new Database(this.file, { create: true });
            this.db.exec("PRAGMA busy_timeout=100; PRAGMA foreign_keys=ON; PRAGMA temp_store=MEMORY;");
          } catch {
            // Fallback for Windows file lock delays: wipe tables directly
            this.db = new Database(this.file, { create: true });
            this.db.exec("PRAGMA busy_timeout=100; PRAGMA foreign_keys=ON; PRAGMA temp_store=MEMORY;");
            this.db.exec("DROP TABLE IF EXISTS steps; DROP TABLE IF EXISTS messages; PRAGMA user_version=0;");
          }
        }
        this.db.exec("PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA temp_store=MEMORY;");
        this.db.transaction(() => {
          this.db.exec(`
            CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY,session TEXT NOT NULL,provider TEXT,model TEXT);
            CREATE TABLE IF NOT EXISTS steps (
              session TEXT NOT NULL,message TEXT NOT NULL,part TEXT NOT NULL,device TEXT NOT NULL,
              at INTEGER NOT NULL,input INTEGER,output INTEGER,reasoning INTEGER,cache_read INTEGER,cache_write INTEGER,reported_total INTEGER,
              PRIMARY KEY(session,message,part));
            CREATE INDEX IF NOT EXISTS steps_at ON steps(at);
            CREATE INDEX IF NOT EXISTS steps_device ON steps(device,at);
            CREATE INDEX IF NOT EXISTS steps_message ON steps(message);
            CREATE INDEX IF NOT EXISTS messages_model ON messages(provider,model);
            PRAGMA user_version=2;
          `);
        }).immediate();
        const check = this.db.query("PRAGMA quick_check").all() as Record<string, unknown>[];
        if (check.some(row => Object.values(row)[0] !== "ok")) throw new Error("Usage database integrity check failed; writes stopped");
      }
    } catch (error) { this.db.close(); throw error; }
  }
  message(id: string, session: string, provider?: string, model?: string) {
    this.db.query(`INSERT INTO messages VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET
      provider=COALESCE(excluded.provider,messages.provider),model=COALESCE(excluded.model,messages.model)`)
      .run(id, session, provider ?? null, model ?? null);
  }
  step(s: Step) {
    const t = s.tokens;
    // A repeated part is a snapshot, not another increment. First observation owns time/device.
    this.db.query(`INSERT INTO steps VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(session,message,part) DO UPDATE SET
      input=COALESCE(excluded.input,steps.input),output=COALESCE(excluded.output,steps.output),
      reasoning=COALESCE(excluded.reasoning,steps.reasoning),cache_read=COALESCE(excluded.cache_read,steps.cache_read),
      cache_write=COALESCE(excluded.cache_write,steps.cache_write),reported_total=COALESCE(excluded.reported_total,steps.reported_total)`)
      .run(s.session,s.message,s.part,s.device,s.at,count(t.input),count(t.output),count(t.reasoning),count(t.cache?.read),count(t.cache?.write),count(t.total));
  }
  reset() {
    this.db.exec("DELETE FROM steps; DELETE FROM messages;");
  }
  view() {
    const from = "FROM steps u LEFT JOIN messages m ON m.id=u.message";
    // Net token accounting separates actual new tokens (input + output/reasoning)
    // from prompt cache hits (cache_read + cache_write).
    const inputComplete = "u.input IS NOT NULL AND u.cache_read IS NOT NULL AND u.cache_write IS NOT NULL";
    const outputTotal = `CASE WHEN ${inputComplete} AND u.reported_total IS NOT NULL THEN MAX(u.reported_total - u.input - u.cache_read - u.cache_write, 0) WHEN u.output IS NULL AND u.reasoning IS NULL THEN NULL ELSE COALESCE(u.output, 0) + COALESCE(u.reasoning, 0) END`;
    const netInput = "CASE WHEN u.input IS NULL THEN NULL ELSE u.input END";
    const cacheTotal = "CASE WHEN u.cache_read IS NULL AND u.cache_write IS NULL THEN NULL ELSE COALESCE(u.cache_read, 0) + COALESCE(u.cache_write, 0) END";
    const total = `COALESCE(${netInput}, 0) + COALESCE(${outputTotal}, 0)`;
    const sums = `COALESCE(SUM(${total}), 0) total, SUM(${netInput}) input, SUM(${outputTotal}) output, SUM(${cacheTotal}) cache, MAX(u.at) last`;
    const summarySums = `COALESCE(SUM(${total}), 0) total, SUM(${netInput}) input, SUM(${outputTotal}) output, SUM(${cacheTotal}) cache`;
    const all = (sql: string) => this.db.query(sql).all() as Record<string, any>[];
    const buckets = new Map<string, { label: string; total: number; input: number | null; output: number | null; cache: number | null; last: number }>();
    for (const r of all(`SELECT u.at, ${netInput} input, ${outputTotal} output, ${cacheTotal} cache, ${total} total ${from}`)) {
      const label = day(r.at, this.zone);
      const b = buckets.get(label);
      if (!b) buckets.set(label, { label, total: r.total || 0, input: r.input ?? null, output: r.output ?? null, cache: r.cache ?? null, last: r.at });
      else {
        b.total += r.total || 0;
        b.input = r.input == null && b.input == null ? null : (b.input ?? 0) + (r.input ?? 0);
        b.output = r.output == null && b.output == null ? null : (b.output ?? 0) + (r.output ?? 0);
        b.cache = r.cache == null && b.cache == null ? null : (b.cache ?? 0) + (r.cache ?? 0);
        if (r.at > b.last) b.last = r.at;
      }
    }
    return {
      summary: all(`SELECT ${summarySums} ${from}`)[0],
      days: [...buckets.values()].sort((a, b) => b.label.localeCompare(a.label)),
      models: all(`SELECT COALESCE(m.provider, 'unknown') || ' / ' || COALESCE(m.model, 'unknown') label, ${sums} ${from} GROUP BY label ORDER BY total DESC`),
      devices: all(`SELECT u.device label, ${sums} ${from} GROUP BY label ORDER BY total DESC`),
    };
  }
  close() { this.db.close(); }
}
