export type TerrainId = 'plain' | 'forest' | 'hill' | 'mountain' | 'marsh' | 'river' | 'lake' | 'coast'
export type FactionId = 'cao' | 'liubiao' | 'sun' | 'liuzhang' | 'zhanglu' | 'shixie' | 'local'

export interface HexTile {
  q: number
  r: number
  x: number
  y: number
  lon: number
  lat: number
  terrain: TerrainId
  landform?: string
  /** 地貌相对起伏度，0 为低地、1 为最高山核，用于渲染明暗与峰体密度。 */
  relief?: number
  cityId?: string
  cityCenter?: boolean
}

export interface City {
  id: string
  name: string
  en: string
  province: string
  prefecture: string
  faction: FactionId
  lon: number
  lat: number
  description: string
  q: number
  r: number
  tileKeys: string[]
}

export interface MovementOptions {
  unit: 'infantry' | 'cavalry' | 'supply'
  boat: boolean
  plank: boolean
}

export type RiverTerminal =
  | { kind: 'sea'; point: { lon: number; lat: number } }
  | { kind: 'lake'; target: string }
  | { kind: 'river'; target: string; point: { lon: number; lat: number } }
  | { kind: 'pending'; target: 'sea'; detail: string }

export interface RiverRoute {
  name: string
  terminal: RiverTerminal
  source?: { kind: 'lake'; name: string }
  /** 该河在最终地图上的连续水道格，按上游到下游排列。 */
  tileKeys: string[]
}

export interface Confluence {
  lon: number
  lat: number
  tileKey: string
  /** 在此共享顶点相交的河流；仅由原始折线共同顶点推导，不按距离猜测。 */
  rivers: string[]
}

export interface PassRoute {
  name: string
  /** 关联山脊；未找到邻近山脊的道口不承担穿脊功能。 */
  range?: string
  /** 是否确实切开了原有山体。 */
  crossed: boolean
  tileKeys: string[]
}

export interface ConnectivityIssue {
  kind: 'river-gap' | 'river-terminal' | 'river-pending' | 'confluence' | 'pass-gap' | 'pass-blocked'
  subject: string
  detail: string
}

export interface World {
  tiles: Map<string, HexTile>
  cities: City[]
  width: number
  height: number
  seed: number
  rivers: RiverRoute[]
  confluences: Confluence[]
  passes: PassRoute[]
}

interface CityRecord extends Omit<City, 'q' | 'r' | 'tileKeys'> {}
interface GeoPoint { lon: number; lat: number }
interface GeoBounds { minLon: number; maxLon: number; minLat: number; maxLat: number }

const polygonBounds = new WeakMap<GeoPoint[], GeoBounds>()

export const HEX_SIZE = 1.2

export const TERRAIN: Record<TerrainId, { name: string; color: number; cost: number; hint: string }> = {
  plain: { name: '平原', color: 0xc8c58d, cost: 1, hint: '沃野广阔，粮秣易集，步骑皆宜迅速通行。' },
  forest: { name: '林地', color: 0x8eaa7d, cost: 2, hint: '林木蔽野，视界受阻，行军与斥候侦察均需谨慎。' },
  hill: { name: '丘陵', color: 0xb69b76, cost: 2, hint: '丘陵起伏，车马难速，行军所耗高于平原。' },
  mountain: { name: '山脉', color: 0x7f8280, cost: Infinity, hint: '崇山峻岭，无栈道则大军难行，须有栈道方可通越。' },
  marsh: { name: '沼泽', color: 0xa6baaa, cost: 3, hint: '泽国泥泞，仅步兵可涉足，消耗三点移动力，骑兵与辎重不可通行。' },
  river: { name: '江河', color: 0x8bb2a2, cost: Infinity, hint: '江河阻隔，必须配备舟船方可通行。' },
  lake: { name: '湖泊', color: 0x79a7a0, cost: Infinity, hint: '湖泊水面阻隔，必须配备舟船方可通行。' },
  coast: { name: '近海', color: 0x9ab8ad, cost: Infinity, hint: '近海水道必须配备舟船方可通行。' },
}

export const FACTIONS: Record<FactionId, { name: string; color: string; ink: number }> = {
  cao: { name: '曹操', color: '#aa826c', ink: 0x6e493d },
  liubiao: { name: '劉表', color: '#91a58a', ink: 0x4b684e },
  sun: { name: '孫權', color: '#668b91', ink: 0x3f686a },
  liuzhang: { name: '劉璋', color: '#b99a6b', ink: 0x79613d },
  zhanglu: { name: '張魯', color: '#9c8ca8', ink: 0x655271 },
  shixie: { name: '士燮', color: '#9a777e', ink: 0x69484e },
  local: { name: '地方/待考', color: '#a5a18e', ink: 0x736d5d },
}

export const DIRECTIONS: [number, number][] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]

const WORLD_WIDTH = 1420
const WORLD_HEIGHT = 1050
const GEO_LEFT = 95
const GEO_TOP = 43
const GEO_SCALE_X = 35
const GEO_SCALE_Y = 37

const LAND_OUTLINE: GeoPoint[] = [
  { lon: 95.0, lat: 35.5 }, { lon: 96.5, lat: 38.2 }, { lon: 99, lat: 40.8 },
  { lon: 103, lat: 42.1 }, { lon: 107, lat: 42.3 }, { lon: 111, lat: 41.5 },
  { lon: 115, lat: 40.9 }, { lon: 118.5, lat: 40.8 }, { lon: 121.7, lat: 40.1 },
  { lon: 123.5, lat: 39.1 }, { lon: 123.3, lat: 37.9 }, { lon: 121.9, lat: 37.1 },
  { lon: 120.8, lat: 36.1 }, { lon: 121.5, lat: 34.9 }, { lon: 120.5, lat: 33.3 },
  { lon: 122.1, lat: 31.6 }, { lon: 121.7, lat: 29.9 }, { lon: 120.1, lat: 28.5 },
  { lon: 119, lat: 26.7 }, { lon: 118.1, lat: 25.7 }, { lon: 116.4, lat: 24.6 },
  { lon: 115.3, lat: 23.7 }, { lon: 113.9, lat: 22.7 }, { lon: 112, lat: 21.9 },
  { lon: 110, lat: 20.9 }, { lon: 108.6, lat: 20.6 }, { lon: 107.3, lat: 21.2 },
  { lon: 106.6, lat: 20.1 }, { lon: 105.5, lat: 19.8 },
  { lon: 104.8, lat: 21.2 }, { lon: 103.8, lat: 22.3 }, { lon: 102, lat: 22.1 },
  { lon: 100.2, lat: 22.4 }, { lon: 98.9, lat: 24 }, { lon: 97.5, lat: 25.1 },
  { lon: 96.2, lat: 27.1 }, { lon: 94.8, lat: 29.5 }, { lon: 94.7, lat: 32.4 },
]

// 山脊是用于策略地图的地理示意线，不代表汉末精确测绘边界。
export const MOUNTAIN_RANGES: { name: string; points: GeoPoint[]; width: number; label: GeoPoint }[] = [
  { name: '秦嶺', width: 0.34, label: { lon: 107.4, lat: 34.05 }, points: [{ lon: 103.5, lat: 34.15 }, { lon: 105.3, lat: 33.95 }, { lon: 107.2, lat: 33.82 }, { lon: 109.3, lat: 33.65 }, { lon: 111.4, lat: 33.55 }] },
  { name: '大巴山', width: 0.3, label: { lon: 106.3, lat: 32.1 }, points: [{ lon: 103.7, lat: 32.55 }, { lon: 105.4, lat: 32.2 }, { lon: 107.1, lat: 32.35 }, { lon: 109.4, lat: 32.05 }] },
  { name: '太行山', width: 0.26, label: { lon: 113.4, lat: 37.2 }, points: [{ lon: 112.9, lat: 34.65 }, { lon: 113.35, lat: 35.55 }, { lon: 113.8, lat: 36.6 }, { lon: 113.9, lat: 37.7 }, { lon: 114.35, lat: 38.8 }] },
  { name: '呂梁山', width: 0.28, label: { lon: 110.7, lat: 37.1 }, points: [{ lon: 110.1, lat: 35.1 }, { lon: 110.7, lat: 36.2 }, { lon: 111.1, lat: 37.4 }, { lon: 111.2, lat: 38.7 }] },
  { name: '燕山', width: 0.3, label: { lon: 117.1, lat: 40.7 }, points: [{ lon: 115.1, lat: 40.45 }, { lon: 116.4, lat: 40.1 }, { lon: 117.7, lat: 40.35 }, { lon: 119.1, lat: 40.55 }, { lon: 120.2, lat: 40.3 }] },
  { name: '陰山', width: 0.36, label: { lon: 109.4, lat: 41.0 }, points: [{ lon: 105.3, lat: 40.65 }, { lon: 107.2, lat: 40.45 }, { lon: 109.5, lat: 40.25 }, { lon: 111.7, lat: 40.35 }, { lon: 113.7, lat: 40.15 }] },
  { name: '龍門山', width: 0.22, label: { lon: 103.1, lat: 31.45 }, points: [{ lon: 102.2, lat: 30.2 }, { lon: 102.75, lat: 31.0 }, { lon: 103.25, lat: 31.9 }, { lon: 103.55, lat: 32.8 }] },
  { name: '橫斷山', width: 0.46, label: { lon: 100.8, lat: 29.0 }, points: [{ lon: 98.1, lat: 28.1 }, { lon: 99.0, lat: 28.8 }, { lon: 99.7, lat: 29.7 }, { lon: 100.4, lat: 30.5 }, { lon: 101.25, lat: 31.5 }, { lon: 102.0, lat: 32.4 }] },
  { name: '武陵山', width: 0.3, label: { lon: 109.8, lat: 29.55 }, points: [{ lon: 108.8, lat: 28.15 }, { lon: 109.4, lat: 28.8 }, { lon: 110.1, lat: 29.55 }, { lon: 110.7, lat: 30.25 }, { lon: 111.2, lat: 30.9 }] },
  { name: '雪峰山', width: 0.23, label: { lon: 110.8, lat: 27.5 }, points: [{ lon: 110.0, lat: 25.8 }, { lon: 110.6, lat: 26.45 }, { lon: 111.0, lat: 27.2 }, { lon: 111.15, lat: 28.0 }, { lon: 111.0, lat: 28.65 }] },
  { name: '南嶺', width: 0.34, label: { lon: 110.9, lat: 25.2 }, points: [{ lon: 108.6, lat: 25.05 }, { lon: 110.2, lat: 25.2 }, { lon: 112.0, lat: 25.05 }, { lon: 113.8, lat: 25.25 }, { lon: 115.5, lat: 25.45 }] },
  { name: '大別山', width: 0.28, label: { lon: 115.4, lat: 31.95 }, points: [{ lon: 113.8, lat: 31.8 }, { lon: 114.8, lat: 31.45 }, { lon: 115.8, lat: 31.35 }, { lon: 116.8, lat: 31.6 }] },
  { name: '武夷山', width: 0.3, label: { lon: 117.7, lat: 27.7 }, points: [{ lon: 116.8, lat: 25.5 }, { lon: 117.25, lat: 26.3 }, { lon: 117.8, lat: 27.2 }, { lon: 118.3, lat: 28.2 }, { lon: 118.8, lat: 29.0 }] },
]

