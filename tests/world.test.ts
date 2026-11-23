import assert from 'node:assert/strict'
import test from 'node:test'
import { auditConnectivity, createWorld, DIRECTIONS, findPath, geoToPixel, movementCost, pixelToHex, type World } from '../src/world.ts'

const world = createWorld(189)

/** 仅沿河流、湖泊与近海格遍历，判断两个水域位置是否连通。 */
function waterPathExists(world: World, startKey: string, targetKeys: Set<string>): boolean {
  const start = world.tiles.get(startKey)
  if (!start || !isWater(start.terrain)) return false
  const visited = new Set([startKey])
  const queue = [start]
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index]!
    const currentKey = `${current.q},${current.r}`
    if (targetKeys.has(currentKey)) return true
    for (const [dq, dr] of DIRECTIONS) {
      const key = `${current.q + dq},${current.r + dr}`
      if (visited.has(key)) continue
      const next = world.tiles.get(key)
      if (!next || !isWater(next.terrain)) continue
      visited.add(key)
      queue.push(next)
    }
  }
  return false
}

/** 判断地形是否属于可航行的最终水域。 */
function isWater(terrain: string): boolean {
  return terrain === 'river' || terrain === 'lake' || terrain === 'coast'
}

/**
 * 建安十三年（208）刘表病逝前各城的代表城邑与州、郡国级归属。
 * 郡国名目以《后汉书·郡国志》为基础，并以 CHGIS/TGAZ 沿革条目核对；
 * 只登记能确认在该时点已存在的建置：如梓潼郡迟至建安二十二年（217）始置，
 * 此时梓潼县仍属广汉郡；武都郡则属凉州，而非益州。
 */
const ADMIN_208: Record<string, readonly [name: string, province: string, prefecture: string]> = {
  chengdu: ['成都', '益州', '蜀郡'],
  luoyang: ['洛陽', '司隸', '河南尹'],
  xuchang: ['許縣', '豫州', '潁川郡'],
  'chang-an': ['長安', '司隸', '京兆尹'],
  ye: ['鄴', '冀州', '魏郡'],
  beiping: ['土垠', '幽州', '右北平郡'],
  jinyang: ['晉陽', '并州', '太原郡'],
  pingyuan: ['平原', '青州', '平原郡'],
  nanpi: ['南皮', '冀州', '勃海郡'],
  xiapi: ['下邳', '徐州', '下邳郡'],
  beihai: ['劇縣', '青州', '北海郡'],
  puyang: ['濮陽', '兗州', '東郡'],
  chenliu: ['陳留', '兗州', '陳留郡'],
  runan: ['平輿', '豫州', '汝南郡'],
  shouchun: ['壽春', '揚州', '九江郡'],
  hefei: ['合肥', '揚州', '九江郡'],
  jianye: ['秣陵', '揚州', '丹陽郡'],
  wu: ['吳縣', '揚州', '吳郡'],
  kuaiji: ['山陰', '揚州', '會稽郡'],
  lujiang: ['皖城', '揚州', '廬江郡'],
  chaishang: ['柴桑', '揚州', '豫章郡'],
  jiangxia: ['沙羨', '荊州', '江夏郡'],
  xiangyang: ['襄陽', '荊州', '南郡'],
  jiangling: ['江陵', '荊州', '南郡'],
  changsha: ['臨湘', '荊州', '長沙郡'],
  wuling: ['臨沅', '荊州', '武陵郡'],
  lingling: ['泉陵', '荊州', '零陵郡'],
  guiyang: ['郴縣', '荊州', '桂陽郡'],
  hanzhong: ['南鄭', '益州', '漢中郡'],
  zitong: ['梓潼', '益州', '廣漢郡'],
  jiangzhou: ['江州', '益州', '巴郡'],
  yongan: ['魚復', '益州', '巴東郡'],
  wudu: ['下辨', '涼州', '武都郡'],
  tianshui: ['冀縣', '涼州', '漢陽郡'],
  anding: ['臨涇', '涼州', '安定郡'],
  wuwei: ['姑臧', '雍州', '武威郡'],
  yunnan: ['雲南縣', '益州', '永昌郡'],
  jianning: ['味縣', '益州', '益州郡'],
  nanhai: ['番禺', '交州', '南海郡'],
  jiaozhi: ['龍編', '交州', '交趾郡'],
}

test('已声明河道终端通过最终地图审计并列出黄河淮水待定项', () => {
  assert.deepEqual(auditConnectivity(world), [
    { kind: 'river-pending', subject: '黄河', detail: '预期入海，下游示意走廊待确认' },
    { kind: 'river-pending', subject: '淮水', detail: '预期入海，下游示意走廊待确认' },
  ])
})

test('连通审计检测河口终端被陆地覆盖', () => {
  const yangtze = world.rivers.find((route) => route.name === '长江')
  assert.ok(yangtze, '缺少长江河道')
  const terminalKey = yangtze.tileKeys.at(-1)!
  const terminalTile = world.tiles.get(terminalKey)
  assert.ok(terminalTile, '长江末格缺失')
  const brokenWorld: World = { ...world, tiles: new Map(world.tiles) }
  brokenWorld.tiles.set(terminalKey, { ...terminalTile, terrain: 'plain' })
  assert.ok(
    auditConnectivity(brokenWorld).some((issue) => issue.kind === 'river-terminal' && issue.subject === '长江'),
    '长江末格被覆盖后仍未报告终端错误',
  )
})

