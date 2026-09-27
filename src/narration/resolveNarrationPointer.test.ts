import { describe, expect, it } from 'vitest'
import type { NarrationPointerSample } from './narrationTypes'
import {
  NARRATION_POINTER_FADE_END_MS,
  NARRATION_POINTER_FADE_IN_MS,
  NARRATION_POINTER_FULLY_VISIBLE_MS,
  resolveNarrationPointerAtTime,
} from './resolveNarrationPointer'

function sample(
  timeMs: number,
  x: number,
  y: number,
  visible = true,
  sceneId = 'one',
): NarrationPointerSample {
  return { timeMs, sceneId, x, y, visible }
}

describe('resolveNarrationPointerAtTime', () => {
  it('hides missing and empty tracks', () => {
    expect(resolveNarrationPointerAtTime(undefined, 0, 'one')).toBeNull()
    expect(resolveNarrationPointerAtTime([], 0, 'one')).toBeNull()
  })

  it('shows a visible sample at its normalized position only on its scene', () => {
    const track = [sample(100, 0.25, 0.75)]
    expect(resolveNarrationPointerAtTime(track, 100, 'one')).toEqual({
      x: 0.25,
      y: 0.75,
      opacity: 0,
    })
    expect(resolveNarrationPointerAtTime(track, 100, 'two')).toBeNull()
  })

  it('honors an explicit hide until a later visible sample', () => {
    const track = [
      sample(0, 0.1, 0.2),
      sample(200, 0.1, 0.2, false),
      sample(400, 0.7, 0.8),
    ]
    expect(resolveNarrationPointerAtTime(track, 300, 'one')).toBeNull()
    expect(resolveNarrationPointerAtTime(track, 400, 'one')).toEqual({
      x: 0.7,
      y: 0.8,
      opacity: 0,
    })
  })

  it('stays opaque, fades linearly, then disappears after inactivity', () => {
    const track = [sample(100, 0.3, 0.4)]
    expect(resolveNarrationPointerAtTime(
      track,
      100 + NARRATION_POINTER_FULLY_VISIBLE_MS,
      'one',
    )?.opacity).toBe(1)
    expect(resolveNarrationPointerAtTime(track, 750, 'one')?.opacity).toBeCloseTo(0.5)
    expect(resolveNarrationPointerAtTime(
      track,
      100 + NARRATION_POINTER_FADE_END_MS,
      'one',
    )).toBeNull()
  })

  it('fades in once per visible run without pulsing on each movement sample', () => {
    const track = [sample(100, 0.1, 0.2), sample(160, 0.2, 0.3), sample(220, 0.3, 0.4)]
    expect(resolveNarrationPointerAtTime(track, 100, 'one')?.opacity).toBe(0)
    expect(resolveNarrationPointerAtTime(track, 100 + NARRATION_POINTER_FADE_IN_MS / 2, 'one')?.opacity).toBeCloseTo(0.5)
    expect(resolveNarrationPointerAtTime(track, 100 + NARRATION_POINTER_FADE_IN_MS, 'one')?.opacity).toBe(1)
    expect(resolveNarrationPointerAtTime(track, 220, 'one')?.opacity).toBeCloseTo(120 / NARRATION_POINTER_FADE_IN_MS)
  })

  it('fades in again after a hide, inactivity, or a slide change', () => {
    const track = [
      sample(0, 0.1, 0.2),
      sample(300, 0.1, 0.2, false),
      sample(400, 0.2, 0.3),
      sample(1300, 0.3, 0.4),
      sample(1600, 0.5, 0.6, true, 'two'),
    ]
    expect(resolveNarrationPointerAtTime(track, 490, 'one')?.opacity).toBeCloseTo(0.5)
    expect(resolveNarrationPointerAtTime(track, 1300, 'one')?.opacity).toBe(0)
    expect(resolveNarrationPointerAtTime(track, 1390, 'one')?.opacity).toBeCloseTo(0.5)
    expect(resolveNarrationPointerAtTime(track, 1600, 'two')?.opacity).toBe(0)
    expect(resolveNarrationPointerAtTime(track, 1690, 'two')?.opacity).toBeCloseTo(0.5)
    expect(resolveNarrationPointerAtTime(track, 490, 'one')?.opacity).toBeCloseTo(0.5)
  })

  it('interpolates only between nearby compatible visible samples', () => {
    expect(resolveNarrationPointerAtTime([
      sample(100, 0, 0),
      sample(200, 1, 1),
    ], 150, 'one')).toEqual({ x: 0.5, y: 0.5, opacity: 50 / NARRATION_POINTER_FADE_IN_MS })

    expect(resolveNarrationPointerAtTime([
      sample(100, 0, 0),
      sample(150, 0, 0, false),
    ], 125, 'one')).toMatchObject({ x: 0, y: 0 })
    expect(resolveNarrationPointerAtTime([
      sample(100, 0, 0),
      sample(150, 1, 1, true, 'two'),
    ], 125, 'one')).toMatchObject({ x: 0, y: 0 })
    expect(resolveNarrationPointerAtTime([
      sample(100, 0, 0),
      sample(201, 1, 1),
    ], 150, 'one')).toMatchObject({ x: 0, y: 0 })
  })

  it('returns the correct historical state when seeking backward', () => {
    const track = [
      sample(100, 0.1, 0.2),
      sample(200, 0.2, 0.3, false),
      sample(400, 0.8, 0.9),
    ]
    expect(resolveNarrationPointerAtTime(track, 450, 'one')).toMatchObject({ x: 0.8, y: 0.9 })
    expect(resolveNarrationPointerAtTime(track, 250, 'one')).toBeNull()
    expect(resolveNarrationPointerAtTime(track, 100, 'one')).toMatchObject({ x: 0.1, y: 0.2 })
  })

  it('normalizes ordering and safely ignores malformed visible samples', () => {
    const track = [
      sample(200, 0.8, 0.9),
      { ...sample(150, 0.4, 0.5), x: Number.NaN },
      sample(100, 0.1, 0.2),
    ]
    expect(resolveNarrationPointerAtTime(track, 100, 'one')).toMatchObject({ x: 0.1, y: 0.2 })
    expect(resolveNarrationPointerAtTime(track, 200, 'one')).toMatchObject({ x: 0.8, y: 0.9 })
  })
})