/** 加密山脊折线并沿法线做确定性摆动，避免山脉成为笔直的线状带。 */
function warpRidge(points: GeoPoint[], rangeSeed: number, amplitude: number): GeoPoint[] {
  const warped: GeoPoint[] = []
  for (let index = 0; index < points.length - 1; index++) {
    const first = points[index]!
    const second = points[index + 1]!
    const steps = Math.max(3, Math.round(Math.hypot(second.lon - first.lon, second.lat - first.lat) / 0.18))
    const longitudeScale = Math.cos(((first.lat + second.lat) / 2) * Math.PI / 180)
    const dx = (second.lon - first.lon) * longitudeScale
    const dy = second.lat - first.lat
    const length = Math.hypot(dx, dy) || 1
    for (let step = 0; step < steps; step++) {
      const t = step / steps
      const lon = first.lon + (second.lon - first.lon) * t
      const lat = first.lat + (second.lat - first.lat) * t
      // 两个空间尺度的摆动叠加，形成自然弯曲而非均匀蛇形。
      const sway = ((sampleNoise(rangeSeed, lon, lat, 22) - 0.5) * 1.1 + (sampleNoise(rangeSeed + 77, lon, lat, 8) - 0.5) * 0.5) * amplitude
      warped.push({ lon: lon - (dy / length) * sway / longitudeScale, lat: lat + (dx / length) * sway })
    }
  }
  warped.push(points[points.length - 1]!)
  return warped
}

const RIDGE_PATHS = new Map(MOUNTAIN_RANGES.map((range) => [range, warpRidge(range.points, nameSeed(range.name) + 479, 0.6)] as const))

const MOUNTAIN_RANGE_BOUNDS = new Map(MOUNTAIN_RANGES.map((range) => {
  const points = RIDGE_PATHS.get(range)!
  return [range, {
    minLon: Math.min(...points.map((point) => point.lon)) - range.width * 3,
    maxLon: Math.max(...points.map((point) => point.lon)) + range.width * 3,
    minLat: Math.min(...points.map((point) => point.lat)) - range.width * 3,
    maxLat: Math.max(...points.map((point) => point.lat)) + range.width * 3,
  }] as const
}))

const MOUNTAIN_PASSES: { name: string; lon: number; lat: number; radius: number }[] = [
  { name: '褒斜道', lon: 107.25, lat: 33.65, radius: 0.22 },
  { name: '陳倉道', lon: 106.9, lat: 34.2, radius: 0.18 },
  { name: '子午道', lon: 108.8, lat: 33.6, radius: 0.18 },
  { name: '米倉道', lon: 106.6, lat: 32.25, radius: 0.2 },
  { name: '巫峽道', lon: 110.15, lat: 30.9, radius: 0.18 },
  { name: '武關道', lon: 110.45, lat: 33.5, radius: 0.17 },
  { name: '梅關道', lon: 114.35, lat: 25.0, radius: 0.18 },
]

const NAMED_LOWLANDS: { name: string; points: GeoPoint[] }[] = [
  { name: '河西走廊', points: [{ lon: 96.8, lat: 37.2 }, { lon: 100.4, lat: 37.3 }, { lon: 103.6, lat: 38.0 }, { lon: 103.5, lat: 40.0 }, { lon: 100.5, lat: 39.7 }, { lon: 97.0, lat: 38.8 }] },
  { name: '關中平原', points: [{ lon: 106.2, lat: 33.8 }, { lon: 107.5, lat: 33.5 }, { lon: 109.5, lat: 33.8 }, { lon: 110.7, lat: 34.6 }, { lon: 110.2, lat: 35.2 }, { lon: 107.7, lat: 35.0 }, { lon: 106.3, lat: 34.7 }] },
  { name: '漢中盆地', points: [{ lon: 105.7, lat: 32.5 }, { lon: 106.4, lat: 32.5 }, { lon: 107.8, lat: 32.8 }, { lon: 108.2, lat: 33.4 }, { lon: 107.0, lat: 33.65 }, { lon: 105.8, lat: 33.2 }] },
  { name: '成都平原', points: [{ lon: 102.7, lat: 30.3 }, { lon: 103.2, lat: 30.1 }, { lon: 104.9, lat: 30.3 }, { lon: 105.3, lat: 31.0 }, { lon: 104.9, lat: 31.7 }, { lon: 103.3, lat: 31.6 }, { lon: 102.7, lat: 31.0 }] },
  { name: '華北平原', points: [{ lon: 113.0, lat: 33.6 }, { lon: 116.2, lat: 33.3 }, { lon: 120.7, lat: 34.0 }, { lon: 120.8, lat: 38.0 }, { lon: 117.0, lat: 38.2 }, { lon: 113.4, lat: 36.5 }] },
  { name: '江漢平原', points: [{ lon: 111.3, lat: 29.7 }, { lon: 112.2, lat: 29.5 }, { lon: 114.6, lat: 29.8 }, { lon: 114.9, lat: 31.3 }, { lon: 113.7, lat: 31.7 }, { lon: 112.0, lat: 31.2 }] },
  { name: '江淮平原', points: [{ lon: 115.0, lat: 31.3 }, { lon: 116.1, lat: 31.0 }, { lon: 119.0, lat: 31.4 }, { lon: 119.5, lat: 33.1 }, { lon: 117.8, lat: 33.5 }, { lon: 115.5, lat: 33.2 }] },
  { name: '雲貴高原', points: [{ lon: 99.5, lat: 24.0 }, { lon: 101.0, lat: 23.6 }, { lon: 104.0, lat: 24.0 }, { lon: 105.0, lat: 26.6 }, { lon: 103.4, lat: 27.4 }, { lon: 100.6, lat: 26.8 }] },
]

