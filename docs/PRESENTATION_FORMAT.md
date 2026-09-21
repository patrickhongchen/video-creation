# Presentation JSON format (schema version 1)

This is the portable project-file format for Video Essay Studio. A file contains exactly one presentation. It contains content, rendering choices, and optional narration section structure, but no editor selection, project-library metadata, recorded audio, selected local take, IndexedDB key, object URL, JSX, HTML, or React implementation details.

Codex can generate a presentation by writing a UTF-8 `.json` file that follows this document. Import it with **Import** in the top bar. Exported files use this same format with two-space indentation.

## Presentation object

Every property below is required except `narration`.

| Property | Type | Rule |
| --- | --- | --- |
| `schemaVersion` | number | Must be `1`. Other and missing versions are rejected. |
| `id` | string | Non-empty, stable identity for this presentation. Prefer lowercase kebab-case. An import collision is resolved by adding a numeric suffix. |
| `title` | string | Human-facing project title. May be empty while drafting. |
| `tagline` | string | May be empty. Shown as presentation metadata. |
| `aspectRatio` | string | Must be `"9:16"` in version 1. |
| `accent` | string | Six-digit hex color, for example `#ff554f`. |
| `imageAssets` | array | Optional presentation-scoped PNG, JPEG, WebP, or SVG registry. Composition image elements reference these entries by stable ID. |
| `scenes` | array | At least one valid scene. Scene IDs must be unique within the presentation. Array order is playback order. |
| `narration` | object | Optional. Contains portable narration section structure as described below. |

Unknown properties are ignored during import and will not be retained. This keeps the runtime data boundary explicit.

## Narration structure

When present, `narration` contains a required `sections` array. The array may be empty. Each section has exactly the portable structure below:

| Property | Type | Rule |
| --- | --- | --- |
| `id` | string | Required, non-empty, stable, and unique among narration sections. |
| `title` | string | Required human-facing section name. May be empty while drafting. |
| `sceneIds` | string[] | Required and non-empty. IDs must exist in `scenes`, occur once across all sections, and form a contiguous range in current presentation order. |

A scene belongs to at most one section, and unassigned scenes are allowed. Sections use scene IDs rather than array positions so ordinary edits preserve identity. Changing a section range clears its local takes because their cues are no longer valid. The editor also removes a deleted scene from its section, removes the section if it becomes empty, and clears the affected section's takes. Reordering scenes within a still-contiguous section updates `sceneIds` to current presentation order and clears its stale cue takes; a move that would split a section into a non-contiguous range is blocked.

Example:

```json
"narration": {
  "sections": [
    { "id": "hook-section", "title": "Hook", "sceneIds": ["housing-hook", "housing-context"] },
    { "id": "data-section", "title": "The data", "sceneIds": ["housing-stat", "housing-stat-meaning"] }
  ]
}
```

Recorded takes are deliberately outside schema version 1. IndexedDB stores the audio Blob, exact browser MIME type, duration, creation time, scene cues, and selected state using presentation and section IDs. Therefore normal JSON export includes section definitions but never audio, and import/duplication produces a presentation with the same section structure and no local recordings. There is no ZIP/audio bundle format.

## Final playback and rendered output

Final Video is runtime behavior and does not add fields to this format. Schema version 1 remains unchanged: video Blobs, output paths, rendering settings, capture metadata, object URLs, and render status are never properties of a `Presentation`.

At runtime, presentation scene order is authoritative. Each narration section appears once at the position of its first scene and uses its selected local take's duration and saved cues. The order of `narration.sections` does not control playback. Unassigned scenes become silent beats using their `duration`; if there are no narration sections, every scene is a silent beat. A short final-frame hold is added after the last segment.

Final playback requires a usable selected local take for every narration section: a non-empty decodable Blob, valid cues beginning at 0 ms on the section's first scene, only in-section scene references, and cue timestamps within the take duration. Missing cue coverage produces a warning rather than invented cues; the recorded take remains authoritative.

