export interface CombatInput {
  attackerTroops: number
  defenderTroops: number
  defenseBonus: number
}

export interface CombatResult {
  outcome: 'victory' | 'defeat'
  attackerBefore: number
  defenderBefore: number
  defenseBonus: number
  effectiveDefense: number
  attackerRemaining: number
  defenderRemaining: number
  attackerLosses: number
  defenderLosses: number
}

/** 按有效防御与固定取整规则结算战斗，不修改输入且不使用随机数。 */
export function resolveCombat(input: CombatInput): CombatResult {
  const { attackerTroops: attackerBefore, defenderTroops: defenderBefore, defenseBonus } = input
  const effectiveDefense = Math.ceil(defenderBefore * (100 + defenseBonus) / 100)
  const outcome = attackerBefore > effectiveDefense ? 'victory' : 'defeat'
  const attackerRemaining = outcome === 'victory'
    ? attackerBefore - Math.ceil(effectiveDefense / 2)
    : Math.max(0, attackerBefore - Math.ceil(3 * effectiveDefense / 4))
  const defenderRemaining = outcome === 'victory'
    ? 0
    : Math.max(1, defenderBefore - Math.floor(attackerBefore * 100 / (2 * (100 + defenseBonus))))

  return {
    outcome,
    attackerBefore,
    defenderBefore,
    defenseBonus,
    effectiveDefense,
    attackerRemaining,
    defenderRemaining,
    attackerLosses: attackerBefore - attackerRemaining,
    defenderLosses: defenderBefore - defenderRemaining,
  }
}
