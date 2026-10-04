# Visual design for presentations

Read and follow this guide before creating or modifying presentations, slides, SVG assets, diagrams, charts, visual annotations, or generated presentation imagery. It governs visual authoring; it does not require changes to application behavior or UI.

Use [PRESENTATION_FORMAT.md](PRESENTATION_FORMAT.md) for the schema and [CODEX_AUTHORING.md](CODEX_AUTHORING.md) for project authoring and validation. The current model in [src/model.ts](../src/model.ts), renderer in [CompositionSceneRenderer.tsx](../src/scenes/CompositionSceneRenderer.tsx), asset validation in [presentationValidation.ts](../src/presentationValidation.ts), and reveal rules in [entranceAnimation.ts](../src/entranceAnimation.ts) also inform this guide. The format and authoring docs currently omit the implemented `video` element; it is included below. User-supplied brand rules, references, and explicit style requests should shape the result while preserving clarity and supported presentation structure.

## Design intent

Aim for visually clean, editorial, human-designed slides. Every visual choice should help the audience understand a claim, follow a relationship, examine evidence, or remember a useful idea. Use intentional composition, strong focal points, and purposeful whitespace, with layouts suited to each idea.

Give each slide one main communication task and one clear visual focal point. Make the main idea recognizable before the audience reads the small text. A large number, an annotated screenshot, a readable chart, or a simple diagram can carry a complete slide. Keep visible text lean: retain necessary headlines, labels, units, qualifications, and evidence, and put fuller explanations in speaker notes. Do not fill space just because it is available.

Omit generic bottom takeaway callouts, motivational summaries, and slogan-like conclusions unless explicitly requested. Use concrete, specific copy that supports the evidence; avoid generic AI-looking imagery and formulaic AI copy.

Avoid generic AI-presentation aesthetics as defaults:

- Repeated card grids and excessive rounded rectangles around unrelated content.
- Gradients, glowing elements, decorative blobs, floating ornaments, and elaborate backgrounds.
- Generic AI illustrations, stock technology metaphors, and meaningless futuristic imagery.
- Unnecessary icons next to every heading, label, or bullet.
- Many badges, pills, borders, callout containers, and competing accent colors.
- A headline, paragraph, and three identical boxes repeated on every slide.

Use a container only when its boundary communicates something, such as a system, region, or grouping. Use an icon only when it identifies something faster or more clearly than a short label. A subject-specific illustration or requested playful tone can be appropriate; keep its purpose and visual language deliberate.

## Slide copy: natural, specific, and brief

Write like a person explaining the subject to an audience. Use familiar words and name the actual topic, action, or observation. Avoid abstract slogans, dramatic fragments, forced metaphors, motivational language, and polished phrases that could fit almost any presentation. Do not make a heading sound profound at the expense of clarity.

A plain topic heading is appropriate when the visual supplies the explanation. Use a direct claim when the slide supports that claim, or a straightforward question when it reflects a real audience question. Do not force every heading into a takeaway sentence or rhetorical question.

Examples from the calorie presentation:

| Avoid | Prefer |
| --- | --- |
| “Precision has a cost” | “How much should you track?” |
| “Let reality close the loop” | “Weight trends over time” |
| “A moving range. Not one fixed daily number.” | Omit the bottom callout; let the chart show the range. |

These examples illustrate the tone, not a set of phrases to reuse across decks. Avoid formulaic contrasts such as “Not X. Y.” and repeated two-line declarations. Keep chart labels literal: describe what is measured, show the units, and distinguish examples and estimates from observed data. Preserve necessary qualifications without adding a paragraph of explanation.

Reduce text by removing repeated explanations and unnecessary commentary before shortening useful labels. Do not automatically add a closing slogan or bottom summary to every slide. Keep the story and evidence intact, and move detail that belongs in the spoken explanation to notes.

Before finishing, read the visible copy aloud. Replace wording that sounds like marketing copy or an AI-generated maxim with the phrase you would naturally use to explain that specific visual. Check that the shorter wording still conveys the intended meaning and degree of certainty.

