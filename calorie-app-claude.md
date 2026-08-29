# CLAUDE.md — CalTrack

Personal calorie-tracking **Progressive Web App (PWA)** with AI-powered meal logging via text, voice, and photo.
Owner: solo developer on **Windows**, using **Claude Code (desktop app)** for development and **GitHub Desktop** for version control.
Runs on the owner's iPhone 15 Pro Max via Safari → "Add to Home Screen". Single user. No accounts, no server, no App Store.
Live at: `dhruvsaikia.com/caltrack` (GitHub Pages project site under the owner's existing custom domain).

## Workflow Rules (IMPORTANT)

- **Claude Code edits files but does NOT commit or push.** The owner reviews every diff in GitHub Desktop and commits/pushes manually. Never run `git commit`, `git push`, or history-modifying commands unless explicitly asked in that session.
- **Build ONE system per session** (see Build Order below). Do not scaffold ahead, do not "also add" future systems, do not refactor unrelated code. Small reviewable diffs are the goal.
- At the end of each system, state exactly how the owner should test it (commands + what to check on the phone).
- If a task appears to require a secret in the repo, a new backend, or a paid service — STOP and flag it instead of building it.

## Project Goals

- Clean, minimalistic UI. One accent color, generous whitespace, large touch targets, mobile-first (~430px design width). Standalone full-screen PWA that feels native, not like a website. When design reference images exist in `/design`, match them closely.
- Log meals three ways:
  1. **Text**: "2 eggs and toast with butter" → LLM parses to structured foods + calories.
  2. **Voice**: in-browser recording (MediaRecorder) → audio sent to Gemini for transcription → same text pipeline. (The Anthropic API does not accept audio input — text/images/documents only — so transcription must use Gemini.)
  3. **Photo**: camera or library image → client-side compression → multimodal LLM → calorie estimate with confidence level.
- Every AI estimate lands on an **editable Confirm screen** before saving. Never auto-save AI output. Label entries "Estimated by AI — tap to edit".
- Weekly/monthly trends, daily calorie target with remaining-calories ring, streaks.
- **Public GitHub repo.** Architecture must guarantee the repo never contains a secret.

## Tech Stack

- React 18 + TypeScript (strict) + Vite
- **PWA**: vite-plugin-pwa (manifest, service worker, offline shell, standalone display). Vite `base: '/caltrack/'` for GitHub Pages project-site paths.
- Tailwind CSS. No component libraries unless justified.
- **Storage**: IndexedDB via Dexie.js, on-device. No backend database.
- Recharts for charts. MediaRecorder for audio. `<input type="file" accept="image/*" capture>` + canvas compression (max ~1024px long edge, JPEG ~0.7) for photos.
- Native `fetch` + async/await. Zero networking libraries. Minimal dependencies overall — justify every package.
- Hosting: GitHub Pages via GitHub Actions on push to `main`. HTTPS is required for mic/camera and PWA install; Pages provides it.

## Architecture: static, serverless, bring-your-own-key

No backend. The browser calls AI APIs directly:

1. **Anthropic API** (`https://api.anthropic.com/v1/messages`)
   - Text parsing: `claude-haiku-4-5`
   - Photo estimation: Sonnet-class model
   - Browser calls require header `anthropic-dangerous-direct-browser-access: true`. Acceptable ONLY because this is a bring-your-own-key personal app; the key belongs to the owner and lives on their device.
2. **Gemini API** — voice transcription (audio input); optional fallback provider for text/photo.

LLM call rules:
- Always request structured JSON: `{ items: [{name, portion, calories, protein_g, carbs_g, fat_g}], total_calories, confidence: "low"|"medium"|"high", notes }`
- Parse defensively: strip markdown fences, validate shape, friendly user-facing errors ("Couldn't reach the AI — check your key in Settings"). Never crash on bad model output.
- Short prompts; this app must cost pennies per month.
- Providers implement a common `LLMProvider` interface so they're swappable.

## Security (NON-NEGOTIABLE — repo is PUBLIC)

- API keys are entered by the owner in the Settings screen and stored in `localStorage` on the device only.
- **Never** hardcode, commit, or log a key — not in code, comments, tests, example files, docs, or GitHub Actions workflows. There is no build-time secret anywhere in this project.
- Mask keys in UI as `sk-ant-…last4`. Never print key values to console or include them in error messages.
- `.gitignore` includes `.env*` defensively even though no env secrets should exist.
- All meal data stays in the phone's IndexedDB. Nothing leaves the device except the AI API calls themselves. No analytics, no telemetry, no third-party trackers, ever.
- Dependencies: prefer zero-dependency solutions; run `npm audit` after adding packages; no packages with install scripts from unknown publishers.
- All external calls over HTTPS only. No dynamic script injection, no `eval`, no `dangerouslySetInnerHTML`.

## Data Durability

- IndexedDB is the source of truth. Call `navigator.storage.persist()` on first run.
- One-tap JSON export (download/share) and import-restore in Settings. Gentle monthly backup reminder.
- Optional future: Supabase free-tier sync. Do not build until the owner asks.

## Build Order — one system per session

1. **Walking skeleton** — Vite/React/TS/Tailwind/PWA scaffold, `base: '/caltrack/'`, GitHub Actions → Pages deploy, placeholder Today screen. Success = live at dhruvsaikia.com/caltrack and installable on iPhone.
2. **Data system** — Dexie schema (meals, foodItems, settings, targets) + typed CRUD helpers + unit tests. No UI beyond a debug list.
3. **Manual logging system** — Today screen (remaining-calories ring, meal list) + manual add/edit/delete meal flow. App is fully usable without AI.
4. **Key vault + Settings** — provider picker, key entry (masked, localStorage), daily target setting.
5. **AI text parsing system** — text input → Haiku → JSON → Confirm screen → save.
6. **Photo system** — capture, compression, vision call, Confirm screen with confidence badge.
7. **Voice system** — record → Gemini transcription → existing text pipeline. Test Safari audio format quirks (webm/mp4).
8. **Trends system** — Recharts weekly bars, monthly view, streaks.
9. **Backup system** — export/import JSON, monthly reminder.
10. **Polish** — favorites/quick re-log, barcode lookup via OpenFoodFacts (free, no AI), dark mode, transitions.

## App Structure

```
src/
  main.tsx / App.tsx      — entry, routing, PWA registration
  db/                     — Dexie schema + CRUD
  services/
    llm/                  — LLMProvider interface, AnthropicProvider, GeminiProvider
    transcription.ts      — audio → text via Gemini
    imageCompress.ts
    exportImport.ts
  screens/
    Today/  AddMeal/  Confirm/  Trends/  Settings/
  components/             — shared UI
design/                   — reference mockups from Claude Design (match these)
```

## Coding Conventions

- TypeScript strict; functional components + hooks; async/await only.
- Mobile Safari is the primary target — mind 100vh quirks, standalone-mode behavior, audio codec support.
- Accessibility: semantic HTML, labeled inputs, adequate contrast, respect prefers-reduced-motion.
- Unit-test LLM JSON parsing and calorie math with Vitest. Skip UI test coverage early.
- Neutral, non-judgmental copy about food; this is a tracking tool, not medical advice.
