import type { FactionId, MovementOptions, World } from './world'
import { findPath, hexKey, movementCost } from './world'
import { resolveCombat, type CombatResult } from './combat'
import { DEFAULT_EVENT_SEED, resolveRandomEventChoice, rollRandomEvent, type PendingEvent, type RandomEventId } from './events'

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

/** 推进一个回合并按六点移动力预算逐格移动；不修改输入状态或地图。 */
export function endTurn(state: GameState, world: World): TurnResult {
  if (state.army.status !== 'marching') {
    return {
      state: { ...state, turn: state.turn + 1, army: { ...state.army, movementOptions: { ...state.army.movementOptions } } },
      movedKeys: [],
      movementSpent: 0,
      arrived: false,
      battle: null,
    }
  }

  let nextTileIndex = state.army.nextTileIndex
  let positionKey = state.army.positionKey
  let troops = state.army.troops
  let movementSpent = 0
  const movedKeys: string[] = []
  while (nextTileIndex < state.army.pathKeys.length) {
    const key = state.army.pathKeys[nextTileIndex]!
    const tile = world.tiles.get(key)
    if (!tile) break
    const cost = movementCost(tile, state.army.movementOptions)
    if (!Number.isFinite(cost) || movementSpent + cost > TURN_MOVEMENT_BUDGET) break

    movementSpent += cost
    const city = tile.cityId ? world.cities.find((entry) => entry.id === tile.cityId) : undefined
    const cityState = city ? state.cityStates[city.id] : undefined
    if (city && cityState && cityState.owner !== state.playerFaction) {
      const combat = resolveCombat({
        attackerTroops: troops,
        defenderTroops: cityState.garrison,
        defenseBonus: cityState.defenseBonus,
      })
      const battle: BattleReport = {
        ...combat,
        turn: state.turn,
        cityId: city.id,
        attackerFaction: state.playerFaction,
        defenderFaction: cityState.owner,
        entryKey: key,
        retreatKey: positionKey,
      }
      troops = combat.attackerRemaining
      if (combat.outcome === 'victory') {
        positionKey = key
        movedKeys.push(key)
        return {
          state: {
            ...state,
            turn: state.turn + 1,
            cityStates: {
              ...state.cityStates,
              [city.id]: { owner: state.playerFaction, garrison: 0, defenseBonus: 0 },
            },
            army: {
              ...state.army,
              positionKey,
              troops,
              status: 'arrived',
              destinationKey: key,
              pathKeys: [],
              nextTileIndex: 0,
              movementOptions: { ...state.army.movementOptions },
            },
            lastBattle: battle,
          },
          movedKeys,
          movementSpent,
          arrived: true,
          battle,
        }
      }

      const status = troops > 0 ? 'ready' : 'defeated'
      return {
        state: {
          ...state,
          turn: state.turn + 1,
          cityStates: {
            ...state.cityStates,
            [city.id]: { ...cityState, garrison: combat.defenderRemaining },
          },
          army: {
            ...state.army,
            positionKey,
            troops,
            status,
            destinationKey: null,
            pathKeys: [],
            nextTileIndex: 0,
            movementOptions: { ...state.army.movementOptions },
          },
          lastBattle: battle,
        },
        movedKeys,
        movementSpent,
        arrived: false,
        battle,
      }
    }

    positionKey = key
    movedKeys.push(key)
    nextTileIndex += 1
  }

  const arrived = nextTileIndex >= state.army.pathKeys.length
  return {
    state: {
      ...state,
      turn: state.turn + 1,
      army: {
        ...state.army,
        positionKey,
        status: arrived ? 'arrived' : 'marching',
        nextTileIndex,
        movementOptions: { ...state.army.movementOptions },
      },
    },
    movedKeys,
    movementSpent,
    arrived,
    battle: null,
  }
}
