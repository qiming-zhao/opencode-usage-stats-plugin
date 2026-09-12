import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { config, writeTimeZone, userConfigFile } from "../src/config";

function sandbox() {
  const base = mkdtempSync(join(tmpdir(), "usage-config-"));
  const home = join(base, "home"), pkg = join(base, "pkg");
  mkdirSync(home, { recursive: true });mkdirSync(pkg, { recursive: true });
  return { home, pkg };
}
const legacy = (pkg: string, v: unknown) => writeFileSync(join(pkg, "stats.config.json"), JSON.stringify(v));
const user = (home: string, v: unknown) => {
  const dir = join(home, ".config", "opencode");mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "usage-stats-plugin.json"), JSON.stringify(v));
};

test("user-level config wins and relative dataDir resolves beside it", () => {
  const { home, pkg } = sandbox();
  legacy(pkg, { dataDir: "./data", timeZone: "UTC" });
  user(home, { dataDir: "./mine", timeZone: "Europe/Berlin" });
  const c = config(pkg, home);
  expect(c.timeZone).toBe("Europe/Berlin");
  expect(c.dataDir).toBe(join(home, ".config", "opencode", "mine"));
});

test("legacy package-root config keeps old behavior", () => {
  const { home, pkg } = sandbox();
  legacy(pkg, { dataDir: "./data", timeZone: "UTC" });
  const c = config(pkg, home);
  expect(c.timeZone).toBe("UTC");
  expect(c.dataDir).toBe(join(pkg, "data"));
});

test("no config falls back to stable defaults", () => {
  const { home, pkg } = sandbox();
  const c = config(pkg, home);
  expect(c.timeZone).toBe("Asia/Shanghai");
  expect(c.dataDir).toBe(join(home, ".config", "opencode", "usage-stats-data"));
});

test("absolute dataDir is used as-is", () => {
  const { home, pkg } = sandbox();
  const abs = join(home, "elsewhere");
  user(home, { dataDir: abs });
  expect(config(pkg, home).dataDir).toBe(abs);
});

test("invalid dataDir and timeZone throw", () => {
  const { home, pkg } = sandbox();
  user(home, { dataDir: 42 });
  expect(() => config(pkg, home)).toThrow("dataDir must be a path string");
  const s2 = sandbox();
  user(s2.home, { timeZone: "Not/AZone" });
  expect(() => config(s2.pkg, s2.home)).toThrow();
});

test("writeTimeZone persists to user-level file without losing dataDir", () => {
  const { home, pkg } = sandbox();
  legacy(pkg, { dataDir: "./data", timeZone: "UTC" });
  writeTimeZone("America/New_York", pkg, home);
  const file = userConfigFile(home);
  const c = config(pkg, home);
  expect(c.timeZone).toBe("America/New_York");
  expect(c.dataDir).toBe(join(pkg, "data"));
  expect(Bun.file(file).size).toBeGreaterThan(0);
});