// 河道控制点为策略地图示意，依据《水经注》所载水系关系与地理走廊校对；
// 不表示建安十三年实测河槽、湖岸或河宽，width 只是绘制与栅格化尺度。
export const RIVERS: { name: string; points: GeoPoint[]; width: number; terminal: RiverTerminal; source?: { kind: 'lake'; name: string } }[] = [
  { name: '黄河', width: 0.15, terminal: { kind: 'pending', target: 'sea', detail: '预期入海，下游示意走廊待确认' }, points: [{ lon: 97, lat: 35 }, { lon: 100, lat: 35.2 }, { lon: 103.8, lat: 36.1 }, { lon: 105.7, lat: 37 }, { lon: 106.3, lat: 39 }, { lon: 107, lat: 40.5 }, { lon: 109.5, lat: 40.7 }, { lon: 110.5, lat: 40 }, { lon: 110.6, lat: 37.5 }, { lon: 110.3, lat: 34.6 }, { lon: 112.4, lat: 34.9 }, { lon: 114, lat: 35.2 }, { lon: 116, lat: 37.3 }, { lon: 118.7, lat: 37.5 }, { lon: 120, lat: 37.8 }] },
  // 长江按宜宾—泸州—江州—江陵—夏口—秣陵—入海走廊示意；宜宾、泸州、江州为显式汇流点。
  { name: '长江', width: 0.19, terminal: { kind: 'sea', point: { lon: 122.1, lat: 31.1 } }, points: [{ lon: 96, lat: 30.2 }, { lon: 99, lat: 28 }, { lon: 101.5, lat: 26.6 }, { lon: 103, lat: 28.2 }, { lon: 104.6, lat: 28.75 }, { lon: 105.44, lat: 28.87 }, { lon: 106.55, lat: 29.56 }, { lon: 108.4, lat: 30.8 }, { lon: 109.47, lat: 31.02 }, { lon: 111.3, lat: 30.7 }, { lon: 112.19, lat: 30.35 }, { lon: 113.25, lat: 30.47 }, { lon: 114.31, lat: 30.59 }, { lon: 115.99, lat: 29.73 }, { lon: 117.1, lat: 30.5 }, { lon: 118.79, lat: 32.06 }, { lon: 120, lat: 31.8 }, { lon: 121.5, lat: 31.3 }, { lon: 122.1, lat: 31.1 }] },
  { name: '汉水', width: 0.12, terminal: { kind: 'river', target: '长江', point: { lon: 114.31, lat: 30.59 } }, points: [{ lon: 106, lat: 33.1 }, { lon: 108, lat: 32.8 }, { lon: 109.5, lat: 32.4 }, { lon: 112.14, lat: 32.04 }, { lon: 113, lat: 31.4 }, { lon: 114.31, lat: 30.59 }] },
  // 淮水下游在本图仅作待定示意，避免沿不可靠岸线无约束延伸。
  { name: '淮水', width: 0.1, terminal: { kind: 'pending', target: 'sea', detail: '预期入海，下游示意走廊待确认' }, points: [{ lon: 113.2, lat: 32.4 }, { lon: 114.5, lat: 32.4 }, { lon: 116, lat: 32.55 }, { lon: 117.5, lat: 32.85 }, { lon: 118.7, lat: 33.25 }, { lon: 119.6, lat: 33.9 }] },
  { name: '湘水', width: 0.08, terminal: { kind: 'lake', target: '洞庭湖' }, points: [{ lon: 110.95, lat: 25.75 }, { lon: 111.61, lat: 26.42 }, { lon: 112.2, lat: 27.5 }, { lon: 112.94, lat: 28.23 }, { lon: 112.8, lat: 29.3 }] },
  { name: '赣水', width: 0.09, terminal: { kind: 'lake', target: '鄱陽湖' }, points: [{ lon: 114.9, lat: 25.8 }, { lon: 114.9, lat: 26.8 }, { lon: 115.2, lat: 27.5 }, { lon: 115.8, lat: 28.6 }, { lon: 116.1, lat: 29.7 }] },
  { name: '珠江', width: 0.12, terminal: { kind: 'sea', point: { lon: 113.8, lat: 22.5 } }, points: [{ lon: 106.5, lat: 25.5 }, { lon: 109, lat: 24.2 }, { lon: 111, lat: 24 }, { lon: 113, lat: 23.2 }, { lon: 113.5, lat: 22.8 }, { lon: 113.8, lat: 22.5 }] },
  // 岷江经都江堰、乐山至宜宾入江，不再止于成都平原南缘。
  { name: '岷江', width: 0.08, terminal: { kind: 'river', target: '长江', point: { lon: 104.6, lat: 28.75 } }, points: [{ lon: 103.8, lat: 32.7 }, { lon: 103.6, lat: 31.8 }, { lon: 103.8, lat: 31.2 }, { lon: 104.1, lat: 30.75 }, { lon: 104.15, lat: 30.55 }, { lon: 103.75, lat: 29.55 }, { lon: 104.6, lat: 28.75 }] },
  // 沱江经泸州入江；泸州同时是长江控制点，构成显式汇流。
  { name: '沱江', width: 0.07, terminal: { kind: 'river', target: '长江', point: { lon: 105.44, lat: 28.87 } }, points: [{ lon: 104.6, lat: 31.6 }, { lon: 104.55, lat: 30.9 }, { lon: 104.75, lat: 30.4 }, { lon: 105.05, lat: 29.85 }, { lon: 105.44, lat: 28.87 }] },
  // 嘉陵江经合川至江州入江；合川为与涪江的显式汇流点。
  { name: '嘉陵江', width: 0.09, terminal: { kind: 'river', target: '长江', point: { lon: 106.55, lat: 29.56 } }, points: [{ lon: 105.5, lat: 33.2 }, { lon: 106.1, lat: 32.2 }, { lon: 106.0, lat: 31.1 }, { lon: 106.27, lat: 30.0 }, { lon: 106.55, lat: 29.56 }] },
  { name: '涪江', width: 0.06, terminal: { kind: 'river', target: '嘉陵江', point: { lon: 106.27, lat: 30.0 } }, points: [{ lon: 103.9, lat: 32.0 }, { lon: 104.7, lat: 31.5 }, { lon: 105.3, lat: 30.9 }, { lon: 106.0, lat: 30.1 }, { lon: 106.27, lat: 30.0 }] },
  // 沅水入洞庭湖，经湖泊水域通江，不再直接接到江陵附近的长江控制点。
  { name: '沅水', width: 0.07, terminal: { kind: 'lake', target: '洞庭湖' }, points: [{ lon: 109.8, lat: 27.4 }, { lon: 110.0, lat: 28.1 }, { lon: 110.4, lat: 28.7 }, { lon: 111.1, lat: 29.1 }, { lon: 112.2, lat: 29.2 }] },
  { name: '洞庭湖出水道', width: 0.08, terminal: { kind: 'river', target: '长江', point: { lon: 113.25, lat: 30.47 } }, source: { kind: 'lake', name: '洞庭湖' }, points: [{ lon: 113.1, lat: 29.7 }, { lon: 113.25, lat: 30.05 }, { lon: 113.25, lat: 30.47 }] },
]

/** 将河道控制折线按约零点一度加密，只细化采样，不添加无史料依据的横向摆动。 */
function densifyRiver(points: GeoPoint[]): GeoPoint[] {
  const densified: GeoPoint[] = []
  for (let index = 0; index < points.length - 1; index++) {
    const first = points[index]!
    const second = points[index + 1]!
    const steps = Math.max(3, Math.round(Math.hypot(second.lon - first.lon, second.lat - first.lat) / 0.1))
    for (let step = 0; step < steps; step++) {
      const t = step / steps
      densified.push({ lon: first.lon + (second.lon - first.lon) * t, lat: first.lat + (second.lat - first.lat) * t })
    }
  }
  densified.push(points[points.length - 1]!)
  return densified
}

const RIVER_PATHS = new Map(RIVERS.map((river) => [river, densifyRiver(river.points)] as const))

// 湖岸为策略地图的示意折线，描述水系位置与河网形态，不等同汉末精确岸线。
export const LAKES: { name: string; points: GeoPoint[]; islands?: GeoPoint[][]; label: GeoPoint }[] = [
  { name: '洞庭湖', label: { lon: 112.95, lat: 29.45 }, points: [{ lon: 111.75, lat: 29.65 }, { lon: 112.08, lat: 30.02 }, { lon: 112.47, lat: 29.88 }, { lon: 112.74, lat: 30.0 }, { lon: 113.13, lat: 29.82 }, { lon: 113.52, lat: 29.55 }, { lon: 113.48, lat: 29.28 }, { lon: 113.16, lat: 29.02 }, { lon: 112.76, lat: 28.98 }, { lon: 112.4, lat: 29.12 }, { lon: 112.06, lat: 29.18 }] },
  { name: '鄱陽湖', label: { lon: 116.25, lat: 29.35 }, points: [{ lon: 115.62, lat: 29.95 }, { lon: 115.92, lat: 30.02 }, { lon: 116.13, lat: 29.83 }, { lon: 116.41, lat: 29.7 }, { lon: 116.56, lat: 29.4 }, { lon: 116.44, lat: 29.08 }, { lon: 116.32, lat: 28.78 }, { lon: 116.17, lat: 28.52 }, { lon: 115.95, lat: 28.64 }, { lon: 115.82, lat: 28.9 }, { lon: 115.67, lat: 29.2 }], islands: [[{ lon: 116.02, lat: 29.36 }, { lon: 116.12, lat: 29.42 }, { lon: 116.2, lat: 29.34 }, { lon: 116.13, lat: 29.26 }]] },
  { name: '太湖', label: { lon: 120.02, lat: 31.25 }, points: [{ lon: 119.78, lat: 31.55 }, { lon: 120.12, lat: 31.52 }, { lon: 120.45, lat: 31.43 }, { lon: 120.65, lat: 31.22 }, { lon: 120.48, lat: 30.98 }, { lon: 120.19, lat: 30.84 }, { lon: 119.92, lat: 30.93 }, { lon: 119.72, lat: 31.08 }] },
  { name: '巢湖', label: { lon: 117.45, lat: 31.55 }, points: [{ lon: 116.92, lat: 31.75 }, { lon: 117.14, lat: 31.89 }, { lon: 117.42, lat: 31.84 }, { lon: 117.75, lat: 31.72 }, { lon: 117.92, lat: 31.52 }, { lon: 117.75, lat: 31.34 }, { lon: 117.43, lat: 31.29 }, { lon: 117.13, lat: 31.42 }] },
]

const MARSH_REGIONS: GeoPoint[][] = [
  [{ lon: 111.2, lat: 30.7 }, { lon: 112.1, lat: 31.0 }, { lon: 113.0, lat: 30.8 }, { lon: 113.8, lat: 30.4 }, { lon: 114.0, lat: 29.7 }, { lon: 113.2, lat: 29.4 }, { lon: 112.2, lat: 29.7 }, { lon: 111.4, lat: 30.0 }],
  [{ lon: 112.8, lat: 33.1 }, { lon: 114.1, lat: 33.0 }, { lon: 115.5, lat: 32.9 }, { lon: 117.0, lat: 33.1 }, { lon: 118.5, lat: 33.2 }, { lon: 118.8, lat: 32.7 }, { lon: 117.1, lat: 32.4 }, { lon: 115.5, lat: 32.5 }, { lon: 114.0, lat: 32.7 }],
  [{ lon: 119.1, lat: 34.0 }, { lon: 120.1, lat: 34.3 }, { lon: 120.9, lat: 34.1 }, { lon: 120.6, lat: 33.4 }, { lon: 119.7, lat: 33.1 }, { lon: 119.2, lat: 33.4 }],
  [{ lon: 100.0, lat: 25.7 }, { lon: 100.3, lat: 26.1 }, { lon: 100.6, lat: 25.9 }, { lon: 100.7, lat: 25.5 }, { lon: 100.4, lat: 25.2 }, { lon: 100.1, lat: 25.3 }],
]

