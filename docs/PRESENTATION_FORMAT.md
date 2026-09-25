# Presentation format — schema v2

The persistent model is intentionally small:

```text
Presentation
  → Slides
      → Elements
```

Every slide is a fixed `1080 × 1920` canvas. Presets create an initial element arrangement, but the preset name is not stored and never constrains later editing. The runtime has one slide renderer; importing schema v1 first converts old specialized scenes into schema v2 slides.

## Desktop project folder

A desktop project is an ordinary folder, not a database or archive:

```text
my-presentation/
├── presentation.json
├── AGENTS.md
└── assets/
    ├── theater.jpg
    └── stick-pointing.svg
```

`presentation.json` is canonical. It contains the presentation model described below and is saved as readable, two-space-indented JSON with a final newline. It does not contain absolute filesystem paths, image binary data, runtime asset URLs, narration Blob bytes, generated videos, current selection, zoom, panel state, or temporary export information.

`AGENTS.md` is a concise authoring guide for Codex and other tools: keep JSON valid, use the fixed coordinate system, store images below `assets/`, preserve stable IDs, and maintain Morph/chart identities. It also directs an author to outline the story first, keep one main idea per slide, prefer visual explanation to paragraphs, vary layouts intentionally, and run the Project validator. It is guidance rather than application state. The `assets/` directory contains the presentation's portable visual files. Moving the complete folder is supported because the JSON refers to these files only through project-relative paths.

## Presentation

| Field | Type | Notes |
| --- | --- | --- |
| `schemaVersion` | `2` | Required. Schema v1 remains importable through migration. |
| `id` | string | Non-empty presentation identity. |
| `title` | string | Project title. |
| `tagline` | string | Short project description. |
| `aspectRatio` | `"9:16"` | The only supported output ratio. |
| `theme` | object | Presentation-wide visual defaults. |
| `imageAssets` | array | Optional presentation-scoped image registry using project-relative paths on desktop. |
| `slides` | array | One or more canonical slides. |
| `narration` | object | Optional narration section structure. Audio remains in IndexedDB and is never embedded in JSON. |

### Theme

`theme` separates presentation personality from slide structure. It contains `id`, optional `name`, `background`, `foreground`, `accent`, `fontFamily`, default text styles for headline/body/caption (and optionally label), and `chartStyle` colors for foreground, muted marks, and grid lines.

Theme text styles provide defaults. A text element may override `fontFamily`, `fontSize`, `fontWeight`, `color`, `lineHeight`, and `letterSpacing`; intentional element values win. The built-in `editorial` theme preserves the original application look. A theme is not a template and does not decide where elements go.

## Slide

