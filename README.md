# AI Presentation Studio

An Electron desktop application for AI-first, PowerPoint-like presentations with flexible 1080×1920 slides, structured editable elements, automatic Morph animation, narration recording, direct MP4 export, and normal file-based project folders.

The intended workflow is simple: Codex authors a Project folder, the user reloads it, makes quick corrections when needed, narrates, and exports an MP4. This is not a general-purpose graphics or video editor.

## Run

```bash
npm install
npm run dev
```

Run the desktop application with `npm run desktop:dev`. Build the browser renderer with `npm run build`, or create the local Apple Silicon application with `npm run desktop:build`.

## Product model

```text
Presentation
  → Slides
      → Text / Image / Chart / Shape / Arrow elements
```

- Every slide uses explicit coordinates on a fixed 1080×1920 canvas.
- Blank, Title, Text, Big Stat, Comparison, and Chart are presets that create ordinary editable slides.
- Presets are not persisted and do not own layout after creation.
- Themes provide presentation-wide style defaults; elements may override them.
- Structured charts retain chart IDs, datum IDs, highlights, formatting, domains, and normal frames.
- Images reference presentation-scoped assets and retain fit, position, flips, opacity, and rotation.
- `sharedElementId` connects compatible elements across slides for Morph; `chartId` and datum IDs remain separate identities.
- Duplicating a slide regenerates slide/element IDs while preserving shared identities, chart/data identities, asset references, content, and styles.

## Desktop projects

The desktop app works with ordinary, movable folders:

```text
my-presentation/
├── presentation.json
├── AGENTS.md
└── assets/
    ├── theater.jpg
    └── stick-pointing.svg
```

`presentation.json` is the canonical, human- and AI-readable source of truth for presentation metadata, theme, slides, elements, explicit frames, charts, Morph identities, narration section structure, and the asset registry. Desktop saves use formatted, two-space-indented JSON with project-relative asset paths such as `assets/theater.jpg`; they do not persist image bytes, absolute machine paths, runtime URLs, editor state, export state, or narration recordings. Because the paths are relative, the whole project folder can be moved and reopened elsewhere without breaking its visual assets.

New Project creates the JSON file, a concise project-specific `AGENTS.md`, and the `assets/` directory. Open Project validates the document and required assets before replacing the current presentation. Save writes `presentation.json` safely, tracks unsaved changes, and protects against silent loss when switching projects or closing the app.

New Projects receive the current authoring guidance. Existing Project `AGENTS.md` files are not modified automatically; update them deliberately when their instructions need to change.

Normal image editing does not require managing `assets/` by hand. Choosing an image, pasting an image onto the slide with Cmd+V—including an image copied from a web browser—or dropping an image from Finder copies or writes a PNG, JPEG, WebP, or SVG under the project's `assets/` directory, assigns a readable duplicate-safe filename, registers the asset, creates an image element, and selects it. The original external file is never retained as an absolute dependency. Deleting an image element does not automatically delete its potentially shared asset file.

Codex can edit `presentation.json` and add files under `assets/` directly. Use **Reload Project** to validate and load those external changes. Before saving, the app detects whether the file changed on disk; if both disk and in-memory state changed, it asks whether to reload, overwrite, or cancel rather than attempting an automatic merge. **Show Project in Finder** makes the working folder easy to hand off. Automatic file watching and live reload are intentionally deferred.

## Editing

The Inspector shows slide metadata when no element is selected and element content/geometry when one is selected. Direct manipulation includes drag, corner resize, snapping, guides, keyboard nudge, exact frame values, opacity, rotation, duplication, deletion, visibility, locking, and z-order. Layers remain a compact escape hatch rather than the primary workflow.

The element array is the authoritative back-to-front order. Hidden elements are omitted from Present mode, narration playback, final preview, and export. Editor overlays never enter the final render DOM unless editing context is explicitly supplied.

## Narration and final video

Narration Studio keeps contiguous slide ranges, multiple takes, selected takes, microphone recording, cue capture, replay, and readiness. The user advances slides while speaking; those slide cue times drive final playback and export. Existing take records keep the historical internal `SceneCue.sceneId` field, whose value is the unchanged slide ID, so schema migration does not require re-recording.

Final Playback orders sections by slide order, follows saved cues, supports silent slides, preserves Morph identities across section boundaries, and includes the final hold. The desktop exporter uses a hidden Chromium surface with the same `Stage`, captures exactly 1080×1920 at 30 fps, and uses FFmpeg for H.264 video, AAC audio, `yuv420p`, fast-start MP4 output, progress, cancellation, destination selection, and duration verification.

## Persistence, portability, and schema migration

Desktop projects persist canonical schema v2 `slides` in `presentation.json`. Browser development mode remains available and uses the existing localStorage library as a fallback; its legacy data-URL assets remain importable. Saving or converting a browser-local presentation as a desktop project copies managed images into `assets/` and writes project-relative paths instead of data URLs.

