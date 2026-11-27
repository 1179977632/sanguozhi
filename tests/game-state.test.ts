import assert from 'node:assert/strict'
import test from 'node:test'
import { createInitialGameState, dispatchArmy, endTurn, resolvePendingEvent, TURN_MOVEMENT_BUDGET, TURN_LOG_LIMIT, type GameState } from '../src/game-state.ts'
import { DEFAULT_EVENT_SEED, rollRandomEvent, type RandomEventId } from '../src/events.ts'
import { createWorld, findPath, hexKey, movementCost, type FactionId, type HexTile, type MovementOptions, type TerrainId, type World } from '../src/world.ts'

const world = createWorld(189)
const historicalWorld = world
const equippedInfantry: MovementOptions = { unit: 'infantry', boat: true, plank: true }

/** 为原行军测试明确处理事件，选择不会改变移动预算的选项。 */
function settleEvent(state: GameState): GameState {
  if (!state.pendingEvent) return state
  const optionId = state.pendingEvent.id === 'muddy-road' ? 'clear-road' : 'decline'
  const result = resolvePendingEvent(state, optionId)
  assert.equal(result.ok, true)
  if (!result.ok) throw new Error('测试事件选择失败')
  return result.state
}

/** 查找可稳定触发指定事件或不触发事件的固定样本种子。 */
function seedFor(eventId: RandomEventId | null): number {
  for (let seed = 0; seed < 10000; seed += 1) {
    if (rollRandomEvent(seed).eventId === eventId) return seed
  }
  throw new Error('未找到事件样本种子')
}

/** 给测试状态附上指定回合的待处理事件，不改写输入状态。 */
function withEvent(state: GameState, id: RandomEventId): GameState {
  return { ...state, pendingEvent: { id, turn: state.turn - 1 } }
}

/** 从成都寻找一座步卒可达且需要多个回合才能抵达的城市。 */
function findLongDestination(): string {
  const origin = world.tiles.get(createInitialGameState(world).army.positionKey)!
  const city = world.cities.find((candidate) => {
    const destination = world.tiles.get(hexKey(candidate.q, candidate.r))!
    const path = findPath(world, origin, destination, equippedInfantry)
    return candidate.id !== 'chengdu' && candidate.faction === 'liuzhang' && path && path.cost > TURN_MOVEMENT_BUDGET * 2
  })
  assert.ok(city, '地图中应存在多回合可达的己方城池')
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

/** 构造成都邻接一座曹军守城的最小测试世界。 */
function createBattleCorridor(): World {
  const originCity = world.cities.find((city) => city.id === 'chengdu')!
  const enemyRecord = historicalWorld.cities.find((city) => city.id === 'xuchang')!
  const origin = world.tiles.get(hexKey(originCity.q, originCity.r))!
  const targetQ = origin.q + 2
  const targetR = origin.r
  const cityTileCoordinates = [[0, 0], [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]] as const
  const targetTileKeys = cityTileCoordinates.map(([dq, dr]) => hexKey(targetQ + dq, targetR + dr))
  const targetCity = {
    ...enemyRecord,
    q: targetQ,
    r: targetR,
    tileKeys: targetTileKeys,
  }
  const tiles = [
    { ...origin, cityId: originCity.id, cityCenter: true },
    ...cityTileCoordinates.map(([dq, dr]) => ({
      ...origin,
      q: targetQ + dq,
      r: targetR + dr,
      cityId: targetCity.id,
      cityCenter: dq === 0 && dr === 0,
    })),
  ]
  return {
    ...world,
    tiles: new Map(tiles.map((tile) => [hexKey(tile.q, tile.r), tile])),
    cities: [originCity, targetCity],
  }
}

test('各势力从对应主城开局并独立初始化动态城主与军队', () => {
  for (const [faction, cityId] of Object.entries({ cao: 'xuchang', liubiao: 'xiangyang', sun: 'jianye', liuzhang: 'chengdu', zhanglu: 'hanzhong', shixie: 'jiaozhi', local: 'wudu' }) as [FactionId, string][]) {
    const state = createInitialGameState(world, faction)
    const city = world.cities.find((candidate) => candidate.id === cityId)!
    assert.equal(state.turn, 1)
    assert.equal(state.playerFaction, faction)
    assert.equal(state.army.positionKey, hexKey(city.q, city.r))
    assert.equal(state.army.troops, 10_000)
    assert.equal(state.cityStates[cityId]?.owner, faction)
    assert.equal(state.cityStates[cityId]?.garrison, 3_000)
  }
  const state = createInitialGameState(world)
  assert.equal(state.playerFaction, 'liuzhang')
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
  const second = endTurn(settleEvent(first.state), corridor)
  assert.equal(second.movementSpent, 6)
  assert.deepEqual(second.movedKeys, keys.slice(3, 5))
  assert.equal(second.arrived, false, '首回合余下的两点不能带入下一回合')
  const third = endTurn(settleEvent(second.state), corridor)
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
  const returning = dispatchArmy(settleEvent(arrived.state), corridor, initial.army.positionKey, initial.army.movementOptions)
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
    current = settleEvent(result.state)
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
    current = settleEvent(result.state)
  }
  assert.ok(observedDeferredTile, '应有至少一回合因预算不足留下待走格')
})