## Work within the actual presentation model

The canonical desktop project is a folder containing `presentation.json`, portable visual files under `assets/`, and optional recorded narration under `narration/`. New presentations use `schemaVersion: 2`, `aspectRatio: "9:16"`, and a `slides` array. Each slide has ordinary `elements`; presets are starting arrangements, not persisted slide types.

The canvas is fixed at **1080 × 1920**. Use explicit `frame` coordinates with `x`, `y`, `width`, and `height`; optional rotation and opacity belong in the frame. TikTok is the default publishing destination for this project: place important content inside the working safe area below. These are authoring margins, not schema limits. Backgrounds and intentional crops can extend across the full canvas. Array order controls back-to-front layering.

### TikTok overlays and working safe area

Compose for the video as it appears in the TikTok feed, with app controls over it. Use the supplied For You feed screenshot as the reference: keep material below the navigation/search row, left of the profile/heart/comment/save/share/sound action rail, and above the account name and video title/description block. The narration subtitle box belongs immediately above that bottom text block and left of the action rail. Essential text, chart labels, annotation targets, faces, and evidence must remain readable with these regions covered.

Use these approximate **project defaults**, based on that reference, on the 1080 × 1920 canvas. They include a small gap from the visible controls without reserving a full bottom quarter:

| Region | Coordinates | Purpose |
| --- | --- | --- |
| Main slide content | `x: 60–920`, `y: 270–1540` | Headlines, charts, labels, diagrams, and essential image details. Maximum width: 860 px. |
| Narration caption band | `x: 60–920`, `y: 1560–1720` | Subtitles immediately above the account/title block. Keep slide content out of this band when captions are used. |
| Top reserve | `y: 0–270` | Navigation/search row, with a small gap below it. |
| Right reserve | `x: 920–1080` | Action rail, with a small gap to its left. |
| Bottom reserve | `y: 1720–1920` | Account name, title/description, and sound attribution. |
| Left margin | `x: 0–60` | Edge/crop breathing room. |

The overall working safe rectangle is `{ "x": 60, "y": 270, "width": 860, "height": 1450 }`. Center important compositions within this rectangle (horizontal center `x: 490`), rather than the full frame. If subtitles are not used, main content may extend to `y: 1720`. Frame boundaries alone are insufficient: keep rendered labels, arrowheads, and meaningful image details inside the area too.

Generated captions use this 860 px maximum width, with their bottom edge at `y: 1720` (about 10.4% above the video bottom), in take preview, final preview, and export. They are centered within the available width, with about 14.8% of the frame kept clear on the right. Keep the compact typography readable and aim for one or two lines. Longer segments grow upward: review the longest captions against the actual slide and leave more space above the band where needed. Do not clip subtitles or shrink them until they become unreadable.

When adapting a phone screenshot, identify the video display area first. The example's black Home/Friends/create/Inbox/Profile bar is app chrome below the video; do not count its height as an additional reserve inside the exported video. A phone screenshot also has a different aspect ratio from the 9:16 export, and TikTok may crop or scale playback. Measure the visible overlay edges relative to the video area and check the actual upload rather than mapping the entire phone screenshot directly to 1080 × 1920.

