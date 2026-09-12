# opencode-usage-stats-plugin

[简体中文](README.zh-CN.md) | English

An [OpenCode](https://opencode.ai) plugin that tracks LLM token usage and displays interactive statistics in the terminal UI.

![Usage stats overview](docs/screenshot-overview.png)

## Features

- **Token tracking** -- automatically records input, output, cache, and reasoning tokens for every LLM call
- **Multi-device** -- aggregates usage across multiple machines via hostname identification
- **Heat-map overview** -- daily and weekly activity heat maps with trend levels
- **Model breakdown** -- per-provider / per-model token consumption with bar charts
- **Device breakdown** -- per-device usage with last-active timestamps
- **Timezone-aware** -- configurable timezone with 10 presets; all aggregation respects DST / leap-year boundaries
- **Crash-safe** -- SQLite WAL mode with busy-timeout retry; committed data survives process kills
- **Keyboard & mouse** -- full keyboard navigation (arrow keys, Tab, Shift+Tab) and mouse click support
- **Responsive layout** -- adapts to narrow terminals with a stacked layout

## Requirements

- [OpenCode](https://opencode.ai) >= 1.18.30, < 1.19.0
- [Bun](https://bun.sh) runtime (for building and running tests)

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/qiming-zhao/opencode-usage-stats-plugin.git
   cd opencode-usage-stats-plugin
   ```

2. Install dependencies:

   ```bash
   bun install
   ```

3. Build the plugin:

   ```bash
   bun run build
   ```

4. Register the plugin in your OpenCode configuration files:

   Add the server plugin to `~/.config/opencode/opencode.json`:

   ```jsonc
   {
     "plugin": [
       "/absolute/path/to/opencode-usage-stats-plugin/dist/server.mjs"
     ]
   }
   ```

   Add the TUI plugin to `~/.config/opencode/tui.json`:

   ```jsonc
   {
     "plugin": [
       "/absolute/path/to/opencode-usage-stats-plugin/dist/tui.mjs"
     ]
   }
   ```

5. Restart OpenCode. The plugin will begin tracking usage automatically.

## Usage

Open the usage panel in OpenCode via:

- Slash command: type `/usage`
- Command palette: search for **Usage stats**

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Tab` | Switch between tabs (Overview / Models / Devices / Settings) |
| `Shift+Tab` | Toggle Daily / Weekly mode (on Overview tab) |
| `Arrow keys` | Navigate heat-map cells |
| `Esc` | Close the panel |

## Configuration

The plugin reads from `stats.config.json` in the plugin root:

```json
{
  "dataDir": "./data",
  "timeZone": "Asia/Shanghai"
}
```

| Field | Description | Default |
|-------|-------------|---------|
| `dataDir` | Directory for the SQLite database | `./data` |
| `timeZone` | IANA timezone for day boundaries | `Asia/Shanghai` |

The timezone can also be changed from the Settings tab in the TUI panel.

## Development

```bash
# Install dependencies
bun install

# Build
bun run build

# Run tests
bun test

# Type check
bun run typecheck
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for more details.

## Architecture

```
src/
├── server.ts      # Server-side plugin entry (event listener + retry queue)
├── tui.tsx        # Terminal UI panel (SolidJS + @opentui)
├── collector.ts   # Event capture / token extraction
├── store.ts       # SQLite data layer (schema, upsert, aggregation)
├── overview.ts    # Heat-map and compact number formatting
└── config.ts      # Configuration file reader
```

## License

[MIT](LICENSE)
