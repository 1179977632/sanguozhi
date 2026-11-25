import type { MovementOptions, World } from './world'
import { findPath, movementCost } from './world'

export const TURN_MOVEMENT_BUDGET = 6

export type ArmyStatus = 'ready' | 'marching' | 'arrived'

export interface ArmyState {
  positionKey: string
  status: ArmyStatus
  destinationKey: string | null
  pathKeys: string[]
  nextTileIndex: number
  movementOptions: MovementOptions
}

export interface GameState {
  turn: number
  army: ArmyState
}

export type DispatchResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: 'army-marching' | 'unknown-destination' | 'same-location' | 'unreachable' }

export interface TurnResult {
  state: GameState
  movedKeys: string[]
  movementSpent: number
  arrived: boolean
}

/** 创建从成都出发、采用步卒编制的首回合游戏状态。 */
export function createInitialGameState(world: World): GameState {
  const chengdu = world.cities.find((city) => city.id === 'chengdu')
  if (!chengdu) throw new Error('游戏地图缺少成都')
  return {
    turn: 1,
    army: {
      positionKey: `${chengdu.q},${chengdu.r}`,
      status: 'ready',
      destinationKey: null,
      pathKeys: [],
      nextTileIndex: 0,
      movementOptions: { unit: 'infantry', boat: false, plank: false },
    },
  }
}

/** 从军队当前位置规划并确认一条合法行军路线；无效命令不会修改原状态。 */
export function dispatchArmy(state: GameState, world: World, destinationKey: string, options: MovementOptions): DispatchResult {
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
        positionKey: state.army.positionKey,
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
    }
  }

  let nextTileIndex = state.army.nextTileIndex
  let movementSpent = 0
  const movedKeys: string[] = []
  while (nextTileIndex < state.army.pathKeys.length) {
    const key = state.army.pathKeys[nextTileIndex]!
    const tile = world.tiles.get(key)
    if (!tile) break
    const cost = movementCost(tile, state.army.movementOptions)
    if (!Number.isFinite(cost) || movementSpent + cost > TURN_MOVEMENT_BUDGET) break
    movementSpent += cost
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
        positionKey: state.army.pathKeys[nextTileIndex - 1] ?? state.army.positionKey,
        status: arrived ? 'arrived' : 'marching',
        nextTileIndex,
        movementOptions: { ...state.army.movementOptions },
      },
    },
    movedKeys,
    movementSpent,
    arrived,
  }
}
