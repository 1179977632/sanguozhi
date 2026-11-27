import type { FactionId, MovementOptions, World } from './world'
import { findPath, hexKey, movementCost } from './world'
import { resolveCombat, type CombatResult } from './combat'
import { DEFAULT_EVENT_SEED, RANDOM_EVENT_DEFINITIONS, resolveRandomEventChoice, rollRandomEvent, type PendingEvent, type RandomEventId } from './events'

export const TURN_MOVEMENT_BUDGET = 6
export const INITIAL_ARMY_TROOPS = 10_000
export const INITIAL_GARRISON = 3_000
export const INITIAL_DEFENSE_BONUS = 25

export const FACTION_START_CITY: Record<FactionId, string> = {
  cao: 'xuchang',
  liubiao: 'xiangyang',
  sun: 'jianye',
  liuzhang: 'chengdu',
  zhanglu: 'hanzhong',
  shixie: 'jiaozhi',
  local: 'wudu',
}

export type ArmyStatus = 'ready' | 'marching' | 'arrived' | 'defeated'

export interface ArmyState {
  positionKey: string
  troops: number
  status: ArmyStatus
  destinationKey: string | null
  pathKeys: string[]
  nextTileIndex: number
  movementOptions: MovementOptions
}

export interface CityState {
  owner: FactionId
  garrison: number
  defenseBonus: number
}

export interface BattleReport extends CombatResult {
  turn: number
  cityId: string
  attackerFaction: FactionId
  defenderFaction: FactionId
  entryKey: string
  retreatKey: string
}

export interface BattleLogEntry {
  kind: 'battle'
  turn: number
  report: BattleReport
}

export interface EventLogEntry {
  kind: 'event'
  turn: number
  eventId: RandomEventId
  title: string
  choice: string
  result: string
}

export type TurnLogEntry = BattleLogEntry | EventLogEntry

export const TURN_LOG_LIMIT = 50

export interface GameState {
  turn: number
  playerFaction: FactionId
  cityStates: Record<string, CityState>
  army: ArmyState
  lastBattle: BattleReport | null
  rngState: number
  pendingEvent: PendingEvent | null
  nextTurnMovementModifier: number
  turnLog: TurnLogEntry[]
}

export type DispatchResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: 'army-marching' | 'army-defeated' | 'pending-event' | 'unknown-destination' | 'same-location' | 'unreachable' }

export interface TurnResult {
  state: GameState
  movedKeys: string[]
  movementSpent: number
  arrived: boolean
  battle: BattleReport | null
  event: PendingEvent | null
  blocked: 'pending-event' | 'army-defeated' | null
}

export type EventChoiceResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: 'no-pending-event' | 'invalid-option' }

/** 按所选势力的起兵城创建独立的城主、驻军和首回合状态。 */
export function createInitialGameState(world: World, playerFaction: FactionId = 'liuzhang', eventSeed = DEFAULT_EVENT_SEED): GameState {
  const origin = world.cities.find((city) => city.id === FACTION_START_CITY[playerFaction])
  if (!origin) throw new Error(`游戏地图缺少起兵城：${FACTION_START_CITY[playerFaction]}`)
  return {
    turn: 1,
    playerFaction,
    cityStates: Object.fromEntries(world.cities.map((city) => [city.id, {
      owner: city.id === origin.id ? playerFaction : city.faction,
      garrison: INITIAL_GARRISON,
      defenseBonus: INITIAL_DEFENSE_BONUS,
    }])),
    army: {
      positionKey: hexKey(origin.q, origin.r),
      troops: INITIAL_ARMY_TROOPS,
      status: 'ready',
      destinationKey: null,
      pathKeys: [],
      nextTileIndex: 0,
      movementOptions: { unit: 'infantry', boat: false, plank: false },
    },
    lastBattle: null,
    rngState: eventSeed >>> 0,
    pendingEvent: null,
    nextTurnMovementModifier: 0,
    turnLog: [],
  }
}

/** 从军队当前位置规划并确认一条合法行军路线；无效命令不会修改原状态。 */
export function dispatchArmy(state: GameState, world: World, destinationKey: string, options: MovementOptions): DispatchResult {
  if (state.pendingEvent) return { ok: false, reason: 'pending-event' }
  if (state.army.status === 'defeated' || state.army.troops === 0) return { ok: false, reason: 'army-defeated' }
  if (state.army.status === 'marching') return { ok: false, reason: 'army-marching' }
  const start = world.tiles.get(state.army.positionKey)
  const destination = world.tiles.get(destinationKey)
  if (!destination) return { ok: false, reason: 'unknown-destination' }
  if (destinationKey === state.army.positionKey) return { ok: false, reason: 'same-location' }
  if (!start) return { ok: false, reason: 'unreachable' }
  const path = findPath(world, start, destination, options)
  if (!path || path.tiles.length < 2) return { ok: false, reason: 'unreachable' }
  return {
    ok: true,
    state: {
      ...state,
      army: {
        ...state.army,
        status: 'marching',
        destinationKey,
        pathKeys: path.tiles.map((tile) => `${tile.q},${tile.r}`),
        nextTileIndex: 1,
        movementOptions: { ...options },
      },
    },
  }
}

