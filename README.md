# AI Presentation Studio — Phase 5C

An Electron desktop application for AI-first, PowerPoint-like presentations with flexible 1080×1920 slides, structured editable elements, automatic Morph animation, narration recording, and direct MP4 export.

The intended workflow is simple: AI or a preset creates a slide, the user accepts it, and direct manipulation remains available for quick corrections. This is not a general-purpose graphics or video editor.

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

## Editing

The Inspector shows slide metadata when no element is selected and element content/geometry when one is selected. Direct manipulation includes drag, corner resize, snapping, guides, keyboard nudge, exact frame values, opacity, rotation, duplication, deletion, visibility, locking, and z-order. Layers remain a compact escape hatch rather than the primary workflow.

The element array is the authoritative back-to-front order. Hidden elements are omitted from Present mode, narration playback, final preview, and export. Editor overlays never enter the final render DOM unless editing context is explicitly supplied.

## Narration and final video

Narration Studio keeps contiguous slide ranges, multiple takes, selected takes, microphone recording, cue capture, replay, and readiness. The user advances slides while speaking; those slide cue times drive final playback and export. Existing take records keep the historical internal `SceneCue.sceneId` field, whose value is the unchanged slide ID, so schema migration does not require re-recording.

Final Playback orders sections by slide order, follows saved cues, supports silent slides, preserves Morph identities across section boundaries, and includes the final hold. The desktop exporter uses a hidden Chromium surface with the same `Stage`, captures exactly 1080×1920 at 30 fps, and uses FFmpeg for H.264 video, AAC audio, `yuv420p`, fast-start MP4 output, progress, cancellation, destination selection, and duration verification.

## Persistence and schema migration

Schema v2 persists only canonical `slides`. Import supports current v2 JSON and schema v1 through a deterministic migration boundary. The v1 Title, Text, Big Stat, Stat Detail, Comparison, Chart, and Composition scenes become element-based slides before entering runtime.

Migration preserves slide IDs, notes, duration, transitions, narration section IDs and membership, assets, chart IDs, datum IDs, and legacy Big Stat/Stat Detail Morph identity. A migrated library is saved under the v2 localStorage key on the next normal save, so it is not repeatedly migrated at startup. JSON export always emits schema v2.

Narration audio and selected-take state remain in IndexedDB, not presentation JSON. Duplicating or importing a presentation gives it a new presentation ID, so recordings do not silently attach to the copy.

## Architecture

- `src/model.ts` defines the canonical schema v2 `Presentation`, `Slide`, element union, theme, assets, and import-only legacy types.
- `src/presentationMigration.ts` owns deterministic v1 → v2 conversion.
- `src/presentationValidation.ts` validates untrusted v2 directly and routes v1 through migration, with path-specific errors.
- `src/presentationFactories.ts` owns slide presets, element factories, duplication rules, stable IDs, and presentation defaults.
- `src/storage/presentationStorage.ts` owns v2 local persistence and loading of earlier library keys.
- `src/scenes/CompositionSceneRenderer.tsx` is the single canonical slide/element renderer and direct-manipulation surface. Its historical filename remains only to limit mechanical churn.
- `src/scenes/SceneRenderers.tsx` is now a thin compatibility import location; specialized runtime renderers were removed.
- `src/components/Stage.tsx` owns slide transitions and the shared Motion layout namespace used by Edit, Present, Narration, Final Playback, and export.
- `src/charts/` contains the reusable semantic chart renderers and numeric scale utilities.
- `src/narration/` and `src/finalPlayback/` own cue-based recording and deterministic playback.
- `src/components/ExportRenderSurface.tsx`, `src/desktop/`, and `electron/export/` own the secure desktop rendering/export bridge.

The seeded **Small Screens, Bigger Questions** and **Chart Story Lab** presentations are native schema v2 slide documents.

## Intentional boundaries

There is no built-in LLM/chat UI, stock search, project bundle, video element, music, captions, timeline, keyframes, grouping, nested components, symbol system, theme editor, plugin system, cloud backend, or collaboration. Slides remain the animation timeline and narration remains the source of narrated timing.

See [docs/PRESENTATION_FORMAT.md](docs/PRESENTATION_FORMAT.md) for the schema, complete example, migration mapping, validation rules, and Codex authoring recommendations.
