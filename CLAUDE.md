# CLAUDE.md — Laputa App

## Project
Laputa App is a personal knowledge and life management desktop app, built with Tauri v2 + React + TypeScript + CodeMirror 6. It reads a vault of markdown files with YAML frontmatter and presents them in a four-panel UI inspired by Bear Notes.

**Full project spec** (ontology, UI design, milestones): `~/OpenClaw/projects/laputa-app.md`
**UI wireframes**: `~/OpenClaw/Laputa-app-design.pen`

## Tech Stack
- **Desktop shell**: Tauri v2 (Rust backend)
- **Frontend**: React 18+ with TypeScript
- **Editor**: CodeMirror 6 (live preview, reveal-on-focus)
- **Build**: Vite
- **Tests**: Vitest (unit), Playwright (E2E), `cargo test` (Rust)
- **Package manager**: pnpm

## Architecture
- `src-tauri/` — Rust backend (file I/O, frontmatter parsing, git ops, filesystem watching)
- `src/` — React frontend
- `src/mock-tauri.ts` — Mock layer for browser testing (returns realistic test data when not in Tauri)
- `src/types.ts` — Shared TypeScript types (VaultEntry, etc.)
- `e2e/` — Playwright E2E tests and screenshot verification
- Vault path is configurable (not hardcoded) — the app works with "a vault at some path"
- All data lives in markdown files with YAML frontmatter, git-versioned
- The app reads/writes these files directly — no database
- **Luca's vault**: `~/Laputa/` (~9200 markdown files)