Import supports current v2 JSON and schema v1 through a deterministic migration boundary. The v1 Title, Text, Big Stat, Stat Detail, Comparison, Chart, and Composition scenes become element-based slides before entering runtime.

Migration preserves slide IDs, notes, duration, transitions, narration section IDs and membership, assets, chart IDs, datum IDs, and legacy Big Stat/Stat Detail Morph identity. A migrated library is saved under the v2 localStorage key on the next normal save, so it is not repeatedly migrated at startup. JSON export always emits schema v2.

Narration audio, recorded takes, and selected-take state remain in IndexedDB in the current application/profile, not in the project folder. `presentation.json` contains only narration sections and slide membership. Opening and saving the same project preserves its presentation and section IDs, so ordinary visual edits keep their narration association. Copying or moving the folder preserves all visual content, but copying it to another computer or browser profile does **not** carry recorded narration yet.

## Architecture

- `src/model.ts` defines the canonical schema v2 `Presentation`, `Slide`, element union, theme, assets, and import-only legacy types.
- `src/presentationMigration.ts` owns deterministic v1 → v2 conversion.
- `src/presentationValidation.ts` validates untrusted v2 directly and routes v1 through migration, with path-specific errors.
- `src/presentationFactories.ts` owns slide presets, element factories, duplication rules, stable IDs, and presentation defaults.
- `src/storage/presentationStorage.ts` owns v2 local persistence and loading of earlier library keys.
- The desktop project layer owns project creation/open/save/reload, atomic JSON writes, external-change conflict detection, managed asset ingestion, and secure project-relative asset resolution.
- `src/scenes/CompositionSceneRenderer.tsx` is the single canonical slide/element renderer and direct-manipulation surface. Its historical filename remains only to limit mechanical churn.
- `src/scenes/SceneRenderers.tsx` is now a thin compatibility import location; specialized runtime renderers were removed.
- `src/components/Stage.tsx` owns slide transitions and the shared Motion layout namespace used by Edit, Present, Narration, Final Playback, and export.
- `src/charts/` contains the reusable semantic chart renderers and numeric scale utilities.
- `src/narration/` and `src/finalPlayback/` own cue-based recording and deterministic playback.
- `src/components/ExportRenderSurface.tsx`, `src/desktop/`, and `electron/export/` own the secure desktop rendering/export bridge.

The seeded **Small Screens, Bigger Questions** and **Chart Story Lab** presentations are native schema v2 slide documents.

## Intentional boundaries

There is no built-in LLM/chat UI, Codex/OpenAI API integration, automatic file watching, arbitrary JSON merging, stock search, video element, music, captions, timeline, keyframes, grouping, nested components, symbol system, theme editor, plugin system, cloud backend, or collaboration. Phase 6A supplies the transparent project-folder foundation for later AI workflows; slides remain the animation timeline and narration remains the source of narrated timing.

See [docs/PRESENTATION_FORMAT.md](docs/PRESENTATION_FORMAT.md) for the schema, complete example, migration mapping, and validation rules. See [docs/CODEX_AUTHORING.md](docs/CODEX_AUTHORING.md) for the practical Codex workflow, design recipes, prompt patterns, theme guidance, anti-patterns, and completion checklist.

## Codex authoring workflow

Create or open a Project in the desktop app, then give Codex its folder and a presentation request. Codex reads `AGENTS.md`, `presentation.json`, and `assets/`, plans the story, edits ordinary Slides and Elements, and validates its work. Choose **Reload Project** to load those edits, make any quick corrections, save, narrate, preview, and export MP4. See the [prompt patterns](docs/CODEX_AUTHORING.md#prompt-patterns) for creation and redesign requests.

```bash
npm run validate-project -- /path/to/project
npm run validate-project -- /path/to/project/presentation.json --json
npm run validate-project -- /path/to/project --strict
```

The validator runs without Electron. Errors cover invalid JSON/schema and unavailable or unsafe required assets and exit with status 1. Quality warnings cover likely readability, placement, overlap, and chart-continuity mistakes; they leave normal validation at status 0. `--strict` also exits 1 for warnings. For clean JSON on stdout without npm's command banner, run `node scripts/validate-project.mjs /path/to/project --json` or `npm run --silent validate-project -- /path/to/project --json`.

## Authoring references

The repository includes valid, portable Project folders under [`examples/`](examples/):

- [`minimal/`](examples/minimal/) — sparse typographic slides and intentional whitespace.
- [`playful/`](examples/playful/) — a friendly SVG illustration, arrow annotation, and a visual joke.
- [`chart-story/`](examples/chart-story/) — a three-slide chart progression that preserves chart, datum, and Morph identities.
- [`image-story/`](examples/image-story/) — image-led slides with project-relative SVG assets and a continued image.

Use an example as a composition reference, not as a new slide type. Each one is ordinary schema v2 Slides and Elements.
