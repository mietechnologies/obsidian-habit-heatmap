# Repository Guidelines

## Project Structure & Module Organization
This repository is a flat TypeScript Obsidian plugin. `main.ts` is the plugin entrypoint, `renderer.ts` renders `habit-heatmap` blocks, and `scanner.ts` plus `parser.ts` extract habit data from notes. Shared types live in `types.ts`. Build configuration is in `esbuild.config.mjs` and `tsconfig.json`. Release metadata lives in `manifest.json` and `versions.json`. UI styling is in `styles.css`. There is currently no `src/` or `tests/` directory, so keep new modules at the root unless the project is intentionally reorganized.

## Build, Test, and Development Commands
Run `npm install` once to install local tooling. Use `npm run dev` during development to watch files and rebuild `main.js` on change. Use `npm run build` to create the production bundle used by Obsidian. There are no dedicated lint or test scripts in `package.json` yet, so a successful build is the minimum required validation before submitting changes.

## Coding Style & Naming Conventions
Match the existing code style: TypeScript with ES modules, double quotes, semicolons, and 2-space indentation. Prefer small focused files and explicit types when they clarify plugin behavior. Use `PascalCase` for classes (`HabitScanner`), `camelCase` for functions and variables (`scheduleRefresh`), and keep file names short and descriptive (`renderer.ts`, `parser.ts`). Preserve existing Obsidian-facing identifiers such as the `habit-heatmap` code block name.

## Testing Guidelines
This project does not yet include automated tests. When changing parsing, scanning, or rendering behavior, verify by running `npm run build` and testing the plugin manually in Obsidian with representative notes. If you add tests, place them in a new `tests/` directory and name files `*.test.ts` so the convention is obvious.

## Commit & Pull Request Guidelines
Purpose

All code-related commits must follow this structured diff-style format.

This format is mandatory for any commit involving code changes.

Commits involving only:
	•	Documentation
	•	Configuration
	•	CI/CD
	•	Formatting-only changes

…may use a simple descriptive title only (no structured body required).

⸻

Commit Format (Code Changes)

1️⃣ Title Line
	•	Descriptive (not imperative required, but descriptive preferred)
	•	No trailing period
	•	No emojis
	•	No prefixes (feat:, fix:, etc.)
	•	One short line only

Examples:

```
Directory opt-in visibility logic added
Stripe payment confirmation fix
Auth token refresh flow refactor
```


⸻

2️⃣ Body Structure

After the title, insert one blank line.

Then list every changed file explicitly using the structured format below.

⸻

Change Symbols

| Symbol | Meaning |
|--------|---------|
| + | Added |
| - | Removed |
| ~ | Modified |

⸻

File-Level Format

Single Change in File

If only one method or section changed:
```
~ DirectoryService.updateVisibility
  * Added opt-in filtering logic.
```

If not method-specific:
```
~ tailwind.config.ts
  * Updated brand color palette.
```

⸻

Multiple Changes in One File

When multiple methods are changed within the same file:
```
~ DirectoryService.ts
  + updateVisibility(): Added role-based filtering.
  - legacyVisibilityCheck(): Removed deprecated logic.
  ~ getVisibleMembers(): Improved role handling.
  * Consolidated directory visibility rules.
```

Rules:
	•	File name listed once.
	•	Methods indented under file.
	•	Method entries must include parentheses () if applicable.
	•	Use a final * line for general file-level explanation if helpful.

⸻

Test Changes

If test changes occur within the same test suite file:

Use the test suite file name, then list methods underneath.

Example:
```
~ DirectoryServiceTests.ts
  + testOptInFiltering(): Added coverage for Member visibility.
  ~ testAdminAccess(): Updated expectations.
```

Do NOT list individual test files separately if they belong to the same suite.

⸻

Formatting Rules (Strict)
	•	One blank line between title and body.
	•	Two spaces before explanation bullets.
	•	* used for explanations.
	•	Every changed file must be listed.
	•	Keep explanations concise and technical.
	•	No storytelling.
	•	No commit noise.
	•	No redundant explanations.
	•	No emojis.
	•	No ticket references unless explicitly requested.

⸻

Symbol Semantics

+ Added
	•	New files
	•	New methods
	•	New logic
	•	New types/interfaces
	•	New tests

- Removed
	•	Dead code
	•	Deprecated logic
	•	Removed files
	•	Deleted tests

~ Modified
	•	Refactored code
	•	Changed logic
	•	Updated signatures
	•	Adjusted behavior
	•	Performance changes

⸻

Large Commits

If many files change:
	•	Every file must still be listed.
	•	No grouping by module.
	•	No “multiple files” shorthand.
	•	Only exception: pure mechanical change (formatting, renaming sweep).

Example mechanical change:
```
Code formatting standardization

~ DirectoryService.ts
  * Applied formatting rules.

~ AuthService.ts
  * Applied formatting rules.

~ TitheController.ts
  * Applied formatting rules.
```

⸻

Full Example Commit
```
Directory opt-in filtering implemented

~ DirectoryService.ts
  + filterVisibleMembers(): Added opt-in constraint for Member role.
  ~ getAllMembers(): Applied visibility filtering.
  * Admin and Treasurer roles remain unrestricted.

~ User.ts
  + optedIn: boolean
  * Introduced directory visibility flag.

~ DirectoryServiceTests.ts
  + testOptInFiltering(): Verifies Members cannot see opted-out users.
  ~ testAdminAccess(): Updated to reflect unrestricted access.
```

⸻

Non-Code Commits

For documentation, CI, configuration, formatting-only:

Use title only.

Examples:
```
Update README with local setup instructions
Add GitHub Actions workflow for deployment
```

No structured body required.

⸻

Enforcement Summary

If commit involves code:
	•	Title
	•	Blank line
	•	Structured file-level summary
	•	Every changed file listed
	•	Test suite grouped properly
	•	Strict formatting rules followed

If commit does not involve code:
	•	Title only
