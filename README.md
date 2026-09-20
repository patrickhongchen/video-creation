# Video Essay Studio — Phase 3

An editorial presentation editor for 9:16 video essays. Phase 3 adds structured, animated bar and line charts that can persist across consecutive story beats while preserving the Phase 1 and Phase 2 editing workflow.

## Run it

```bash
npm install
npm run dev
```

Create a production build with `npm run build`.

## What is included

- Multiple locally persisted presentations with switching, creation, duplication, rename, and deletion
- Title, Text, Big Stat, Comparison, and Stat Detail scene factories
- Editorial Bar and Line Chart scenes with numeric data, highlights, sources, formatting, and optional explicit domains
- Stable `chartId` and datum IDs for chart-to-chart Morph storytelling, plus restrained entry animation and reduced-motion support
- A compact Inspector data editor for adding, deleting, reordering, editing, and highlighting data
- Add, duplicate, delete, and reorder scene actions with a valid selection maintained
- Scene content, timing, transition, notes, and presentation-level title/tagline/accent editing
- Import validation and readable, presentation-only JSON export
- Animated transitions, Present mode, typed renderer registry, and Morph-style shared elements from Phase 1

The first launch seeds the original **Small Screens, Bigger Questions** demo and a seven-scene **Chart Story Lab** sample built from clearly marked illustrative data. Existing Phase 1 data stored under `video-essay-studio:presentation:v1` is migrated into the new library when possible.

## Architecture

- `src/model.ts` defines schema version 1 and the discriminated `Scene` union.
- `src/presentationValidation.ts` is the runtime boundary for untrusted JSON and produces path-specific errors.
- `src/presentationFactories.ts` owns IDs, presentation defaults, and defaults for every scene type.
- `src/storage/presentationStorage.ts` owns local library persistence and Phase 1 migration.
- `src/presentationFiles.ts` owns presentation-only serialization, download, and file parsing.
- `src/scenes/SceneRenderers.tsx` contains the typed renderer registry; presentation files contain no JSX, HTML, or React details.
- `src/charts/` contains the reusable numeric domain/scale utilities and the native Motion/SVG bar and line renderers.
- `src/components/Stage.tsx` remains the shared editor/Present surface for transitions and the Motion `LayoutGroup`.

See [docs/PRESENTATION_FORMAT.md](docs/PRESENTATION_FORMAT.md) for the complete schema, a full importable example, validation rules, and a Codex authoring checklist.

## Shared-element identity

`big-stat` and `stat-detail` scenes may carry an `elementId`. Consecutive scenes using the same value share a namespaced Motion layout identity, such as `presentation-small-screens:theater-decline-stat`, and Morph between layouts.

Duplicating a scene always creates a new scene `id` but intentionally preserves `elementId`. An adjacent duplicate can therefore continue the same visual concept through a Morph transition. Change or remove `elementId` when the copy represents an unrelated statistic.

Chart scenes use `chartId` for the continuing chart and datum `id` for each continuing bar or point. Consecutive compatible scenes preserve those IDs so values can move, resize, reorder, and change emphasis without becoming unrelated objects. Chart IDs are namespaced by presentation and chart type; bar charts do not Morph into line charts.

## Add a scene type

1. Add the scene interface to the `Scene` union in `src/model.ts`.
2. Add its default to `createScene` and its label to `sceneTypeOptions` in `src/presentationFactories.ts`.
3. Parse and validate it in `src/presentationValidation.ts`.
4. Add and register its renderer in `src/scenes/SceneRenderers.tsx`.
5. Add its editor fields in `src/components/Inspector.tsx`.
6. Update the format specification.

The mapped renderer registry makes a missing renderer a TypeScript error.

## Current boundaries

There is intentionally no timeline, recording, media upload, general-purpose chart designer, multi-series charting, image support, AI API, backend, or video export. Browser storage is the project library; exported presentation JSON is the portable project file.