These coordinates are our working policy, not official universal TikTok pixel limits. [TikTok's official safe-zone guidance](https://ads.tiktok.com/resources/help/article/tiktok-auction-in-feed-ads?lang=en) is for in-feed ads and says the available area depends on dimensions, description length, and additional formats; preview and live display can differ by device. Use it as a reference for organic posts, then check a representative upload in the actual feed with the intended description. Ads, Shop links, expanded descriptions, and other extra overlays may require more room.

Use the outer regions for backgrounds or nonessential image texture. Recompose within the smaller area instead of uniformly shrinking a full-frame layout: shorten headlines, simplify charts, crop screenshots to the evidence, and split crowded ideas across slides. Preserve useful type hierarchy and whitespace. Do not draw safe-area boxes or imitate TikTok controls in the exported video. Existing slides are not automatically repositioned by this policy; apply it when authoring or revising their composition.

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

Choose a coherent, readable font family available in the rendering environment and provide sensible fallbacks. Usually one family and a restrained set of weights are enough. Keep typography consistent across native text and SVG artwork. Give changes in size, weight, or color a clear purpose, and preserve useful hierarchy when redesigning. Do not default to making everything Arial or flattening all text to neutral colors.

Use large, short headlines, often 3–12 words. Choose a clear topic heading, a specific supported claim, or a natural audience question; avoid vague category labels and slogan-like statements. Break lines at meaningful phrases; avoid isolated trailing words. Use size and weight before adding a box, underline, or accent color.

For this canvas, headline sizes around 80–132 and supporting text around 32–44 are useful starting points, not fixed requirements. There is no fixed maximum of three font sizes or minimum size of 40. Choose sizes for readability, hierarchy, and the actual canvas. A single word or number may be much larger. Captions can be smaller, but key information must remain readable when the tall slide is shown at a reduced viewing size. Check actual wrapping and font rendering before finalizing.

Text frames must fit the rendered copy with breathing room. If text overflows, shorten the copy or change the composition before reducing everything to tiny type. Use `lineHeight`, `letterSpacing`, and alignment deliberately; do not rely on rich text or arbitrary CSS.

Build a clear reading path with aligned edges, related spacing, and a few strong scale differences. Default to left alignment for explanatory copy; centered text works for a brief statement or number. Leave substantial empty space around the main idea. Avoid borders and background panels when proximity and alignment already establish the relationship.

Use a limited, coherent palette with restrained accents and supporting marks. Preserve meaningful chart colors and use distinct colors where they identify data series, categories, or emphasis. Maintain readable contrast, especially for small labels and charts. Color should indicate emphasis or meaning; pair it with labels, position, or shape so meaning survives without color.

## Choose the simplest visual that explains the point

Start from the communication task, not a template. Prefer concrete visual explanations, readable charts, comparisons, and diagrams over lists of statements. These compositions use ordinary elements:

| Task | Useful treatment |
| --- | --- |
| State an evidence-based conclusion | One concise, specific claim supported by a relevant value or visual. |
| Make one value memorable | A large number, unit, and short explanation. |
| Compare two things | Two aligned visual clusters with direct labels and the difference made obvious. |
| Explain a mechanism | A few labeled nodes and arrows showing a clear sequence or relationship. |
| Point to evidence | A large screenshot or image with one precise annotation. |
| Explain a trend | One readable semantic chart and a concise headline stating the observed trend. |
| Develop an idea over time | Continue the same meaningful object or chart across slides, changing emphasis. |

Use a list only when the items themselves are the point, and do not turn every list into a card grid. Otherwise, show the relationship through a comparison, sequence, chart, or diagram, with supporting statements in notes.

### Diagrams, arrows, and annotations

Use native text, shapes, and arrows for simple diagrams. Keep the node count low, the reading direction clear, and the labels short. Use consistent strokes and purposeful spacing. A rectangle can identify a system boundary; it should not become a decorative card around every label.

Prefer direct labels next to the object they describe. Use arrows only for a real direction, relationship, or target. Every arrow should have an unambiguous endpoint. Avoid crossing connectors and repeated pointer marks that compete for attention.

For screenshots, crop or frame the relevant area large enough to read. Add a circle, rule, arrow, or short native text label where it directs attention. Use a detail slide when the full interface would make the evidence too small. Preserve the screenshot's factual content and put sources or context in notes as appropriate.

### Charts and large numbers

Use a semantic `chart` element for supported bar and line charts. Keep data, labels, `highlightIds`, `showValues`, formatting, and domains meaningful. A single statistic usually works better as large editable text than a one-bar chart.

Give the chart enough space to read. Make the relevant comparison or trend clear through composition, a concise headline, labels, and purposeful emphasis. Use restrained grid lines through `theme.chartStyle` and preserve meaningful series and category colors. Prefer direct labels and values over an added legend when the available chart controls and composition allow it. Do not invent unsupported chart options.

Preserve supplied values and units; never invent data for visual balance. Keep comparable scales consistent and avoid misleading domains. If custom SVG is necessary for an unsupported visualization, retain the underlying data and source context in the project or notes, and recognize that the result is an image rather than an editable semantic chart.

## Asset choices: primitives, then SVG, then purposeful raster

Inspect the existing `assets/` files and `imageAssets` registry before creating new assets. Reuse visuals that already fit the story. Keep native text, charts, and simple geometry editable whenever they can express the idea clearly.

**Use custom SVG when primitives are insufficient.** Appropriate reasons include an irregular outline, a curved connector, a subject-specific illustration, or a diagram whose geometry cannot be expressed cleanly with the supported shapes. Compose it with simple paths, restrained fills, consistent strokes, and the deck's palette. Include a suitable `viewBox`, preserve its aspect ratio, and avoid unnecessary detail. Keep the file self-contained with no external image, font, or script dependencies. Put slide headlines and changing labels in native text where practical; SVG content is managed as one image element, without independently editable or revealable internal parts.

**Use ImageGen only for purposeful icons or stylized graphics.** Do not generate realistic photographs of food, objects, or people. Avoid generic AI-looking imagery and graphics added merely to fill empty space. Reuse existing photographs, screenshots, and assets when they communicate the point; prefer native primitives or SVG for visuals they can express clearly.

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

Do not add visible slide numbers, page counters, repeated section headers, or small footers to slide canvases unless explicitly requested. Keep navigation indicators in the application UI.

Use repeated layouts when they make a comparison or progression easier to follow. Avoid repetition that merely fills a template. Keep recurring concepts in recognizable positions when helpful, and reserve dramatic changes in scale or color for meaningful changes in the story.

Preserve the presentation ID, slide IDs, narration section IDs and membership, and element IDs when the same content continues. Preserve `sharedElementId`, `chartId`, and datum IDs for their corresponding continuing concepts. Cosmetic edits should not break narration or visual continuity.

## Narration-aware design

Slides support spoken narration. They should give the audience something useful to see while hearing the explanation: evidence, a relationship, a concrete example, or a meaningful comparison. Do not paste a narration script onto the canvas.

Place the spoken explanation, delivery cues, source reminders, and supporting context in slide `notes`. Notes are authoring support; recorded takes and cue timing are managed separately under `narration/`. Keep necessary visible labels, units, and qualifications so the visual remains understandable.

Choose slides as natural narration beats. If the listener needs to understand several separate claims, consider separate slides. If a single idea benefits from successive evidence or labels, use a small reveal sequence within the slide. Avoid unnecessary micro-slides and long slides crowded with all the points the narrator intends to say.

When redesigning an existing deck, preserve the story and supplied data while improving composition and visualization. Preserve narration sections and slide membership unless a story change was requested. Check the visuals against the existing spoken sequence so labels and evidence appear when the narrator discusses them.

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
5. Inspect slides at presentation size and at a reduced viewing size. Check contrast, wrapping, clipping, crops, chart labels, arrow endpoints, and reading order. For TikTok, review with the top, right, and bottom reserves covered and with a long narration caption visible; essential content must remain clear. Check a representative upload in the actual feed with the intended description. Inspect SVGs and generated images as rendered, not only as files or prompts.
6. Read the visible copy aloud for natural, specific wording, and remove redundant callouts. Review the sequence for consistency and narration pacing. Step through any reveals and Morph transitions; verify that each stage makes sense before the next advance.
7. Run `npm run validate-project -- <project-folder> --strict` for modified presentation projects and resolve errors and meaningful warnings. Validation checks structure and assets; visual review still matters. For repository changes, also follow the build requirement in the repo-level `AGENTS.md`.

Before finishing, remove decoration without a communication purpose, unnecessary containers and icons, redundant visible narration, and motion that distracts from the idea. The final slide should feel intentionally composed, readable, and coherent with its neighbors.
