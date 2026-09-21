# Video Essay Studio — Phase 5B

An Electron desktop application for building and exporting 9:16 video essays. Phase 5B adds a bounded Composition editor for precise mixed layouts while preserving the structured scene templates, Narration Studio, Final Playback Preview, transitions, Morph animation, and deterministic desktop MP4 exporter.

## Run it

```bash
npm install
npm run dev
```

`npm run dev` keeps the ordinary Vite/browser development workflow. Run the complete desktop application with one command:

```bash
npm run desktop:dev
```

Create the browser renderer with `npm run build`, or create a locally usable Apple Silicon macOS `.app` with `npm run desktop:build`. Phase 4C does not add signing, notarization, App Store distribution, or automatic updates.

## What is included

- Multiple locally persisted presentations with switching, creation, duplication, rename, and deletion
- Title, Text, Big Stat, Comparison, and Stat Detail scene factories
- A Composition scene with a fixed logical 1080×1920 canvas and structured text, image, chart, rectangle, circle, line, and arrow elements
- Dragging, corner resizing, exact X/Y/W/H/rotation/opacity controls, 1 px keyboard nudging, 10 px Shift-nudging, duplication, deletion, and structured copy/paste
- Center, safe-zone, element-edge, and element-center snapping; Option/Alt temporarily disables snapping; editor-only grid and guide toggles
- A flat Layers panel with stable element IDs, names, array-authoritative z-order actions, visibility, and locking
- Presentation-scoped PNG, JPEG, WebP, and SVG assets referenced by stable `assetId`, with contain/cover, controlled positioning, flips, and aspect-preserving resize by default
- Reused Bar and Line chart rendering inside bounded Composition frames, including data editing, highlights, `chartId`, datum IDs, and minimum frame sizes
- Type-compatible `sharedElementId` identities for Composition Morphs across scenes and narration-section boundaries
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
- A dedicated hidden 1080×1920 Chromium render surface that reuses the shared `Stage`
- Deterministic 30 fps raw-frame streaming to bundled FFmpeg with H.264 video, AAC audio, `yuv420p`, and MP4 fast-start metadata
- Native save destination, progress, cancellation, Open Video, and Show in Finder actions with no screen-sharing permission

The first launch seeds the original **Small Screens, Bigger Questions** demo and a seven-scene **Chart Story Lab** sample built from clearly marked illustrative data. Existing Phase 1 data stored under `video-essay-studio:presentation:v1` is migrated into the new library when possible.

## Architecture

- `src/model.ts` defines schema version 1 and the discriminated `Scene` union.
- `src/presentationValidation.ts` is the runtime boundary for untrusted JSON and produces path-specific errors.
- `src/presentationFactories.ts` owns IDs, presentation defaults, and defaults for every scene type.
- `src/storage/presentationStorage.ts` owns local library persistence and Phase 1 migration.
- `src/presentationFiles.ts` owns presentation-only serialization, download, and file parsing.
- `src/scenes/SceneRenderers.tsx` contains the typed renderer registry; presentation files contain no JSX, HTML, or React details.
- `src/scenes/CompositionSceneRenderer.tsx` owns the canonical canvas, element rendering, editor-only selection chrome, pointer conversion, interaction previews, snapping, and Motion identities. `Stage` remains scene-agnostic.
- `src/components/CompositionInspector.tsx` owns Composition add controls, exact transforms, type-specific fields, image ingestion, and the flat Layers panel.
- `src/charts/` contains the reusable numeric domain/scale utilities and the native Motion/SVG bar and line renderers.
- `src/components/Stage.tsx` remains the shared editor/Present surface for transitions and the Motion `LayoutGroup`.
- `src/narration/` owns native IndexedDB take/blob persistence, microphone capture, level metering, and cue-synchronized playback.
- `src/components/NarrationStudio.tsx` owns section authoring and the recording/review workflow while reusing `Stage`.
- `src/finalPlayback/` builds the deterministic scene-ordered playback plan and runs narrated and silent segments with one continuous Stage render identity.
- `src/desktop/` defines the narrow renderer/main-process contract and converts selected narration Blobs to transferable bytes.
- `src/components/ExportRenderSurface.tsx` is the export-only React surface. It derives visuals from the playback-plan timeline and renders the existing `Stage` full-frame.
- `electron/main.ts` and `electron/preload.ts` provide the secure desktop shell and application-specific IPC bridge; renderer code never receives Node, filesystem, process-spawning, or arbitrary IPC access.
- `electron/export/` owns the offscreen window, full-frame paint composition, fixed-rate frame pump, narration timeline, FFmpeg process, verification, cancellation, and cleanup.
- `src/components/FinalVideoStudio.tsx` coordinates readiness, Final Playback Preview, desktop export progress, and post-export actions.