test('长江珠江入海且洞庭湖出水道接入长江', () => {
  const yangtze = world.rivers.find((route) => route.name === '长江')
  const pearl = world.rivers.find((route) => route.name === '珠江')
  const outlet = world.rivers.find((route) => route.name === '洞庭湖出水道')
  assert.ok(yangtze && pearl && outlet, '缺少预期的入海河道或洞庭湖出水道')

  for (const route of [yangtze, pearl]) {
    const last = world.tiles.get(route.tileKeys.at(-1)!)
    assert.equal(last?.terrain, 'coast', `${route.name}末格未接入近海`)
    const coastKeys = new Set([...world.tiles].filter(([, tile]) => tile.terrain === 'coast').map(([key]) => key))
    assert.ok(waterPathExists(world, route.tileKeys[0]!, coastKeys), `${route.name}未通过纯水域连到近海`)
  }

  const source = world.tiles.get(outlet.tileKeys[0]!)
  const destination = outlet.tileKeys.at(-1)!
  assert.equal(source?.terrain, 'lake', '洞庭湖出水道未始于湖泊水域')
  assert.equal(source?.landform, '洞庭湖', '洞庭湖出水道源头不属于洞庭湖')
  assert.ok(yangtze.tileKeys.includes(destination), '洞庭湖出水道末格未与长江共享')
  assert.ok(waterPathExists(world, outlet.tileKeys[0]!, new Set(yangtze.tileKeys)), '洞庭湖未通过纯水域连到长江')
  assert.ok(world.confluences.some((entry) => entry.tileKey === destination && entry.rivers.includes('洞庭湖出水道') && entry.rivers.includes('长江')), '洞庭湖出口缺少与长江共享的显式汇流点')
})

test('洞庭湖与鄱阳湖支流保持纯水域通江', () => {
  const yangtze = world.rivers.find((route) => route.name === '长江')
  assert.ok(yangtze, '缺少长江河道')
  for (const name of ['湘水', '沅水', '赣水']) {
    const route = world.rivers.find((entry) => entry.name === name)
    assert.ok(route, `缺少${name}河道`)
    assert.ok(waterPathExists(world, route.tileKeys.at(-1)!, new Set(yangtze.tileKeys)), `${name}未通过湖泊水域连到长江`)
  }
})

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

test('城池稳定ID与208年州郡归属保持锁定', () => {
  const ids = world.cities.map((city) => city.id)
  assert.equal(new Set(ids).size, ids.length, '城池ID重复')
  assert.deepEqual([...ids].sort(), Object.keys(ADMIN_208).sort(), '城池ID集合发生变化')
  for (const city of world.cities) {
    const expected = ADMIN_208[city.id]
    assert.ok(expected, `${city.id} 缺少核实后的行政记录`)
    assert.equal(city.name, expected[0], `${city.id} 的代表城邑不符`)
    assert.equal(city.province, expected[1], `${city.id} 的州属不符`)
    assert.equal(city.prefecture, expected[2], `${city.id} 的郡国级归属不符`)
    assert.ok(!/縣$/.test(city.prefecture), `${city.id} 的郡级字段仍是县名：${city.prefecture}`)
  }
})

test('河网连续且显式汇流点同时属于双方河道', () => {
  assert.deepEqual(
    auditConnectivity(world).filter((issue) => issue.kind !== 'river-pending'),
    [],
  )
  assert.ok(world.confluences.length >= 5, '汇流点数量少于河道折线中的共享顶点')
  /** 判断两条河是否在共享控制点处显式汇流。 */
  const joins = (first: string, second: string): boolean =>
    world.confluences.some((entry) => entry.rivers.includes(first) && entry.rivers.includes(second))
  for (const [first, second] of [['岷江', '长江'], ['沱江', '长江'], ['汉水', '长江'], ['嘉陵江', '长江'], ['涪江', '嘉陵江']] as const) {
    assert.ok(joins(first, second), `${first}未与${second}在显式汇流点相接`)
  }
  assert.ok(!joins('沅水', '长江'), '沅水不应绕过洞庭湖直接接入长江控制点')
})

test('湘水、沅水、赣水末段分别由洞庭湖与鄱阳湖承接', () => {
  for (const [riverName, lakeName] of [['沅水', '洞庭湖'], ['湘水', '洞庭湖'], ['赣水', '鄱陽湖']] as const) {
    const route = world.rivers.find((entry) => entry.name === riverName)
    assert.ok(route, `缺少${riverName}河道`)
    const last = world.tiles.get(route.tileKeys.at(-1)!)
    assert.ok(last, `${riverName}末格缺失`)
    assert.equal(last.terrain, 'lake', `${riverName}末段未落入湖泊水域`)
    assert.equal(last.landform, lakeName, `${riverName}末段未由${lakeName}承接`)
  }
})

test('冠名河道的记录格在最终地图上仍为水域', () => {
  for (const route of world.rivers) {
    for (const key of route.tileKeys) {
      const tile = world.tiles.get(key)
      assert.ok(tile, `${route.name}的记录格${key}不存在`)
      assert.ok(
        tile.terrain === 'river' || tile.terrain === 'lake' || tile.terrain === 'coast',
        `${route.name}在${key}被覆盖为${tile.terrain}`,
      )
    }
  }
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

test('关键城址未被河道或地形推离目标点位', () => {
  for (const id of ['xiangyang', 'jiangling', 'jiangzhou', 'shouchun', 'chengdu']) {
    const city = world.cities.find((entry) => entry.id === id)
    assert.ok(city, `缺少城池${id}`)
    const target = pixelToHex(geoToPixel(city.lon, city.lat).x, geoToPixel(city.lon, city.lat).y)
    // 城心按十格邻域搜位；超出该范围说明河道或地形把城址推到了不相干的位置。
    const steps = (Math.abs(target.q - city.q) + Math.abs(target.q + target.r - city.q - city.r) + Math.abs(target.r - city.r)) / 2
    assert.ok(steps <= 10, `${id}城心偏离目标点位${steps}格，超出十格搜位范围`)
  }
})
