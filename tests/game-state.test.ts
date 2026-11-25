import assert from 'node:assert/strict'
import test from 'node:test'
import { createInitialGameState, dispatchArmy, endTurn, TURN_MOVEMENT_BUDGET } from '../src/game-state.ts'
import { createWorld, findPath, hexKey, movementCost, type HexTile, type MovementOptions, type TerrainId, type World } from '../src/world.ts'

const world = createWorld(189)
const equippedInfantry: MovementOptions = { unit: 'infantry', boat: true, plank: true }

/** 从成都寻找一座步卒可达且需要多个回合才能抵达的城市。 */
function findLongDestination(): string {
  const origin = world.tiles.get(createInitialGameState(world).army.positionKey)!
  const city = world.cities.find((candidate) => {
    const destination = world.tiles.get(hexKey(candidate.q, candidate.r))!
    const path = findPath(world, origin, destination, equippedInfantry)
    return candidate.id !== 'chengdu' && path && path.cost > TURN_MOVEMENT_BUDGET * 2
  })
  assert.ok(city, '地图中应存在多回合可达的城池')
  return hexKey(city.q, city.r)
}

/** 构造只有一条通路的地形走廊，精确验证阻断和逐格消耗。 */
function createCorridor(terrains: TerrainId[]): World {
  const chengdu = world.cities.find((city) => city.id === 'chengdu')!
  const origin = world.tiles.get(hexKey(chengdu.q, chengdu.r))!
  const tiles = terrains.map((terrain, index): HexTile => ({
    ...origin,
    q: origin.q + index,
    terrain,
    cityId: index === 0 ? chengdu.id : undefined,
    cityCenter: index === 0,
  }))
  return { ...world, tiles: new Map(tiles.map((tile) => [hexKey(tile.q, tile.r), tile])), cities: [chengdu] }
}

test('初始军队位于成都且回合从一开始', () => {
  const state = createInitialGameState(world)
  const chengdu = world.cities.find((city) => city.id === 'chengdu')!
  assert.equal(state.turn, 1)
  assert.equal(state.army.positionKey, hexKey(chengdu.q, chengdu.r))
  assert.equal(state.army.status, 'ready')
  assert.deepEqual(state.army.movementOptions, { unit: 'infantry', boat: false, plank: false })
})

test('合法派遣保存寻路结果与编制快照且不修改原状态', () => {
  const state = createInitialGameState(world)
  const destinationKey = findLongDestination()
  const result = dispatchArmy(state, world, destinationKey, equippedInfantry)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.state.army.status, 'marching')
  assert.equal(result.state.army.destinationKey, destinationKey)
  assert.equal(result.state.army.pathKeys[0], state.army.positionKey)
  assert.equal(result.state.army.pathKeys.at(-1), destinationKey)
  assert.deepEqual(result.state.army.movementOptions, equippedInfantry)
  assert.equal(state.army.status, 'ready')
  assert.equal(state.army.pathKeys.length, 0)
})

test('未知地点、原地派遣和不可通行目的地均拒绝命令', () => {
  const state = createInitialGameState(world)
  assert.deepEqual(dispatchArmy(state, world, 'missing-tile', equippedInfantry), { ok: false, reason: 'unknown-destination' })
  assert.deepEqual(dispatchArmy(state, world, state.army.positionKey, equippedInfantry), { ok: false, reason: 'same-location' })
  const mountain = [...world.tiles.values()].find((tile) => tile.terrain === 'mountain')!
  assert.deepEqual(
    dispatchArmy(state, world, hexKey(mountain.q, mountain.r), { unit: 'infantry', boat: false, plank: false }),
    { ok: false, reason: 'unreachable' },
  )
  assert.equal(state.army.status, 'ready')
})

test('途中河流阻断陆路且配备舟船后才能派遣', () => {
  const corridor = createCorridor(['plain', 'river', 'plain'])
  const initial = createInitialGameState(corridor)
  const destination = [...corridor.tiles.values()].at(-1)!
  const destinationKey = hexKey(destination.q, destination.r)
  assert.deepEqual(dispatchArmy(initial, corridor, destinationKey, initial.army.movementOptions), {
    ok: false,
    reason: 'unreachable',
  })
  const options: MovementOptions = { unit: 'infantry', boat: true, plank: false }
  const dispatched = dispatchArmy(initial, corridor, destinationKey, options)
  assert.equal(dispatched.ok, true)
  if (!dispatched.ok) return
  options.boat = false
  assert.equal(dispatched.state.army.movementOptions.boat, true, '派遣后配置应与外部对象隔离')
  assert.equal(endTurn(dispatched.state, corridor).arrived, true)
})