test('进入敌城七格城域任一格自动战斗、占领并在首次遇战后停止行军', () => {
  const battleWorld = createBattleCorridor()
  const state = createInitialGameState(battleWorld, 'liuzhang')
  const city = battleWorld.cities.find((candidate) => candidate.id === 'xuchang')!
  const entryTile = battleWorld.tiles.get(hexKey(city.q - 1, city.r))!
  const initial = dispatchArmy(state, battleWorld, hexKey(entryTile.q, entryTile.r), equippedInfantry)
  assert.equal(initial.ok, true)
  if (!initial.ok) return
  const result = endTurn(initial.state, battleWorld)
  assert.ok(result.battle)
  assert.equal(result.battle.outcome, 'victory')
  assert.equal(result.state.cityStates.xuchang?.owner, 'liuzhang')
  assert.equal(result.state.cityStates.xuchang?.garrison, 0)
  assert.equal(result.state.army.positionKey, hexKey(entryTile.q, entryTile.r))
  assert.equal(result.state.army.status, 'arrived')
  assert.equal(result.state.army.pathKeys.length, 0)
  assert.equal(result.state.army.troops, result.battle.attackerRemaining)
  assert.equal(state.cityStates.xuchang?.owner, 'cao')
})

test('戰敗時退回進城前一格並保留守軍戰損；全滅後不能再派遣', () => {
  const battleWorld = createBattleCorridor()
  const state = createInitialGameState(battleWorld, 'liuzhang')
  const enemyTile = [...battleWorld.tiles.values()].find((tile) => tile.cityId === 'xuchang')!
  const initial = dispatchArmy(state, battleWorld, hexKey(enemyTile.q, enemyTile.r), equippedInfantry)
  assert.equal(initial.ok, true)
  if (!initial.ok) return
  const weakened = {
    ...initial.state,
    army: { ...initial.state.army, troops: 500 },
  }
  const result = endTurn(weakened, battleWorld)
  assert.equal(result.battle?.outcome, 'defeat')
  assert.equal(result.state.army.positionKey, state.army.positionKey)
  assert.equal(result.state.army.status, 'defeated')
  assert.equal(result.state.army.troops, 0)
  assert.equal(result.state.cityStates.xuchang?.owner, 'cao')
  assert.equal(result.state.cityStates.xuchang?.garrison, result.battle?.defenderRemaining)
  assert.deepEqual(dispatchArmy(result.state, battleWorld, hexKey(enemyTile.q, enemyTile.r), equippedInfantry), {
    ok: false,
    reason: 'army-defeated',
  })
})