## Narration Studio workflow

Open a presentation and choose **Narrate**. Create a section by selecting its start and end scenes, then rename it as needed. Ranges must be contiguous and cannot overlap another section; not every scene has to be assigned. Choose **Record New Take**, allow microphone access, confirm input on the level meter, and start the countdown. During recording, Space or Right Arrow advances within the section and Left Arrow moves back. Every visual change is stored as a scene cue relative to the take's monotonic start time, with the first scene fixed at 0 ms.

Finished takes remain available for comparison. Play, pause, or restart a take to hear it while the saved cues drive the same `Stage` used by Edit and Present modes. Mark one take as selected for each section; the readiness count reports how many sections have a valid selected local take. Canceling an active recording discards its audio and cues without writing to storage.

Audio blobs, MIME type, duration, cues, creation time, and selected-take state are local data stored in IndexedDB. Temporary object URLs exist only during playback and are revoked afterward. Presentation JSON and localStorage contain only the lightweight section definitions (`id`, `title`, and ordered scene IDs), never audio, microphone data, object URLs, or IndexedDB keys.

Electron uses its own persistent Chromium profile, so presentations and narration recorded inside the desktop app survive application restarts. That profile is separate from Chrome or another browser: presentation JSON can be imported into the desktop app, but existing browser-local narration recordings do not migrate automatically and may need to be re-recorded in Electron.

Duplicating a presentation copies its visuals and narration section structure but gives the copy a new presentation ID, so it has no recordings or selected takes. Import behaves the same way: section structure imports, audio does not. Standard JSON export intentionally excludes recordings; moving narration audio between browsers is not supported yet.

Deleting a presentation or narration section also requests deletion of its associated IndexedDB takes. Changing a section's scene range clears its now-stale takes. Deleting a scene removes that scene from its section, removes the section if it becomes empty, and likewise clears that affected section's recordings. Reordering scenes inside a still-contiguous section normalizes its scene-ID order and clears stale cue takes; a move that would split the range is blocked with a clear message.

Narration requires a browser with `getUserMedia`, `MediaRecorder`, Web Audio, and IndexedDB support. Microphone permission is requested for each new recording session, and tracks are stopped after a take, cancellation, error, or studio exit. Recording remains browser-native: no transcoding or format conversion is performed, so the stored MIME type depends on browser support.

## Final Video workflow

Choose **Final Video** after recording and selecting one usable take for every narration section. The preflight list loads all section takes from IndexedDB, validates each selected take and its cues, and asks the browser to decode each selected audio Blob. A missing, invalid, or unsupported take blocks both preview and rendering and links back to Narration Studio. A take that omits cues for some scenes remains playable, but the studio warns that those scenes will not appear because recorded cues are authoritative.

Scenes outside narration sections do not block the workflow. They become silent visual beats using their scene durations. A presentation with no narration sections is also valid and renders as a fully silent video. Narrated section duration comes from its selected take, not the durations of the scenes inside it; the estimate also includes silent beats and a brief final-frame hold.

Use **Preview Final Playback** before export. The preview playback engine chains every selected take, follows its saved cues, runs silent beats, and preserves shared-element and chart identity across section boundaries. Preview supports pause/resume, restart, and stop.

For output, choose **Export Final Video** and select an `.mp4` destination. Electron creates a second, hidden offscreen `BrowserWindow` containing only `ExportRenderSurface` and the shared `Stage`. An explicit ready/start handshake establishes the first valid presentation frame before encoding. The renderer follows the numeric playback-plan clock, while the main process emits exactly one current full frame for every 1/30-second output interval. Static visuals repeat the last full frame instead of shortening the video. Rendering is intentionally real-time, so a 90-second presentation takes about 90 seconds; moving or minimizing the editor does not affect it.

Selected narration Blob bytes are copied into a unique temporary job directory. FFmpeg decodes each take, normalizes it to 48 kHz stereo, inserts playback-plan silent segments and the final 500 ms hold, and muxes that audio with the raw Chromium frames. The result is always an MP4 with H.264 video, AAC audio, 1080×1920 resolution, 30 fps, and `yuv420p`. The exporter probes the completed file duration before reporting success. Success, failure, and cancellation destroy the render window, terminate the encoder when necessary, remove temporary files, and remove incomplete output without deleting a completed video.

After success, use **Open Video**, **Show in Finder**, or **Export Again**. In an ordinary browser, editing, Present mode, Narration Studio, and Final Playback Preview remain available, but direct MP4 export shows that the desktop app is required. There is no screen-sharing fallback.

