# Visual design for presentations

Read and follow this guide before creating or modifying presentations, slides, SVG assets, diagrams, charts, visual annotations, or generated presentation imagery. It governs visual authoring; it does not require changes to application behavior or UI.

Use [PRESENTATION_FORMAT.md](PRESENTATION_FORMAT.md) for the schema and [CODEX_AUTHORING.md](CODEX_AUTHORING.md) for project authoring and validation. The current model in [src/model.ts](../src/model.ts), renderer in [CompositionSceneRenderer.tsx](../src/scenes/CompositionSceneRenderer.tsx), asset validation in [presentationValidation.ts](../src/presentationValidation.ts), and reveal rules in [entranceAnimation.ts](../src/entranceAnimation.ts) also inform this guide. The format and authoring docs currently omit the implemented `video` element; it is included below. User-supplied brand rules, references, and explicit style requests should shape the result while preserving clarity and supported presentation structure.

## Design intent

Aim for editorial, restrained, human-designed slides. Every visual choice should help the audience understand a claim, follow a relationship, examine evidence, or remember a useful idea. Prefer confident typography, deliberate composition, and whitespace to decoration.

Give each slide one main communication task and one clear visual focal point. Make the takeaway recognizable before the audience reads the small text. A short statement, a large number, an annotated screenshot, or a simple diagram can carry a complete slide. Do not fill space just because it is available.

Avoid generic AI-presentation aesthetics as defaults:

- Repeated card grids and excessive rounded rectangles around unrelated content.
- Gradients, glowing elements, decorative blobs, floating ornaments, and elaborate backgrounds.
- Generic AI illustrations, stock technology metaphors, and meaningless futuristic imagery.
- Unnecessary icons next to every heading, label, or bullet.
- Many badges, pills, borders, callout containers, and competing accent colors.
- A headline, paragraph, and three identical boxes repeated on every slide.

Use a container only when its boundary communicates something, such as a system, region, or grouping. Use an icon only when it identifies something faster or more clearly than a short label. A subject-specific illustration or requested playful tone can be appropriate; keep its purpose and visual language deliberate.

## Work within the actual presentation model

The canonical desktop project is a folder containing `presentation.json`, portable visual files under `assets/`, and optional recorded narration under `narration/`. New presentations use `schemaVersion: 2`, `aspectRatio: "9:16"`, and a `slides` array. Each slide has ordinary `elements`; presets are starting arrangements, not persisted slide types.

The canvas is fixed at **1080 × 1920**. Use explicit `frame` coordinates with `x`, `y`, `width`, and `height`; optional rotation and opacity belong in the frame. Important content usually sits within approximately `x: 80–1000` and `y: 120–1720`. These are useful margins, not schema limits. Intentional crops and off-canvas elements are possible. Array order controls back-to-front layering.

Use the existing primitives first:

| Element | Supported use | Design preference |
| --- | --- | --- |
| `text` | Editable text with `headline`, `body`, `caption`, or `label` roles and explicit typography overrides. | Statements, large numbers, direct labels, and short annotations. |
| `shape` | `rectangle`, `circle`, or `line`, with fill and stroke controls. | Rules, meaningful boundaries, highlights, and simple diagram nodes. |
| `arrow` | Straight frame-based line with stroke controls; start cap `none` or `dot`, end cap `none` or `arrow`. | Direction, cause and effect, and precise annotation targets. |
| `chart` | Semantic bar or line chart with data, labels, highlights, value formatting, and optional domain; bars support orientation. | Numeric comparisons or trends that benefit from showing relationships. |
| `image` | Registered PNG, JPEG, WebP, or SVG asset, with `contain` or `cover`, position, and optional flips. | Screenshots, photographs, custom SVG diagrams, and purposeful raster imagery. |
| `video` | Registered MP4 or QuickTime asset through `videoAssets`, with `assetId` and `contain` or `cover`. | A demonstration or evidence that needs motion; avoid decorative background footage. |

There are no native arbitrary paths, Bézier controls, groups, nested components, rich HTML, or per-character text styling. Do not invent element types or unsupported styling fields. Gradients, glows, and rounded-card styling are not native primitive controls; do not add an image merely to imitate them.

## Typography and whitespace

Establish a small type hierarchy for the deck through `theme.fontFamily` and its headline, body, caption, and optional label defaults. Use element overrides when a slide needs a deliberate emphasis. Theme colors and `chartStyle` set the shared visual language; a theme does not determine layout.

Choose a readable font family available in the rendering environment and provide sensible fallbacks. Usually one family and two or three weights are enough. Keep typography consistent across native text and SVG artwork.

Use large, short headlines, often 3–12 words. Prefer a sentence that states the point to a vague category heading. Break lines at meaningful phrases; avoid isolated trailing words. Use size and weight before adding a box, underline, or accent color.

For this canvas, headline sizes around 80–132 and supporting text around 32–44 are useful starting points, not fixed requirements. A single word or number may be much larger. Captions can be smaller, but key information must remain readable when the tall slide is shown at a reduced viewing size. Check actual wrapping and font rendering before finalizing.