Desktop export creates a hidden Electron offscreen renderer that contains only the existing `Stage` at 1080×1920. It derives scene changes from the same playback-plan segment durations and narration cue timestamps as Final Playback Preview, preserves one render identity for Motion and Morph continuity, and emits a fixed 30 fps frame stream independent of Chromium paint frequency. Bundled FFmpeg assembles selected narration takes, planned silence, and the final hold into 48 kHz stereo audio, then writes a deterministic MP4 containing H.264 video, AAC audio, and `yuv420p` pixels. Export paths, jobs, temporary files, and encoded media remain outside the presentation schema.

## Fields shared by every scene

| Property | Type | Rule |
| --- | --- | --- |
| `id` | string | Required, non-empty, and unique within the presentation. Keep it stable when editing content. |
| `type` | string | One of the seven discriminators below. |
| `title` | string | Required editor-facing scene name. May be empty while drafting. |
| `duration` | number | Required; at least `1`, measured in seconds. |
| `transition` | object | Required. `type` is `fade`, `slide`, or `scale`; `duration` is a non-negative number in seconds. |
| `eyebrow` | string | Optional small heading. May be empty. |
| `notes` | string | Optional speaker/research notes. May be empty. |

Line breaks inside display copy use JSON's `\n` escape. Do not embed markup.

## Scene types

### `title`

Required: `headline`. Optional: `subtitle`.

### `text`

Required: `headline`, `body`. Optional: `callout`.

### `big-stat`

Required: `value`, `label`. Optional: `supportingText`, `elementId`.

### `comparison`

Required: `headline`, `left`, `right`. Both sides are objects with string `label` and `value` properties.

### `stat-detail`

Required: `value`, `label`, `headline`, `body`. Optional: `elementId`.

### `chart`

Chart scenes store numeric source data, never rendered widths, coordinates, SVG paths, or HTML.

| Property | Type | Rule |
| --- | --- | --- |
| `headline` | string | Required editorial headline. |
| `chartType` | string | Required: `bar` or `line`. Line charts are single-series in version 1. |
| `orientation` | string | Optional: `horizontal` or `vertical`. Applies to bar charts and defaults to horizontal when omitted. |
| `data` | array | Required and non-empty. Every datum has a non-empty stable `id`, non-empty `label`, and finite numeric `value`. Datum IDs must be unique within the scene. Array order controls display order. |
| `highlightIds` | string[] | Required. Every value must be a unique datum ID present in `data`. An empty array shows all data at full emphasis. |
| `showValues` | boolean | Required. Shows or hides formatted numeric values. |
| `valuePrefix` | string | Optional text before every formatted value, such as `$`. |
| `valueSuffix` | string | Optional text after every formatted value, such as `%`. |
| `decimalPlaces` | number | Optional integer from `0` through `6`. Defaults to the renderer's compact formatting. |
| `source` | string | Optional source or citation line. Use explicit placeholder language for invented sample data. |
| `supportingText` | string | Optional short explanatory copy. |
| `chartId` | string | Optional non-empty stable identity shared by related chart scenes. |
| `domain` | object | Optional numeric `min` and/or `max`. When both are present, `min` must be less than `max`; every datum must remain inside the explicit bounds. |

The automatic domain includes zero so bar lengths and line position are not visually exaggerated. It handles negative and constant datasets. Use `domain` only when the story requires an explicit comparable scale; never choose a tighter range simply to dramatize a change.

Horizontal bars are recommended for category comparisons in a 9:16 frame. Vertical bars are supported for compact category sets. Line charts use the array order as the horizontal sequence and are intended for one ordered series, not multiple-series analysis.

### `composition`

A Composition scene is a bounded structured layout, not arbitrary HTML or a freeform drawing document. It has a fixed canonical canvas of `1080 × 1920` design units. Every element frame is stored in those units regardless of the editor's displayed Stage size.

| Property | Type | Rule |
| --- | --- | --- |
| `background` | string | Optional: `presentation`, `light`, `dark`, `accent`, or a six-digit hex color. |
| `elements` | array | Required; may be empty. Array order is authoritative back-to-front layer order. Element IDs and non-empty `sharedElementId` values must be unique inside the scene. |

The common element fields are:

