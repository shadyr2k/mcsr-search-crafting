# Repository Guidelines

## Project Structure & Module Organization

`generator/src/mcsr_data/` contains the Python build-time pipeline for Minecraft 1.16.1 recipes, tags, translations, tooltips, and recipe-result collections. Its tests and fixtures live in `generator/tests/`; source audits are in `generator/references/`. `web/src/` contains the React application, organized into `data/`, `domain/`, `engine/`, `persistence/`, `presets/`, and `components/`. Browser tests live in `web/e2e/`, while generated schema-v3 JSON is published to `web/public/data/`. Design records and implementation plans live under `docs/superpowers/`.

`minecraft-data/` is ignored local source material. Do not commit extracted game files, virtual environments, dependency caches, Playwright output, or `web/dist/`.

## Efficient Repository Navigation

Start with files directly relevant to the requested task and their immediate
dependencies. Do not scan or read the entire repository by default.

Prefer targeted searches with `rg` or `rg --files` over broad directory
exploration. Read additional files only when the initially relevant files do
not provide enough context.

Do not read `docs/superpowers/` unless the current task depends on a design
record or implementation plan there. Do not inspect generated data,
`minecraft-data/`, dependency directories, build output, or test artifacts
unless the task specifically requires them.

Avoid rereading unchanged files when their relevant contents are already known
in the current session.

## Build, Test, and Development Commands

Run commands from the repository root unless noted:

- `.\.venv\Scripts\python.exe -m pytest -q` — run all generator tests.
- `.\.venv\Scripts\python.exe -m mcsr_data.generate --source minecraft-data --output web/public/data` — regenerate and validate production browser data.
- `pnpm --dir web test --run` — run Vitest once.
- `pnpm --dir web run typecheck` — validate TypeScript without emitting files.
- `pnpm --dir web run build` — type-check and build the static site.
- `pnpm --dir web run e2e` — run Playwright against Vite.
- `pnpm --dir web run dev --host 127.0.0.1` — serve locally at `http://127.0.0.1:5173`.

Never use `--allow-non-baseline` when generating committed production data.

## Coding Style & Naming Conventions

Follow existing files: four-space indentation in Python and two spaces in TypeScript/TSX, single quotes in TypeScript, and no unnecessary semicolons. Use `snake_case` for Python functions/modules, `camelCase` for TypeScript values, and `PascalCase` for React components and exported types. Keep optimization logic independent of React under `web/src/engine/`. Preserve exact Minecraft item IDs and deterministic lexical ordering.

## Testing Guidelines

Use `test_*.py` for pytest and `*.test.ts(x)` for Vitest. Add focused regression
tests before fixes. Engine changes need unit coverage; visible workflows need
Testing Library or Playwright coverage. Generator changes must preserve
cross-file schema consistency and deterministic output.

During implementation, run the smallest relevant test subset first. Do not run
the full test suite after every change. Run broader verification once the task
is complete, when changes span multiple systems, or when explicitly requested.

Prefer concise test output. Use verbose output only when needed to diagnose a
failure.

## Subagent Guidelines

Use subagents for independent work that benefits from parallel investigation,
not for routine or narrowly scoped tasks.

Give each subagent a specific responsibility and relevant files or directories
when known. Avoid having multiple subagents independently explore the same
parts of the repository.

Subagents should return concise findings, relevant file paths, decisions, and
actionable conclusions rather than raw command output or lengthy summaries.

## Commit & Pull Request Guidelines

History uses concise Conventional Commit subjects such as `feat:`, `fix:`, `test:`, `docs:`, and `chore:`. Keep commits scoped and imperative. Pull requests should explain behavior changes, list verification commands and results, call out generated-data updates, link relevant issues/designs, and include screenshots for UI changes. Never mix unrelated local or worktree changes into a commit.