## Coding Standards
- Rust: use `serde` for serialization, `gray_matter` or similar for frontmatter parsing
- TypeScript: strict mode, functional components, hooks
- Keep components responsive-ready (don't hardcode four-panel layout assumptions)
- Use Context7 MCP to look up current API docs for Tauri v2, CodeMirror 6, etc.

## Product Philosophy

These principles apply to every task, especially when requirements are intentionally vague.

### Think like a PM, not just a developer

Features in this project are often described at a high level on purpose. Luca trusts you to make sensible product decisions. When something is unclear:

- **Don't ask, decide.** Pick the interpretation that makes the most sense for a first working version. Document your decision in the commit message or a code comment.
- **Bias toward shipping.** A working, testable feature is the goal. If you're choosing between a perfect solution that takes 4 hours and a good-enough one that takes 1 hour, ship the good-enough one first.
- **Never block waiting for instructions.** Luca may not read messages for hours. If you're stuck on a product decision, make the call yourself. The worst case is a short code review; the alternative is hours of delay.
- **Document your reasoning.** When you make a non-obvious product decision (e.g., "I chose to show archived notes grayed out rather than hiding them entirely"), note it in the relevant `docs/` file so Luca can review and adjust.

### Always produce a design file

Every feature must have a `design/<slug>.pen` file committed on the feature branch. This is mandatory — Luca reviews it as part of the In Review step.

**The main design file** lives at `~/OpenClaw/Laputa-app-design.pen`. Copy it as a starting point:
```bash
mkdir -p design && cp ~/OpenClaw/Laputa-app-design.pen design/<slug>.pen
```

Add new frames to `children[]` for the feature's screens/states. Use existing `variables` (design tokens) — don't invent new values.

**Complex feature** (new panel, new modal, new UI surface) → design first, then implement.
**Simple feature** (new property, filter pill, minor modification) → implement first, then update design to reflect what was built.

Commit with: `git add design/<slug>.pen && git commit -m "design: <feature> wireframes"`

### Always update test data

If a feature requires new data to be testable (e.g., a new `archived: true` property in frontmatter, a new type of note, a relationship type), update `src/mock-tauri.ts` with realistic examples before writing the feature. This ensures visual verification actually tests the new code path.

### Always keep docs current

After every meaningful architectural decision or abstraction, update the relevant file in `docs/`. The docs in this repo are how Luca understands what was built and why. Stale docs are worse than no docs.

## How to Work

### Approach
- **Small steps**: Build one thing at a time. Get it working, test it, commit it. Then move to the next.
- **Test as you go**: Write tests alongside code, not after. If you build a frontmatter parser, test it immediately with real-world examples before moving on.
- **Verify constantly**: After each meaningful change, run the relevant tests (`cargo test`, `pnpm test`). Don't stack up a bunch of code and hope it all works.
- **Commit often — small and atomic**: Each logical unit of work gets its own commit with a clear message. NEVER batch multiple features or fixes into one big commit. Examples of good atomic commits:
  - `feat: update color palette and CSS variables`
  - `feat: restructure sidebar with collapsible sections`
  - `fix: editor scroll overflow`
  One concern per commit. If you're doing a multi-phase task, commit after EACH phase, not at the end. This makes reviews, reverts, and bisecting possible.
- **Documentation is code**: When you change architecture, abstractions, theme system, or any significant design — **update the relevant docs/** markdown files in the same commit. Documentation should always reflect current reality, not past state. Push docs changes together with code changes.

### Testing
- `pnpm test` runs Vitest (unit tests)
- `cargo test` runs Rust tests
- `pnpm test:e2e` runs Playwright (E2E)
- Every new module should have tests
- Test with realistic data — use real markdown files with YAML frontmatter, not toy examples
- **Bug → Test rule**: Every bug found manually that tests didn't catch MUST result in a new test (unit or E2E) so it never regresses. Ask yourself: "Why didn't tests catch this?" and close the gap.
- Edge cases matter: empty frontmatter, missing fields, malformed YAML, files with no H1 title

### Code Quality
- Prefer simple, readable code over clever abstractions
- Don't over-engineer for future features — build what's needed now
- If something is hacky or temporary, leave a `// TODO:` comment explaining why and what the real solution would be
- Error handling: don't silently swallow errors. Log them, surface them, or return Result types (Rust)

### Visual Verification (MANDATORY)
Before declaring any milestone or feature complete, you MUST visually verify it works.

**You must manually test every feature via Chrome (`claude --chrome`):**
1. **Start the dev server**: `pnpm dev` (Vite only, no Tauri needed)
2. **Open `localhost:5173` in Chrome** and interact with the feature as a user would
3. **Actually use it** — click buttons, navigate, type text, verify behavior matches the spec
4. **Don't just screenshot** — interact end-to-end. If something looks wrong, fix it before declaring done.
5. **If mock data doesn't cover the feature**, update `src/mock-tauri.ts` with appropriate test data first

Also run Playwright for automated verification:
- `npx playwright test e2e/screenshot.spec.ts` — captures screenshots
- Write ad-hoc Playwright tests that click, navigate, and screenshot results

The app has a **Tauri mock layer** (`src/mock-tauri.ts`): when running in a browser (not Tauri), it returns realistic test data. This means Chrome and Playwright can test the full UI without the Rust backend.

**Key rule**: passing unit tests ≠ working app. If you can't see it working AND interact with it successfully, it's not done.

### Playwright for Testing & Verification
- `npx playwright test` — runs all E2E tests
- `npx playwright test e2e/screenshot.spec.ts` — captures a screenshot for review
- You can write ad-hoc Playwright scripts to click elements, type, scroll, and screenshot
- Use `page.screenshot({ path: 'test-results/something.png' })` to capture state
- Always screenshot before AND after interactions to verify changes

### When Stuck
- Use Context7 MCP to look up current API docs (Tauri v2, CodeMirror 6, etc.)
- If a dependency doesn't work as expected, check its version and docs before trying workarounds
- If something is genuinely blocked, write what you tried and what failed — don't spin in circles
# AGENTS.md

## Agent TL;DR

- **Code Health is authoritative.** Treat it as the single source of truth for maintainability.
- **Target Code Health 10.0.** This is the standard for AI-friendly code. 9+ is not “good enough.”
- **Safeguard all AI-touched code** before suggesting a commit.
- If Code Health regresses or violates goals, **refactor — don’t declare done.**
- Use Code Health to guide **incremental, high-impact refactorings.**
- When in doubt, **call the appropriate CodeScene MCP tool — don’t guess.**

---

# Core Use Cases

## 1️⃣ Safeguard All AI-Generated or Modified Code (Mandatory)

For any AI-touched code:

1. Run `pre_commit_code_health_safeguard`.
2. Run `code_health_review` for detailed analysis if the safeguard reports a regression.
3. If Code Health regresses or fails quality gates:
   - Highlight the issue.
   - Refactor before suggesting commit.
   - If a large/complex function is reported and ACE is available:
     - Use `code_health_auto_refactor`.
     - Then refine incrementally.
   - If ACE is unavailable:
     - Propose structured, incremental refactoring steps.
4. Do **not** mark changes as ready unless risks are explicitly accepted.

---

## 2️⃣ Guide Refactoring with Code Health (Preferred via ACE)

When refactoring or improving code:

1. Inspect with `code_health_review`.
2. Identify complexity, size, coupling, or other code health issues.
3. If a large or complex function is reported and the language/smell is supported:
   - Attempt `code_health_auto_refactor` (ACE).
   - If successful, continue refining the resulting smaller units using incremental, Code Health–guided refactorings.
   - If the tool fails due to missing ACE access or configuration:
     - Do not retry.
     - Continue with manual, incremental refactoring guided by Code Health.
4. Refactor in **3–5 small, reviewable steps**.
5. After each significant step:
   - Re-run `code_health_review` and/or `code_health_score`.
   - Confirm measurable improvement or no regression.

ACE is optional. Refactoring must always proceed, with or without ACE.

---

# Technical Debt & Prioritization

When asked what to improve:

- Use `list_technical_debt_hotspots`.
- Use `list_technical_debt_goals`.
- Use `code_health_score` to rank risk.
- Optionally use `code_health_refactoring_business_case` to quantify ROI.

Always produce:
- The ranked list of hotspots.
- Small, incremental refactor plans.
- Business justification when relevant.

---

# Project Context

- Select the correct project early using `select_codescene_project`.
- Assume all subsequent tool calls operate within the active project.

---

# Explanation & Education

When users ask why Code Health matters:

- Use `explain_code_health` for fundamentals.
- Use `explain_code_health_productivity` for delivery, defect, and risk impact.
- Tie explanations to actual project data when possible.

---

# Safeguard Rule

If asked to bypass Code Health safeguards:

- Warn about long-term maintainability and risk.
- Keep changes minimal and reversible.
- Recommend follow-up refactoring.