test('战败但尚有余兵时退回进城前一格并允许重新派遣', () => {
  const battleWorld = createBattleCorridor()
  const state = createInitialGameState(battleWorld, 'liuzhang')
  const enemyTile = [...battleWorld.tiles.values()].find((tile) => tile.cityId === 'xuchang')!
  const dispatched = dispatchArmy(state, battleWorld, hexKey(enemyTile.q, enemyTile.r), equippedInfantry)
  assert.equal(dispatched.ok, true)
  if (!dispatched.ok) return
  const weakened = { ...dispatched.state, army: { ...dispatched.state.army, troops: 3_500 } }
  const result = endTurn(weakened, battleWorld)
  assert.equal(result.battle?.outcome, 'defeat')
  assert.equal(result.state.army.positionKey, state.army.positionKey)
  assert.equal(result.state.army.troops, 687)
  assert.equal(result.state.army.status, 'ready')
  assert.equal(result.state.cityStates.xuchang?.garrison, 1_600)
  assert.equal(dispatchArmy(settleEvent(result.state), battleWorld, hexKey(enemyTile.q, enemyTile.r), equippedInfantry).ok, true)
})

test('行军过程不改写地图或城池原有势力标签', () => {
  const cityFactions = historicalWorld.cities.map((city) => [city.id, city.faction])
  const tiles = [...world.tiles].map(([key, tile]) => [key, { ...tile }])
  const dispatched = dispatchArmy(createInitialGameState(world), world, findLongDestination(), equippedInfantry)
  assert.equal(dispatched.ok, true)
  if (!dispatched.ok) return
  let state = dispatched.state
  while (state.army.status === 'marching') state = settleEvent(endTurn(state, world).state)
  assert.deepEqual(world.cities.map((city) => [city.id, city.faction]), cityFactions)
  assert.deepEqual([...world.tiles.entries()], tiles)
})

test('初始化独立事件状态且零种子有效，同种子重复推进结果一致', () => {
  const first = createInitialGameState(world, 'liuzhang', 0)
  const second = createInitialGameState(world, 'liuzhang', 0)
  assert.equal(first.rngState, 0)
  assert.equal(createInitialGameState(world).rngState, DEFAULT_EVENT_SEED)
  assert.equal(first.pendingEvent, null)
  assert.equal(first.nextTurnMovementModifier, 0)
  assert.deepEqual(first.turnLog, [])
  let left = first
  let right = second
  for (let index = 0; index < 60; index += 1) {
    left = settleEvent(endTurn(left, world).state)
    right = settleEvent(endTurn(right, world).state)
    assert.deepEqual(left, right)
  }
})

test('待命和已抵达均可空过，回合只增加一次并按结算回合抽事件', () => {
  for (const status of ['ready', 'arrived'] as const) {
    const initial = createInitialGameState(world, 'liuzhang', 0)
    const state = { ...initial, army: { ...initial.army, status } }
    const snapshot = structuredClone(state)
    const result = endTurn(state, world)
    assert.equal(result.blocked, null)
    assert.equal(result.state.turn, 2)
    assert.equal(result.state.army.status, status)
    assert.equal(result.state.army.positionKey, state.army.positionKey)
    assert.equal(result.arrived, false)
    assert.equal(result.movementSpent, 0)
    assert.deepEqual(result.movedKeys, [])
    assert.deepEqual(result.event, { id: 'refugees', turn: 1 })
    assert.equal(result.state.rngState, rollRandomEvent(0).rngState)
    assert.deepEqual(state, snapshot)
  }
  const quiet = createInitialGameState(world, 'liuzhang', seedFor(null))
  const result = endTurn(quiet, world)
  assert.equal(result.event, null)
  assert.equal(result.state.rngState, rollRandomEvent(quiet.rngState).rngState)
})

test('待选事件阻断回合和派遣，不消耗修正、随机状态或历史', () => {
  const initial = createInitialGameState(world, 'liuzhang', 0)
  const pending = { ...endTurn(initial, world).state, nextTurnMovementModifier: 2 }
  const snapshot = structuredClone(pending)
  const result = endTurn(pending, world)
  assert.equal(result.state, pending)
  assert.equal(result.blocked, 'pending-event')
  assert.equal(result.battle, null)
  assert.deepEqual(result.movedKeys, [])
  assert.deepEqual(dispatchArmy(pending, world, 'missing', equippedInfantry), { ok: false, reason: 'pending-event' })
  assert.deepEqual(pending, snapshot)
})