```ts
interface Slide {
  id: string
  title: string
  duration: number
  notes?: string
  transition: { type: 'fade' | 'slide' | 'scale'; duration: number }
  background?: 'presentation' | 'light' | 'dark' | 'accent' | `#${string}`
  elements: SlideElement[]
}
```

`duration` is used for silent playback. Narrated sections use recorded slide cue times instead. Array order in `elements` is authoritative back-to-front layer order. A slide may intentionally contain no elements, one image, two images, one phrase, or any other valid structured composition.

`background: "presentation"` or an omitted background uses the theme. The other named choices are simple overrides; six-digit hex colors are also supported.

## Common element fields

All elements have:

| Field | Rule |
| --- | --- |
| `id` | Non-empty and unique inside the slide. |
| `type` | `text`, `image`, `chart`, `shape`, or `arrow`. |
| `name` | Non-empty editor-facing layer name. |
| `frame` | Finite `x`, `y`, positive `width`, positive `height`; optional rotation `-360..360` and opacity `0..1`. |
| `locked` | Optional. Prevents direct drag/resize but does not hide the element. |
| `hidden` | Optional. Omits the element from editing output, playback, and export. |
| `sharedElementId` | Optional semantic identity for compatible cross-slide Morph. |

Coordinates are explicit design units, not percentages or responsive constraints:

```json
"frame": { "x": 120, "y": 260, "width": 840, "height": 220 }
```

Elements may extend outside the canvas for intentional crops. Keep important content roughly inside `x: 80–1000` and `y: 120–1720` unless the design calls for otherwise.

## TextElement

Required: `text`. Optional: `role` (`headline`, `body`, `caption`, `label`), `fontFamily`, `fontSize` (`1..512`), integer `fontWeight` (`100..900`), six-digit `color`, `textAlign`, `lineHeight` (`0.5..3`), and `letterSpacing` (`-20..100`). Missing style fields come from the theme role default.

Text stays semantic and editable. Rich HTML, arbitrary CSS, and per-character styling are not accepted.

## ImageElement and assets

An image element references an asset by `assetId`; bytes never live in the element. It requires `fit` (`contain` or `cover`) and may set `position`, `flipX`, and `flipY`.

Each desktop-project `imageAssets` entry has `id`, `name`, `mimeType`, and `path`. The path uses forward slashes and must remain below `assets/`, for example:

```json
{
  "id": "theater-photo",
  "name": "Movie theater",
  "mimeType": "image/jpeg",
  "path": "assets/theater.jpg"
}
```

Absolute paths and traversal such as `../secret.png` are invalid. The desktop runtime resolves a validated path to a managed local URL, but that runtime `source` is not written back to `presentation.json`. Supported MIME types are PNG, JPEG, WebP, and SVG. Asset IDs must be unique and every image element's `assetId` must resolve.

Browser/local-library compatibility remains available: legacy and browser-only presentations may carry a matching data URL in `source` instead of `path`. Desktop project saving converts managed visual assets to files and omits the data URL/runtime URL from canonical project JSON. New Codex-authored desktop projects should always use `path`.

The editor routes file-picker imports, clipboard image paste (including browser-copied images), and Finder drops through the same managed ingestion flow. Clipboard paste accepts an image payload directly and can fall back to a public HTTPS image referenced by the browser's clipboard HTML. Files are copied or written under `assets/` with readable duplicate-safe names; image elements never depend on the original absolute source path. Codex may also add a supported file under `assets/` and register it in JSON. Deleting an image element leaves the asset file in place because other slides may share it.

## ChartElement

A chart remains one semantic element. It owns `chartType`, optional bar `orientation`, numeric `data`, `highlightIds`, `showValues`, optional prefix/suffix/decimal formatting, optional domain, and optional `chartId`.

Chart identity has three independent levels:

- `sharedElementId` — the chart frame's placement/size identity for slide Morph;
- `chartId` — identity of the continuing visualization;
- datum `id` — identity of each continuing bar or point.

Preserve each identity only for the concept it represents. Bar and line renderings are incompatible; bar orientation must also remain compatible for shared Morph.

## ShapeElement and ArrowElement

Shapes support `rectangle`, `circle`, and `line`, with optional six-digit `fill`, `stroke`, and non-negative `strokeWidth`. Arrows support a straight frame-based line, optional color/width, `startCap` (`none` or `dot`), and `endCap` (`none` or `arrow`). There are deliberately no arbitrary paths, Bézier controls, groups, or nested components.

## Narration

Schema v2 section structure is:

```json
"narration": {
  "sections": [
    { "id": "opening", "title": "Opening", "slideIds": ["hook", "context"] }
  ]
}
```

Section ranges must be non-empty, contiguous in slide order, non-overlapping, and reference existing slide IDs. Recorded takes, audio Blobs, and selected-take state remain profile-local IndexedDB data keyed by presentation and section ID. Existing stored cue records retain their historical internal `sceneId` property, but its value is simply the unchanged slide ID; this preserves old takes without re-recording.

Opening and saving the same project preserves these IDs, so editing text, frames, charts, or illustrations does not by itself detach narration. Narration recordings are not currently files in the project: moving the folder on the same machine/profile keeps its association, while copying the folder alone to another computer or browser profile does not transfer the audio.

## Morph and duplication

`sharedElementId` is separate from the element's per-slide `id`. Compatible elements on different slides with the same shared identity can move and resize as one visual. Compatibility is checked by kind: text↔text, image↔image, matching shape kind, and compatible chart representation.

Duplicating a slide creates a new slide ID and new element IDs while preserving normal content, frames, `sharedElementId`, asset references, `chartId`, and datum IDs. This makes the primary workflow:

```text
Duplicate Slide → move/resize/edit → Morph
```

Duplicating one element within a slide clears its shared identity to avoid ambiguous matches.

## Complete schema v2 example

```json
{
  "schemaVersion": 2,
  "id": "tiny-explanation",
  "title": "The Tiny Explanation",
  "tagline": "A playful, structured presentation.",
  "aspectRatio": "9:16",
  "theme": {
    "id": "editorial",
    "name": "Editorial",
    "background": "#fffdf9",
    "foreground": "#111821",
    "accent": "#ff554f",
    "fontFamily": "Inter, system-ui, sans-serif",
    "defaultHeadlineStyle": { "fontSize": 92, "fontWeight": 800, "lineHeight": 1.02 },
    "defaultBodyStyle": { "fontSize": 38, "fontWeight": 400, "lineHeight": 1.35 },
    "defaultCaptionStyle": { "fontSize": 24, "fontWeight": 500, "lineHeight": 1.25 },
    "chartStyle": { "foreground": "#111821", "muted": "#aeb8c3", "grid": "#d9e0e7" }
  },
  "imageAssets": [
    {
      "id": "theater-photo",
      "name": "Movie theater",
      "mimeType": "image/jpeg",
      "path": "assets/theater.jpg"
    }
  ],
  "slides": [
    {
      "id": "question",
      "title": "Ask the question",
      "duration": 4,
      "notes": "Pause after the headline.",
      "transition": { "type": "fade", "duration": 0.5 },
      "background": "presentation",
      "elements": [
        {
          "id": "headline-1",
          "type": "text",
          "name": "Headline",
          "sharedElementId": "main-question",
          "frame": { "x": 100, "y": 220, "width": 880, "height": 300 },
          "text": "Wait… what happened?",
          "role": "headline",
          "textAlign": "center"
        },
        {
          "id": "chart-1",
          "type": "chart",
          "name": "Audience chart",
          "sharedElementId": "main-chart-frame",
          "frame": { "x": 390, "y": 610, "width": 620, "height": 650 },
          "chartType": "bar",
          "orientation": "horizontal",
          "chartId": "audience-chart",
          "data": [
            { "id": "before", "label": "Before", "value": 72 },
            { "id": "after", "label": "After", "value": 54 }
          ],
          "highlightIds": ["after"],
          "valueSuffix": "%",
          "showValues": true
        },
        {
          "id": "arrow-1",
          "type": "arrow",
          "name": "Look here",
          "frame": { "x": 210, "y": 850, "width": 260, "height": 90, "rotation": -8 },
          "stroke": "#ff554f",
          "strokeWidth": 10,
          "startCap": "dot",
          "endCap": "arrow"
        },
        {
          "id": "theater-image",
          "type": "image",
          "name": "Theater photo",
          "frame": { "x": 120, "y": 1130, "width": 840, "height": 240 },
          "assetId": "theater-photo",
          "fit": "cover",
          "position": "center"
        },
        {
          "id": "caption-1",
          "type": "text",
          "name": "Sarcastic caption",
          "frame": { "x": 100, "y": 1420, "width": 880, "height": 160, "rotation": -2 },
          "text": "Cool. Totally normal.",
          "role": "caption",
          "fontSize": 42,
          "fontWeight": 700,
          "textAlign": "center"
        }
      ]
    },
    {
      "id": "answer",
      "title": "Move to the answer",
      "duration": 5,
      "transition": { "type": "slide", "duration": 0.65 },
      "elements": [
        {
          "id": "headline-2",
          "type": "text",
          "name": "Headline",
          "sharedElementId": "main-question",
          "frame": { "x": 100, "y": 120, "width": 880, "height": 220 },
          "text": "The same question, now with context.",
          "role": "headline",
          "fontSize": 72
        },
        {
          "id": "chart-2",
          "type": "chart",
          "name": "Audience chart",
          "sharedElementId": "main-chart-frame",
          "frame": { "x": 100, "y": 500, "width": 880, "height": 920 },
          "chartType": "bar",
          "orientation": "horizontal",
          "chartId": "audience-chart",
          "data": [
            { "id": "before", "label": "Before", "value": 72 },
            { "id": "after", "label": "After", "value": 54 }
          ],
          "highlightIds": ["after"],
          "valueSuffix": "%",
          "showValues": true
        }
      ]
    }
  ]
}
```

## Presets

The editor offers Blank, Title, Text, Big Stat, Comparison, and Chart. These are factory inputs only. `createSlideFromPreset()` returns a normal slide with a readable element array. There is no persisted preset discriminator, preset-specific renderer, or preset-specific inspector.

## Project lifecycle and external editing

On desktop, New Project creates a valid blank `presentation.json`, `AGENTS.md`, and `assets/`; Open Project parses and validates the presentation and checks required assets before replacing the current in-memory project. Save writes the canonical JSON through a temporary file and atomic replacement rather than truncating the source file in place. Unsaved state is application state and is never serialized into the presentation.

Codex may edit `presentation.json` and add registered files below `assets/`. Choose **Reload Project** to parse, validate, resolve assets, and then replace the in-memory model. A malformed external edit leaves the last valid presentation open. If the selected slide ID survives a reload, the editor keeps it selected.

The app tracks the last-known disk version. If `presentation.json` changed externally while the editor also has unsaved changes, Save offers reload from disk, overwrite with the in-memory version, or cancel; Phase 6A does not attempt an automatic JSON merge. It also does not watch files or live-reload changes. There is no in-app AI API, chat, prompt UI, or agent execution in this phase.

Browser development mode does not emulate a filesystem. It continues to use the localStorage presentation library and accepts browser/legacy data-URL assets. **Save as Project** is the bridge from that local representation to a portable desktop folder; the local copy is not automatically deleted.

## Schema v1 migration

Import and local persistence accept schema v1, validate it, and deterministically convert it before runtime use:

| v1 scene | v2 output |
| --- | --- |
| Title | eyebrow/headline/subtitle text elements |
| Text | eyebrow/headline/body/callout text elements |
| Big Stat | value/label/supporting text; legacy `elementId` becomes the value's `sharedElementId` |
| Stat Detail | value/label/headline/body text; legacy `elementId` becomes the value's `sharedElementId` |
| Comparison | headline plus left/right value and label text elements |
| Chart | headline/support/source text plus one semantic chart element preserving `chartId`, datum IDs, highlights, formatting, domain, and orientation |
| Composition | same slide ID, metadata, background, and structured elements |

Slide IDs, notes, duration, transition, image asset IDs, narration section IDs, and narration membership are preserved. `sceneIds` becomes `slideIds` without changing its values. All newly saved/exported presentations use schema v2 and `slides`; legacy types exist only at the import boundary.

## Codex authoring

Use [CODEX_AUTHORING.md](CODEX_AUTHORING.md) as the canonical practical guide. It covers narrative planning, visual hierarchy, layout recipes, playful work, image and chart choices, theme personalities, Morph restraint, narration notes, prompt patterns, anti-patterns, and the finish checklist.

Its core rules are: choose composition from communication intent rather than a rigid scene type; communicate one main idea per slide; keep visible copy short; put citations and delivery notes in `notes`; and preserve stable identities when a concept continues. The reference Projects in [`examples/`](../examples/) demonstrate these patterns using only ordinary slides and elements.

## Validation and import

Validation reports the failing property path. It rejects missing/unsupported schema versions, empty slide arrays, duplicate IDs, malformed frames/styles/backgrounds, unresolved asset references, unsafe/absolute/traversing project asset paths, invalid chart data/highlights/domains, incompatible shared identities, and invalid narration ranges. Desktop project loading additionally reports missing required files before replacing the current valid project. Current v2 JSON is validated directly. Schema v1 is parsed at the migration boundary, converted once, then validated as v2.