const FOREST_REGIONS: GeoPoint[][] = [
  [{ lon: 97.8, lat: 27.1 }, { lon: 99.0, lat: 27.6 }, { lon: 100.2, lat: 28.2 }, { lon: 101.5, lat: 29.0 }, { lon: 102.4, lat: 30.0 }, { lon: 101.4, lat: 30.6 }, { lon: 100.3, lat: 29.8 }, { lon: 99.2, lat: 29.1 }, { lon: 98.2, lat: 28.5 }],
  [{ lon: 102.4, lat: 26.7 }, { lon: 103.4, lat: 27.2 }, { lon: 104.3, lat: 28.4 }, { lon: 104.9, lat: 29.8 }, { lon: 104.2, lat: 30.6 }, { lon: 103.4, lat: 29.3 }, { lon: 102.6, lat: 28.4 }],
  [{ lon: 115.4, lat: 27.1 }, { lon: 116.4, lat: 27.8 }, { lon: 117.0, lat: 28.8 }, { lon: 118.2, lat: 29.4 }, { lon: 119.0, lat: 30.0 }, { lon: 118.3, lat: 30.6 }, { lon: 117.3, lat: 30.0 }, { lon: 116.5, lat: 29.1 }, { lon: 115.7, lat: 28.2 }],
  [{ lon: 119.0, lat: 26.2 }, { lon: 120.0, lat: 26.8 }, { lon: 120.8, lat: 27.8 }, { lon: 121.2, lat: 28.7 }, { lon: 120.6, lat: 29.2 }, { lon: 119.9, lat: 28.3 }, { lon: 119.2, lat: 27.5 }],
]

const CITY_RECORDS: CityRecord[] = [
  { id: 'chengdu', name: '成都', en: 'CHENGDU', province: '益州', prefecture: '蜀郡', faction: 'liuzhang', lon: 104.0668, lat: 30.5728, description: '益州治所，據成都平原沃土，西川兵糧之源。' },
  { id: 'luoyang', name: '洛陽', en: 'LUOYANG', province: '司隸', prefecture: '河南尹', faction: 'cao', lon: 112.454, lat: 34.6197, description: '東漢舊都，北臨黃河，南屏嵩山，為天下中樞。' },
  { id: 'xuchang', name: '許縣', en: 'XUXIAN', province: '豫州', prefecture: '潁川郡', faction: 'cao', lon: 113.8526, lat: 34.0357, description: '許縣為漢廷所在，曹操挾天子以令諸侯的政治中心。' },
  { id: 'chang-an', name: '長安', en: 'CHANGAN', province: '司隸', prefecture: '京兆尹', faction: 'cao', lon: 108.94, lat: 34.26, description: '關中故都，建安十三年仍屬司隸京兆尹。' },
  { id: 'ye', name: '鄴', en: 'YE', province: '冀州', prefecture: '魏郡', faction: 'cao', lon: 114.6, lat: 36.33, description: '河北要城，曹操經營北方的根基之一，控帶太行與平原。' },
  { id: 'beiping', name: '土垠', en: 'TUGEN', province: '幽州', prefecture: '右北平郡', faction: 'cao', lon: 118.2, lat: 39.8, description: '右北平郡治土垠，北接燕山，為幽州東北邊城；點位為郡治故城的近似定位。' },
  { id: 'jinyang', name: '晉陽', en: 'JINYANG', province: '并州', prefecture: '太原郡', faction: 'cao', lon: 112.55, lat: 37.87, description: '太原盆地雄城，西望呂梁，東臨太行。' },
  { id: 'pingyuan', name: '平原', en: 'PINGYUAN', province: '青州', prefecture: '平原郡', faction: 'cao', lon: 116.36, lat: 37.43, description: '黃河下游平原郡城，扼守冀州、青州往來之路。' },
  { id: 'nanpi', name: '南皮', en: 'NANPI', province: '冀州', prefecture: '勃海郡', faction: 'cao', lon: 116.7, lat: 38.04, description: '勃海郡治，瀕近燕趙海口，素為河北軍事重地。' },
  { id: 'xiapi', name: '下邳', en: 'XIAPI', province: '徐州', prefecture: '下邳郡', faction: 'cao', lon: 117.88689, lat: 34.11826, description: '建安十一年下邳國除為郡；郡治下邳，控淮泗水陸要道。' },
  { id: 'beihai', name: '劇縣', en: 'JUXIAN', province: '青州', prefecture: '北海郡', faction: 'cao', lon: 118.75, lat: 36.8, description: '建安十一年（206）北海國除為郡；郡治劇縣，位於青州東境。點位為劇縣故城的近似定位。' },
  { id: 'puyang', name: '濮陽', en: 'PUYANG', province: '兗州', prefecture: '東郡', faction: 'cao', lon: 115.03, lat: 35.76, description: '兗州東郡治濮陽，黃河津渡要城，為中原北門之一。' },
  { id: 'chenliu', name: '陳留', en: 'CHENLIU', province: '兗州', prefecture: '陳留郡', faction: 'cao', lon: 114.3, lat: 34.8, description: '汴渠與中原驛路交會，東西轉運皆經其境。' },
  { id: 'runan', name: '平輿', en: 'PINGYU', province: '豫州', prefecture: '汝南郡', faction: 'cao', lon: 114.63, lat: 32.96, description: '汝南郡治平輿，潁汝之間水網與沃土交錯，兵員糧源充足；點位為郡治故城的近似定位。' },
  { id: 'shouchun', name: '壽春', en: 'SHOUCHUN', province: '揚州', prefecture: '九江郡', faction: 'cao', lon: 116.79, lat: 32.57, description: '淮南重鎮，北拒中原，南通合肥與江東。' },
  { id: 'hefei', name: '合肥', en: 'HEFEI', province: '揚州', prefecture: '九江郡', faction: 'cao', lon: 117.23, lat: 31.82, description: '東漢合肥侯國屬九江郡，為淮南水陸咽喉。' },
  { id: 'jianye', name: '秣陵', en: 'MOLING', province: '揚州', prefecture: '丹陽郡', faction: 'sun', lon: 118.79, lat: 32.06, description: '丹陽郡境大江津渡，孫權所據江東腹地，舟楫可達諸郡。' },
  { id: 'wu', name: '吳縣', en: 'WUXIAN', province: '揚州', prefecture: '吳郡', faction: 'sun', lon: 120.62, lat: 31.3, description: '吳郡治吳縣，江東膏腴之地，湖蕩相間，桑麻與舟楫俱盛。' },
  { id: 'kuaiji', name: '山陰', en: 'SHANYIN', province: '揚州', prefecture: '會稽郡', faction: 'sun', lon: 120.58, lat: 30, description: '會稽郡治山陰，東南沿海郡城，山越環伺，港汊綿延。' },
  { id: 'lujiang', name: '皖城', en: 'WAN', province: '揚州', prefecture: '廬江郡', faction: 'local', lon: 116.57, lat: 30.63, description: '孫策於建安四年（199）襲取皖城，後由李術守城；建安十三年此城實際控制方待考，點位為近似定位。' },
  { id: 'chaishang', name: '柴桑', en: 'CHAISANG', province: '揚州', prefecture: '豫章郡', faction: 'sun', lon: 115.99, lat: 29.73, description: '長江與鄱陽湖之間的要津，通江東而控荊州。' },
  // 208 年春孫權破黃祖後，分漢江夏郡置吳江夏郡，治沙羨；此點僅示沙羨一帶，不代表全江夏郡。
  { id: 'jiangxia', name: '沙羨', en: 'SHAXIAN', province: '荊州', prefecture: '江夏郡', faction: 'sun', lon: 114.13541, lat: 30.34289, description: '建安十三年春孫權破黃祖後，分漢江夏郡置吳江夏郡，治沙羨；此點不代表全江夏郡歸屬。' },
  { id: 'xiangyang', name: '襄陽', en: 'XIANGYANG', province: '荊州', prefecture: '南郡', faction: 'liubiao', lon: 112.14, lat: 32.04, description: '劉表所據荊州重城，此時屬南郡；襄陽郡為劉琮降曹後分置，尚未發生。' },
  { id: 'jiangling', name: '江陵', en: 'JIANGLING', province: '荊州', prefecture: '南郡', faction: 'liubiao', lon: 112.19, lat: 30.35, description: '南郡治所，據長江中游，東西荊州交界之戰略樞紐。' },
  { id: 'changsha', name: '臨湘', en: 'LINXIANG', province: '荊州', prefecture: '長沙郡', faction: 'liubiao', lon: 112.94, lat: 28.23, description: '長沙郡治臨湘，湘水穿城而過，南望嶺表，為荊州南部大郡。' },
  { id: 'wuling', name: '臨沅', en: 'LINYUAN', province: '荊州', prefecture: '武陵郡', faction: 'liubiao', lon: 111.69, lat: 29.03, description: '武陵郡治臨沅，五溪與武陵山交界之處，通巴蜀、荊南之路。' },
  { id: 'lingling', name: '泉陵', en: 'QUANLING', province: '荊州', prefecture: '零陵郡', faction: 'liubiao', lon: 111.61, lat: 26.42, description: '零陵郡治泉陵，湘水上游之郡，北通荊南，南入五嶺山道。' },
  { id: 'guiyang', name: '郴縣', en: 'CHENXIAN', province: '荊州', prefecture: '桂陽郡', faction: 'liubiao', lon: 113.02, lat: 25.79, description: '桂陽郡治郴縣，五嶺北麓關隘郡城，據南北轉運與山道隘口。' },
  { id: 'hanzhong', name: '南鄭', en: 'NANZHENG', province: '益州', prefecture: '漢中郡', faction: 'zhanglu', lon: 107.02, lat: 33.07, description: '張魯據漢中，治南鄭，與劉璋割據爭戰；僅示城邑控制，不推定巴漢精確疆界。' },
  { id: 'zitong', name: '梓潼', en: 'ZITONG', province: '益州', prefecture: '廣漢郡', faction: 'liuzhang', lon: 105.17, lat: 31.64, description: '梓潼縣屬廣漢郡，益州北道要地，連通漢中棧道與成都平原；梓潼郡至建安二十二年（217）始分置。' },
  { id: 'jiangzhou', name: '江州', en: 'JIANGZHOU', province: '益州', prefecture: '巴郡', faction: 'liuzhang', lon: 106.55, lat: 29.56, description: '嘉陵、長江交會之城，居巴蜀水陸轉運中心。' },
  { id: 'yongan', name: '魚復', en: 'YUFU', province: '益州', prefecture: '巴東郡', faction: 'liuzhang', lon: 109.47, lat: 31.02, description: '建安六年（201）固陵郡改名巴東郡，郡治魚復；此處為後世治所白帝城一帶的近似點位。' },
  { id: 'wudu', name: '下辨', en: 'XIABIAN', province: '涼州', prefecture: '武都郡', faction: 'local', lon: 105.78, lat: 33.79, description: '武都郡治下辨，屬涼州，約在今成縣一帶；點位為近似定位，漢末具體控制情況待考。' },
  { id: 'tianshui', name: '冀縣', en: 'JIXIAN', province: '涼州', prefecture: '漢陽郡', faction: 'local', lon: 105.38878, lat: 34.73837, description: '漢陽郡治冀縣，隸屬涼州；此時具體控制方不作確定判定。' },
  { id: 'anding', name: '臨涇', en: 'LINJING', province: '涼州', prefecture: '安定郡', faction: 'local', lon: 107.37, lat: 35.31, description: '安定郡治臨涇，約在今涇川水泉寺一帶；此時仍屬涼州，控制方待考。' },
  { id: 'wuwei', name: '姑臧', en: 'GUZANG', province: '雍州', prefecture: '武威郡', faction: 'local', lon: 102.64, lat: 37.93, description: '武威郡治姑臧，興平元年（194）置雍州統轄河西四郡，姑臧為州、郡治所；具體控制待考。' },
  { id: 'yunnan', name: '雲南縣', en: 'YUNNAN', province: '益州', prefecture: '永昌郡', faction: 'local', lon: 100.55, lat: 25.48, description: '東漢永昌郡雲南縣，約在今雲南驛，非今大理城或滇池；點位為近似定位，實際控制待考。' },
  { id: 'jianning', name: '味縣', en: 'WEIXIAN', province: '益州', prefecture: '益州郡', faction: 'local', lon: 103.73, lat: 25.53, description: '東漢益州郡味縣，約在今曲靖一帶；點位為近似定位，地方勢力與實際控制待考。' },
  { id: 'nanhai', name: '番禺', en: 'PANYU', province: '交州', prefecture: '南海郡', faction: 'local', lon: 113.25607, lat: 23.13462, description: '南海郡治番禺，嶺南海上門戶；本時點實際控制待考，不以後來吳地歸屬推定孫權控制。' },
  { id: 'jiaozhi', name: '龍編', en: 'LONGBIAN', province: '交州', prefecture: '交趾郡', faction: 'shixie', lon: 105.95475, lat: 21.09321, description: '交趾郡治龍編，士燮所據交州地方勢力；士燮至建安十五年才歸附孫權。點位參照後世龍編治所，漢末精確位置待考。' }
]

