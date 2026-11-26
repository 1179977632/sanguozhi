import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveCombat, type CombatInput } from '../src/combat.ts'

test('常规胜利清空守军并返回完整战损', () => {
  assert.deepEqual(resolveCombat({ attackerTroops: 200, defenderTroops: 100, defenseBonus: 0 }), {
    outcome: 'victory',
    attackerBefore: 200,
    defenderBefore: 100,
    defenseBonus: 0,
    effectiveDefense: 100,
    attackerRemaining: 150,
    defenderRemaining: 0,
    attackerLosses: 50,
    defenderLosses: 100,
  })
})

test('常规失败按固定比例扣除双方兵力', () => {
  assert.deepEqual(resolveCombat({ attackerTroops: 90, defenderTroops: 100, defenseBonus: 0 }), {
    outcome: 'defeat',
    attackerBefore: 90,
    defenderBefore: 100,
    defenseBonus: 0,
    effectiveDefense: 100,
    attackerRemaining: 15,
    defenderRemaining: 55,
    attackerLosses: 75,
    defenderLosses: 45,
  })
})

test('兵力等于有效防御时判守方获胜', () => {
  const result = resolveCombat({ attackerTroops: 100, defenderTroops: 100, defenseBonus: 0 })
  assert.equal(result.outcome, 'defeat')
  assert.equal(result.attackerRemaining, 25)
  assert.equal(result.defenderRemaining, 50)
})

test('防御加成改变有效防御和战斗胜负', () => {
  const input = { attackerTroops: 140, defenderTroops: 100, defenseBonus: 0 }
  assert.equal(resolveCombat(input).outcome, 'victory')
  const fortified = resolveCombat({ ...input, defenseBonus: 50 })
  assert.equal(fortified.effectiveDefense, 150)
  assert.equal(fortified.outcome, 'defeat')
  assert.equal(fortified.attackerRemaining, 27)
  assert.equal(fortified.defenderRemaining, 54)
})

test('奇数有效防御和胜方损耗均向上取整', () => {
  const result = resolveCombat({ attackerTroops: 10, defenderTroops: 5, defenseBonus: 25 })
  assert.equal(result.effectiveDefense, 7)
  assert.equal(result.outcome, 'victory')
  assert.equal(result.attackerRemaining, 6)
  assert.equal(result.attackerLosses, 4)
})

test('败方损耗向上取整且守军损耗向下取整', () => {
  const result = resolveCombat({ attackerTroops: 7, defenderTroops: 5, defenseBonus: 25 })
  assert.equal(result.effectiveDefense, 7)
  assert.equal(result.outcome, 'defeat')
  assert.equal(result.attackerRemaining, 1)
  assert.equal(result.defenderRemaining, 3)
})

test('攻方可全灭且剩余兵力不为负', () => {
  for (const attackerTroops of [0, 1, 50, 75]) {
    const result = resolveCombat({ attackerTroops, defenderTroops: 100, defenseBonus: 0 })
    assert.equal(result.outcome, 'defeat')
    assert.equal(result.attackerRemaining, 0)
    assert.equal(result.attackerLosses, attackerTroops)
    assert.ok(result.defenderRemaining >= 1)
  }
})

test('守方胜利时至少保留一名守军', () => {
  const result = resolveCombat({ attackerTroops: 1, defenderTroops: 1, defenseBonus: 0 })
  assert.equal(result.outcome, 'defeat')
  assert.equal(result.defenderRemaining, 1)
})

test('无驻军时正兵力攻方无损胜利且不受城防加成影响', () => {
  for (const defenseBonus of [0, 50, 250]) {
    const result = resolveCombat({ attackerTroops: 1, defenderTroops: 0, defenseBonus })
    assert.equal(result.outcome, 'victory')
    assert.equal(result.effectiveDefense, 0)
    assert.equal(result.attackerRemaining, 1)
    assert.equal(result.defenderRemaining, 0)
    assert.equal(result.attackerLosses, 0)
    assert.equal(result.defenderLosses, 0)
  }
})

test('结算不修改输入对象', () => {
  const input = Object.freeze({ attackerTroops: 97, defenderTroops: 83, defenseBonus: 15 })
  const before = { ...input }
  resolveCombat(input)
  assert.deepEqual(input, before)
})

test('双方损失始终等于战前兵力减去剩余兵力', () => {
  const inputs: CombatInput[] = [
    { attackerTroops: 200, defenderTroops: 100, defenseBonus: 0 },
    { attackerTroops: 90, defenderTroops: 100, defenseBonus: 0 },
    { attackerTroops: 7, defenderTroops: 5, defenseBonus: 25 },
    { attackerTroops: 0, defenderTroops: 100, defenseBonus: 0 },
    { attackerTroops: 1, defenderTroops: 0, defenseBonus: 100 },
  ]
  for (const input of inputs) {
    const result = resolveCombat(input)
    assert.equal(result.attackerBefore, input.attackerTroops)
    assert.equal(result.defenderBefore, input.defenderTroops)
    assert.equal(result.defenseBonus, input.defenseBonus)
    assert.equal(result.attackerLosses, result.attackerBefore - result.attackerRemaining)
    assert.equal(result.defenderLosses, result.defenderBefore - result.defenderRemaining)
  }
})

test('相同输入重复结算得到相同结果且返回独立对象', () => {
  const input = { attackerTroops: 97, defenderTroops: 83, defenseBonus: 15 }
  const expected = resolveCombat(input)
  for (let index = 0; index < 10; index += 1) {
    const actual = resolveCombat(input)
    assert.deepEqual(actual, expected)
    assert.notEqual(actual, expected)
  }
})