| Property | Type | Rule |
| --- | --- | --- |
| `id` | string | Required, non-empty, stable, and unique inside the scene. Never use an array index. |
| `type` | string | `text`, `image`, `chart`, `shape`, or `arrow`. |
| `name` | string | Required non-empty editor-facing layer name. |
| `frame` | object | Required `x`, `y`, positive `width`, and positive `height`; optional `rotation` from `-360` through `360` degrees and `opacity` from `0` through `1`. All values are finite canonical units. |
| `locked` | boolean | Optional. A locked element renders but direct manipulation cannot move or resize it. |
| `hidden` | boolean | Optional. A hidden element does not render in Edit, Present, Narration, Final Preview, or export. |
| `sharedElementId` | string | Optional non-empty semantic identity used for compatible cross-scene Morphs. It is separate from `id`. |

Elements may extend partly or completely outside the 1080×1920 canvas. Import does not clamp or repair them. Typical safe content is approximately `x: 80–1000` and `y: 120–1720`.

#### Text element

Required: `text` and `fontSize` (`1`–`512`). Optional: `role` (`headline`, `body`, `caption`, or `label`), integer `fontWeight` (`100`–`900`), `textAlign` (`left`, `center`, or `right`), `lineHeight` (`0.5`–`3`), and `letterSpacing` (`-20`–`100`). Text uses the application font stack. Rich spans, custom fonts, effects, gradients, and per-character formatting are not supported.

#### Image element and asset registry

An image element requires `assetId` and `fit` (`cover` or `contain`). Optional `position` is one of `center`, `top`, `bottom`, `left`, `right`, `top-left`, `top-right`, `bottom-left`, or `bottom-right`; `flipX` and `flipY` are optional booleans.

Image bytes never live in an element. `presentation.imageAssets` is the minimal Phase 5B registry:

```json
{
  "id": "stick-pointing-right",
  "name": "stick-pointing-right.svg",
  "mimeType": "image/svg+xml",
  "source": "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20100%20100'%3E%3Ccircle%20cx='50'%20cy='20'%20r='10'/%3E%3Cpath%20d='M50%2030V70M50%2045L85%2035M50%2070L30%2095M50%2070L70%2095'%20stroke='black'%20fill='none'/%3E%3C/svg%3E"
}
```

`mimeType` must be `image/png`, `image/jpeg`, `image/webp`, or `image/svg+xml`, and `source` must be a non-empty data URL with the same MIME type. Every image element must reference a known asset; a missing reference blocks import and export readiness. This registry is intentionally not the future project-bundle/asset-library system.

#### Chart element

A chart element uses the same structured fields and validation as a standalone chart except it has no scene headline/source/supporting copy. Required: `chartType`, non-empty `data`, `highlightIds`, and `showValues`. Optional: `orientation`, `valuePrefix`, `valueSuffix`, `decimalPlaces`, `chartId`, and `domain`. The renderer reuses the Bar/Line chart implementation in a chart-only responsive mode. Use at least roughly `280 × 220` design units for legibility.

#### Shape element

Required `shape`: `rectangle`, `circle`, or `line`. Optional `fill`, `stroke` (six-digit hex colors), and non-negative `strokeWidth`. The editor intentionally provides no path, pen, or Bézier controls.

#### Arrow element

Optional `stroke` is a six-digit hex color; `strokeWidth` is positive; `startCap` is `none` or `dot`; `endCap` is `none` or `arrow`. The arrow follows its rectangular frame and rotation. It is a straight line only.

#### Composition shared identity

`sharedElementId` identifies where a semantic visual exists in a Composition layout. It does not replace the per-scene element `id`. Validation prevents one shared ID from being reused by incompatible representations anywhere in a presentation. Text matches text, image matches image, shapes require the same shape kind, and charts require compatible bar/line representation and bar orientation.

For charts, keep all identity layers distinct:

- `sharedElementId`: the whole chart's Composition placement and size;
- `chartId`: the continuing visualization;
- datum `id`: a continuing bar or point.

Duplicating a Composition scene creates a new scene ID and new element IDs but preserves `sharedElementId`, asset IDs, chart IDs, and datum IDs. Duplicating one element inside a scene creates a new element ID, offsets it, and clears its shared identity.

## Shared-element / Morph IDs

`elementId` describes the identity of a visual concept, not the identity of a scene. When consecutive `big-stat` or `stat-detail` scenes use the same `elementId`, their statistic can move and resize as one shared element. Use the same value only when the statistic is conceptually the same; omit it or choose another stable value for unrelated content.