const CITY_OFFSETS: [number, number][] = [[0, 0], ...DIRECTIONS]

/** 把軸向六邊形座標轉成尖頂六邊形中心像素。 */
export function hexToPixel(q: number, r: number): { x: number; y: number } {
  return { x: Math.sqrt(3) * HEX_SIZE * (q + r / 2), y: 1.5 * HEX_SIZE * r }
}

/** 將平面像素位置轉回最近的軸向六邊形坐標。 */
export function pixelToHex(x: number, y: number): { q: number; r: number } {
  const q = (Math.sqrt(3) / 3 * x - y / 3) / HEX_SIZE
  const r = 2 / 3 * y / HEX_SIZE
  const cubeX = q
  const cubeZ = r
  const cubeY = -cubeX - cubeZ
  let roundedX = Math.round(cubeX)
  let roundedY = Math.round(cubeY)
  let roundedZ = Math.round(cubeZ)
  const deltaX = Math.abs(roundedX - cubeX)
  const deltaY = Math.abs(roundedY - cubeY)
  const deltaZ = Math.abs(roundedZ - cubeZ)
  if (deltaX > deltaY && deltaX > deltaZ) roundedX = -roundedY - roundedZ
  else if (deltaY > deltaZ) roundedY = -roundedX - roundedZ
  else roundedZ = -roundedX - roundedY
  void roundedY
  return { q: roundedX, r: roundedZ }
}

/** 將歷史經緯度投影到本地游戲戰略圖坐標系。 */
export function geoToPixel(lon: number, lat: number): { x: number; y: number } {
  return { x: 245 + (lon - GEO_LEFT) * GEO_SCALE_X, y: 112 + (GEO_TOP - lat) * GEO_SCALE_Y }
}

/** 統一生成地形網格、海岸帶、具名山道與具有七格城域的三國城池。 */
export function createWorld(seed = 189): World {
  const tiles = new Map<string, HexTile>()
  const cityCenters: { city: City; tiles: HexTile[] }[] = []
  const reserved = new Set<string>()
  const qLimit = Math.ceil(WORLD_WIDTH / (Math.sqrt(3) * HEX_SIZE)) + 4
  const rLimit = Math.ceil(WORLD_HEIGHT / (1.5 * HEX_SIZE)) + 4

  for (let r = -rLimit; r <= rLimit; r++) {
    for (let q = -qLimit; q <= qLimit; q++) {
      const point = hexToPixel(q, r)
      if (point.x < -16 || point.x > WORLD_WIDTH + 16 || point.y < -16 || point.y > WORLD_HEIGHT + 16) continue
      const geo = pixelToGeo(point.x, point.y)
      const land = isLand(geo.lon, geo.lat)
      const key = hexKey(q, r)
      if (!land && !isNearCoast(geo.lon, geo.lat)) continue
      const detail = land ? getLandTerrain(geo.lon, geo.lat, seed) : { terrain: 'coast' as TerrainId, landform: '近海', relief: 0 }
      tiles.set(key, { q, r, x: point.x, y: point.y, lon: round2(geo.lon), lat: round2(geo.lat), ...detail })
    }
  }

  // 先成河，再开山道，最后落城，避免后续步骤破坏已完成的连通性。
  const rivers = rasterizeRivers(tiles)
  const confluences = findExplicitConfluences(tiles)
  const passes = carveMountainPasses(tiles)
  const passTiles = new Set(passes.flatMap((pass) => pass.tileKeys))

  for (const record of CITY_RECORDS) {
    const target = geoToPixel(record.lon, record.lat)
    const center = findCityCenter(target.x, target.y, tiles, reserved, passTiles)
    if (!center) continue
    const city: City = { ...record, q: center.q, r: center.r, tileKeys: [] }
    const footprint: HexTile[] = []
    for (const [dq, dr] of CITY_OFFSETS) {
      const tile = tiles.get(hexKey(center.q + dq, center.r + dr))
      if (!tile) continue
      footprint.push(tile)
    }
    if (footprint.length !== 7) continue
    city.tileKeys = footprint.map((tile) => hexKey(tile.q, tile.r))
    footprint.forEach((tile) => {
      reserved.add(hexKey(tile.q, tile.r))
      tile.cityId = city.id
      tile.cityCenter = tile.q === center.q && tile.r === center.r
      if (tile.cityCenter) tile.terrain = 'plain'
    })
    cityCenters.push({ city, tiles: footprint })
  }

  return { tiles, cities: cityCenters.map(({ city }) => city), width: WORLD_WIDTH, height: WORLD_HEIGHT, seed, rivers, confluences, passes }
}

/** 返回可在本世界已生成地图範圍內直達的鄰接格。 */
export function neighbors(tile: HexTile, world: World): HexTile[] {
  return DIRECTIONS.map(([dq, dr]) => world.tiles.get(hexKey(tile.q + dq, tile.r + dr))).filter((neighbor): neighbor is HexTile => Boolean(neighbor))
}

/** 按兵種、地形和配備的舟船或棧道計算單格移動力。 */
export function movementCost(tile: HexTile, options: MovementOptions): number {
  if (tile.terrain === 'mountain') return options.plank ? (options.unit === 'infantry' ? 3 : 4) : Infinity
  if (tile.terrain === 'river' || tile.terrain === 'lake' || tile.terrain === 'coast') return options.boat ? 1 : Infinity
  if (tile.terrain === 'marsh') return options.unit === 'infantry' ? 3 : Infinity
  if (tile.terrain === 'plain') return 1
  if (tile.terrain === 'forest' || tile.terrain === 'hill') return options.unit === 'infantry' ? 2 : 3
  return Infinity
}

