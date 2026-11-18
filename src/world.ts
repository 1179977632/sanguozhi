export type TerrainId = 'plain' | 'forest' | 'hill' | 'mountain' | 'marsh' | 'river' | 'lake' | 'coast'
export type FactionId = 'wei' | 'shu' | 'wu' | 'neutral'

export interface HexTile {
  q: number
  r: number
  x: number
  y: number
  lon: number
  lat: number
  terrain: TerrainId
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

export interface World {
  tiles: Map<string, HexTile>
  cities: City[]
  width: number
  height: number
  seed: number
}

interface CityRecord extends Omit<City, 'q' | 'r' | 'tileKeys'> {}
interface GeoPoint { lon: number; lat: number }

export const HEX_SIZE = 3

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
  wei: { name: '曹魏', color: '#aa826c', ink: 0x6e493d },
  shu: { name: '蜀漢', color: '#91a58a', ink: 0x4b684e },
  wu: { name: '孫吳', color: '#82a3a3', ink: 0x3f686a },
  neutral: { name: '群雄', color: '#b4ae9c', ink: 0x736d5d },
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

const MOUNTAIN_RANGES: { name: string; lon: number; lat: number; rx: number; ry: number; angle: number }[] = [
  { name: 'Qinling', lon: 107.5, lat: 33.5, rx: 2.5, ry: 1.15, angle: -0.4 },
  { name: 'Daba', lon: 105.8, lat: 31.7, rx: 1.85, ry: 0.75, angle: -0.45 },
  { name: 'Taihang', lon: 113.6, lat: 36.9, rx: 0.8, ry: 2.25, angle: 0.12 },
  { name: 'Yinshan', lon: 109.5, lat: 40.5, rx: 2.9, ry: 0.68, angle: -0.13 },
  { name: 'Wuling', lon: 110.4, lat: 29, rx: 2.2, ry: 0.95, angle: 0.22 },
  { name: 'Nanling', lon: 111.3, lat: 25.6, rx: 4.25, ry: 0.9, angle: -0.1 },
  { name: 'ShuPasses', lon: 103.9, lat: 30.2, rx: 1.45, ry: 1.7, angle: 0.2 },
  { name: 'Hengshan', lon: 112.8, lat: 27.2, rx: 0.85, ry: 1.65, angle: -0.16 },
]

export const RIVERS: { name: string; points: GeoPoint[]; width: number }[] = [
  { name: '黄河', width: 0.15, points: [{ lon: 97, lat: 35 }, { lon: 100, lat: 35.2 }, { lon: 103.8, lat: 36.1 }, { lon: 105.7, lat: 37 }, { lon: 106.3, lat: 39 }, { lon: 107, lat: 40.5 }, { lon: 109.5, lat: 40.7 }, { lon: 110.5, lat: 40 }, { lon: 110.6, lat: 37.5 }, { lon: 110.3, lat: 34.6 }, { lon: 112.4, lat: 34.9 }, { lon: 114, lat: 35.2 }, { lon: 116, lat: 37.3 }, { lon: 118.7, lat: 37.5 }, { lon: 120, lat: 37.8 }] },
  { name: '长江', width: 0.19, points: [{ lon: 96, lat: 30.2 }, { lon: 99, lat: 28 }, { lon: 101.5, lat: 26.6 }, { lon: 103, lat: 28.2 }, { lon: 104.6, lat: 28.75 }, { lon: 106.55, lat: 29.56 }, { lon: 108.4, lat: 30.8 }, { lon: 109.47, lat: 31.02 }, { lon: 111.3, lat: 30.7 }, { lon: 112.19, lat: 30.35 }, { lon: 114.31, lat: 30.59 }, { lon: 115.99, lat: 29.73 }, { lon: 117.1, lat: 30.5 }, { lon: 118.79, lat: 32.06 }, { lon: 120, lat: 31.8 }, { lon: 121.5, lat: 31.3 }] },
  { name: '汉水', width: 0.12, points: [{ lon: 106, lat: 33.1 }, { lon: 108, lat: 32.8 }, { lon: 109.5, lat: 32.4 }, { lon: 112.14, lat: 32.04 }, { lon: 113, lat: 31.4 }, { lon: 114.31, lat: 30.59 }] },
  { name: '淮水', width: 0.1, points: [{ lon: 111.5, lat: 33.2 }, { lon: 114, lat: 33 }, { lon: 116, lat: 32.7 }, { lon: 118, lat: 33.3 }, { lon: 119.5, lat: 33.4 }] },
  { name: '湘水', width: 0.08, points: [{ lon: 111.61, lat: 26.42 }, { lon: 112.2, lat: 27.5 }, { lon: 112.94, lat: 28.23 }, { lon: 112.8, lat: 29.3 }] },
  { name: '赣水', width: 0.09, points: [{ lon: 114.9, lat: 25.8 }, { lon: 114.9, lat: 26.8 }, { lon: 115.2, lat: 27.5 }, { lon: 115.8, lat: 28.6 }, { lon: 116.1, lat: 29.7 }] },
  { name: '珠江', width: 0.12, points: [{ lon: 106.5, lat: 25.5 }, { lon: 109, lat: 24.2 }, { lon: 111, lat: 24 }, { lon: 113, lat: 23.2 }, { lon: 113.5, lat: 22.8 }] },
]

const LAKES: { lon: number; lat: number; rx: number; ry: number }[] = [
  { lon: 112.8, lat: 29.3, rx: 0.75, ry: 0.34 },
  { lon: 116.3, lat: 29.1, rx: 0.48, ry: 0.67 },
  { lon: 118.8, lat: 33.2, rx: 0.72, ry: 0.35 },
  { lon: 120, lat: 31.2, rx: 0.49, ry: 0.23 },
]

const CITY_RECORDS: CityRecord[] = [
  { id: 'chengdu', name: '成都', en: 'CHENGDU', province: '益州', prefecture: '蜀郡', faction: 'shu', lon: 104.0668, lat: 30.5728, description: '益州治所，據成都平原沃土，西川兵糧之源。' },
  { id: 'luoyang', name: '洛陽', en: 'LUOYANG', province: '司隸', prefecture: '河南尹', faction: 'wei', lon: 112.454, lat: 34.6197, description: '東漢舊都，北臨黃河，南屏嵩山，為天下中樞。' },
  { id: 'xuchang', name: '許昌', en: 'XUCHANG', province: '豫州', prefecture: '潁川郡', faction: 'wei', lon: 113.8526, lat: 34.0357, description: '漢獻帝所在，曹操奉天子以令諸侯的許都。' },
  { id: 'chang-an', name: '長安', en: 'CHANGAN', province: '雍州', prefecture: '京兆尹', faction: 'wei', lon: 108.94, lat: 34.26, description: '關中故都，東扼函谷，西通隴蜀，足為關中根本。' },
  { id: 'ye', name: '鄴', en: 'YE', province: '冀州', prefecture: '魏郡', faction: 'wei', lon: 114.6, lat: 36.33, description: '河北要城，曹魏北方根基所在，控帶太行與平原。' },
  { id: 'beiping', name: '北平', en: 'BEIPING', province: '幽州', prefecture: '右北平郡', faction: 'wei', lon: 118.9, lat: 39.88, description: '幽燕北疆重鎮，南通冀州，北扼燕山諸道。' },
  { id: 'jinyang', name: '晉陽', en: 'JINYANG', province: '并州', prefecture: '太原郡', faction: 'wei', lon: 112.55, lat: 37.87, description: '太原盆地雄城，西望呂梁，東臨太行。' },
  { id: 'pingyuan', name: '平原', en: 'PINGYUAN', province: '青州', prefecture: '平原郡', faction: 'wei', lon: 116.36, lat: 37.43, description: '黃河下游平原郡城，扼守冀州、青州往來之路。' },
  { id: 'nanpi', name: '南皮', en: 'NANPI', province: '冀州', prefecture: '勃海郡', faction: 'wei', lon: 116.7, lat: 38.04, description: '勃海郡治，瀕近燕趙海口，素為河北軍事重地。' },
  { id: 'xiapi', name: '下邳', en: 'XIAPI', province: '徐州', prefecture: '下邳國', faction: 'neutral', lon: 117.2, lat: 34.3, description: '淮泗間水陸要塞，守徐州者可據以制淮北。' },
  { id: 'beihai', name: '北海', en: 'BEIHAI', province: '青州', prefecture: '北海國', faction: 'neutral', lon: 118.48, lat: 36.69, description: '青州東境郡城，北接萊州海濱，南通琅琊。' },
  { id: 'puyang', name: '濮陽', en: 'PUYANG', province: '兗州', prefecture: '濮陽縣', faction: 'wei', lon: 115.03, lat: 35.76, description: '兗州黃河津渡要城，為中原北門之一。' },
  { id: 'chenliu', name: '陳留', en: 'CHENLIU', province: '兗州', prefecture: '陳留郡', faction: 'wei', lon: 114.3, lat: 34.8, description: '汴渠與中原驛路交會，東西轉運皆經其境。' },
  { id: 'runan', name: '汝南', en: 'RUNAN', province: '豫州', prefecture: '汝南郡', faction: 'wei', lon: 114.36, lat: 33.01, description: '豫州南郡，水網與沃土交錯，兵員糧源充足。' },
  { id: 'shouchun', name: '壽春', en: 'SHOUCHUN', province: '揚州', prefecture: '九江郡', faction: 'neutral', lon: 116.79, lat: 32.57, description: '淮南重鎮，北拒中原，南通合肥與江東。' },
  { id: 'hefei', name: '合肥', en: 'HEFEI', province: '揚州', prefecture: '廬江郡', faction: 'wei', lon: 117.23, lat: 31.82, description: '淮南水陸咽喉，扼守魏吳疆界與濡須諸道。' },
  { id: 'jianye', name: '建業', en: 'JIANYE', province: '揚州', prefecture: '丹陽郡', faction: 'wu', lon: 118.79, lat: 32.06, description: '大江天險環護，孫吳立國都城，舟楫可達江東諸郡。' },
  { id: 'wu', name: '吳郡', en: 'WU', province: '揚州', prefecture: '吳郡', faction: 'wu', lon: 120.62, lat: 31.3, description: '江東膏腴之地，湖蕩相間，桑麻與舟楫俱盛。' },
  { id: 'kuaiji', name: '會稽', en: 'KUAJI', province: '揚州', prefecture: '會稽郡', faction: 'wu', lon: 120.58, lat: 30, description: '東南沿海郡治，山越環伺，港汊綿延。' },
  { id: 'lujiang', name: '廬江', en: 'LUJIANG', province: '揚州', prefecture: '廬江郡', faction: 'wu', lon: 116.56, lat: 31.48, description: '江淮間的山川郡城，西接蘄春，東連丹陽。' },
  { id: 'chaishang', name: '柴桑', en: 'CHAISANG', province: '揚州', prefecture: '豫章郡', faction: 'wu', lon: 115.99, lat: 29.73, description: '長江與鄱陽湖之間的要津，通江東而控荊州。' },
  { id: 'jiangxia', name: '江夏', en: 'JIANGXIA', province: '荊州', prefecture: '江夏郡', faction: 'wu', lon: 114.31, lat: 30.59, description: '漢水入江之口，連接荊襄與江東水道。' },
  { id: 'xiangyang', name: '襄陽', en: 'XIANGYANG', province: '荊州', prefecture: '襄陽郡', faction: 'wei', lon: 112.14, lat: 32.04, description: '漢水北岸重城，控扼荊州北門與南北交通。' },
  { id: 'jiangling', name: '江陵', en: 'JIANGLING', province: '荊州', prefecture: '南郡', faction: 'wu', lon: 112.19, lat: 30.35, description: '南郡治所，據長江中游，東西荊州交界之戰略樞紐。' },
  { id: 'changsha', name: '長沙', en: 'CHANGSHA', province: '荊州', prefecture: '長沙郡', faction: 'wu', lon: 112.94, lat: 28.23, description: '湘水穿城而過，南望嶺表，為荊州南部大郡。' },
  { id: 'wuling', name: '武陵', en: 'WULING', province: '荊州', prefecture: '武陵郡', faction: 'shu', lon: 111.69, lat: 29.03, description: '五溪與武陵山交界之處，通巴蜀、荊南之路。' },
  { id: 'lingling', name: '零陵', en: 'LINGLING', province: '荊州', prefecture: '零陵郡', faction: 'shu', lon: 111.61, lat: 26.42, description: '湘水上游之郡，北通荊南，南入五嶺山道。' },
  { id: 'guiyang', name: '桂陽', en: 'GUIYANG', province: '荊州', prefecture: '桂陽郡', faction: 'shu', lon: 113.02, lat: 25.79, description: '五嶺北麓關隘郡城，據南北轉運與山道隘口。' },
  { id: 'hanzhong', name: '漢中', en: 'HANZHONG', province: '益州', prefecture: '漢中郡', faction: 'shu', lon: 107.02, lat: 33.07, description: '漢水源頭盆地，秦嶺與大巴山間的北方門戶。' },
  { id: 'zitong', name: '梓潼', en: 'ZITONG', province: '益州', prefecture: '梓潼郡', faction: 'shu', lon: 105.17, lat: 31.64, description: '蜀中北道關城，連通漢中棧道與成都平原。' },
  { id: 'jiangzhou', name: '江州', en: 'JIANGZHOU', province: '益州', prefecture: '巴郡', faction: 'shu', lon: 106.55, lat: 29.56, description: '嘉陵、長江交會之城，居巴蜀水陸轉運中心。' },
  { id: 'yongan', name: '永安', en: 'YONGAN', province: '益州', prefecture: '巴東郡', faction: 'shu', lon: 109.47, lat: 31.02, description: '峽口江城，鎮守蜀道東端和長江夔門。' },
  { id: 'wudu', name: '武都', en: 'WUDU', province: '雍州', prefecture: '武都郡', faction: 'neutral', lon: 104.92, lat: 33.4, description: '隴蜀山口間的軍事要地，控南北棧道。' },
  { id: 'tianshui', name: '天水', en: 'TIANSHUI', province: '雍州', prefecture: '天水郡', faction: 'wei', lon: 105.72, lat: 34.58, description: '秦隴交通要衝，東望關中，南接漢中山道。' },
  { id: 'anding', name: '安定', en: 'ANDING', province: '雍州', prefecture: '安定郡', faction: 'wei', lon: 104.67, lat: 35.56, description: '隴右要郡，連結河西與關中之間的軍道。' },
  { id: 'wuwei', name: '武威', en: 'WUWEI', province: '涼州', prefecture: '武威郡', faction: 'neutral', lon: 102.64, lat: 37.93, description: '河西走廊東部郡城，往來西域與中原之要道。' },
  { id: 'yunnan', name: '雲南', en: 'YUNNAN', province: '益州', prefecture: '雲南郡', faction: 'neutral', lon: 100.3, lat: 25.58, description: '滇池與高原諸部之間的郡城，南控山地道路。' },
  { id: 'jianning', name: '建寧', en: 'JIANNING', province: '益州', prefecture: '建寧郡', faction: 'shu', lon: 103.8, lat: 25.5, description: '滇黔山地郡城，諸族聚居，控雲南東北山口。' },
  { id: 'nanhai', name: '南海', en: 'NANHAI', province: '交州', prefecture: '南海郡', faction: 'wu', lon: 113.27, lat: 23.12, description: '嶺南海上門戶，港浦眾多，溝通南海與交廣。' },
  { id: 'jiaozhi', name: '交趾', en: 'JIAOZHI', province: '交州', prefecture: '交趾郡', faction: 'wu', lon: 105.84, lat: 21.02, description: '交州南部郡治，紅河平原豐饒，為嶺南遠南之地。' },
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

/** 統一生成地形網格、海岸帶與具有七格城域的三國城池。 */
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
      const terrain = land ? getLandTerrain(geo.lon, geo.lat, seed, q, r) : 'coast'
      tiles.set(key, { q, r, x: point.x, y: point.y, lon: round2(geo.lon), lat: round2(geo.lat), terrain })
    }
  }

  rasterizeRivers(tiles)

  for (const record of CITY_RECORDS) {
    const target = geoToPixel(record.lon, record.lat)
    const center = findCityCenter(target.x, target.y, tiles, reserved)
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

  return { tiles, cities: cityCenters.map(({ city }) => city), width: WORLD_WIDTH, height: WORLD_HEIGHT, seed }
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

/** 按山系、河谷、江湖與可重現噪聲分配陸地格的地形類型。 */
function getLandTerrain(lon: number, lat: number, seed: number, q: number, r: number): TerrainId {
  if (LAKES.some((lake) => ellipseDistance(lon, lat, lake.lon, lake.lat, lake.rx, lake.ry) < 0.72)) return 'lake'
  const river = closestRiverDistance(lon, lat)
  if (river.distance < river.width * 0.74) return 'river'
  if (inMountainRange(lon, lat, 'Yinshan') && lat > 39.5) return 'hill'
  if (inMountainRange(lon, lat)) {
    const range = MOUNTAIN_RANGES.find((candidate) => ellipseDistance(lon, lat, candidate.lon, candidate.lat, candidate.rx, candidate.ry, candidate.angle) < 1)
    const pass = range && ['Qinling', 'Daba', 'ShuPasses'].includes(range.name) && randomValue(seed, q + 17, r - 31) > 0.79
    return pass ? 'hill' : randomValue(seed, q, r) < 0.32 ? 'hill' : 'mountain'
  }
  if (inMountainRange(lon, lat, 'Nanling') && randomValue(seed, q + 5, r + 8) < 0.65) return 'hill'
  if ((lat < 25.5 && lon > 100) || (lon > 112 && lon < 119 && lat > 33 && lat < 36.4)) {
    if (randomValue(seed, q - 10, r + 2) < 0.25) return 'marsh'
  }
  const random = randomValue(seed, q, r)
  if (random < 0.13 && ((lon > 97 && lon < 108 && lat > 25 && lat < 38) || (lon > 115 && lat < 33))) return 'forest'
  if (random > 0.92) return 'hill'
  return 'plain'
}

/** 在历史点四格范围内按实际像素距离选择可居住且完整七格未占用的城心。 */
function findCityCenter(x: number, y: number, tiles: Map<string, HexTile>, reserved: Set<string>): HexTile | undefined {
  const { q, r } = pixelToHex(x, y)
  let best: { tile: HexTile; distance: number } | undefined
  for (let dq = -4; dq <= 4; dq++) {
    for (let dr = -4; dr <= 4; dr++) {
      if (Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) > 4) continue
      const tile = tiles.get(hexKey(q + dq, r + dr))
      if (!tile || !['plain', 'forest', 'hill', 'marsh'].includes(tile.terrain)) continue
      const footprint = CITY_OFFSETS.map(([oq, or]) => tiles.get(hexKey(tile.q + oq, tile.r + or)))
      if (footprint.some((entry) => !entry || entry.terrain === 'coast' || entry.terrain === 'lake' || reserved.has(hexKey(entry.q, entry.r)))) continue
      const distance = Math.hypot(tile.x - x, tile.y - y)
      if (!best || distance < best.distance) best = { tile, distance }
    }
  }
  return best?.tile
}

