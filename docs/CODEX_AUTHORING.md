# Authoring presentations with Codex

This is a working guide for an agent editing a presentation Project. The target is a clear, varied presentation that a person can review, narrate, and export, rather than a document placed on a tall canvas.

## Project model

- `presentation.json` is the source of truth.
- `assets/` holds portable visual files. Register each image with a project-relative `assets/...` path.
- The canvas is `1080 × 1920`. Slides are the presentation timeline; elements are the visual content.
- A presentation has normal Slides containing `text`, `image`, `chart`, `shape`, and `arrow` elements. Recipes below are composition ideas, never new schema or renderer types.

Read the current JSON and inspect `assets/` before changing anything. Preserve the presentation ID, slide IDs, narration section IDs, element IDs, `sharedElementId`, `chartId`, and datum IDs whenever the same concept remains. Do not change narration sections during a visual redesign unless asked.

## Workflow

1. Understand the audience, subject, tone, length, and desired conclusion.
2. Inspect the existing presentation and reusable assets.
3. Write a slide-by-slide narrative outline before placing detailed elements.
4. Give every slide one main communication idea and choose the simplest useful visual treatment.
5. Compose the slides with explicit frames, then add useful notes and intentional Morph continuity.
6. Check the whole sequence for rhythm and variation. A repeated layout is useful only when it communicates a deliberate progression.
7. Write related assets and JSON close together, keep JSON valid when possible, then run `npm run validate-project -- <project-folder> --strict` and fix errors and meaningful warnings. AI Presentation Studio automatically detects and loads stable valid changes in an open, clean Project; do not try to trigger Reload from Codex.

The app keeps the last valid deck open during invalid intermediate writes. Unsaved edits in the app block automatic replacement and leave an external update pending. Present mode, Narration Studio, and Final Video defer updates until Edit mode. **Reload Project** remains available as a manual fallback or explicit discard and reload.

## Composition and hierarchy

Choose what the viewer sees first. A typical slide has one dominant element, one to three supporting elements, and perhaps a small annotation. Dominance can come from scale, contrast, placement, or whitespace.

Use the full canvas deliberately. Important content usually fits comfortably within `x: 80–1000` and `y: 120–1720`, but intentional crops, overlap, off-canvas images, asymmetry, and empty space are useful design tools. Do not fill every corner or force a corporate grid.

Keep visible copy presentation-like: a 3–12 word headline, short labels, and short annotations. A paragraph usually belongs in `notes`, where it can carry the narration suggestion, source reminder, pronunciation, delivery cue, or supporting context. Use body text when it is truly the visual point, not as a substitute for planning.

## Recipes

Use these as starting points and freely combine them.

| Communication goal | Composition |
| --- | --- |
| Dramatic statement | Huge phrase plus a small label or source. |
| Big number | Large statistic, one short explanation, generous space. |
| Image beat | One readable image, often with no additional copy beyond a caption. |
| Two-image comparison | Two large image clusters with concise labels. |
| Explain a mechanism | Illustration or image, arrow, and one short annotation. |
| Evidence | One semantic chart and a clear written takeaway. |
| Before / after | Two visual clusters, with the difference obvious at a glance. |
| Visual joke / pause | A simple image or illustration plus a short caption. |
| Playful explanation | Stick figure or icon on one side, arrow toward a chart or consequence, and a tiny comment such as “well, that’s not ideal.” |
| Screenshot annotation | Large screenshot, circle or arrow, and a small sarcastic or explanatory caption. |
| Unexpected connection | Two apparently unrelated images linked by one short phrase. |
| Continuation / Morph | Keep one or two shared identities, move or resize them, and introduce one new concept. |

For a chart progression, show the full chart on Slide A, highlight one datum on Slide B, then shift emphasis on Slide C. Keep its chart and datum IDs stable. These are three ordinary Slides, not keyframes or a special chart-slide type.

For a sequence, vary the treatment to fit the story: huge statement, image beat, annotated image, evidence chart, chart continuation, visual pause, comparison, simple conclusion. Variety should create pacing, not randomness.

## Images, charts, and themes

Prefer one strong image over several tiny decorative ones. Use `cover` for photos filling a frame and `contain` for illustrations, logos, and transparent SVGs. Do not distort an image. Reuse an existing asset instead of adding a duplicate, and keep asset paths under `assets/`.

Use a chart when a numeric relationship matters. A single memorable value such as `42%` is usually a big number, not a one-bar chart. Charts stay semantic: retain their data, labels, highlights, formatting, domains, and IDs rather than drawing chart marks as shapes.

Chart storytelling works especially well across slides: show all values; continue the same chart with one datum highlighted; continue it again with a new emphasis. Keep the same `chartId`, datum IDs, and (when the frame continues) `sharedElementId`.