/** 使用 A* 查找含地形消耗權重的最低移動力行軍路線。 */
export function findPath(world: World, start: HexTile, end: HexTile, options: MovementOptions): { tiles: HexTile[]; cost: number } | null {
  const startKey = hexKey(start.q, start.r)
  const endKey = hexKey(end.q, end.r)
  const worldStart = world.tiles.get(startKey)
  const worldEnd = world.tiles.get(endKey)
  if (!worldStart || !worldEnd || start.terrain !== worldStart.terrain || end.terrain !== worldEnd.terrain || !Number.isFinite(movementCost(worldStart, options)) || !Number.isFinite(movementCost(worldEnd, options))) return null
  if (startKey === endKey) return { tiles: [worldStart], cost: 0 }
  const open = new Set<string>([startKey])
  const previous = new Map<string, string>()
  const distance = new Map<string, number>([[startKey, 0]])
  const tileByKey = new Map<string, HexTile>([[startKey, worldStart], [endKey, worldEnd]])
  const estimated = new Map<string, number>([[startKey, axialDistance(start, end)]])

  while (open.size) {
    const currentKey = findCheapest(open, estimated)
    if (currentKey === endKey) {
      const keys = [endKey]
      let key = endKey
      while (key !== startKey) {
        const parent = previous.get(key)
        if (!parent) return null
        key = parent
        keys.push(key)
      }
      const route = keys.reverse().map((entry) => tileByKey.get(entry) ?? world.tiles.get(entry)).filter((tile): tile is HexTile => Boolean(tile))
      return { tiles: route, cost: distance.get(endKey) ?? 0 }
    }
    open.delete(currentKey)
    const current = tileByKey.get(currentKey) ?? world.tiles.get(currentKey)
    if (!current) continue
    for (const neighbor of neighbors(current, world)) {
      const stepCost = movementCost(neighbor, options)
      if (!Number.isFinite(stepCost)) continue
      const neighborKey = hexKey(neighbor.q, neighbor.r)
      tileByKey.set(neighborKey, neighbor)
      const nextDistance = (distance.get(currentKey) ?? Infinity) + stepCost
      if (nextDistance >= (distance.get(neighborKey) ?? Infinity)) continue
      previous.set(neighborKey, currentKey)
      distance.set(neighborKey, nextDistance)
      estimated.set(neighborKey, nextDistance + axialDistance(neighbor, end))
      open.add(neighborKey)
    }
  }
  return null
}

/** 判断最终地形格是否属于河流、湖泊或近海水域。 */
function isWaterTerrain(terrain: TerrainId): boolean {
  return terrain === 'river' || terrain === 'lake' || terrain === 'coast'
}

/** 复核最终地图的河道终端、河道连续、显式汇流与山道通行，返回可读问题清单。 */
export function auditConnectivity(world: World): ConnectivityIssue[] {
  const issues: ConnectivityIssue[] = []
  const describe = (before: HexTile, after: HexTile): string => `${before.lon.toFixed(2)},${before.lat.toFixed(2)} → ${after.lon.toFixed(2)},${after.lat.toFixed(2)}`

  for (const route of world.rivers) {
    if (!route.tileKeys.length) issues.push({ kind: 'river-gap', subject: route.name, detail: '河道记录为空' })
    for (let index = 0; index < route.tileKeys.length; index++) {
      const tile = world.tiles.get(route.tileKeys[index]!)
      if (!tile) {
        issues.push({ kind: 'river-gap', subject: route.name, detail: '河道记录包含未生成的格子' })
        continue
      }
      if (!isWaterTerrain(tile.terrain)) issues.push({ kind: 'river-gap', subject: route.name, detail: `河道记录格被覆盖为${tile.terrain}` })
      if (!index) continue
      const before = world.tiles.get(route.tileKeys[index - 1]!)
      if (before && !isSameOrAdjacent(before, tile)) issues.push({ kind: 'river-gap', subject: route.name, detail: `断点 ${describe(before, tile)}` })
    }

    const terminal = route.terminal
    const terminalKey = route.tileKeys.at(-1)
    const terminalTile = terminalKey ? world.tiles.get(terminalKey) : undefined
    if (terminal.kind === 'pending') {
      issues.push({ kind: 'river-pending', subject: route.name, detail: terminal.detail })
    } else if (terminal.kind === 'sea') {
      const point = geoToPixel(terminal.point.lon, terminal.point.lat)
      const hex = pixelToHex(point.x, point.y)
      const expectedKey = hexKey(hex.q, hex.r)
      if (terminalKey !== expectedKey || !terminalTile || terminalTile.terrain !== 'coast') {
        issues.push({ kind: 'river-terminal', subject: route.name, detail: '声明入海但终点格未落在指定近海水域' })
      }
    } else if (terminal.kind === 'lake') {
      if (!terminalTile || terminalTile.terrain !== 'lake' || terminalTile.landform !== terminal.target) {
        issues.push({ kind: 'river-terminal', subject: route.name, detail: `声明入${terminal.target}但末格未落入目标湖泊` })
      }
    } else {
      const target = world.rivers.find((entry) => entry.name === terminal.target)
      const point = geoToPixel(terminal.point.lon, terminal.point.lat)
      const hex = pixelToHex(point.x, point.y)
      const sharedKey = hexKey(hex.q, hex.r)
      const sharedTile = world.tiles.get(sharedKey)
      const hasSharedConfluence = world.confluences.some((entry) =>
        entry.tileKey === sharedKey && entry.rivers.includes(route.name) && entry.rivers.includes(terminal.target),
      )
      if (
        terminalKey !== sharedKey ||
        !target?.tileKeys.includes(sharedKey) ||
        !sharedTile ||
        !isWaterTerrain(sharedTile.terrain) ||
        !hasSharedConfluence
      ) {
        issues.push({ kind: 'river-terminal', subject: route.name, detail: `声明汇入${terminal.target}但未接入共享水道点` })
      }
    }

    if (route.source?.kind === 'lake') {
      const sourceKey = route.tileKeys[0]
      const sourceTile = sourceKey ? world.tiles.get(sourceKey) : undefined
      if (!sourceTile || sourceTile.terrain !== 'lake' || sourceTile.landform !== route.source.name) {
        issues.push({ kind: 'river-terminal', subject: route.name, detail: `源头未落入${route.source.name}` })
      }
    }
  }

  for (const confluence of world.confluences) {
    const tile = world.tiles.get(confluence.tileKey)
    const isWater = tile && (tile.terrain === 'river' || tile.terrain === 'lake' || tile.terrain === 'coast')
    if (!isWater) {
      issues.push({ kind: 'confluence', subject: confluence.rivers.join('·'), detail: '汇流点不是水道格' })
      continue
    }
    for (const name of confluence.rivers) {
      const route = world.rivers.find((entry) => entry.name === name)
      if (!route || !route.tileKeys.includes(confluence.tileKey)) issues.push({ kind: 'confluence', subject: name, detail: '未接入共享汇流点' })
    }
  }

  for (const pass of world.passes) {
    for (let index = 0; index < pass.tileKeys.length; index++) {
      const tile = world.tiles.get(pass.tileKeys[index]!)
      if (!tile) {
        issues.push({ kind: 'pass-gap', subject: pass.name, detail: '通道记录包含未生成的格子' })
        continue
      }
      if (tile.terrain === 'mountain') issues.push({ kind: 'pass-blocked', subject: pass.name, detail: `山道仍被山体阻断 ${tile.lon.toFixed(2)},${tile.lat.toFixed(2)}` })
      if (!index) continue
      const previous = world.tiles.get(pass.tileKeys[index - 1]!)
      if (previous && !isSameOrAdjacent(previous, tile)) issues.push({ kind: 'pass-gap', subject: pass.name, detail: '通道格不连续' })
    }
  }

  return issues
}

/** 生成帶坐標容差的地理地形，不在青藏高原和遠海散布格子。 */
function isLand(lon: number, lat: number): boolean {
  return pointInPolygon(lon, lat, LAND_OUTLINE)
    && !(lon < 97.25 && lat > 31.4)
    && !(lon < 98 && lat > 35.8)
}

/** 仅在陆地轮廓的东南真实岸线外约零点四五度保留近海航道。 */
function isNearCoast(lon: number, lat: number): boolean {
  return LAND_OUTLINE.slice(8, 29).some((point, index, coastline) => {
    const next = coastline[index + 1]
    return next !== undefined && segmentDistance(lon, lat, point.lon, point.lat, next.lon, next.lat) <= 0.45
  })
}