/** 以小于六边形半径的像素步长栅格化河道，保留湖泊与近海原貌。 */
function rasterizeRivers(tiles: Map<string, HexTile>): void {
  for (const river of RIVERS) {
    for (let index = 1; index < river.points.length; index++) {
      const first = river.points[index - 1]!
      const second = river.points[index]!
      const start = geoToPixel(first.lon, first.lat)
      const end = geoToPixel(second.lon, second.lat)
      const steps = Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / (HEX_SIZE / 4))
      for (let step = 0; step <= steps; step++) {
        const t = step / steps
        const hex = pixelToHex(start.x + (end.x - start.x) * t, start.y + (end.y - start.y) * t)
        const tile = tiles.get(hexKey(hex.q, hex.r))
        if (tile && tile.terrain !== 'lake' && tile.terrain !== 'coast') tile.terrain = 'river'
      }
    }
  }
}

/** 求最近主要水系到所给点的角度加权距离。 */
function closestRiverDistance(lon: number, lat: number): { distance: number; width: number } {
  let closest = { distance: Infinity, width: 0 }
  for (const river of RIVERS) {
    for (let index = 1; index < river.points.length; index++) {
      const first = river.points[index - 1]!
      const second = river.points[index]!
      const distance = segmentDistance(lon * Math.cos(lat * Math.PI / 180), lat, first.lon * Math.cos(lat * Math.PI / 180), first.lat, second.lon * Math.cos(lat * Math.PI / 180), second.lat)
      if (distance < closest.distance) closest = { distance, width: river.width }
    }
  }
  return closest
}

/** 判斷點是否落在指定山系的不規則範圍內。 */
function inMountainRange(lon: number, lat: number, name?: string): boolean {
  return MOUNTAIN_RANGES.some((range) => (!name || range.name === name) && ellipseDistance(lon, lat, range.lon, range.lat, range.rx, range.ry, range.angle) < 1)
}

/** 計算點在線段上的最近距離並用經度餘弦校正平面距離。 */
function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const denominator = dx * dx + dy * dy || 1
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / denominator))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** 計算旋轉地形橢圓內位置以形成河谷山脈與湖泊。 */
function ellipseDistance(lon: number, lat: number, cx: number, cy: number, rx: number, ry: number, angle = 0): number {
  const x = (lon - cx) * Math.cos(angle) + (lat - cy) * Math.sin(angle)
  const y = -(lon - cx) * Math.sin(angle) + (lat - cy) * Math.cos(angle)
  return Math.hypot(x / rx, y / ry)
}

/** 用射线穿越法判断地理位置是否落在海岸线多边形内。 */
function pointInPolygon(lon: number, lat: number, polygon: GeoPoint[]): boolean {
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