Text frames must fit the rendered copy with breathing room. If text overflows, shorten the copy or change the composition before reducing everything to tiny type. Use `lineHeight`, `letterSpacing`, and alignment deliberately; do not rely on rich text or arbitrary CSS.

Build a clear reading path with aligned edges, related spacing, and a few strong scale differences. Default to left alignment for explanatory copy; centered text works for a brief statement or number. Leave substantial empty space around the main idea. Avoid borders and background panels when proximity and alignment already establish the relationship.

Use a restrained palette: a coherent background and foreground, one primary accent, and muted supporting marks. Maintain readable contrast, especially for small labels and charts. Color should indicate emphasis or meaning; pair it with labels, position, or shape so meaning survives without color.

## Choose the simplest visual that explains the point

Start from the communication task, not a template. These compositions use ordinary elements:

| Task | Useful treatment |
| --- | --- |
| State a conclusion | One large phrase with a small supporting label if needed. |
| Make one value memorable | A large number, unit, and short explanation. |
| Compare two things | Two aligned visual clusters with direct labels and the difference made obvious. |
| Explain a mechanism | A few labeled nodes and arrows showing a clear sequence or relationship. |
| Point to evidence | A large screenshot or image with one precise annotation. |
| Explain a trend | One readable semantic chart and a takeaway headline. |
| Develop an idea over time | Continue the same meaningful object or chart across slides, changing emphasis. |

Do not turn every list into a card grid. Try a typographic list, a sequence of labels, two contrasting regions, or separate narration beats when those communicate more clearly.

### Diagrams, arrows, and annotations

Use native text, shapes, and arrows for simple diagrams. Keep the node count low, the reading direction clear, and the labels short. Use consistent strokes and purposeful spacing. A rectangle can identify a system boundary; it should not become a decorative card around every label.

Prefer direct labels next to the object they describe. Use arrows only for a real direction, relationship, or target. Every arrow should have an unambiguous endpoint. Avoid crossing connectors and repeated pointer marks that compete for attention.

For screenshots, crop or frame the relevant area large enough to read. Add a circle, rule, arrow, or short native text label where it directs attention. Use a detail slide when the full interface would make the evidence too small. Preserve the screenshot's factual content and put sources or context in notes as appropriate.

### Charts and large numbers

Use a semantic `chart` element for supported bar and line charts. Keep data, labels, `highlightIds`, `showValues`, formatting, and domains meaningful. A single statistic usually works better as large editable text than a one-bar chart.

Give the chart enough space to read. Use an explicit takeaway, concise labels, restrained grid lines through `theme.chartStyle`, and one emphasis at a time. Prefer direct labels and values over an added legend when the available chart controls and composition allow it. Do not invent unsupported chart options.

Preserve supplied values and units; never invent data for visual balance. Keep comparable scales consistent and avoid misleading domains. If custom SVG is necessary for an unsupported visualization, retain the underlying data and source context in the project or notes, and recognize that the result is an image rather than an editable semantic chart.

## Asset choices: primitives, then SVG, then purposeful raster

Inspect the existing `assets/` files and `imageAssets` registry before creating new assets. Reuse visuals that already fit the story. Keep native text, charts, and simple geometry editable whenever they can express the idea clearly.

**Use custom SVG when primitives are insufficient.** Appropriate reasons include an irregular outline, a curved connector, a subject-specific illustration, or a diagram whose geometry cannot be expressed cleanly with the supported shapes. Compose it with simple paths, restrained fills, consistent strokes, and the deck's palette. Include a suitable `viewBox`, preserve its aspect ratio, and avoid unnecessary detail. Keep the file self-contained with no external image, font, or script dependencies. Put slide headlines and changing labels in native text where practical; SVG content is managed as one image element, without independently editable or revealable internal parts.

**Use generated raster images only when they materially improve the slide.** A specific scene, concrete object, atmosphere essential to the narrative, or subject-specific visual explanation may justify generation. A generic illustration added to fill empty space does not. Existing photographs, screenshots, and assets may already communicate the point better.

Before generation, identify what the image explains, the intended crop and frame, and how it fits the deck's tone. Keep unrelated detail low and leave room for any adjacent typography. Do not ask a generated image to supply precise chart data, interface evidence, labels, or paragraphs that should remain accurate and editable. Inspect the result for factual errors, artifacts, readability, and coherence with the other slides before using it.

Register SVG and raster files the same way: save them below the presentation project's `assets/`, add a unique `imageAssets` entry, and reference its ID from an `image` element. For example:

```json
{
  "id": "process-diagram",
  "name": "Process diagram",
  "mimeType": "image/svg+xml",
  "path": "assets/process-diagram.svg"
}
```

The element uses `assetId: "process-diagram"` and a valid frame and `fit`. Use `contain` for diagrams, logos, and illustrations; use `cover` for photos intended to fill a frame, checking the crop. Do not distort images. Desktop project JSON must use safe project-relative paths, not absolute paths, remote URLs, runtime URLs, or embedded data URLs. Supported MIME types are `image/png`, `image/jpeg`, `image/webp`, and `image/svg+xml`.

