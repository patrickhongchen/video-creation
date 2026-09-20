# Video Essay Studio — Phase 1

An editorial, data-driven presentation engine for vertical short-form video essays. This phase includes a seven-scene demo, typed scene renderers, animated transitions, Morph-style shared elements, a text inspector, speaker notes, local persistence, and a keyboard-driven presentation mode.

## Run it

```bash
npm install
npm run dev
```

Create a production build with `npm run build`.

## Architecture

- `src/model.ts` defines the `Presentation` model and discriminated `Scene` union.
- `src/demoPresentation.ts` contains presentation content only—no JSX or HTML.
- `src/scenes/SceneRenderers.tsx` contains one renderer per scene type and the renderer registry.
- `src/components/Stage.tsx` is the single presentation surface used by both editor and Present mode. It owns scene transitions and the shared `LayoutGroup`.
- `src/components/Inspector.tsx` edits each scene type's major text fields, transition, duration, and notes.
- `src/App.tsx` owns selection, keyboard navigation, presentation mode, and `localStorage` persistence.

## Presentation schema

Every presentation has an ID, title, 9:16 aspect ratio, accent color, and ordered scenes. All scene types share:

```ts
{
  id: string
  type: 'title' | 'text' | 'big-stat' | 'comparison' | 'stat-detail'
  title: string
  duration: number
  notes?: string
  eyebrow?: string
  transition: { type: 'fade' | 'slide' | 'scale'; duration: number }
}
```

The discriminated `type` selects the rest of the required fields. For example, `big-stat` requires `value` and `label`, while `comparison` requires `left` and `right` items. See `src/model.ts` for the full definitions.

### Shared-element / Morph identity

A renderable concept may carry an `elementId` in presentation data. Consecutive renderers pass that ID to Motion as a namespaced `layoutId`:

```ts
layoutId = `presentation-${presentation.id}:${scene.elementId}`
```

Scenes `stat-reveal` and `stat-context` both reference `theater-decline-stat`, so the statistic moves and resizes between layouts. Stable IDs are essential: generating a new ID on each render—or reusing one for unrelated simultaneous elements—breaks the Morph relationship. The presentation namespace prevents collisions when multiple documents are eventually mounted together.

## Add a scene type

1. Add a new scene interface and include it in the `Scene` union in `src/model.ts`.
2. Add its renderer to `src/scenes/SceneRenderers.tsx` and register it in `sceneRendererRegistry`. The mapped registry type makes omissions a TypeScript error.
3. Add fields for the new discriminator in `src/components/Inspector.tsx`.
4. Add demo data (or load equivalent project data) without putting markup in the presentation.

The Stage, navigation, persistence, notes, transition selection, and Present mode then work without changes.

## Current boundaries

There is intentionally no freeform positioning, timeline, recording, media upload, backend, export, or AI integration. Persistence is a single browser-local document. Morph support currently proves shared identity and layout interpolation; a future composition model can generalize persistent elements beyond the statistic examples while preserving the same `elementId` contract.