test('混合地形逐格扣点且未用完的移动力不结转', () => {
  const corridor = createCorridor(['plain', 'hill', 'hill', 'mountain', 'mountain', 'plain'])
  const initial = createInitialGameState(corridor)
  const keys = [...corridor.tiles.keys()]
  const dispatched = dispatchArmy(initial, corridor, keys.at(-1)!, equippedInfantry)
  assert.equal(dispatched.ok, true)
  if (!dispatched.ok) return
  const originalState = structuredClone(dispatched.state)
  const first = endTurn(dispatched.state, corridor)
  assert.deepEqual(dispatched.state, originalState, '推进回合不应改写上一回合状态')
  assert.equal(first.movementSpent, 4)
  assert.deepEqual(first.movedKeys, keys.slice(1, 3))
  assert.equal(first.state.army.positionKey, keys[2])
  assert.equal(first.state.army.nextTileIndex, 3)
  const second = endTurn(first.state, corridor)
  assert.equal(second.movementSpent, 6)
  assert.deepEqual(second.movedKeys, keys.slice(3, 5))
  assert.equal(second.arrived, false, '首回合余下的两点不能带入下一回合')
  const third = endTurn(second.state, corridor)
  assert.equal(third.movementSpent, 1)
  assert.equal(third.arrived, true)
  assert.equal(third.state.army.positionKey, keys.at(-1))
})

test('抵达后可从军队当前位置派遣下一条路线', () => {
  const corridor = createCorridor(['plain', 'plain', 'plain'])
  const initial = createInitialGameState(corridor)
  const keys = [...corridor.tiles.keys()]
  const dispatched = dispatchArmy(initial, corridor, keys.at(-1)!, initial.army.movementOptions)
  assert.equal(dispatched.ok, true)
  if (!dispatched.ok) return
  const arrived = endTurn(dispatched.state, corridor)
  const returning = dispatchArmy(arrived.state, corridor, initial.army.positionKey, initial.army.movementOptions)
  assert.equal(returning.ok, true)
  if (!returning.ok) return
  assert.equal(returning.state.army.pathKeys[0], keys.at(-1))
  assert.equal(returning.state.army.nextTileIndex, 1)
  assert.equal(returning.state.turn, arrived.state.turn)
  assert.equal(endTurn(returning.state, corridor).state.army.positionKey, initial.army.positionKey)
})

test('行军中的军队不能接受重复派遣', () => {
  const state = createInitialGameState(world)
  const first = dispatchArmy(state, world, findLongDestination(), equippedInfantry)
  assert.equal(first.ok, true)
  if (!first.ok) return
  assert.deepEqual(dispatchArmy(first.state, world, createInitialGameState(world).army.positionKey, equippedInfantry), {
    ok: false,
    reason: 'army-marching',
  })
})

test('结束回合遵守移动力上限并在后续回合抵达', () => {
  const state = createInitialGameState(world)
  const dispatched = dispatchArmy(state, world, findLongDestination(), equippedInfantry)
  assert.equal(dispatched.ok, true)
  if (!dispatched.ok) return

  let current = dispatched.state
  let turnCount = 0
  while (current.army.status === 'marching' && turnCount < 100) {
    const result = endTurn(current, world)
    assert.ok(result.movementSpent <= TURN_MOVEMENT_BUDGET)
    assert.equal(result.movedKeys.length, result.state.army.nextTileIndex - current.army.nextTileIndex)
    assert.equal(result.state.army.positionKey, result.movedKeys.at(-1) ?? current.army.positionKey)
    assert.equal(result.state.turn, current.turn + 1)
    if (!result.arrived) assert.equal(result.state.army.status, 'marching')
    current = result.state
    turnCount += 1
  }

  assert.ok(turnCount > 1, '长路线应跨越多个回合')
  assert.equal(current.army.status, 'arrived')
  assert.equal(current.army.positionKey, current.army.destinationKey)
  const completed = endTurn(current, world)
  assert.equal(completed.arrived, false)
  assert.deepEqual(completed.movedKeys, [])
  assert.equal(completed.state.army.positionKey, current.army.positionKey)
})

test('移动力不足以进入下一格时保留待走格供下一回合使用', () => {
  const state = createInitialGameState(world)
  const destinationKey = findLongDestination()
  const dispatched = dispatchArmy(state, world, destinationKey, equippedInfantry)
  assert.equal(dispatched.ok, true)
  if (!dispatched.ok) return
  let current = dispatched.state
  let observedDeferredTile = false
  while (current.army.status === 'marching' && current.turn < 20) {
    const beforeIndex = current.army.nextTileIndex
    const result = endTurn(current, world)
    const nextTileCost = result.state.army.status === 'marching'
      ? world.tiles.get(result.state.army.pathKeys[result.state.army.nextTileIndex]!)!
      : undefined
    if (nextTileCost) {
      const nextCost = movementCost(nextTileCost, equippedInfantry)
      if (result.movementSpent + nextCost > TURN_MOVEMENT_BUDGET) observedDeferredTile = true
    }
    assert.ok(result.state.army.nextTileIndex >= beforeIndex)
    current = result.state
  }
  assert.ok(observedDeferredTile, '应有至少一回合因预算不足留下待走格')
})

test('行军过程不改写地图或城池原有势力标签', () => {
  const cityFactions = world.cities.map((city) => [city.id, city.faction])
  const tiles = [...world.tiles].map(([key, tile]) => [key, { ...tile }])
  const dispatched = dispatchArmy(createInitialGameState(world), world, findLongDestination(), equippedInfantry)
  assert.equal(dispatched.ok, true)
  if (!dispatched.ok) return
  let state = dispatched.state
  while (state.army.status === 'marching') state = endTurn(state, world).state
  assert.deepEqual(world.cities.map((city) => [city.id, city.faction]), cityFactions)
  assert.deepEqual([...world.tiles.entries()], tiles)
})