/** 先结算行军与战斗，再统一推进回合、消耗临时移动力并抽取事件。 */
export function endTurn(state: GameState, world: World): TurnResult {
  const blocked = state.pendingEvent ? 'pending-event'
    : state.army.status === 'defeated' || state.army.troops === 0 ? 'army-defeated' : null
  if (blocked) {
    return { state, movedKeys: [], movementSpent: 0, arrived: false, battle: null, event: state.pendingEvent, blocked }
  }

  let army: ArmyState = { ...state.army, movementOptions: { ...state.army.movementOptions } }
  let cityStates = state.cityStates
  let battle: BattleReport | null = null
  let movementSpent = 0
  let arrived = false
  const movedKeys: string[] = []
  const movementBudget = Math.max(0, TURN_MOVEMENT_BUDGET + state.nextTurnMovementModifier)

  if (army.status === 'marching') {
    while (army.nextTileIndex < army.pathKeys.length) {
      const key = army.pathKeys[army.nextTileIndex]!
      const tile = world.tiles.get(key)
      if (!tile) break
      const cost = movementCost(tile, army.movementOptions)
      if (!Number.isFinite(cost) || movementSpent + cost > movementBudget) break

      movementSpent += cost
      const city = tile.cityId ? world.cities.find((entry) => entry.id === tile.cityId) : undefined
      const cityState = city ? cityStates[city.id] : undefined
      if (city && cityState && cityState.owner !== state.playerFaction) {
        const combat = resolveCombat({
          attackerTroops: army.troops,
          defenderTroops: cityState.garrison,
          defenseBonus: cityState.defenseBonus,
        })
        battle = {
          ...combat,
          turn: state.turn,
          cityId: city.id,
          attackerFaction: state.playerFaction,
          defenderFaction: cityState.owner,
          entryKey: key,
          retreatKey: army.positionKey,
        }
        arrived = combat.outcome === 'victory'
        cityStates = {
          ...cityStates,
          [city.id]: arrived
            ? { owner: state.playerFaction, garrison: 0, defenseBonus: 0 }
            : { ...cityState, garrison: combat.defenderRemaining },
        }
        if (arrived) movedKeys.push(key)
        army = {
          ...army,
          positionKey: arrived ? key : army.positionKey,
          troops: combat.attackerRemaining,
          status: arrived ? 'arrived' : combat.attackerRemaining > 0 ? 'ready' : 'defeated',
          destinationKey: arrived ? key : null,
          pathKeys: [],
          nextTileIndex: 0,
        }
        break
      }

      army.positionKey = key
      movedKeys.push(key)
      army.nextTileIndex += 1
    }
    if (!battle) {
      arrived = army.nextTileIndex >= army.pathKeys.length
      army.status = arrived ? 'arrived' : 'marching'
    }
  }

  const roll = army.troops > 0 ? rollRandomEvent(state.rngState) : { rngState: state.rngState, eventId: null }
  const event: PendingEvent | null = roll.eventId ? { id: roll.eventId, turn: state.turn } : null
  const turnLog: TurnLogEntry[] = battle
    ? [...state.turnLog, { kind: 'battle', turn: state.turn, report: battle }].slice(-TURN_LOG_LIMIT) as TurnLogEntry[]
    : state.turnLog
  return {
    state: {
      ...state,
      turn: state.turn + 1,
      army,
      cityStates,
      lastBattle: battle ?? state.lastBattle,
      rngState: roll.rngState,
      pendingEvent: event,
      nextTurnMovementModifier: 0,
      turnLog,
    },
    movedKeys,
    movementSpent,
    arrived,
    battle,
    event,
    blocked: null,
  }
}

/** 应用当前事件的有效选项并记录结果；无效或重复选择不改变状态。 */
export function resolvePendingEvent(state: GameState, optionId: string): EventChoiceResult {
  const pending = state.pendingEvent
  if (!pending) return { ok: false, reason: 'no-pending-event' }
  const option = resolveRandomEventChoice(pending.id, optionId)
  if (!option) return { ok: false, reason: 'invalid-option' }
  const troops = Math.max(0, state.army.troops + option.troopsDelta)
  const entry: EventLogEntry = {
    kind: 'event',
    turn: pending.turn,
    eventId: pending.id,
    title: RANDOM_EVENT_DEFINITIONS[pending.id].title,
    choice: option.label,
    result: option.result,
  }
  return {
    ok: true,
    state: {
      ...state,
      army: troops > 0 ? { ...state.army, troops } : {
        ...state.army, troops: 0, status: 'defeated', destinationKey: null, pathKeys: [], nextTileIndex: 0,
      },
      pendingEvent: null,
      nextTurnMovementModifier: troops > 0 ? state.nextTurnMovementModifier + option.movementModifierDelta : 0,
      turnLog: [...state.turnLog, entry].slice(-TURN_LOG_LIMIT),
    },
  }
}