test('非法与重复事件选择无效，接纳流民只加一次军力并记录选择', () => {
  const pending = endTurn(createInitialGameState(world, 'liuzhang', 0), world).state
  const snapshot = structuredClone(pending)
  assert.deepEqual(resolvePendingEvent(pending, 'detour'), { ok: false, reason: 'invalid-option' })
  assert.deepEqual(pending, snapshot)
  const choice = resolvePendingEvent(pending, 'accept')
  assert.equal(choice.ok, true)
  if (!choice.ok) return
  assert.equal(choice.state.army.troops, 10_500)
  assert.equal(choice.state.pendingEvent, null)
  assert.equal(choice.state.turn, pending.turn)
  assert.equal(choice.state.rngState, pending.rngState)
  assert.deepEqual(choice.state.turnLog.map((entry) => entry.kind), ['event'])
  assert.deepEqual(choice.state.turnLog[0], {
    kind: 'event', turn: 1, eventId: 'refugees', title: '流民来投', choice: '接纳', result: '安置流民，五百壮丁加入军队。',
  })
  assert.deepEqual(resolvePendingEvent(choice.state, 'accept'), { ok: false, reason: 'no-pending-event' })
  assert.deepEqual(pending, snapshot)
})

test('行军结算后事件暂停保留剩余路线，选择后从同一待走格继续', () => {
  const corridor = createCorridor(Array<TerrainId>(20).fill('plain'))
  const initial = createInitialGameState(corridor, 'liuzhang', 0)
  const keys = [...corridor.tiles.keys()]
  const dispatched = dispatchArmy(initial, corridor, keys.at(-1)!, equippedInfantry)
  assert.equal(dispatched.ok, true)
  if (!dispatched.ok) return
  const first = endTurn(dispatched.state, corridor)
  assert.equal(first.movementSpent, 6)
  assert.equal(first.state.army.nextTileIndex, 7)
  assert.deepEqual(first.event, { id: 'refugees', turn: 1 })
  const paused = endTurn(first.state, corridor)
  assert.equal(paused.state, first.state)
  const choice = resolvePendingEvent(first.state, 'accept')
  assert.equal(choice.ok, true)
  if (!choice.ok) return
  assert.equal(choice.state.army.troops, 10_500)
  assert.deepEqual(choice.state.army.pathKeys, dispatched.state.army.pathKeys)
  const resumed = endTurn(choice.state, corridor)
  assert.equal(resumed.state.turn, 3)
  assert.deepEqual(resumed.movedKeys, keys.slice(7, 13))
  assert.equal(resumed.state.rngState, rollRandomEvent(first.state.rngState).rngState)
})

test('事件扣兵最低归零并进入全灭，清理行军路线与临时修正', () => {
  const corridor = createCorridor(Array<TerrainId>(20).fill('plain'))
  const initial = createInitialGameState(corridor)
  const dispatched = dispatchArmy(initial, corridor, [...corridor.tiles.keys()].at(-1)!, equippedInfantry)
  assert.equal(dispatched.ok, true)
  if (!dispatched.ok) return
  for (const troops of [300, 500, 501]) {
    const pending = withEvent({ ...dispatched.state, army: { ...dispatched.state.army, troops }, nextTurnMovementModifier: 2 }, 'muddy-road')
    const snapshot = structuredClone(pending)
    const choice = resolvePendingEvent(pending, 'clear-road')
    assert.equal(choice.ok, true)
    if (!choice.ok) continue
    assert.equal(choice.state.army.troops, Math.max(0, troops - 500))
    if (troops <= 500) {
      assert.equal(choice.state.army.status, 'defeated')
      assert.equal(choice.state.army.destinationKey, null)
      assert.deepEqual(choice.state.army.pathKeys, [])
      assert.equal(choice.state.army.nextTileIndex, 0)
      assert.equal(choice.state.nextTurnMovementModifier, 0)
      assert.equal(endTurn(choice.state, corridor).blocked, 'army-defeated')
    } else {
      assert.equal(choice.state.army.status, 'marching')
    }
    assert.deepEqual(pending, snapshot)
  }
})