/** 依據河道、湖岸、多段山脊和連片植被濕地分類地塊，並保留具名地貌與相對起伏。 */
function getLandTerrain(lon: number, lat: number, seed: number): { terrain: TerrainId; landform: string; relief: number } {
  const lake = LAKES.find((candidate) => pointInPolygon(lon, lat, candidate.points) && !candidate.islands?.some((island) => pointInPolygon(lon, lat, island)))
  if (lake) return { terrain: 'lake', landform: lake.name, relief: 0 }
  const river = closestRiverDistance(lon, lat)
  if (river.name && river.distance < river.width * 0.58) return { terrain: 'river', landform: river.name, relief: 0.02 }
  const pass = findMountainPass(lon, lat)
  if (pass) return { terrain: 'hill', landform: pass.name, relief: 0.3 }
  const range = closestMountainRange(lon, lat)
  const noise = smoothNoise(seed, lon, lat)
  if (range) {
    const rangeSeed = seed + nameSeed(range.range.name)
    // 沿脊峰团决定宽窄，断口处山核收窄成垭口；块状与碎边噪声打碎平滑轮廓。
    const massif = alongNoise(rangeSeed, range.along, 18)
    const gap = alongNoise(rangeSeed + 613, range.along, 12)
    const block = sampleNoise(rangeSeed + 4177, lon, lat, 6)
    const foot = sampleNoise(rangeSeed + 9001, lon, lat, 2.2)
    const span = range.range.width * (0.9 + massif * 1.0 + block * 0.5)
    if (range.distance < span * (0.8 + foot * 0.42)) {
      const core = span * (gap < 0.38 ? 0.1 : 0.32 + block * 0.5)
      // 山体直接与平地相接，起伏明显的山麓交给全局散丘，不再沿山围一圈。
      if (range.distance < core) return { terrain: 'mountain', landform: range.range.name, relief: 0.6 + massif * 0.24 + block * 0.14 }
    }
  }
  const marsh = MARSH_REGIONS.find((region) => pointInPolygon(lon, lat, region))
  if (marsh && noise > 0.27) return { terrain: 'marsh', landform: '江湖泽地', relief: 0.04 }
  const forest = FOREST_REGIONS.find((region) => pointInPolygon(lon, lat, region))
  if (forest && noise > 0.1 && sampleNoise(seed + 991, lon, lat, 3.2) > 0.26) return { terrain: 'forest', landform: '山地林区', relief: 0.16 + noise * 0.12 }
  const lowland = NAMED_LOWLANDS.find((region) => pointInPolygon(lon, lat, region.points))
  if (lowland) return { terrain: 'plain', landform: lowland.name, relief: 0.06 + noise * 0.06 }
  // 远离山脉的平原上另行散布丘陵、树林与孤立山，不依附山系。
  const scatter = sampleNoise(seed + 6151, lon, lat, 12)
  const scatterEdge = sampleNoise(seed + 8233, lon, lat, 3)
  const grove = sampleNoise(seed + 2711, lon, lat, 10)
  const groveEdge = sampleNoise(seed + 5449, lon, lat, 3)
  if (scatter > 0.85 && scatterEdge > 0.42) return { terrain: 'mountain', landform: '孤峰', relief: 0.45 + scatter * 0.2 }
  if (grove > 0.75 && groveEdge > 0.38) return { terrain: 'forest', landform: '林地', relief: 0.14 + grove * 0.12 }
  if (scatter > 0.66 && scatterEdge > 0.3) return { terrain: 'hill', landform: '丘陵地', relief: 0.2 + scatter * 0.22 }
  return { terrain: 'plain', landform: '平原', relief: 0.05 + noise * 0.08 }
}

/** 在历史点十格范围内按实际像素距离选择可居住且完整七格未占用的城心。 */
function findCityCenter(x: number, y: number, tiles: Map<string, HexTile>, reserved: Set<string>, passTiles: Set<string>): HexTile | undefined {
  const { q, r } = pixelToHex(x, y)
  let best: { tile: HexTile; distance: number } | undefined
  for (let dq = -10; dq <= 10; dq++) {
    for (let dr = -10; dr <= 10; dr++) {
      if (Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) > 10) continue
      const tile = tiles.get(hexKey(q + dq, r + dr))
      // 城心会被改成平原，因此必须避开山道通道，避免把通道切断。
      if (!tile || passTiles.has(hexKey(tile.q, tile.r)) || !['plain', 'forest', 'hill'].includes(tile.terrain)) continue
      const footprint = CITY_OFFSETS.map(([oq, or]) => tiles.get(hexKey(tile.q + oq, tile.r + or)))
      // 城域七格只允许平原、林地、丘陵与河流，避免沼泽、湖海和孤峰落进城内。
      if (footprint.some((entry) => !entry || entry.terrain === 'coast' || entry.terrain === 'lake' || entry.terrain === 'mountain' || entry.terrain === 'marsh' || reserved.has(hexKey(entry.q, entry.r)))) continue
      const distance = Math.hypot(tile.x - x, tile.y - y)
      if (!best || distance < best.distance) best = { tile, distance }
    }
  }
  return best?.tile
}

/** 判断两个格子是否相同或六向相邻。 */
function isSameOrAdjacent(first: HexTile, second: HexTile): boolean {
  if (first.q === second.q && first.r === second.r) return true
  return DIRECTIONS.some(([dq, dr]) => first.q + dq === second.q && first.r + dr === second.r)
}

/** 在两个六边形之间按立方坐标插值，返回含首尾的连续格序列。 */
function hexLine(from: HexTile, to: HexTile): { q: number; r: number }[] {
  const distance = axialDistance(from, to)
  if (!distance) return [{ q: from.q, r: from.r }]
  const points: { q: number; r: number }[] = []
  for (let step = 0; step <= distance; step++) {
    const t = step / distance
    const point = hexToPixel(from.q + (to.q - from.q) * t, from.r + (to.r - from.r) * t)
    points.push(pixelToHex(point.x, point.y))
  }
  return points
}

/** 把河名覆盖到陆地格；湖泊与近海保持原地貌，只视为河道流经。 */
function stampRiver(tile: HexTile, riverName: string): void {
  if (tile.terrain === 'lake' || tile.terrain === 'coast') return
  tile.terrain = 'river'
  tile.landform = riverName
  tile.relief = 0.02
}

/** 以小于六边形半径的步长栅格化河道，记录每条河的连续水道并补齐采样断点。 */
function rasterizeRivers(tiles: Map<string, HexTile>): RiverRoute[] {
  const routes: RiverRoute[] = []
  for (const river of RIVERS) {
    const path = RIVER_PATHS.get(river)!
    const tileKeys: string[] = []
    const record = (tile: HexTile): void => {
      stampRiver(tile, river.name)
      const key = hexKey(tile.q, tile.r)
      if (tileKeys.at(-1) !== key) tileKeys.push(key)
    }
    let previous: HexTile | undefined
    for (let index = 1; index < path.length; index++) {
      const first = path[index - 1]!
      const second = path[index]!
      const start = geoToPixel(first.lon, first.lat)
      const end = geoToPixel(second.lon, second.lat)
      const steps = Math.max(1, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / (HEX_SIZE / 4)))
      for (let step = 0; step <= steps; step++) {
        const t = step / steps
        const hex = pixelToHex(start.x + (end.x - start.x) * t, start.y + (end.y - start.y) * t)
        const tile = tiles.get(hexKey(hex.q, hex.r))
        // 河道出图属于边界裁剪，不按断流处理。
        if (!tile) {
          previous = undefined
          continue
        }
        if (previous && !isSameOrAdjacent(previous, tile)) {
          for (const entry of hexLine(previous, tile)) {
            const bridged = tiles.get(hexKey(entry.q, entry.r))
            if (bridged) record(bridged)
          }
        } else {
          record(tile)
        }
        previous = tile
      }
    }
    routes.push({ name: river.name, terminal: river.terminal, source: river.source, tileKeys })
  }
  return routes
}

/** 由河道折线的共享控制顶点推导显式汇流点，邻近但未共享顶点不算汇流。 */
function findExplicitConfluences(tiles: Map<string, HexTile>): Confluence[] {
  const groups = new Map<string, { lon: number; lat: number; rivers: Set<string> }>()
  for (const river of RIVERS) {
    for (const point of river.points) {
      const key = `${point.lon.toFixed(4)},${point.lat.toFixed(4)}`
      const group = groups.get(key) ?? { lon: point.lon, lat: point.lat, rivers: new Set<string>() }
      group.rivers.add(river.name)
      groups.set(key, group)
    }
  }
  const confluences: Confluence[] = []
  for (const group of groups.values()) {
    if (group.rivers.size < 2) continue
    const pixel = geoToPixel(group.lon, group.lat)
    const hex = pixelToHex(pixel.x, pixel.y)
    const tileKey = hexKey(hex.q, hex.r)
    if (!tiles.has(tileKey)) continue
    confluences.push({ lon: group.lon, lat: group.lat, tileKey, rivers: [...group.rivers] })
  }
  return confluences
}

/** 找到最近山脊线段，返回山脊名与单位切线；超出搜索距离视为附近无山脊。 */
function closestRidgeFrame(point: GeoPoint, maxDistance: number): { rangeName: string; tangent: { lon: number; lat: number } } | undefined {
  const cos = Math.cos(point.lat * Math.PI / 180) || 1
  const planeX = point.lon * cos
  let best: { distance: number; rangeName: string; tangent: { lon: number; lat: number } } | undefined
  for (const range of MOUNTAIN_RANGES) {
    const bounds = MOUNTAIN_RANGE_BOUNDS.get(range)!
    if (point.lon < bounds.minLon - maxDistance || point.lon > bounds.maxLon + maxDistance || point.lat < bounds.minLat - maxDistance || point.lat > bounds.maxLat + maxDistance) continue
    const points = RIDGE_PATHS.get(range)!
    for (let index = 1; index < points.length; index++) {
      const first = points[index - 1]!
      const second = points[index]!
      const projection = segmentProjection(planeX, point.lat, first.lon * cos, first.lat, second.lon * cos, second.lat)
      if (best && projection.distance >= best.distance) continue
      const dx = (second.lon - first.lon) * cos
      const dy = second.lat - first.lat
      const length = Math.hypot(dx, dy) || 1
      best = { distance: projection.distance, rangeName: range.name, tangent: { lon: dx / length, lat: dy / length } }
    }
  }
  if (!best || best.distance > maxDistance) return undefined
  return { rangeName: best.rangeName, tangent: best.tangent }
}