Duplicating a scene in the editor creates a new scene `id` and deliberately preserves `elementId`, making an adjacent duplicated beat eligible to Morph. Presentation duplication preserves all scene and element IDs because each presentation has its own rendering namespace.

Charts use two identity levels. `chartId` identifies the continuing visualization and each datum `id` identifies one continuing entity inside it. Consecutive compatible scenes with the same `chartId`, `chartType`, and datum IDs can preserve bars or points while they move, resize, or change emphasis. Identity comes from presentation data, never array indexes. Preserve a datum ID when its label, value, highlight state, or order changes. Choose a new ID only when the underlying entity changes.

Bar-to-line Morphing is not supported. A bar chart and a line chart are different representations even if they contain similar data. Entry animation and chart Morphing respect the operating system's reduced-motion preference.

## Multi-scene chart story example

The following abbreviated scene objects demonstrate the authoring pattern. They intentionally repeat the same `chartId` and datum IDs. In a complete presentation, each object also includes the shared scene fields documented above.

```json
[
  {
    "id": "share-all",
    "type": "chart",
    "title": "Show the field",
    "duration": 5,
    "eyebrow": "Illustrative data",
    "headline": "Four services divide the sample.",
    "chartType": "bar",
    "orientation": "horizontal",
    "chartId": "streaming-share",
    "data": [
      { "id": "netflix", "label": "Netflix", "value": 28 },
      { "id": "youtube", "label": "YouTube", "value": 24 },
      { "id": "disney", "label": "Disney", "value": 12 },
      { "id": "hulu", "label": "Hulu", "value": 9 }
    ],
    "highlightIds": [],
    "valueSuffix": "%",
    "showValues": true,
    "source": "Illustrative sample data — replace before publishing",
    "transition": { "type": "fade", "duration": 0.5 }
  },
  {
    "id": "share-netflix",
    "type": "chart",
    "title": "Focus on Netflix",
    "duration": 5,
    "headline": "One service leads the sample.",
    "chartType": "bar",
    "orientation": "horizontal",
    "chartId": "streaming-share",
    "data": [
      { "id": "netflix", "label": "Netflix", "value": 28 },
      { "id": "youtube", "label": "YouTube", "value": 24 },
      { "id": "disney", "label": "Disney", "value": 12 },
      { "id": "hulu", "label": "Hulu", "value": 9 }
    ],
    "highlightIds": ["netflix"],
    "valueSuffix": "%",
    "showValues": true,
    "transition": { "type": "fade", "duration": 0.5 }
  },
  {
    "id": "share-disney",
    "type": "chart",
    "title": "Focus on Disney",
    "duration": 5,
    "headline": "Now guide the eye elsewhere.",
    "chartType": "bar",
    "orientation": "horizontal",
    "chartId": "streaming-share",
    "data": [
      { "id": "netflix", "label": "Netflix", "value": 28 },
      { "id": "youtube", "label": "YouTube", "value": 24 },
      { "id": "disney", "label": "Disney", "value": 12 },
      { "id": "hulu", "label": "Hulu", "value": 9 }
    ],
    "highlightIds": ["disney"],
    "valueSuffix": "%",
    "showValues": true,
    "transition": { "type": "fade", "duration": 0.5 }
  }
]
```

For a line chart, use the same datum structure with `"chartType": "line"`; order points from left to right and give each point a stable ID such as a year or period slug.

## Complete Composition example

This importable example deliberately uses a playful offset rather than a perfect corporate grid. The transparent SVG is a normal image asset; the scene combines it with an arrow, chart, shape, headline, and sarcastic caption.

