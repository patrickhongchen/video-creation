const ROTATION_SNAP_INCREMENT = 15

export function normalizedRotation(value: number) {
  return ((value + 180) % 360 + 360) % 360 - 180
}

export function rotationFromPointerAngles(
  startingRotation: number,
  startingPointerAngle: number,
  currentPointerAngle: number,
  snapToIncrement: boolean,
) {
  const angleDelta = (currentPointerAngle - startingPointerAngle) * 180 / Math.PI
  const rotation = normalizedRotation(startingRotation + angleDelta)
  return snapToIncrement
    ? normalizedRotation(Math.round(rotation / ROTATION_SNAP_INCREMENT) * ROTATION_SNAP_INCREMENT)
    : rotation
}
