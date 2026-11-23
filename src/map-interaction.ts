export interface PointerGesture {
  pointerId: number
  originX: number
  originY: number
  lastX: number
  lastY: number
  maxDistance: number
  dragged: boolean
}

/** 记录主指针按下位置，供整个手势累计判定。 */
export function startGesture(pointerId: number, x: number, y: number): PointerGesture {
  return { pointerId, originX: x, originY: y, lastX: x, lastY: y, maxDistance: 0, dragged: false }
}

/** 只更新活动指针并保持已经触发的拖动标记。 */
export function advanceGesture(gesture: PointerGesture, pointerId: number, x: number, y: number): { gesture: PointerGesture; dx: number; dy: number } | null {
  if (gesture.pointerId !== pointerId) return null
  const maxDistance = Math.max(gesture.maxDistance, Math.hypot(x - gesture.originX, y - gesture.originY))
  return {
    gesture: { ...gesture, lastX: x, lastY: y, maxDistance, dragged: gesture.dragged || maxDistance > 5 },
    dx: x - gesture.lastX,
    dy: y - gesture.lastY,
  }
}

/** 根据视口与世界范围计算全图适配下限。 */
export function fitZoom(width: number, height: number, worldWidth: number, worldHeight: number): number {
  return Math.min(1.2, Math.max(80, width - 60) / worldWidth, Math.max(80, height - 155) / worldHeight)
}

/** 将任意缩放值限制在全图适配下限与统一上限内。 */
export function clampZoom(zoom: number, minimum: number): number {
  return Math.max(minimum, Math.min(zoom, 7))
}