```json
{
  "schemaVersion": 1,
  "id": "whimsical-composition-demo",
  "title": "The Very Scientific Explanation",
  "tagline": "A stick figure investigates the numbers.",
  "aspectRatio": "9:16",
  "accent": "#ff554f",
  "imageAssets": [
    {
      "id": "stick-pointing-right",
      "name": "stick-pointing-right.svg",
      "mimeType": "image/svg+xml",
      "source": "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20100%20140'%3E%3Cg%20fill='none'%20stroke='%23111821'%20stroke-width='5'%20stroke-linecap='round'%3E%3Ccircle%20cx='40'%20cy='20'%20r='13'/%3E%3Cpath%20d='M40%2034V88M40%2050L88%2038M40%2053L15%2075M40%2088L16%20132M40%2088L72%20130'/%3E%3C/g%3E%3C/svg%3E"
    }
  ],
  "scenes": [
    {
      "id": "why-this-matters",
      "type": "composition",
      "title": "Why this matters",
      "duration": 6,
      "transition": { "type": "fade", "duration": 0.5 },
      "background": "light",
      "notes": "The character, chart, and caption are all structured elements.",
      "elements": [
        {
          "id": "chart-backing",
          "type": "shape",
          "name": "Chart backing",
          "shape": "rectangle",
          "frame": { "x": 365, "y": 515, "width": 660, "height": 760, "rotation": 2, "opacity": 1 },
          "fill": "#f3f6f8",
          "stroke": "#d9e0e7",
          "strokeWidth": 3
        },
        {
          "id": "character-1",
          "sharedElementId": "guide-character",
          "type": "image",
          "name": "Pointing character",
          "assetId": "stick-pointing-right",
          "frame": { "x": 68, "y": 790, "width": 285, "height": 430, "rotation": -6, "opacity": 1 },
          "fit": "contain",
          "position": "center",
          "flipX": false,
          "flipY": false
        },
        {
          "id": "chart-1",
          "sharedElementId": "main-chart",
          "type": "chart",
          "name": "Subscriber decline",
          "frame": { "x": 390, "y": 560, "width": 620, "height": 680, "rotation": 2, "opacity": 1 },
          "chartType": "bar",
          "orientation": "horizontal",
          "chartId": "subscriber-decline",
          "data": [
            { "id": "2024", "label": "2024", "value": 72 },
            { "id": "2025", "label": "2025", "value": 54 }
          ],
          "highlightIds": ["2025"],
          "valueSuffix": "%",
          "showValues": true
        },
        {
          "id": "arrow-1",
          "type": "arrow",
          "name": "Look over there",
          "frame": { "x": 265, "y": 815, "width": 245, "height": 80, "rotation": -12, "opacity": 1 },
          "stroke": "#ff554f",
          "strokeWidth": 10,
          "startCap": "dot",
          "endCap": "arrow"
        },
        {
          "id": "headline-1",
          "sharedElementId": "question-headline",
          "type": "text",
          "name": "Headline",
          "frame": { "x": 100, "y": 145, "width": 880, "height": 270, "rotation": 0, "opacity": 1 },
          "text": "Okay... so what happened?",
          "role": "headline",
          "fontSize": 78,
          "fontWeight": 700,
          "textAlign": "center",
          "lineHeight": 1.05
        },
        {
          "id": "caption-1",
          "type": "text",
          "name": "Sarcastic caption",
          "frame": { "x": 90, "y": 1370, "width": 900, "height": 180, "rotation": -2, "opacity": 0.9 },
          "text": "Wait... THAT caused it? Cool. Totally normal.",
          "role": "caption",
          "fontSize": 42,
          "fontWeight": 600,
          "textAlign": "center",
          "lineHeight": 1.2
        }
      ]
    }
  ]
}
```

## Complete example

This example includes all five non-chart scene types and can be imported as-is. See the chart-story sample seeded in the application for a complete chart presentation.