See [docs/PRESENTATION_FORMAT.md](docs/PRESENTATION_FORMAT.md) for the complete schema, a full importable example, validation rules, and a Codex authoring checklist.

## Shared-element identity

`big-stat` and `stat-detail` scenes may carry an `elementId`. Consecutive scenes using the same value share a namespaced Motion layout identity, such as `presentation-small-screens:theater-decline-stat`, and Morph between layouts.

Duplicating a scene always creates a new scene `id` but intentionally preserves `elementId`. An adjacent duplicate can therefore continue the same visual concept through a Morph transition. Change or remove `elementId` when the copy represents an unrelated statistic.

Chart scenes use `chartId` for the continuing chart and datum `id` for each continuing bar or point. Consecutive compatible scenes preserve those IDs so values can move, resize, reorder, and change emphasis without becoming unrelated objects. Chart IDs are namespaced by presentation and chart type; bar charts do not Morph into line charts.

Composition elements use a separate optional `sharedElementId`. The element's `id` is its identity inside one scene; `sharedElementId` describes the semantic visual carried between scenes. Compatible identities are namespaced by representation, so text Morphs only to text, images only to images, matching shape kinds only to matching shape kinds, and charts only when their bar/line representation is compatible. A Composition chart keeps three distinct identity layers: `sharedElementId` for its placement, `chartId` for the continuing visualization, and each datum `id` for a continuing mark.

Duplicating a Composition scene regenerates its scene and element IDs but preserves every `sharedElementId`, `chartId`, datum ID, and asset reference. This supports the fast workflow: duplicate a scene, move or resize the shared elements, then preview their Morph. Duplicating one element within the same scene clears its shared identity to avoid ambiguous matches.

## Composition workflow

Add **Composition** from the scene menu, then use **Add Element** in the Inspector. The visible editor Stage may be smaller than the video, but every frame is stored in canonical 1080×1920 units. Resizing the application never rewrites those coordinates. Pointer input is translated back into canonical units, while the Inspector is the precision source for X, Y, width, height, rotation, and opacity.

The element array is the authoritative back-to-front layer order. Select a layer to rename it, hide/show it, lock/unlock it, or use the forward/back/front/back actions. Locked elements remain rendered but cannot be dragged or resized. Hidden elements are omitted from every Stage, including Present, Narration, Final Playback Preview, and MP4 export. Selection boxes, handles, grids, safe zones, and snap lines exist only when the editor passes Composition editing context.

Images live in the presentation-level `imageAssets` registry as data URLs for this phase; Composition elements store only `assetId`. This keeps element data modular and makes imported/exported JSON self-contained, including transparent PNG/SVG illustrations. It is intentionally a minimal asset layer: there is no project bundle, reusable character library, stock search, video asset, or asset-management UI yet. Very large images may exceed browser localStorage limits; export the presentation JSON after adding important assets.

The hidden Electron renderer uses the same Composition renderer. Its existing 432×768 CSS scene canvas is scaled 2.5× by the exporter, while Composition scales 1080×1920 coordinates to 432×768 inside that canvas. The transforms cancel exactly, so stored canonical positions reach the 1080×1920 output without editor-coordinate approximation.

## Add a scene type

1. Add the scene interface to the `Scene` union in `src/model.ts`.
2. Add its default to `createScene` and its label to `sceneTypeOptions` in `src/presentationFactories.ts`.
3. Parse and validate it in `src/presentationValidation.ts`.
4. Add and register its renderer in `src/scenes/SceneRenderers.tsx`.
5. Add its editor fields in `src/components/Inspector.tsx`.
6. Update the format specification.

The mapped renderer registry makes a missing renderer a TypeScript error.

## Current boundaries

Composition is deliberately between rigid templates and unrestricted design software. There is no pen or Bézier editor, crop tool, mask, filter, arbitrary CSS/HTML, custom font loading, rich-text span formatting, grouping, nested layers, symbols, alignment/distribution panel, timeline, keyframes, per-element animation timing, video element, character library, stock search, or project bundle. Images preserve the frame aspect ratio during corner resize by default; hold Shift to resize the frame freely. Rotation is numeric in the Inspector.

Final video output is a real-time desktop render rather than an accelerated offline Motion engine. The only user-facing final format is MP4. There is intentionally no waveform/timeline editing, trimming, gain processing, captions, transcription, background audio, cloud rendering, project/audio bundle migration, or final-video database. Narration `MediaRecorder` remains browser-native inside Chromium, while FFmpeg handles varying selected-take formats during final export.
