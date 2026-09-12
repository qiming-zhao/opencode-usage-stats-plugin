import solid from "@opentui/solid/bun-plugin";
const result = await Bun.build({
  entrypoints: ["./src/server.ts", "./src/tui.tsx"], outdir: "./dist",
  target: "bun", format: "esm", naming: "[name].mjs", plugins: [solid],
  external: ["bun:sqlite", "@opencode-ai/plugin", "@opencode-ai/plugin/tui", "@opentui/core", "@opentui/solid", "solid-js"]
});
if (!result.success) { console.error(result.logs); process.exit(1); }
