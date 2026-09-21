# Presentation format — schema v2

The persistent model is intentionally small:

```text
Presentation
  → Slides
      → Elements
```

Every slide is a fixed `1080 × 1920` canvas. Presets create an initial element arrangement, but the preset name is not stored and never constrains later editing. The runtime has one slide renderer; importing schema v1 first converts old specialized scenes into schema v2 slides.

## Presentation

| Field | Type | Notes |
| --- | --- | --- |
| `schemaVersion` | `2` | Required. Schema v1 remains importable through migration. |
| `id` | string | Non-empty presentation identity. |
| `title` | string | Project title. |
| `tagline` | string | Short project description. |
| `aspectRatio` | `"9:16"` | The only supported output ratio. |
| `theme` | object | Presentation-wide visual defaults. |
| `imageAssets` | array | Optional presentation-scoped image registry. |
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

Each `imageAssets` entry has `id`, `name`, `mimeType`, and a matching data URL in `source`. Supported MIME types are PNG, JPEG, WebP, and SVG. Asset IDs must be unique and every image reference must resolve.

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

Section ranges must be non-empty, contiguous in slide order, non-overlapping, and reference existing slide IDs. Recorded takes remain local IndexedDB data keyed by presentation and section ID. Existing stored cue records retain their historical internal `sceneId` property, but its value is simply the unchanged slide ID; this preserves old takes without re-recording.

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

## Codex authoring recommendations

- Choose layout from communication intent, not a rigid scene type.
- Need a dramatic number? Use one large text element.
- Need two photos? Use two image elements with explicit frames.
- Need a playful explanation? Combine an image or stick figure, arrow, chart, and caption.
- Need a chart? Keep it as one semantic chart element and place it where the composition needs it.
- Need continuity? Preserve `sharedElementId`; preserve `chartId` and datum IDs independently.
- Keep JSON readable: meaningful element IDs/names, explicit numeric frames, shallow arrays, and no hidden wrapper objects.
- Put citations and delivery notes in `notes`. Verify factual claims before publication.

## Validation and import

Validation reports the failing property path. It rejects missing/unsupported schema versions, empty slide arrays, duplicate IDs, malformed frames/styles/backgrounds, unresolved asset references, invalid chart data/highlights/domains, incompatible shared identities, and invalid narration ranges. Current v2 JSON is validated directly. Schema v1 is parsed at the migration boundary, converted once, then validated as v2.
