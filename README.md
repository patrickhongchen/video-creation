# Video Essay Studio — Phase 4B

An editorial presentation editor for 9:16 video essays. Phase 4B turns selected Narration Studio takes and their saved scene cues into an automatically performed, browser-native 1080×1920 final video while preserving the editor, charts, Morph animation, and Present mode.

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
- A readiness-gated Final Video workspace with automatic full-presentation preview and pause, resume, restart, and stop controls
- Real-time browser-tab capture that crops only the shared Stage into a 1080×1920, 30 fps output canvas
- In-memory MP4 or WebM review and download, with the filename extension matched to the browser's actual recording container

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
- `src/finalPlayback/` builds the deterministic scene-ordered playback plan and runs narrated and silent segments with one continuous Stage render identity.
- `src/recording/` owns browser-tab capture, Stage crop geometry, output format selection, and MediaRecorder composition.
- `src/components/FinalVideoStudio.tsx` coordinates readiness, preview, capture preparation, rendering, review, and download.

## Narration Studio workflow

Open a presentation and choose **Narrate**. Create a section by selecting its start and end scenes, then rename it as needed. Ranges must be contiguous and cannot overlap another section; not every scene has to be assigned. Choose **Record New Take**, allow microphone access, confirm input on the level meter, and start the countdown. During recording, Space or Right Arrow advances within the section and Left Arrow moves back. Every visual change is stored as a scene cue relative to the take's monotonic start time, with the first scene fixed at 0 ms.

Finished takes remain available for comparison. Play, pause, or restart a take to hear it while the saved cues drive the same `Stage` used by Edit and Present modes. Mark one take as selected for each section; the readiness count reports how many sections have a valid selected local take. Canceling an active recording discards its audio and cues without writing to storage.

Audio blobs, MIME type, duration, cues, creation time, and selected-take state are local browser data stored in IndexedDB. Temporary object URLs exist only during playback and are revoked afterward. Presentation JSON and localStorage contain only the lightweight section definitions (`id`, `title`, and ordered scene IDs), never audio, microphone data, object URLs, or IndexedDB keys.

Duplicating a presentation copies its visuals and narration section structure but gives the copy a new presentation ID, so it has no recordings or selected takes. Import behaves the same way: section structure imports, audio does not. Standard JSON export intentionally excludes recordings; moving narration audio between browsers is not supported yet.

Deleting a presentation or narration section also requests deletion of its associated IndexedDB takes. Changing a section's scene range clears its now-stale takes. Deleting a scene removes that scene from its section, removes the section if it becomes empty, and likewise clears that affected section's recordings. Reordering scenes inside a still-contiguous section normalizes its scene-ID order and clears stale cue takes; a move that would split the range is blocked with a clear message.

Narration requires a browser with `getUserMedia`, `MediaRecorder`, Web Audio, and IndexedDB support. Microphone permission is requested for each new recording session, and tracks are stopped after a take, cancellation, error, or studio exit. Recording remains browser-native: no transcoding or format conversion is performed, so the stored MIME type depends on browser support.

## Final Video workflow

Choose **Final Video** after recording and selecting one usable take for every narration section. The preflight list loads all section takes from IndexedDB, validates each selected take and its cues, and asks the browser to decode each selected audio Blob. A missing, invalid, or unsupported take blocks both preview and rendering and links back to Narration Studio. A take that omits cues for some scenes remains playable, but the studio warns that those scenes will not appear because recorded cues are authoritative.

Scenes outside narration sections do not block the workflow. They become silent visual beats using their scene durations. A presentation with no narration sections is also valid and renders as a fully silent video. Narrated section duration comes from its selected take, not the durations of the scenes inside it; the estimate also includes silent beats and a brief final-frame hold.

Use **Preview Final Playback** before capture. The same playback engine used by rendering chains every selected take, follows its saved cues, runs silent beats, and preserves shared-element and chart identity across section boundaries. Preview supports pause/resume, restart, and stop and does not request screen-sharing permission.

For output, choose **Prepare Video Capture** and select the current Video Essay Studio browser tab—not a window or monitor. The capture request explicitly asks supporting browsers to prefer and include the current tab; browsers may ignore these hints and show their normal picker. Inspect the separate live 9:16 crop preview to verify the selected source, then choose **Render Final Video**. Rendering runs in real time, so a 90-second presentation takes about 90 seconds. Keep the shared tab visible and do not change its layout while rendering. Display/tab audio and the microphone are excluded; narration audio comes directly from the selected IndexedDB Blobs through Web Audio. The output canvas is exactly 1080×1920 at 30 fps, and only the Stage is recorded.

After rendering, review the vertical video, download it, prepare another render, or discard it. Final video Blobs and their object URLs are ephemeral and exist in memory only: they are never written to presentation JSON, localStorage, or IndexedDB. Download a completed video before refreshing, closing the page, or discarding it. Canceling, leaving Final Video, or ending screen sharing releases the display stream, audio graph, animation loops, and temporary URLs.

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

Final video output is browser-native, real-time capture rather than deterministic offline rendering. Browser MediaRecorder support determines whether the download is MP4 or WebM; there is no transcoding or FFmpeg fallback. There is intentionally no waveform/timeline editing, trimming, gain processing, captions, transcription, background audio, cloud rendering, final-video persistence, or audio bundle export. Narration audio remains local to one browser profile, and selected formats that the current browser cannot decode must be re-recorded in that browser.
