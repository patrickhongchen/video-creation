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
| `type` | string | One of the five discriminators below. |
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

## Shared-element / Morph IDs

`elementId` describes the identity of a visual concept, not the identity of a scene. When consecutive `big-stat` or `stat-detail` scenes use the same `elementId`, their statistic can move and resize as one shared element. Use the same value only when the statistic is conceptually the same; omit it or choose another stable value for unrelated content.

Duplicating a scene in the editor creates a new scene `id` and deliberately preserves `elementId`, making an adjacent duplicated beat eligible to Morph. Presentation duplication preserves all scene and element IDs because each presentation has its own rendering namespace.

## Complete example

This example includes all five scene types and can be imported as-is.

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
7. Ensure all JSON strings use double quotes and contain no trailing commas or comments.
8. Import the file. If validation fails, use the reported property path to fix the malformed value.

## Import behavior and errors

Import parses JSON, requires schema version 1, validates all required presentation and scene fields, rejects zero scenes and duplicate scene IDs, and reports the failing path. It never replaces an existing project: if the presentation `id` already exists, the imported copy receives `-2`, `-3`, and so on. A malformed file is not added to the library, and the current project remains open.
