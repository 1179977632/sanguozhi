import assert from 'node:assert/strict'
import test from 'node:test'
import { auditConnectivity, createWorld, findPath, movementCost } from '../src/world.ts'

const world = createWorld(189)

test('城池均为完整七格且互不重叠', () => {
  assert.equal(world.cities.length, 40)
  const used = new Set<string>()
  for (const city of world.cities) {
    assert.equal(city.tileKeys.length, 7, `${city.name} 城域不足七格`)
    for (const key of city.tileKeys) {
      assert.ok(!used.has(key), `${city.name} 与其他城池城域重叠`)
      used.add(key)
    }
    const center = world.tiles.get(`${city.q},${city.r}`)
    assert.equal(center?.terrain, 'plain', `${city.name} 城心不是平原`)
  }
})

test('河网连续且显式汇流点同时属于双方河道', () => {
  assert.deepEqual(auditConnectivity(world), [])
  assert.ok(world.confluences.length >= 3, '汇流点数量少于河道折线中的共享顶点')
  const pairs = world.confluences.map((entry) => [...entry.rivers].sort().join('·'))
  assert.ok(pairs.some((entry) => entry.includes('长江') && entry.includes('汉水')), '长江与汉水未在共享顶点汇流')
  assert.ok(pairs.some((entry) => entry.includes('长江') && entry.includes('嘉陵江')), '长江与嘉陵江未在共享顶点汇流')
})

test('具名山道形成无栈道可通行的跨脊通道', () => {
  const crossing = world.passes.filter((pass) => pass.range)
  assert.ok(crossing.length >= 5, '可关联山脊的具名山道过少')
  for (const pass of crossing) {
    assert.ok(pass.crossed, `${pass.name} 未切开原有山体`)
    const first = world.tiles.get(pass.tileKeys[0]!)
    const last = world.tiles.get(pass.tileKeys.at(-1)!)
    assert.ok(first && last, `${pass.name} 通道端点缺失`)
    const path = findPath(world, first!, last!, { unit: 'infantry', boat: true, plank: false })
    assert.ok(path, `${pass.name} 在无栈道条件下不可通行`)
  }
})

test('舟船与栈道限制仍按地形生效', () => {
  const river = [...world.tiles.values()].find((tile) => tile.terrain === 'river')!
  assert.equal(movementCost(river, { unit: 'infantry', boat: false, plank: false }), Infinity)
  assert.equal(movementCost(river, { unit: 'infantry', boat: true, plank: false }), 1)
  const mountain = [...world.tiles.values()].find((tile) => tile.terrain === 'mountain')!
  assert.equal(movementCost(mountain, { unit: 'infantry', boat: false, plank: false }), Infinity)
  assert.ok(Number.isFinite(movementCost(mountain, { unit: 'infantry', boat: false, plank: true })))
})
