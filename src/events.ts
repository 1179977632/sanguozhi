export type RandomEventId = 'refugees' | 'muddy-road' | 'local-guide'

export interface PendingEvent {
  id: RandomEventId
  turn: number
}

export interface RandomEventOption {
  id: string
  label: string
  result: string
  troopsDelta: number
  movementModifierDelta: number
}

export interface RandomEventDefinition {
  id: RandomEventId
  title: string
  description: string
  options: readonly RandomEventOption[]
}

export const DEFAULT_EVENT_SEED = 20261126
export const EVENT_CHANCE = 0.3

export const RANDOM_EVENT_DEFINITIONS: Record<RandomEventId, RandomEventDefinition> = {
  refugees: {
    id: 'refugees',
    title: '流民来投',
    description: '一队流民前来投奔，其中壮丁愿意从军效力。',
    options: [
      { id: 'accept', label: '接纳', result: '安置流民，五百壮丁加入军队。', troopsDelta: 500, movementModifierDelta: 0 },
      { id: 'decline', label: '婉拒', result: '婉言谢绝，流民另寻安身之处。', troopsDelta: 0, movementModifierDelta: 0 },
    ],
  },
  'muddy-road': {
    id: 'muddy-road',
    title: '山路泥泞',
    description: '连日降雨使山路泥泞难行，大军进退受阻。',
    options: [
      { id: 'detour', label: '绕行', result: '绕道前行，移动力减少二点。', troopsDelta: 0, movementModifierDelta: -2 },
      { id: 'clear-road', label: '强行整路', result: '冒险整修道路，损失五百军力。', troopsDelta: -500, movementModifierDelta: 0 },
    ],
  },
  'local-guide': {
    id: 'local-guide',
    title: '乡导献策',
    description: '熟悉地形的乡导献上近路，愿为大军引路。',
    options: [
      { id: 'accept', label: '采纳', result: '依计走近路，移动力增加二点。', troopsDelta: 0, movementModifierDelta: 2 },
      { id: 'decline', label: '谢绝', result: '谢绝乡导，仍按原路行军。', troopsDelta: 0, movementModifierDelta: 0 },
    ],
  },
}

/** 推进独立的三十二位线性同余随机状态。 */
function advanceRandomState(state: number): number {
  return (Math.imul(state, 1664525) + 1013904223) >>> 0
}

/** 先判定事件是否触发，仅在触发时再次推进状态抽取事件。 */
export function rollRandomEvent(rngState: number): { rngState: number; eventId: RandomEventId | null } {
  const nextState = advanceRandomState(rngState)
  if (nextState / 2 ** 32 >= EVENT_CHANCE) {
    return { rngState: nextState, eventId: null }
  }

  const eventState = advanceRandomState(nextState)
  const eventIds = Object.keys(RANDOM_EVENT_DEFINITIONS) as RandomEventId[]
  return {
    rngState: eventState,
    eventId: eventIds[Math.floor((eventState / 2 ** 32) * 3)],
  }
}

/** 返回指定事件选项的效果，非法选项返回空值。 */
export function resolveRandomEventChoice(eventId: RandomEventId, optionId: string): RandomEventOption | null {
  return RANDOM_EVENT_DEFINITIONS[eventId].options.find((option) => option.id === optionId) ?? null
}