```json
{
  "schemaVersion": 1,
  "id": "housing-after-the-boom",
  "title": "Housing After the Boom",
  "tagline": "Why a basic need became a moving target.",
  "aspectRatio": "9:16",
  "accent": "#e4572e",
  "scenes": [
    {
      "id": "housing-hook",
      "type": "title",
      "title": "The question",
      "duration": 4,
      "eyebrow": "Housing after the boom",
      "headline": "When did home\nmove out of reach?",
      "subtitle": "A short story about supply, wages, and place.",
      "notes": "Open on the question and leave a short pause.",
      "transition": { "type": "fade", "duration": 0.55 }
    },
    {
      "id": "housing-context",
      "type": "text",
      "title": "The context",
      "duration": 5,
      "eyebrow": "The long squeeze",
      "headline": "Demand moved fast.\nHomes did not.",
      "body": "In growing regions, construction often lagged behind new jobs and new households.",
      "callout": "A shortage compounds one year at a time.",
      "notes": "Replace this general statement with sourced local research.",
      "transition": { "type": "slide", "duration": 0.65 }
    },
    {
      "id": "housing-stat",
      "type": "big-stat",
      "title": "The price gap",
      "duration": 5,
      "eyebrow": "The number",
      "value": "2.4×",
      "label": "faster than wage growth",
      "supportingText": "Illustrative placeholder data—replace it and record a source in the notes.",
      "elementId": "price-to-wage-gap",
      "notes": "Do not publish placeholder data. Add a source, geography, and date range.",
      "transition": { "type": "scale", "duration": 0.7 }
    },
    {
      "id": "housing-stat-meaning",
      "type": "stat-detail",
      "title": "What the gap means",
      "duration": 5,
      "eyebrow": "Behind the ratio",
      "value": "2.4×",
      "label": "the widening gap",
      "headline": "The same paycheck\nbuys less stability.",
      "body": "A larger share of income goes toward rent or a down payment, leaving less room for everything else.",
      "elementId": "price-to-wage-gap",
      "notes": "This scene intentionally shares the prior elementId.",
      "transition": { "type": "slide", "duration": 0.75 }
    },
    {
      "id": "housing-comparison",
      "type": "comparison",
      "title": "Two paths",
      "duration": 5,
      "eyebrow": "The policy choice",
      "headline": "Scarcity is built.\nSo is abundance.",
      "left": { "label": "Status quo", "value": "−" },
      "right": { "label": "More homes", "value": "+" },
      "notes": "Close by moving from diagnosis to agency.",
      "transition": { "type": "fade", "duration": 0.6 }
    }
  ]
}
```

## Codex authoring checklist

1. Start with `schemaVersion: 1`, a unique kebab-case presentation `id`, and `aspectRatio: "9:16"`.
2. Build an ordered story with one or more scenes. Give every scene a unique, stable kebab-case `id`.
3. Use only the documented discriminator and fields for each scene type.
4. Keep text concise enough for a vertical frame. Use `\n` intentionally in large headlines.
5. Put research reminders and citations in `notes`; verify all factual claims before publication.
6. Reuse an `elementId` only across scenes that represent the same statistic or concept.
7. For related chart scenes, preserve `chartId` and every continuing datum `id`; change `highlightIds`, values, and array order to tell the next beat.
8. Keep chart values numeric. Put units in `valuePrefix` or `valueSuffix`, not inside `value`.
9. Prefer a few legible categories, concise labels, horizontal bars for ranked comparisons, and a single ordered line for trends.
10. For Composition, author against `x: 0–1080` and `y: 0–1920`; keep important content approximately inside `x: 80–1000` and `y: 120–1720` unless an intentional off-canvas crop serves the story.
11. Give every element a meaningful stable ID and layer name. Avoid accidental overlap, but use deliberate offsets and small rotations for playful scenes instead of forcing everything into a corporate grid.
12. Preserve `sharedElementId` across duplicated scenes only for intended Morphs. Preserve `chartId` and datum IDs independently for continuing charts.
13. Reference image bytes through `imageAssets`; never put a data URL directly in an element. Transparent PNG and SVG assets are appropriate for stick figures and illustrations.
14. Keep chart frames at least about `280 × 220`, text frames large enough for their font size, and important text inside safe zones.
15. Ensure all JSON strings use double quotes and contain no trailing commas or comments.
16. Import the file. If validation fails, use the reported property path to fix the malformed value.

## Import behavior and errors

Import parses JSON, requires schema version 1, validates all required presentation and scene fields, rejects zero scenes, duplicate scene/element/asset IDs, non-finite or non-positive frames, invalid opacity/rotation/typography, unknown asset references, duplicate or incompatible shared identities, duplicate chart datum IDs, non-finite chart values, invalid chart identity reuse, and invalid highlight references, and reports the failing path. It never replaces an existing project: if the presentation `id` already exists, the imported copy receives `-2`, `-3`, and so on. A malformed file is not added to the library, and the current project remains open.
