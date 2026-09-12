import { readFileSync, existsSync, realpathSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve, join, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { hostname, homedir } from "node:os";

// Both src and dist are immediately below the package root. Resolve Junctions.
export const root = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));

export type UsageConfig = { dataDir: string; timeZone: string; device: string };

const LEGACY_FILE = "stats.config.json";
const USER_FILE = "usage-stats-plugin.json";

// The OpenCode config directory doubles as the home for user-level plugin
// config. It survives plugin updates, unlike files inside the package.
export function configDir(home: string = homedir()): string {
  return resolve(home, ".config", "opencode");
}

export function userConfigFile(home: string = homedir()): string {
  return join(configDir(home), USER_FILE);
}

function readJson(file: string): Record<string, unknown> | undefined {
  if (!existsSync(file)) return undefined;
  return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
}

function checkedTimeZone(value: unknown): string {
  const zone = typeof value === "string" ? value : "Asia/Shanghai";
  new Intl.DateTimeFormat("en", { timeZone: zone }).format();
  return zone;
}

function resolveDataDir(value: Record<string, unknown>, baseDir: string, fallback: string): string {
  const dir = value.dataDir;
  if (dir === undefined || dir === null) return fallback;
  if (typeof dir !== "string") throw new Error("dataDir must be a path string");
  if (isAbsolute(dir)) return dir;
  return resolve(baseDir, dir);
}

// Resolution order: user-level config next to opencode.json first,
// legacy package-root config second (unchanged behavior), built-in
// defaults last. config() never writes; it only reads.
export function config(packageRoot: string = root, home: string = homedir()): UsageConfig {
  const dir = configDir(home);
  const userValue = readJson(join(dir, USER_FILE));
  const value = userValue ?? readJson(resolve(packageRoot, LEGACY_FILE)) ?? {};
  const baseDir = userValue ? dir : packageRoot;
  const fallback = join(dir, "usage-stats-data");
  return {
    dataDir: resolveDataDir(value, baseDir, fallback),
    timeZone: checkedTimeZone(value.timeZone),
    device: hostname(),
  };
}

// Timezone edits always land in the user-level config so they survive
// plugin updates. Current effective values are carried over losslessly.
export function writeTimeZone(timeZone: string, packageRoot: string = root, home: string = homedir()) {
  const zone = checkedTimeZone(timeZone);
  const current = config(packageRoot, home);
  const file = userConfigFile(home);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ dataDir: current.dataDir, timeZone: zone }));
}