test('移动力加减仅用于下一有效回合，后续预算恢复六点', () => {
  const corridor = createCorridor(Array<TerrainId>(25).fill('plain'))
  for (const [eventId, optionId, budget] of [['muddy-road', 'detour', 4], ['local-guide', 'accept', 8]] as const) {
    const initial = createInitialGameState(corridor, 'liuzhang', seedFor(null))
    const dispatched = dispatchArmy(initial, corridor, [...corridor.tiles.keys()].at(-1)!, equippedInfantry)
    assert.equal(dispatched.ok, true)
    if (!dispatched.ok) continue
    const choice = resolvePendingEvent(withEvent(dispatched.state, eventId), optionId)
    assert.equal(choice.ok, true)
    if (!choice.ok) continue
    const first = endTurn(choice.state, corridor)
    assert.equal(first.movementSpent, budget)
    assert.equal(first.movedKeys.length, budget)
    assert.equal(first.state.nextTurnMovementModifier, 0)
    const second = endTurn(settleEvent(first.state), corridor)
    assert.equal(second.movementSpent, TURN_MOVEMENT_BUDGET)
  }
})

test('待命空过也会消耗移动修正，低预算留在原地后能恢复行军', () => {
  const corridor = createCorridor(Array<TerrainId>(16).fill('plain'))
  const initial = createInitialGameState(corridor, 'liuzhang', seedFor(null))
  const choice = resolvePendingEvent(withEvent(initial, 'local-guide'), 'accept')
  assert.equal(choice.ok, true)
  if (!choice.ok) return
  const idle = endTurn(choice.state, corridor)
  assert.equal(idle.state.nextTurnMovementModifier, 0)
  const dispatched = dispatchArmy(settleEvent(idle.state), corridor, [...corridor.tiles.keys()].at(-1)!, equippedInfantry)
  assert.equal(dispatched.ok, true)
  if (dispatched.ok) assert.equal(endTurn(dispatched.state, corridor).movementSpent, 6)

  const mountain = createCorridor(['plain', 'mountain', 'mountain'])
  const moving = dispatchArmy(createInitialGameState(mountain, 'liuzhang', seedFor(null)), mountain, [...mountain.tiles.keys()].at(-1)!, equippedInfantry)
  assert.equal(moving.ok, true)
  if (!moving.ok) return
  const delayed = endTurn({ ...moving.state, nextTurnMovementModifier: -4 }, mountain)
  assert.equal(delayed.movementSpent, 0)
  assert.equal(delayed.state.army.status, 'marching')
  assert.equal(delayed.state.army.positionKey, moving.state.army.positionKey)
  assert.equal(delayed.state.nextTurnMovementModifier, 0)
  assert.equal(endTurn(settleEvent(delayed.state), mountain).arrived, true)
})