/** 沿山脊法线为具名山道开辟连续丘陵通道，只切山体，不改动河道与湖泊。 */
function carveMountainPasses(tiles: Map<string, HexTile>): PassRoute[] {
  return MOUNTAIN_PASSES.map((pass) => {
    const frame = closestRidgeFrame(pass, 0.7)
    if (!frame) return { name: pass.name, crossed: false, tileKeys: [] }
    const cos = Math.cos(pass.lat * Math.PI / 180) || 1
    const normal = { lon: -frame.tangent.lat / cos, lat: frame.tangent.lon }
    const tileKeys: string[] = []
    let crossed = false
    let previous: HexTile | undefined
    const carve = (tile: HexTile): void => {
      if (tile.terrain === 'mountain') {
        tile.terrain = 'hill'
        tile.landform = pass.name
        tile.relief = Math.min(tile.relief ?? 0.3, 0.3)
        crossed = true
      }
      const key = hexKey(tile.q, tile.r)
      if (tileKeys.at(-1) !== key) tileKeys.push(key)
    }
    // 以山口为中心沿法线各外扩约一度，足以穿出示意山脊的厚度。
    for (let offset = -0.95; offset <= 0.95 + 1e-9; offset += 0.045) {
      const pixel = geoToPixel(pass.lon + normal.lon * offset, pass.lat + normal.lat * offset)
      const hex = pixelToHex(pixel.x, pixel.y)
      const tile = tiles.get(hexKey(hex.q, hex.r))
      if (!tile) {
        previous = undefined
        continue
      }
      if (previous && !isSameOrAdjacent(previous, tile)) {
        for (const entry of hexLine(previous, tile)) {
          const bridged = tiles.get(hexKey(entry.q, entry.r))
          if (bridged) carve(bridged)
        }
      } else {
        carve(tile)
      }
      previous = tile
    }
    return { name: pass.name, range: frame.rangeName, crossed, tileKeys }
  })
}

/** 返回最近河段及其河名和宽度，并以线段包围盒跳过远处水系。 */
function closestRiverDistance(lon: number, lat: number): { distance: number; width: number; name: string } {
  let closest = { distance: Infinity, width: 0, name: '' }
  const longitudeScale = Math.cos(lat * Math.PI / 180)
  const pointX = lon * longitudeScale
  for (const river of RIVERS) {
    const path = RIVER_PATHS.get(river)!
    for (let index = 1; index < path.length; index++) {
      const first = path[index - 1]!
      const second = path[index]!
      const minX = Math.min(first.lon, second.lon) * longitudeScale - river.width * 2 * longitudeScale
      const maxX = Math.max(first.lon, second.lon) * longitudeScale + river.width * 2 * longitudeScale
      if (pointX < minX || pointX > maxX || lat < Math.min(first.lat, second.lat) - river.width * 2 || lat > Math.max(first.lat, second.lat) + river.width * 2) continue
      const distance = segmentDistance(pointX, lat, first.lon * longitudeScale, first.lat, second.lon * longitudeScale, second.lat)
      if (distance < closest.distance) closest = { distance, width: river.width, name: river.name }
    }
  }
  return closest
}

/** 返回最近的具名山脊、校正距离与沿线位置，先用地理包围盒缩小线段计算。 */
function closestMountainRange(lon: number, lat: number): { range: typeof MOUNTAIN_RANGES[number]; distance: number; along: number } | undefined {
  let closest: { range: typeof MOUNTAIN_RANGES[number]; distance: number; along: number } | undefined
  const longitudeScale = Math.cos(lat * Math.PI / 180)
  for (const range of MOUNTAIN_RANGES) {
    const bounds = MOUNTAIN_RANGE_BOUNDS.get(range)!
    if (lon < bounds.minLon || lon > bounds.maxLon || lat < bounds.minLat || lat > bounds.maxLat) continue
    const points = RIDGE_PATHS.get(range)!
    let total = 0
    for (let index = 1; index < points.length; index++) {
      total += Math.hypot((points[index]!.lon - points[index - 1]!.lon) * longitudeScale, points[index]!.lat - points[index - 1]!.lat)
    }
    let walked = 0
    for (let index = 1; index < points.length; index++) {
      const first = points[index - 1]!
      const second = points[index]!
      const length = Math.hypot((second.lon - first.lon) * longitudeScale, second.lat - first.lat)
      const projection = segmentProjection(lon * longitudeScale, lat, first.lon * longitudeScale, first.lat, second.lon * longitudeScale, second.lat)
      if (!closest || projection.distance < closest.distance) {
        closest = { range, distance: projection.distance, along: total ? (walked + projection.t * length) / total : 0 }
      }
      walked += length
    }
  }
  return closest
}

/** 返回坐落于已记录古道隘口附近的地块地貌名称。 */
function findMountainPass(lon: number, lat: number): { name: string } | undefined {
  return MOUNTAIN_PASSES.find((pass) => Math.hypot((lon - pass.lon) * Math.cos(lat * Math.PI / 180), lat - pass.lat) < pass.radius)
}

/** 将地名散列为稳定整数，作为各山脉独立的噪声相位。 */
function nameSeed(name: string): number {
  let value = 0
  for (const char of name) value = (value * 131 + char.charCodeAt(0)) % 99991
  return value
}

/** 叠加两种空间尺度的平滑噪声，打散规则边界而不产生椒盐状单格孤岛。 */
function smoothNoise(seed: number, lon: number, lat: number): number {
  const broad = sampleNoise(seed, lon, lat, 8)
  const detail = sampleNoise(seed + 7919, lon + 1.37, lat - 0.83, 3.5)
  return broad * 0.68 + detail * 0.32
}

/** 在指定地理尺度上双线性插值稳定噪声。 */
function sampleNoise(seed: number, lon: number, lat: number, scale: number): number {
  const x = (lon - GEO_LEFT) * GEO_SCALE_X / scale
  const y = (GEO_TOP - lat) * GEO_SCALE_Y / scale
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const tx = smoothStep(x - x0)
  const ty = smoothStep(y - y0)
  const top = randomValue(seed, x0, y0) * (1 - tx) + randomValue(seed, x0 + 1, y0) * tx
  const bottom = randomValue(seed, x0, y0 + 1) * (1 - tx) + randomValue(seed, x0 + 1, y0 + 1) * tx
  return top * (1 - ty) + bottom * ty
}

/** 平滑格网插值端点，避免地形纹理逐格跳变。 */
function smoothStep(value: number): number {
  return value * value * (3 - 2 * value)
}

/** 沿山脊长度采样一维平滑噪声，制造峰团的宽窄与断口。 */
function alongNoise(seed: number, t: number, frequency: number): number {
  const x = t * frequency
  const index = Math.floor(x)
  const blend = smoothStep(x - index)
  return randomValue(seed, index, 0) * (1 - blend) + randomValue(seed, index + 1, 0) * blend
}

/** 返回点到线段的距离及落点在线段上的参数。 */
function segmentProjection(px: number, py: number, ax: number, ay: number, bx: number, by: number): { distance: number; t: number } {
  const dx = bx - ax
  const dy = by - ay
  const denominator = dx * dx + dy * dy || 1
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / denominator))
  return { distance: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)), t }
}

/** 計算點在線段上的最近距離並用經度餘弦校正平面距離。 */
function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const denominator = dx * dx + dy * dy || 1
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / denominator))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** 以缓存的地理包围盒和射线穿越法判断地理位置是否落在多边形内。 */
function pointInPolygon(lon: number, lat: number, polygon: GeoPoint[]): boolean {
  let bounds = polygonBounds.get(polygon)
  if (!bounds) {
    bounds = { minLon: Infinity, maxLon: -Infinity, minLat: Infinity, maxLat: -Infinity }
    for (const point of polygon) {
      bounds.minLon = Math.min(bounds.minLon, point.lon)
      bounds.maxLon = Math.max(bounds.maxLon, point.lon)
      bounds.minLat = Math.min(bounds.minLat, point.lat)
      bounds.maxLat = Math.max(bounds.maxLat, point.lat)
    }
    polygonBounds.set(polygon, bounds)
  }
  if (lon < bounds.minLon || lon > bounds.maxLon || lat < bounds.minLat || lat > bounds.maxLat) return false
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const first = polygon[index]!
    const second = polygon[previous]!
    const crosses = (first.lat > lat) !== (second.lat > lat)
      && lon < (second.lon - first.lon) * (lat - first.lat) / (second.lat - first.lat) + first.lon
    if (crosses) inside = !inside
  }
  return inside
}

/** 把像素坐標轉回近似經緯度以供地理算法篩選。 */
function pixelToGeo(x: number, y: number): GeoPoint {
  return { lon: GEO_LEFT + (x - 245) / GEO_SCALE_X, lat: GEO_TOP - (y - 112) / GEO_SCALE_Y }
}

/** 為指定地圖種子與六邊形坐標產生穩定噪聲值。 */
function randomValue(seed: number, q: number, r: number): number {
  const value = Math.sin((q * 127.1 + r * 311.7 + seed * 74.7) * 0.0174533) * 43758.5453
  return value - Math.floor(value)
}

/** 把軸向坐標轉為可直接讀取的穩定地塊鍵。 */
export function hexKey(q: number, r: number): string {
  return `${q},${r}`
}

/** 計算兩個軸向六邊形坐標間的最短格數。 */
function axialDistance(first: HexTile, second: HexTile): number {
  return (Math.abs(first.q - second.q) + Math.abs(first.q + first.r - second.q - second.r) + Math.abs(first.r - second.r)) / 2
}

/** 從開放集合挑選當前 A* 預估總成本最小的節點。 */
function findCheapest(open: Set<string>, scores: Map<string, number>): string {
  let chosen = ''
  let lowest = Infinity
  for (const key of open) {
    const score = scores.get(key) ?? Infinity
    if (score < lowest) {
      chosen = key
      lowest = score
    }
  }
  return chosen
}

/** 對地理座標做兩位小數舍入以保持面板信息穩定。 */
function round2(value: number): number {
  return Math.round(value * 100) / 100
}
