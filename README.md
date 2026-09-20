# Video Essay Studio — Phase 4A

An editorial presentation editor for 9:16 video essays. Phase 4A adds a Narration Studio for recording a presentation in manageable, multi-scene sections while preserving the existing editor, charts, Morph animation, and Present mode.

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
- A desktop-first Narration Studio with contiguous, non-overlapping sections that may span one or many scenes
- Multiple microphone takes per section, an explicit selected take, and local readiness status
- Monotonic scene cues captured when visuals advance, plus synchronized audio-and-Stage take playback
- Speaker notes, a simple live microphone meter, a 3–2–1 recording countdown, and cancel/retry controls

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
- `src/narration/` owns native IndexedDB take/blob persistence, microphone capture, level metering, and cue-synchronized playback.
- `src/components/NarrationStudio.tsx` owns section authoring and the recording/review workflow while reusing `Stage`.

## Narration Studio workflow

Open a presentation and choose **Narrate**. Create a section by selecting its start and end scenes, then rename it as needed. Ranges must be contiguous and cannot overlap another section; not every scene has to be assigned. Choose **Record New Take**, allow microphone access, confirm input on the level meter, and start the countdown. During recording, Space or Right Arrow advances within the section and Left Arrow moves back. Every visual change is stored as a scene cue relative to the take's monotonic start time, with the first scene fixed at 0 ms.

Finished takes remain available for comparison. Play, pause, or restart a take to hear it while the saved cues drive the same `Stage` used by Edit and Present modes. Mark one take as selected for each section; the readiness count reports how many sections have a valid selected local take. Canceling an active recording discards its audio and cues without writing to storage.

Audio blobs, MIME type, duration, cues, creation time, and selected-take state are local browser data stored in IndexedDB. Temporary object URLs exist only during playback and are revoked afterward. Presentation JSON and localStorage contain only the lightweight section definitions (`id`, `title`, and ordered scene IDs), never audio, microphone data, object URLs, or IndexedDB keys.

Duplicating a presentation copies its visuals and narration section structure but gives the copy a new presentation ID, so it has no recordings or selected takes. Import behaves the same way: section structure imports, audio does not. Standard JSON export intentionally excludes recordings; moving narration audio between browsers is not supported yet.

Deleting a presentation or narration section also requests deletion of its associated IndexedDB takes. Changing a section's scene range clears its now-stale takes. Deleting a scene removes that scene from its section, removes the section if it becomes empty, and likewise clears that affected section's recordings. Reordering scenes inside a still-contiguous section normalizes its scene-ID order and clears stale cue takes; a move that would split the range is blocked with a clear message.

Narration requires a browser with `getUserMedia`, `MediaRecorder`, Web Audio, and IndexedDB support. Microphone permission is requested for each new recording session, and tracks are stopped after a take, cancellation, error, or studio exit. Recording remains browser-native: no transcoding or format conversion is performed, so the stored MIME type depends on browser support.

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

There is intentionally no final video rendering, display capture, transcoding, waveform/timeline editing, trimming, gain processing, captions, transcription, background audio, cloud sync, or audio bundle export. Narration audio is local to one browser profile. Browser-native microphone formats can differ, arbitrary seek editing is not provided, and section cue timing does not overwrite scene duration. Final automated playback and 1080×1920 video rendering remain Phase 4B work.
