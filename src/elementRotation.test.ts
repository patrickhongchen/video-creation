import { describe, expect, it } from 'vitest'
import { normalizedRotation, rotationFromPointerAngles } from './elementRotation'

const radians = (degrees: number) => degrees * Math.PI / 180

describe('element rotation', () => {
  it('normalizes rotations to the shared -180 through 180 convention', () => {
    expect(normalizedRotation(180)).toBe(-180)
    expect(normalizedRotation(540)).toBe(-180)
    expect(normalizedRotation(-181)).toBe(179)
    expect(normalizedRotation(1080)).toBe(0)
  })

  it('keeps pointer rotation continuous across the angle boundary', () => {
    expect(rotationFromPointerAngles(10, radians(179), radians(-179), false)).toBeCloseTo(12)
    expect(rotationFromPointerAngles(-10, radians(-179), radians(179), false)).toBeCloseTo(-12)
  })

  it('snaps the resulting rotation to exact 15 degree increments', () => {
    expect(rotationFromPointerAngles(4, radians(0), radians(8), true)).toBe(15)
    expect(rotationFromPointerAngles(-4, radians(0), radians(-8), true)).toBe(-15)
  })
})