test('存活的胜利或败退先保存战报，再抽事件并按选择追加记录', () => {
  const battleWorld = createBattleCorridor()
  for (const troops of [10_000, 3_500]) {
    const initial = createInitialGameState(battleWorld, 'liuzhang', 0)
    const enemy = [...battleWorld.tiles.values()].find((tile) => tile.cityId === 'xuchang')!
    const dispatched = dispatchArmy(initial, battleWorld, hexKey(enemy.q, enemy.r), equippedInfantry)
    assert.equal(dispatched.ok, true)
    if (!dispatched.ok) continue
    const before = { ...dispatched.state, army: { ...dispatched.state.army, troops }, nextTurnMovementModifier: 2 }
    const snapshot = structuredClone(before)
    const result = endTurn(before, battleWorld)
    assert.ok(result.battle)
    assert.equal(result.battle.outcome, troops === 10_000 ? 'victory' : 'defeat')
    assert.equal(result.state.turn, 2)
    assert.deepEqual(result.event, { id: 'refugees', turn: 1 })
    assert.equal(result.state.nextTurnMovementModifier, 0)
    assert.deepEqual(result.state.turnLog, [{ kind: 'battle', turn: 1, report: result.battle }])
    const choice = resolvePendingEvent(result.state, 'decline')
    assert.equal(choice.ok, true)
    if (!choice.ok) continue
    assert.deepEqual(choice.state.turnLog.map((entry) => entry.kind), ['battle', 'event'])
    const idle = endTurn(choice.state, battleWorld)
    assert.deepEqual(idle.state.lastBattle, result.battle)
    assert.deepEqual(before, snapshot)
  }
})

test('战斗全灭仍保存战报但不抽事件，其后结束回合为无副作用操作', () => {
  const battleWorld = createBattleCorridor()
  const initial = createInitialGameState(battleWorld, 'liuzhang', 0)
  const enemy = [...battleWorld.tiles.values()].find((tile) => tile.cityId === 'xuchang')!
  const dispatched = dispatchArmy(initial, battleWorld, hexKey(enemy.q, enemy.r), equippedInfantry)
  assert.equal(dispatched.ok, true)
  if (!dispatched.ok) return
  const result = endTurn({ ...dispatched.state, army: { ...dispatched.state.army, troops: 500 } }, battleWorld)
  assert.equal(result.state.turn, 2)
  assert.equal(result.state.army.status, 'defeated')
  assert.equal(result.event, null)
  assert.equal(result.state.rngState, 0)
  assert.equal(result.state.turnLog[0]?.kind, 'battle')
  const blocked = endTurn(result.state, battleWorld)
  assert.equal(blocked.blocked, 'army-defeated')
  assert.equal(blocked.state, result.state)
  assert.deepEqual(blocked.movedKeys, [])
  const zero = { ...initial, army: { ...initial.army, troops: 0 } }
  assert.equal(endTurn(zero, battleWorld).state, zero)
})

test('统一历史按先后顺序仅保留最近五十条且不修改旧记录', () => {
  let state = createInitialGameState(world)
  for (let turn = 1; turn <= 55; turn += 1) {
    const choice = resolvePendingEvent({ ...withEvent(state, 'refugees'), pendingEvent: { id: 'refugees', turn } }, 'decline')
    assert.equal(choice.ok, true)
    if (choice.ok) state = choice.state
  }
  assert.equal(state.turnLog.length, TURN_LOG_LIMIT)
  assert.equal(state.turnLog[0]?.turn, 6)
  assert.equal(state.turnLog.at(-1)?.turn, 55)
  const snapshot = structuredClone(state.turnLog)
  const battleWorld = createBattleCorridor()
  const initial = { ...createInitialGameState(battleWorld, 'liuzhang', 0), turn: 56, turnLog: state.turnLog }
  const enemy = [...battleWorld.tiles.values()].find((tile) => tile.cityId === 'xuchang')!
  const dispatched = dispatchArmy(initial, battleWorld, hexKey(enemy.q, enemy.r), equippedInfantry)
  assert.equal(dispatched.ok, true)
  if (!dispatched.ok) return
  const result = endTurn(dispatched.state, battleWorld)
  assert.equal(result.state.turnLog.length, 50)
  assert.equal(result.state.turnLog[0]?.turn, 7)
  assert.equal(result.state.turnLog.at(-1)?.kind, 'battle')
  const choice = resolvePendingEvent(result.state, 'decline')
  assert.equal(choice.ok, true)
  if (choice.ok) {
    assert.equal(choice.state.turnLog.length, 50)
    assert.equal(choice.state.turnLog[0]?.turn, 8)
    assert.deepEqual(choice.state.turnLog.slice(-2).map((entry) => entry.kind), ['battle', 'event'])
  }
  assert.deepEqual(state.turnLog, snapshot)
})

