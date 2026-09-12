import { readFileSync, existsSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hostname } from "node:os";

// Both src and dist are immediately below the package root. Resolve Junctions.
export const root = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
export function config() {
  const file = resolve(root, "stats.config.json");
  const value = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  const timeZone = value.timeZone ?? "Asia/Shanghai";
  new Intl.DateTimeFormat("en", { timeZone }).format();
  if (value.dataDir !== undefined && typeof value.dataDir !== "string") throw new Error("dataDir must be a path string");
  return { dataDir: resolve(root, value.dataDir ?? "data"), timeZone, device: hostname() };
}
export function writeTimeZone(timeZone: string) {
  new Intl.DateTimeFormat("en", { timeZone }).format();
  const file = resolve(root, "stats.config.json");
  const value = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  writeFileSync(file, JSON.stringify({ ...value, timeZone }));
}
