# Contributing

Thank you for your interest in contributing to opencode-usage-stats-plugin!

## Prerequisites

- [Bun](https://bun.sh) (latest stable)
- [OpenCode](https://opencode.ai) >= 1.18.30

## Getting Started

1. Fork and clone the repository
2. Install dependencies:

   ```bash
   bun install
   ```

3. Create a feature branch:

   ```bash
   git checkout -b feat/your-feature
   ```

## Development Workflow

### Build

```bash
bun run build
```

### Run Tests

```bash
bun test
```

### Type Check

```bash
bun run typecheck
```

Please ensure all tests pass and type checks succeed before submitting a pull request.

## Project Structure

```
src/
├── server.ts      # Server plugin entry point
├── tui.tsx        # Terminal UI (SolidJS + @opentui)
├── collector.ts   # Event capture logic
├── store.ts       # SQLite storage layer
├── overview.ts    # Data visualization calculations
└── config.ts      # Configuration reader

test/
├── store.test.ts     # Storage layer unit tests
├── overview.test.ts  # Overview logic unit tests
├── crash.test.ts     # Crash recovery test
├── smoke.ts          # Build artifact smoke test
└── tui-smoke.ts      # TUI rendering smoke test
```

## Commit Messages

Use clear, descriptive commit messages. Suggested prefixes:

- `feat:` -- new feature
- `fix:` -- bug fix
- `docs:` -- documentation changes
- `test:` -- adding or updating tests
- `refactor:` -- code refactoring without behavior change
- `chore:` -- build, CI, or tooling changes

## Pull Requests

- Keep PRs focused on a single change
- Include tests for new functionality
- Update documentation if the change affects user-facing behavior
- Ensure CI passes before requesting review

## Reporting Issues

Use GitHub Issues to report bugs or request features. Please include:

- OpenCode version
- Bun version
- Operating system
- Steps to reproduce (for bugs)
- Expected vs actual behavior

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
