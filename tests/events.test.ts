import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_EVENT_SEED,
  EVENT_CHANCE,
  RANDOM_EVENT_DEFINITIONS,
  resolveRandomEventChoice,
  rollRandomEvent,
  type PendingEvent,
  type RandomEventDefinition,
  type RandomEventId,
  type RandomEventOption,
} from '../src/events.ts'

/** 独立计算预期的三十二位线性同余状态。 */
function nextState(state: number): number {
  return (Math.imul(state, 1664525) + 1013904223) >>> 0
}

/** 在固定范围内寻找满足触发条件或未触发条件的种子。 */
function findSeed(triggered: boolean): number {
  for (let seed = 0; seed < 10000; seed += 1) {
    if ((nextState(seed) / 2 ** 32 < 0.3) === triggered) return seed
  }
  throw new Error('固定样本中未找到符合条件的种子')
}

test('事件类型、待处理事件和定义符合公开接口', () => {
  const ids: RandomEventId[] = ['refugees', 'muddy-road', 'local-guide']
  const pending: PendingEvent = { id: 'refugees', turn: 2 }
  const definitions: Record<RandomEventId, RandomEventDefinition> = RANDOM_EVENT_DEFINITIONS
  assert.deepEqual(Object.keys(definitions), ids)
  assert.deepEqual(pending, { id: 'refugees', turn: 2 })
  assert.equal(EVENT_CHANCE, 0.3)
  assert.ok(Number.isInteger(DEFAULT_EVENT_SEED))
  assert.ok(DEFAULT_EVENT_SEED >= 0 && DEFAULT_EVENT_SEED <= 0xffffffff)

  for (const id of ids) {
    const definition = definitions[id]
    const options: readonly RandomEventOption[] = definition.options
    assert.equal(definition.id, id)
    assert.ok(definition.title.length > 0)
    assert.ok(definition.description.length > 0)
    assert.equal(options.length, 2)
    for (const option of options) {
      assert.ok(option.label.length > 0)
      assert.ok(option.result.length > 0)
    }
  }
})

test('每个事件选项具有约定的军力和移动力效果', () => {
  const cases: [RandomEventId, string, string, number, number][] = [
    ['refugees', 'accept', '接纳', 500, 0],
    ['refugees', 'decline', '婉拒', 0, 0],
    ['muddy-road', 'detour', '绕行', 0, -2],
    ['muddy-road', 'clear-road', '强行整路', -500, 0],
    ['local-guide', 'accept', '采纳', 0, 2],
    ['local-guide', 'decline', '谢绝', 0, 0],
  ]
  for (const [eventId, optionId, label, troopsDelta, movementModifierDelta] of cases) {
    const option = resolveRandomEventChoice(eventId, optionId)
    assert.ok(option)
    assert.equal(option.id, optionId)
    assert.equal(option.label, label)
    assert.equal(option.troopsDelta, troopsDelta)
    assert.equal(option.movementModifierDelta, movementModifierDelta)
  }
})

test('非法选项和其他事件专属选项返回空值', () => {
  for (const id of Object.keys(RANDOM_EVENT_DEFINITIONS) as RandomEventId[]) {
    for (const optionId of ['', 'unknown', 'toString', '__proto__']) {
      assert.equal(resolveRandomEventChoice(id, optionId), null)
    }
  }
  assert.equal(resolveRandomEventChoice('refugees', 'detour'), null)
  assert.equal(resolveRandomEventChoice('muddy-road', 'accept'), null)
})

test('相同种子生成完全一致的连续事件序列', () => {
  let firstState = DEFAULT_EVENT_SEED
  let secondState = DEFAULT_EVENT_SEED
  for (let turn = 0; turn < 1000; turn += 1) {
    const first = rollRandomEvent(firstState)
    const second = rollRandomEvent(secondState)
    assert.deepEqual(first, second)
    firstState = first.rngState
    secondState = second.rngState
  }
})

test('未触发种子只推进一次随机状态', () => {
  const seed = findSeed(false)
  assert.ok(nextState(seed) / 2 ** 32 >= 0.3)
  assert.deepEqual(rollRandomEvent(seed), { rngState: nextState(seed), eventId: null })
})

test('触发种子消耗两个状态并按定义键顺序抽取事件', () => {
  const seed = findSeed(true)
  const first = nextState(seed)
  const second = nextState(first)
  const ids = Object.keys(RANDOM_EVENT_DEFINITIONS) as RandomEventId[]
  assert.ok(first / 2 ** 32 < 0.3)
  assert.deepEqual(rollRandomEvent(seed), {
    rngState: second,
    eventId: ids[Math.floor((second / 2 ** 32) * 3)],
  })
})

test('零种子有效且不被默认种子替换', () => {
  assert.deepEqual(rollRandomEvent(0), { rngState: 1196435762, eventId: 'refugees' })
})

test('固定种子样本遵循三成阈值且能触发全部三类事件', () => {
  const seen = new Set<RandomEventId>()
  const ids = Object.keys(RANDOM_EVENT_DEFINITIONS) as RandomEventId[]
  for (let seed = 0; seed < 10000; seed += 1) {
    const first = nextState(seed)
    const result = rollRandomEvent(seed)
    if (first / 2 ** 32 < 0.3) {
      const second = nextState(first)
      const eventId = ids[Math.floor((second / 2 ** 32) * 3)]
      assert.deepEqual(result, { rngState: second, eventId })
      seen.add(eventId)
    } else {
      assert.deepEqual(result, { rngState: first, eventId: null })
    }
  }
  assert.deepEqual([...seen].sort(), [...ids].sort())
})
