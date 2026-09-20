# Presentation JSON format (schema version 1)

This is the portable project-file format for Video Essay Studio. A file contains exactly one presentation. It contains content and rendering choices, but no editor selection, project-library metadata, JSX, HTML, or React implementation details.

Codex can generate a presentation by writing a UTF-8 `.json` file that follows this document. Import it with **Import** in the top bar. Exported files use this same format with two-space indentation.

## Presentation object

Every property below is required.

| Property | Type | Rule |
| --- | --- | --- |
| `schemaVersion` | number | Must be `1`. Other and missing versions are rejected. |
| `id` | string | Non-empty, stable identity for this presentation. Prefer lowercase kebab-case. An import collision is resolved by adding a numeric suffix. |
| `title` | string | Human-facing project title. May be empty while drafting. |
| `tagline` | string | May be empty. Shown as presentation metadata. |
| `aspectRatio` | string | Must be `"9:16"` in version 1. |
| `accent` | string | Six-digit hex color, for example `#ff554f`. |
| `scenes` | array | At least one valid scene. Scene IDs must be unique within the presentation. Array order is playback order. |

Unknown properties are ignored during import and will not be retained. This keeps the runtime data boundary explicit.

## Fields shared by every scene

| Property | Type | Rule |
| --- | --- | --- |
| `id` | string | Required, non-empty, and unique within the presentation. Keep it stable when editing content. |
| `type` | string | One of the six discriminators below. |
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
10. Ensure all JSON strings use double quotes and contain no trailing commas or comments.
11. Import the file. If validation fails, use the reported property path to fix the malformed value.

## Import behavior and errors

Import parses JSON, requires schema version 1, validates all required presentation and scene fields, rejects zero scenes, duplicate scene IDs, duplicate chart datum IDs, non-finite chart values, and invalid highlight references, and reports the failing path. It never replaces an existing project: if the presentation `id` already exists, the imported copy receives `-2`, `-3`, and so on. A malformed file is not added to the library, and the current project remains open.