The editor's file imports, clipboard image paste, and Finder drops also ingest managed assets. Codex can directly write and register files; no new application asset pipeline is needed. Deleting an image element does not delete its shared asset file, so avoid deleting files still referenced elsewhere. If a video is necessary, register it separately in `videoAssets` with `video/mp4` or `video/quicktime` and the same safe `assets/...` path convention; do not place it in `imageAssets`.

## Consistency across slides

Keep a coherent type hierarchy, palette, margin rhythm, label treatment, stroke language, and image style across the deck. Vary composition to suit the story while preserving those conventions. A statement, screenshot, chart, and diagram should feel like parts of one presentation.

Do not add visible slide numbers, page counters, or repeated section headers to slide canvases unless explicitly requested. Keep navigation indicators in the application UI.

Use repeated layouts when they make a comparison or progression easier to follow. Avoid repetition that merely fills a template. Keep recurring concepts in recognizable positions when helpful, and reserve dramatic changes in scale or color for meaningful changes in the story.

Preserve the presentation ID, slide IDs, narration section IDs and membership, and element IDs when the same content continues. Preserve `sharedElementId`, `chartId`, and datum IDs for their corresponding continuing concepts. Cosmetic edits should not break narration or visual continuity.

## Narration-aware design

Slides support spoken narration. They should give the audience something useful to see while hearing the explanation: evidence, a relationship, a concrete example, or a memorable takeaway. Do not paste a narration script onto the canvas.

Place the spoken explanation, delivery cues, source reminders, and supporting context in slide `notes`. Notes are authoring support; recorded takes and cue timing are managed separately under `narration/`. Keep necessary visible labels, units, and qualifications so the visual remains understandable.

Choose slides as natural narration beats. If the listener needs to understand several separate claims, consider separate slides. If a single idea benefits from successive evidence or labels, use a small reveal sequence within the slide. Avoid unnecessary micro-slides and long slides crowded with all the points the narrator intends to say.

When redesigning an existing deck, preserve narration sections and slide membership unless a story change was requested. Check the visuals against the existing spoken sequence so labels and evidence appear when the narrator discusses them.

## Restrained animation and continuity

Animation should direct attention or clarify continuity. Keep most content immediately visible. Use the existing click-through reveal system for a purposeful staged explanation:

```json
"animation": { "entrance": "fade", "order": 1 }
```

Allowed entrances are `appear`, `fade`, `pop`, `slide-up`, `slide-left`, and `slide-right`. Prefer `appear` or `fade` for quiet editorial reveals; use the others when their motion helps explain direction or fits the requested tone.

- An element without `animation` is visible immediately.
- `order` is a positive integer. Advances consume sorted unique reveal orders before moving to the next slide.
- Elements with the same order enter together. Group a label and the object it explains when they should arrive as one thought.
- Orders need not be contiguous. Keep the sequence short and tied to narration beats.
- Do not author `delayMs`, `durationMs`, exits, keyframes, or custom triggers. The app supplies entrance duration, and the presenter controls reveal timing.

Narration recording stores reveal advances so replay and export reproduce their timing. Silent playback and legacy takes without reveal cues use deterministic fallback timing. Slide `duration` supports silent playback; narrated playback uses recorded cues. Slide transitions use the existing `fade`, `slide`, or `scale` type and their slide-level duration; they are separate from element entrances.

Use Morph only when the audience should recognize the same object moving, resizing, or changing emphasis between slides. Continue compatible elements with the same `sharedElementId`; do not share identities merely because unrelated elements look alike. Continuing charts also need stable `chartId` and datum IDs, with compatible chart type and bar orientation.

An entrance is suppressed when the immediately previous slide has a visible compatible continuing `sharedElementId` or `chartId`. Design the next slide with that element already visible. Usually one or two meaningful continuities are enough; avoid animating every item. Edit mode shows the completed composition, so use Preview Slide or Present mode to inspect the reveal order.

## Authoring and review

1. Read the current project, narration structure, reusable assets, and relevant format guidance.
2. Identify each slide's main idea and what the narrator will explain. Choose the simplest visual treatment that supports it.
3. Establish or preserve the deck's typography, palette, and spacing conventions. Compose with native elements before making new assets.
4. Add custom SVG or purposeful raster assets only where needed, register them, and preserve continuing identities.
5. Inspect slides at presentation size and at a reduced viewing size. Check contrast, wrapping, clipping, crops, chart labels, arrow endpoints, and reading order. Inspect SVGs and generated images as rendered, not only as files or prompts.
6. Review the sequence for consistency and narration pacing. Step through any reveals and Morph transitions; verify that each stage makes sense before the next advance.
7. Run `npm run validate-project -- <project-folder> --strict` for modified presentation projects and resolve errors and meaningful warnings. Validation checks structure and assets; visual review still matters. For repository changes, also follow the build requirement in the repo-level `AGENTS.md`.

Before finishing, remove decoration without a communication purpose, unnecessary containers and icons, redundant visible narration, and motion that distracts from the idea. The final slide should feel intentionally composed, readable, and coherent with its neighbors.