Theme controls personality, not layout. Select a coherent background, foreground, accent, font family, role defaults, and chart foreground/muted/grid colors. Every slide can still use a different composition.

```jsonc
// Minimal: quiet, high contrast
{ "background": "#f7f4ed", "foreground": "#1c1b18", "accent": "#5b6cff", "fontFamily": "Inter, system-ui, sans-serif" }
// Playful: warm, bold, informal
{ "background": "#fff3c7", "foreground": "#2c2840", "accent": "#ff5b52", "fontFamily": "Arial Rounded MT Bold, system-ui, sans-serif" }
// Dark: cinematic, restrained
{ "background": "#10131b", "foreground": "#f4f1e8", "accent": "#e7ff5b", "fontFamily": "Inter, system-ui, sans-serif" }
// Notebook: casual and legible
{ "background": "#f7f6f0", "foreground": "#26344a", "accent": "#1d77c9", "fontFamily": "Georgia, serif" }
```

The snippets are JSONC for readability; remove comments when placing values in `presentation.json`. Each fragment still needs valid role styles and `chartStyle` in a complete theme. Editorial is a strong neutral default.

## Facts and assets

Preserve supplied facts and sourced values. Do not invent chart numbers for visual balance. If the user asks for example data, label it illustrative in visible copy or notes. Place a source reminder in notes when a claim needs later verification. This workflow does not turn the app into a research system.

Inspect both `assets/` and `imageAssets` before creating a file. Reuse registered visuals where they fit; avoid near-duplicate filenames. Final Projects should not rely on remote image URLs. Keep required bytes under `assets/` so export stays deterministic.

## Morph and narration

Slides are the animation timeline. To make something move, continue it on the next slide and give compatible elements the same `sharedElementId`. Use this only when the viewer should perceive the same thing moving or changing: a headline moves up, a photo shrinks, a statistic moves to a corner, a stick figure walks, or a chart grows.

Usually continue one or two concepts and introduce new information around them. Do not assign shared identities merely because elements look similar, and do not make every item Morph. For continuing charts, `sharedElementId`, `chartId`, and datum IDs serve separate roles and may all need preservation.

Slides should be natural narration beats. Avoid both unnecessary micro-slides and slides carrying many talking points. Put the spoken explanation and source reminders in `notes`; do not turn a narration script into visible text.

## Prompt patterns

**Create:** “Create an 8-slide presentation explaining why movie theaters are declining for a general audience. Make it playful and conversational. Keep visible text minimal, use charts only when the numbers add understanding, and include a few humorous visual beats. Add useful speaker notes. Reuse assets where appropriate, add new files under `assets/`, and run the Project validator before finishing.”

**Redesign:** “Redesign Slides 4–6 to be more playful and easier to understand. Keep all factual content, Slide IDs, narration section membership, chart identities, datum IDs, and shared identities where concepts continue. You may reposition, resize, add, or remove visual elements. Preserve useful asset references and validate before finishing.”

**Make more visual:** “Find Slides that rely too heavily on text. Communicate the same facts using existing images, charts, shapes, arrows, and larger typography. Keep notes for spoken explanation. Preserve narration Slide IDs unless the story structure truly changes.”

**Make more playful:** “Use asymmetry, scale contrast, occasional rotation, simple illustrations, arrows, and short humorous captions where they clarify the point. Keep the sequence coherent and uncluttered; do not repeat one layout on every Slide.”

## Anti-patterns

- Writing a document with a headline, paragraph, three charts, two statistics, four images, and five callouts on one slide.
- Repeating headline-at-top plus asset-in-middle on every slide.
- Using a chart because data exists when one large number says more.
- Treating theme choice as a layout template.
- Replacing stable IDs during a cosmetic revision and breaking narration or Morph.
- Adding absolute paths, data URLs, or unregistered image files to a desktop project.
- Using a shared identity for every element, creating constant meaningless motion.
- Adding tiny charts or decorative images that cannot be read at presentation size.
- Using arrows without a clear target, or placing many competing elements over one another.
- Splitting one beat across needless micro-Slides, or forcing several beats onto one crowded Slide.

## Finish checklist

- The story has a clear opening, development, and conclusion.
- Each slide has one main idea and a deliberate dominant element.
- Visible copy is short; explanation, sources, and delivery cues live in notes.
- Layouts vary with the narrative and leave intentional whitespace.
- Image assets are readable, registered, and project-relative.
- Charts are semantic and continuing charts preserve their identities.
- Morph expresses real continuity and is restrained.
- Existing IDs and narration structure survive where concepts survive.
- Validation passes and warnings have been reviewed.
