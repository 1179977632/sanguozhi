import assert from 'node:assert/strict'
import test from 'node:test'
import { advanceGesture, clampZoom, fitZoom, startGesture } from '../src/map-interaction.ts'

test('慢速连续移动累计超过阈值后不再是点击', () => {
  let gesture = startGesture(1, 100, 100)
  for (let x = 101; x <= 106; x++) {
    gesture = advanceGesture(gesture, 1, x, 100)!.gesture
  }
  assert.equal(gesture.dragged, true)
})

test('轻微抖动仍是点击且越界后返回不会清除拖动', () => {
  const initial = startGesture(1, 100, 100)
  assert.equal(advanceGesture(initial, 1, 103, 104)!.gesture.dragged, false)
  const moved = advanceGesture(initial, 1, 106, 100)!.gesture
  assert.equal(advanceGesture(moved, 1, 100, 100)!.gesture.dragged, true)
})

test('非活动指针不影响手势且最终松手位移也能判定拖动', () => {
  const initial = startGesture(1, 100, 100)
  assert.equal(advanceGesture(initial, 2, 120, 100), null)
  const final = advanceGesture(initial, 1, 107, 100)!
  assert.equal(final.gesture.dragged, true)
  assert.equal(final.dx, 7)
  assert.equal(final.dy, 0)
})

test('总览下继续缩小不反向放大且最大缩放保持为7', () => {
  const minimum = fitZoom(360, 600, 2000, 1600)
  assert.ok(minimum < 0.38)
  assert.equal(clampZoom(minimum * 0.83, minimum), minimum)
  assert.equal(clampZoom(10, minimum), 7)
})

test('不同视口共享适配下限并在视口变大时立即钳制', () => {
  for (const width of [360, 390, 820, 821, 1440]) {
    const minimum = fitZoom(width, 900, 2000, 1600)
    assert.ok(minimum > 0 && minimum <= 1.2)
    assert.equal(clampZoom(minimum * 0.89, minimum), minimum)
  }
  const previous = fitZoom(360, 600, 2000, 1600)
  const next = fitZoom(1000, 900, 2000, 1600)
  assert.equal(clampZoom(previous, next), next)
  assert.equal(fitZoom(10000, 10000, 2000, 1600), 1.2)
})
