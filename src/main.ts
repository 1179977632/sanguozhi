import Phaser from 'phaser'
import { createIcons, ArrowDownUp, ArrowLeft, ArrowRight, ChevronsDown, Compass, Expand, LocateFixed, Minus, Mountain, MousePointer2, Plus, RotateCcw, Search, Ship, Sparkles, X, ZoomIn, ZoomOut } from 'lucide'
import type { City, FactionId, HexTile, MovementOptions } from './world'
import { createWorld, DIRECTIONS, FACTIONS, HEX_SIZE, RIVERS, TERRAIN, findPath, geoToPixel, hexKey, hexToPixel, movementCost, pixelToHex } from './world'
import './style.css'

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <main class="atlas">
    <header class="topbar">
      <div class="brand-lockup">
        <div class="brand-seal">漢</div>
        <div><div class="brand-name">群雄地志</div><div class="brand-meta">TIANXIA · STRATEGIC ATLAS</div></div>
      </div>
      <nav class="topnav" aria-label="地图图层">
        <button class="active" type="button" data-nav-filter="overview">天下形势</button>
        <button type="button" data-nav-filter="factions">州郡分区</button>
        <button type="button" data-nav-filter="cities">列郡城邑</button>
      </nav>
      <div class="era-label">漢末三國 · 地理與勢力示意</div>
      <button id="mobile-details" class="mobile-details" type="button" aria-label="打开地形和行军详情" aria-expanded="false">地形與行軍</button>
    </header>
    <div class="workspace">
      <aside class="left-rail" aria-label="城池检索">
        <div class="rail-head">
          <div class="eyebrow">REALMS OF HAN</div>
          <div class="rail-heading"><h2>州郡城邑</h2><span id="city-count"></span></div>
        </div>
        <label class="search-wrap"><i data-lucide="search"></i><input id="city-search" type="search" placeholder="尋找城池、州郡…" autocomplete="off" /></label>
        <select id="faction-filter" class="faction-select" aria-label="按势力筛选">
          <option value="all">全部势力</option><option value="wei">魏 · 北方</option><option value="shu">蜀 · 西川</option><option value="wu">吳 · 江東</option><option value="neutral">群雄 · 未定</option>
        </select>
        <div class="city-list-head">CITY INDEX · <span id="city-visible-count">0</span></div>
        <div id="city-list" class="city-list"></div>
        <div class="rail-bottom"><small>漢末三分 · 勢力圖例</small><div class="faction-legend">
          <span class="legend-entry"><i class="faction-dot" style="--faction:#9c7660"></i>魏</span>
          <span class="legend-entry"><i class="faction-dot" style="--faction:#74937d"></i>蜀</span>
          <span class="legend-entry"><i class="faction-dot" style="--faction:#6d8d96"></i>吳</span>
          <span class="legend-entry"><i class="faction-dot" style="--faction:#aaa596"></i>群雄</span>
        </div></div>
      </aside>

      <section class="map-shell" aria-label="三国战略地图">
        <div class="map-ribbon"><div class="map-edition"><strong>漢末山川圖</strong><em>建安五年 · 成都近覽</em></div><div class="map-coordinates"><span id="coordinates">北緯 30°　東經 104°</span><span class="map-coordinate-seal">天地四方 · 州郡可行</span></div></div>
        <div class="map-status"><i class="map-status-dot"></i><span id="status-line">拖動以遊覽地圖 · 滾輪縮放</span></div>
        <div class="canvas-wrap"><canvas id="map" aria-label="尖顶六边形三国地形地图，可拖动浏览并点击地块" tabindex="0"></canvas></div>
        <div class="map-compass">北<span>↑</span></div>
        <div class="map-toolbar">
          <button id="locate-city" class="tool-button" type="button" aria-label="定位所选城池" title="定位所选城池"><i data-lucide="locate-fixed"></i></button>
          <button id="zoom-in" class="tool-button" type="button" aria-label="放大地图" title="放大"><i data-lucide="plus"></i></button>
          <button id="zoom-out" class="tool-button" type="button" aria-label="缩小地图" title="缩小"><i data-lucide="minus"></i></button>
          <span class="zoom-readout" id="zoom-readout">160%</span><span class="toolbar-divider"></span>
          <button id="reset-map" class="tool-button" type="button" aria-label="重置地图视角" title="重置视角"><i data-lucide="expand"></i></button>
        </div>
        <div class="map-scale" id="map-scale">約 130 里</div>
        <div class="map-legend"><div class="map-legend-title">山川地势</div><div class="terrain-swatches">
          <span class="terrain-item"><i class="terrain-swatch" style="background:#c8c58d"></i>平原</span><span class="terrain-item"><i class="terrain-swatch" style="background:#8eaa7d"></i>林地</span><span class="terrain-item"><i class="terrain-swatch" style="background:#b69b76"></i>山地</span><span class="terrain-item"><i class="terrain-swatch" style="background:#7f8280"></i>山脉</span><span class="terrain-item"><i class="terrain-swatch" style="background:#8bb2a2"></i>江河湖泊</span><span class="terrain-item"><i class="terrain-swatch" style="background:#a6baaa"></i>沼澤</span>
        </div></div>
      </section>

      <aside class="right-rail" aria-label="地形和行军详情">
        <section class="detail-section">
          <div class="detail-head"><h3>城邑誌</h3><button id="mobile-close" class="mobile-close" aria-label="关闭详情"><i data-lucide="x"></i></button><span class="detail-index">01 / 03</span></div>
          <div id="inspector" class="inspector"></div>
        </section>
        <section class="detail-section">
          <div class="detail-head"><h3>軍勢行軍</h3><span class="detail-index">ROUTE</span></div>
          <label class="select-label" for="unit-select">行軍編制</label>
          <select id="unit-select" class="unit-select">
            <option value="infantry">步卒 · 平原通行</option><option value="cavalry">騎兵 · 機動行軍</option><option value="supply">輜重 · 糧車補給</option>
          </select>
          <div class="toggle-row"><span>舟船 · 渡河行水</span><input id="boat-toggle" class="toggle" type="checkbox" /></div>
          <div class="toggle-row"><span>棧道 · 翻越山隘</span><input id="plank-toggle" class="toggle" type="checkbox" /></div>
          <div id="route-report" class="route-report"><i class="route-dot"></i>尚未規劃行軍路線</div>
          <button id="route-button" class="route-cta" type="button" aria-pressed="false"><i data-lucide="mouse-pointer-2"></i>規劃行軍路線</button>
          <button id="clear-route" class="secondary-action" type="button">清除路線</button>
          <div class="movement-costs"><div><span>平原步卒</span><strong>1 移动力</strong></div><div><span>丘陵步卒</span><strong>2 移动力</strong></div><div><span>河流步卒</span><strong class="danger">須乘舟</strong></div></div>
        </section>
        <section class="detail-section">
          <div class="detail-head"><h3>圖層與疆域</h3><span class="detail-index">LAYERS</span></div>
          <div class="layer-list">
            <label class="layer-row"><input data-layer="showRelief" type="checkbox" checked />山川地勢</label>
            <label class="layer-row"><input data-layer="showRivers" type="checkbox" checked />水系河流</label>
            <label class="layer-row"><input data-layer="showLabels" type="checkbox" checked />城池標記</label>
            <label class="layer-row"><input data-layer="showBorders" type="checkbox" />州郡分區（示意）</label>
            <label class="layer-row"><input data-layer="showSeaLabels" type="checkbox" checked />海域名稱</label>
          </div>
          <div class="detail-head" style="margin-top:16px;margin-bottom:8px"><h3>地形篩選</h3></div>
          <div class="filter-row"><button class="terrain-filter terrain-filter--active" data-filter="all" type="button">全地形</button><button class="terrain-filter" data-filter="highland" type="button">山岳</button><button class="terrain-filter" data-filter="water" type="button">水域</button></div>
        </section>
      </aside>
    </div>
    <footer class="footer"><div class="footer-left"><span>天下山川 · 軍行九州</span><span>地勢圖 · 第一卷</span></div><div class="footer-right"><span>滾輪縮放</span><span>拖曳平移</span><span><i class="footer-key">ESC</i> 取消路線</span><span>HAN · 建安</span></div></footer>
  </main>`

const world = createWorld(189)
const mapCanvas = document.querySelector<HTMLCanvasElement>('#map')!
const mapContext = mapCanvas.getContext('2d')!
const cityListElement = document.querySelector<HTMLElement>('#city-list')!
const citySearchInput = document.querySelector<HTMLInputElement>('#city-search')!
const inspectorElement = document.querySelector<HTMLElement>('#inspector')!
const routeReport = document.querySelector<HTMLElement>('#route-report')!
const routeButton = document.querySelector<HTMLButtonElement>('#route-button')!
const unitSelect = document.querySelector<HTMLSelectElement>('#unit-select')!
const boatToggle = document.querySelector<HTMLInputElement>('#boat-toggle')!
const plankToggle = document.querySelector<HTMLInputElement>('#plank-toggle')!
const statusLine = document.querySelector<HTMLElement>('#status-line')!
const coordinatesElement = document.querySelector<HTMLElement>('#coordinates')!
const zoomReadout = document.querySelector<HTMLElement>('#zoom-readout')!
const cityCountElement = document.querySelector<HTMLElement>('#city-count')!
const cityVisibleCountElement = document.querySelector<HTMLElement>('#city-visible-count')!
const initialCity = world.cities.find((city) => city.id === 'chengdu')!
const provinceByTile = new Map(Array.from(world.tiles, ([key, tile]) => {
  const nearest = world.cities.reduce((closest, city) => Math.hypot(tile.x - hexToPixel(city.q, city.r).x, tile.y - hexToPixel(city.q, city.r).y) < Math.hypot(tile.x - hexToPixel(closest.q, closest.r).x, tile.y - hexToPixel(closest.q, closest.r).y) ? city : closest)
  return [key, nearest.province] as const
}))
let phaserGame: Phaser.Game | undefined

const state = {
  city: initialCity,
  selectedTile: world.tiles.get(hexKey(initialCity.q, initialCity.r)) ?? null,
  panX: 0,
  panY: 0,
  zoom: 0.55,
  dirty: true,
  dragging: false,
  dragMoved: false,
  previousPointer: { x: 0, y: 0 },
  hoveredKey: '',
  route: [] as HexTile[],
  routeCost: 0,
  routeStart: null as HexTile | null,
  pathMode: false,
  terrainFilter: 'all',
  showRivers: true,
  showLabels: true,
  showBorders: false,
  showRelief: true,
  showSeaLabels: true,
  positionReady: false,
}

const dpr = Math.min(window.devicePixelRatio || 1, 2)
let resizeObserver: ResizeObserver | undefined
let viewportWidth = 0
let viewportHeight = 0

/** 初始化 Phaser 计时与战场贴图，并启动视图自适应。 */
function bootAtlas(): void {
  phaserGame = new Phaser.Game({
    type: Phaser.CANVAS,
    parent: mapCanvas.parentElement!,
    canvas: mapCanvas,
    width: mapCanvas.width,
    height: mapCanvas.height,
    backgroundColor: '#e7e7da',
    clearBeforeRender: false,
    transparent: true,
    banner: false,
    audio: { noAudio: true },
    scale: { mode: Phaser.Scale.NONE },
    scene: [AtlasRenderScene],
  })
  resizeObserver = new ResizeObserver(resizeMap)
  resizeObserver.observe(mapCanvas.parentElement!)
  window.addEventListener('resize', resizeMap)
  window.addEventListener('keydown', handleKeyboard)
  resizeMap()
  initializeControls()
  renderCityList()
  updateSelection()
  createIcons({
    icons: { ArrowDownUp, ArrowLeft, ArrowRight, ChevronsDown, Compass, Expand, LocateFixed, Minus, Mountain, MousePointer2, Plus, RotateCcw, Search, Ship, Sparkles, X, ZoomIn, ZoomOut },
  })
}

/** 调整地图分辨率并在窗口变化时保持当前地图中心。 */
function resizeMap(): void {
  const bounds = mapCanvas.parentElement!.getBoundingClientRect()
  const width = Math.max(1, Math.floor(bounds.width))
  const height = Math.max(1, Math.floor(bounds.height))
  const resolutionWidth = Math.floor(width * dpr)
  const resolutionHeight = Math.floor(height * dpr)
  if (mapCanvas.width !== resolutionWidth || mapCanvas.height !== resolutionHeight) {
    if (phaserGame) phaserGame.scale.resize(resolutionWidth, resolutionHeight)
    else {
      mapCanvas.width = resolutionWidth
      mapCanvas.height = resolutionHeight
    }
  }
  mapCanvas.style.width = `${width}px`
  mapCanvas.style.height = `${height}px`
  if (!state.positionReady) focusCity(initialCity, 1.6)
  else {
    state.panX += (width - viewportWidth) / 2
    state.panY += (height - viewportHeight) / 2
  }
  viewportWidth = width
  viewportHeight = height
  scheduleMap()
}

/** 以指定城池为中心打开区域近景，突出周边行军格距。 */
function focusCity(city: City, zoom: number): void {
  const bounds = mapCanvas.parentElement!.getBoundingClientRect()
  const center = hexToPixel(city.q, city.r)
  state.zoom = Phaser.Math.Clamp(zoom, 0.38, 2.2)
  state.panX = bounds.width / 2 - center.x * state.zoom
  state.panY = bounds.height / 2 - center.y * state.zoom
  state.positionReady = true
  document.querySelector<HTMLElement>('.map-edition em')!.textContent = `建安五年 · ${city.name}近覽`
  scheduleMap()
}

/** 将所有可行地块纳入视口，并为标题和工具栏留白。 */
function fitMap(): void {
  const bounds = mapCanvas.parentElement!.getBoundingClientRect()
  const tiles = Array.from(world.tiles.values())
  const left = Math.min(...tiles.map((tile) => tile.x)) - HEX_SIZE
  const right = Math.max(...tiles.map((tile) => tile.x)) + HEX_SIZE
  const top = Math.min(...tiles.map((tile) => tile.y)) - HEX_SIZE
  const bottom = Math.max(...tiles.map((tile) => tile.y)) + HEX_SIZE
  state.zoom = Phaser.Math.Clamp(Math.min(Math.max(80, bounds.width - 60) / (right - left), Math.max(80, bounds.height - 155) / (bottom - top)), 0.2, 1.2)
  state.panX = bounds.width / 2 - (left + right) / 2 * state.zoom
  state.panY = 75 + (bounds.height - 155) / 2 - (top + bottom) / 2 * state.zoom
  state.positionReady = true
  document.querySelector<HTMLElement>('.map-edition em')!.textContent = '建安五年 · 全域總覽'
  scheduleMap()
}

/** 请求下一帧绘制，以减少拖拽时的冗余重绘。 */
function scheduleMap(): void {
  state.dirty = true
  zoomReadout.textContent = `${Math.round(state.zoom * 100)}%`
  const latitude = state.selectedTile?.lat ?? 32
  const distance = 60 / state.zoom / 35 * 111 * Math.cos(latitude * Math.PI / 180) * 2
  document.querySelector('#map-scale')!.textContent = `約 ${Math.round(distance / 10) * 10} 里`
}

/** 绘制地形格、州界、行军路线、山水和城池标记。 */
function drawMap(): void {
  if (!state.dirty) return
  const bounds = mapCanvas.getBoundingClientRect()
  if (!bounds.width || !bounds.height) return
  const resolution = Phaser.Math.Clamp(dpr, 1, 2)
  const context = mapContext
  context.setTransform(resolution, 0, 0, resolution, 0, 0)
  context.clearRect(0, 0, mapCanvas.width / resolution, mapCanvas.height / resolution)
  context.fillStyle = '#e7e7da'
  context.fillRect(0, 0, mapCanvas.width / resolution, mapCanvas.height / resolution)
  context.save()
  context.translate(state.panX, state.panY)
  context.scale(state.zoom, state.zoom)
  drawRelief(context)
  const viewport = { left: -state.panX / state.zoom, top: -state.panY / state.zoom, right: (-state.panX + bounds.width) / state.zoom, bottom: (-state.panY + bounds.height) / state.zoom }
  const visibleTiles = Array.from(world.tiles.values()).filter((tile) => {
    const { x, y } = hexToPixel(tile.q, tile.r)
    return x >= viewport.left - 24 && x <= viewport.right + 24 && y >= viewport.top - 24 && y <= viewport.bottom + 24
  })
  for (const tile of visibleTiles) drawTile(context, tile)
  if (state.showBorders) drawProvinceLines(context, visibleTiles)
  if (state.showRivers) drawRivers(context)
  if (state.showSeaLabels) drawSeaLabels(context)
  drawRoute(context)
  drawCityTerritories(context, visibleTiles)
  drawCities(context, visibleTiles)
  drawHover(context)
  context.restore()
  state.dirty = false
}

/** 为大地绘制纸本晕染般的丘陵阴影和地形纹理。 */
function drawRelief(context: CanvasRenderingContext2D): void {
  if (!state.showRelief) return
  const ridges = [
    { name: '秦岭', x: 627, y: 481, radiusX: 117, radiusY: 55, angle: -0.35 },
    { name: '巴山', x: 578, y: 547, radiusX: 92, radiusY: 45, angle: -0.27 },
    { name: '太行山', x: 792, y: 377, radiusX: 32, radiusY: 90, angle: 0.18 },
    { name: '阴山', x: 755, y: 248, radiusX: 106, radiusY: 29, angle: -0.09 },
    { name: '武陵山', x: 728, y: 594, radiusX: 88, radiusY: 48, angle: 0.28 },
    { name: '南岭', x: 733, y: 713, radiusX: 155, radiusY: 37, angle: -0.12 },
    { name: '太湖', x: 1081, y: 667, radiusX: 32, radiusY: 18, angle: 0 },
  ]
  context.save()
  context.globalAlpha = 0.27
  for (const ridge of ridges) {
    context.save()
    context.translate(ridge.x, ridge.y)
    context.rotate(ridge.angle)
    context.strokeStyle = ridge.name === '太湖' ? '#608a83' : '#83785e'
    context.fillStyle = ridge.name === '太湖' ? 'rgba(105,152,147,.22)' : 'rgba(147,134,103,.12)'
    context.lineWidth = 1.3
    context.setLineDash([2, 3])
    for (let band = 0; band < 4; band++) {
      context.beginPath()
      context.ellipse(band * 1.2, -band * 1.2, Math.max(2, ridge.radiusX - band * 12), Math.max(2, ridge.radiusY - band * 6), 0, 0, Math.PI * 2)
      context.fill()
      context.stroke()
    }
    if (ridge.name !== '太湖') {
      context.globalAlpha = 0.56
      context.fillStyle = '#695e4d'
      context.font = '11px "Noto Serif SC", serif'
      context.textAlign = 'center'
      context.fillText(ridge.name, 0, 3)
      context.globalAlpha = 0.27
    }
    context.restore()
  }
  context.restore()
}

/** 在一枚尖顶六边形内标出高辨识度的地形色块和河湖水面。 */
function drawTile(context: CanvasRenderingContext2D, tile: HexTile): void {
  const { x, y } = hexToPixel(tile.q, tile.r)
  const filtered = state.terrainFilter === 'all' || (state.terrainFilter === 'water' ? tile.terrain === 'river' || tile.terrain === 'lake' || tile.terrain === 'coast' : state.terrainFilter === 'highland' ? tile.terrain === 'hill' || tile.terrain === 'mountain' : state.terrainFilter === tile.terrain)
  context.beginPath()
  pathHex(context, x, y, HEX_SIZE - 0.5)
  context.fillStyle = state.terrainFilter !== 'all' && !filtered ? '#e1e1d5' : `#${TERRAIN[tile.terrain].color.toString(16).padStart(6, '0')}`
  context.globalAlpha = 0.88
  context.fill()
  context.globalAlpha = 1
  context.strokeStyle = 'rgba(83,83,71,.24)'
  context.lineWidth = 0.65
  context.stroke()
  if (state.terrainFilter !== 'all' && filtered) {
    context.beginPath()
    pathHex(context, x, y, HEX_SIZE - 3)
    context.strokeStyle = '#876d4a'
    context.lineWidth = 1.2
    context.stroke()
  }
  if (!state.showRelief || tile.cityCenter) return
  context.save()
  context.translate(x, y)
  context.scale(HEX_SIZE / 9, HEX_SIZE / 9)
  context.globalAlpha = 0.34
  if (tile.terrain === 'forest') {
    context.fillStyle = '#3d6552'
    context.beginPath()
    context.moveTo(0, -4)
    context.lineTo(-3, 3)
    context.lineTo(3, 3)
    context.closePath()
    context.fill()
  } else if (tile.terrain === 'hill' || tile.terrain === 'mountain') {
    context.strokeStyle = '#746957'
    context.lineWidth = tile.terrain === 'mountain' ? 1.5 : 1
    context.beginPath()
    context.moveTo(-4, 2)
    context.lineTo(0, -3)
    context.lineTo(4, 2)
    if (tile.terrain === 'mountain') {
      context.moveTo(-1.3, 2)
      context.lineTo(2, -1.5)
      context.lineTo(4.5, 2)
    }
    context.stroke()
  } else if (tile.terrain === 'marsh') {
    context.strokeStyle = '#527b76'
    context.lineWidth = 1
    context.beginPath()
    context.moveTo(-3.5, -1)
    context.quadraticCurveTo(0, -2.5, 3.5, -1)
    context.moveTo(-3, 1.5)
    context.quadraticCurveTo(0, 0, 3, 1.5)
    context.stroke()
  } else if (tile.terrain === 'lake') {
    context.fillStyle = '#599193'
    context.beginPath()
    context.ellipse(0, 0, 3.7, 2.7, 0, 0, Math.PI * 2)
    context.fill()
  }
  context.restore()
}

/** 追踪尖顶六边形轮廓。 */
function pathHex(context: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  context.moveTo(x, y - radius)
  for (let side = 1; side <= 6; side++) {
    const angle = -Math.PI / 2 + side * Math.PI / 3
    context.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius)
  }
  context.closePath()
}

/** 按相邻地块所属州郡绘制示意分界线与区域标注。 */
function drawProvinceLines(context: CanvasRenderingContext2D, tiles: HexTile[]): void {
  const visibleKeys = new Set(tiles.map((tile) => hexKey(tile.q, tile.r)))
  const edgeIndices = [1, 0, 5, 4, 3, 2]
  context.save()
  context.setLineDash([4, 5])
  context.lineWidth = 1.4
  context.strokeStyle = 'rgba(116,91,64,.68)'
  for (const tile of tiles) {
    const province = provinceByTile.get(hexKey(tile.q, tile.r))
    if (!province) continue
    const { x, y } = hexToPixel(tile.q, tile.r)
    for (let direction = 0; direction < DIRECTIONS.length; direction++) {
      const [dq, dr] = DIRECTIONS[direction]
      const key = hexKey(tile.q + dq, tile.r + dr)
      if (!visibleKeys.has(key) || provinceByTile.get(key) === province) continue
      const edge = edgeIndices[direction]
      const startAngle = -Math.PI / 2 + edge * Math.PI / 3
      const endAngle = startAngle + Math.PI / 3
      context.beginPath()
      context.moveTo(x + Math.cos(startAngle) * HEX_SIZE, y + Math.sin(startAngle) * HEX_SIZE)
      context.lineTo(x + Math.cos(endAngle) * HEX_SIZE, y + Math.sin(endAngle) * HEX_SIZE)
      context.stroke()
    }
  }
  context.setLineDash([])
  context.fillStyle = 'rgba(89,76,59,.82)'
  context.font = '600 10px "Noto Serif SC", serif'
  context.textAlign = 'center'
  for (const city of world.cities) {
    const center = hexToPixel(city.q, city.r)
    if (center.x < -40 || center.x > mapCanvas.width / dpr + 40 || center.y < -40 || center.y > mapCanvas.height / dpr + 40) continue
    context.fillText(city.province, center.x, center.y + HEX_SIZE * 2.2)
  }
  context.restore()
}

/** 将世界生成器中的地理水系绘制为地图上的河流和标注。 */
function drawRivers(context: CanvasRenderingContext2D): void {
  context.save()
  context.lineCap = 'round'
  context.lineJoin = 'round'
  for (const river of RIVERS) {
    const points = river.points.map(({ lon, lat }) => geoToPixel(lon, lat))
    context.beginPath()
    points.forEach(({ x, y }, index) => index ? context.lineTo(x, y) : context.moveTo(x, y))
    context.strokeStyle = '#c5ddd3'
    context.lineWidth = Math.max(2, river.width * (22 * HEX_SIZE / 9) + 1.5)
    context.stroke()
    context.strokeStyle = river.width >= 0.14 ? '#477d82' : '#56888a'
    context.lineWidth = Math.max(0.9, river.width * 22 * HEX_SIZE / 9)
    context.globalAlpha = 0.9
    context.stroke()
    const labelPoint = points[Math.floor(points.length / 2)]
    context.globalAlpha = 1
    context.fillStyle = '#416c74'
    context.font = '10px "Noto Serif SC", serif'
    context.textAlign = 'center'
    context.fillText(river.name, labelPoint.x, labelPoint.y - 7)
  }
  context.restore()
}

/** 标注常用海域并用题刻衬线字保持古地图阅读气质。 */
function drawSeaLabels(context: CanvasRenderingContext2D): void {
  context.save()
  context.fillStyle = 'rgba(64,104,104,.68)'
  context.textAlign = 'center'
  context.font = '15px "Noto Serif SC", serif'
  context.fillText('北 海', 1108, 271)
  context.fillText('東 海', 1257, 443)
  context.font = '12px "Noto Serif SC", serif'
  context.fillText('南 海', 993, 829)
  context.fillText('黃海', 1205, 327)
  context.restore()
}

/** 沿城池中心格外圈绘制城域范围，内部地形色保持不变。 */
function drawCityTerritories(context: CanvasRenderingContext2D, visibleTiles: HexTile[]): void {
  const edgeIndices = [1, 0, 5, 4, 3, 2]
  context.save()
  context.lineWidth = 1.1
  for (const tile of visibleTiles) {
    if (!tile.cityId) continue
    const city = world.cities.find((entry) => entry.id === tile.cityId)
    if (!city) continue
    const { x, y } = hexToPixel(tile.q, tile.r)
    const color = `#${FACTIONS[city.faction].ink.toString(16).padStart(6, '0')}`
    context.strokeStyle = color
    context.globalAlpha = city.id === state.city.id ? 0.9 : 0.5
    context.setLineDash(city.id === state.city.id ? [] : [2, 2])
    for (let direction = 0; direction < DIRECTIONS.length; direction++) {
      const [dq, dr] = DIRECTIONS[direction]
      if (world.tiles.get(hexKey(tile.q + dq, tile.r + dr))?.cityId === city.id) continue
      const edge = edgeIndices[direction]
      const startAngle = -Math.PI / 2 + edge * Math.PI / 3
      const endAngle = startAngle + Math.PI / 3
      context.beginPath()
      context.moveTo(x + Math.cos(startAngle) * HEX_SIZE, y + Math.sin(startAngle) * HEX_SIZE)
      context.lineTo(x + Math.cos(endAngle) * HEX_SIZE, y + Math.sin(endAngle) * HEX_SIZE)
      context.stroke()
    }
  }
  context.restore()
}

/** 以印章、城垛和城名绘制视口内的城池节点。 */
function drawCities(context: CanvasRenderingContext2D, visibleTiles: HexTile[]): void {
  const visibleCityIds = new Set(visibleTiles.filter((tile) => tile.cityId).map((tile) => tile.cityId))
  context.save()
  for (const city of world.cities) {
    if (!visibleCityIds.has(city.id)) continue
    const { x, y } = hexToPixel(city.q, city.r)
    const color = FACTIONS[city.faction].ink
    const selected = state.city.id === city.id
    context.globalAlpha = selected ? 1 : 0.93
    context.beginPath()
    context.arc(x, y, selected ? HEX_SIZE * 0.82 : HEX_SIZE * 0.65, 0, Math.PI * 2)
    context.fillStyle = '#f5edda'
    context.fill()
    context.strokeStyle = `#${color.toString(16).padStart(6, '0')}`
    context.lineWidth = selected ? 1.2 : 0.8
    context.stroke()
    context.beginPath()
    const markerSize = HEX_SIZE * 0.45
    context.rect(x - markerSize / 2, y - markerSize / 2, markerSize, markerSize)
    context.fillStyle = `#${color.toString(16).padStart(6, '0')}`
    context.fill()
    context.globalAlpha = 1
    if (state.showLabels || selected) {
      context.textAlign = 'center'
      context.font = selected ? '700 13px "Noto Serif SC", serif' : '600 10px "Noto Serif SC", serif'
      context.lineWidth = 3.5
      context.strokeStyle = 'rgba(239,238,221,.94)'
      context.strokeText(city.name, x, y - 10)
      context.fillStyle = selected ? '#5a3f32' : '#574d43'
      context.fillText(city.name, x, y - 10)
    }
  }
  context.restore()
}

/** 显示已规划的行军路径及当前聚焦的格子。 */
function drawRoute(context: CanvasRenderingContext2D): void {
  if (!state.route.length) return
  context.save()
  context.setLineDash([7, 5])
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.lineWidth = 4
  context.strokeStyle = 'rgba(146,70,54,.26)'
  context.beginPath()
  state.route.forEach((tile, index) => {
    const { x, y } = hexToPixel(tile.q, tile.r)
    index ? context.lineTo(x, y) : context.moveTo(x, y)
  })
  context.stroke()
  context.lineWidth = 2
  context.strokeStyle = '#a14a3a'
  context.stroke()
  context.setLineDash([])
  const last = state.route.at(-1)!
  const point = hexToPixel(last.q, last.r)
  context.beginPath()
  context.arc(point.x, point.y, 5, 0, Math.PI * 2)
  context.fillStyle = '#a14a3a'
  context.fill()
  context.restore()
}

/** 高亮鼠标悬停或正在查看的地图格。 */
function drawHover(context: CanvasRenderingContext2D): void {
  const tile = world.tiles.get(state.hoveredKey) ?? state.selectedTile
  if (!tile) return
  const { x, y } = hexToPixel(tile.q, tile.r)
  context.beginPath()
  pathHex(context, x, y, HEX_SIZE - 1)
  context.fillStyle = 'rgba(245,225,168,.20)'
  context.fill()
  context.strokeStyle = '#a66042'
  context.lineWidth = state.selectedTile ? 2.1 : 1.3
  context.stroke()
}

/** 构建六边形中心的世界像素坐标。 */
function pointerWorld(clientX: number, clientY: number): { x: number; y: number } {
  const bounds = mapCanvas.getBoundingClientRect()
  return { x: (clientX - bounds.left - state.panX) / state.zoom, y: (clientY - bounds.top - state.panY) / state.zoom }
}

/** 把地图点击映射到相邻真实格并更新侧栏。 */
function handleMapClick(event: PointerEvent): void {
  if (state.dragMoved || event.button !== 0) return
  const point = pointerWorld(event.clientX, event.clientY)
  const cell = pixelToHex(point.x, point.y)
  const tile = world.tiles.get(hexKey(cell.q, cell.r))
  if (!tile) return
  if (state.pathMode) {
    selectRouteWaypoint(tile)
    return
  }
  const city = tile.cityId ? world.cities.find((entry) => entry.id === tile.cityId) : undefined
  if (city) selectCity(city)
  else {
    state.selectedTile = tile
    updateSelection()
    scheduleMap()
  }
}

/** 选择出发格和抵达格并按当前军种配置查询移动力最短路。 */
function selectRouteWaypoint(tile: HexTile): void {
  if (!state.routeStart) {
    state.routeStart = tile
    state.route = []
    statusLine.textContent = '选择一个目的地'
    routeReport.innerHTML = `<span class="route-dot"></span>出发于 ${TERRAIN[tile.terrain].name} · 再点选目的地`
    scheduleMap()
    return
  }
  const options = readMovementOptions()
  const path = findPath(world, state.routeStart, tile, options)
  if (!path) {
    routeReport.innerHTML = '<span class="route-dot route-dot--danger"></span>此路不通 · 试试舟船或棧道'
    statusLine.textContent = '无法到达此处'
    return
  }
  state.route = path.tiles
  state.routeCost = path.cost
  routeReport.innerHTML = `<span class="route-dot"></span>${path.tiles.length - 1} 格行程 <strong>${path.cost} 移动力</strong>`
  statusLine.textContent = `路径已规划 · 共 ${path.tiles.length - 1} 格`
  state.routeStart = null
  state.pathMode = false
  routeButton.classList.remove('tool-button--active')
  routeButton.setAttribute('aria-pressed', 'false')
  scheduleMap()
}

/** 从界面读取步兵、骑兵、辎重及工具选项。 */
function readMovementOptions(): MovementOptions {
  return { unit: unitSelect.value as MovementOptions['unit'], boat: boatToggle.checked, plank: plankToggle.checked }
}

/** 把视口移动到指定古城并更新选中信息。 */
function selectCity(city: City): void {
  state.city = city
  state.selectedTile = world.tiles.get(hexKey(city.q, city.r)) ?? null
  focusCity(city, Math.max(state.zoom, 1.6))
  updateSelection()
  renderCityList()
  if (window.matchMedia('(max-width: 820px)').matches) {
    document.body.classList.add('details-open')
    document.querySelector<HTMLButtonElement>('#mobile-details')!.setAttribute('aria-expanded', 'true')
  }
  scheduleMap()
}

/** 刷新右侧的州郡、势力、地形与移动力摘要。 */
function updateSelection(): void {
  const tile = state.selectedTile
  if (!tile) return
  const city = tile.cityId ? world.cities.find((entry) => entry.id === tile.cityId) : undefined
  const terrain = TERRAIN[tile.terrain]
  const faction = city ? FACTIONS[city.faction] : undefined
  inspectorElement.innerHTML = city ? `
    <div class="inspector-place"><span class="inspector-label">所在州</span><strong>${city.province} · ${city.prefecture}</strong></div>
    <h2 class="inspector-name">${city.name}<span>${city.en}</span></h2>
    <p class="inspector-copy">${city.description}</p>
    <div class="inspector-facts">
      <div><span>歸屬勢力</span><strong><i class="faction-dot" style="--faction:${faction!.color}"></i>${faction!.name}</strong></div>
      <div><span>城域規模</span><strong>七格 · ${terrain.name}</strong></div>
      <div><span>地理坐标</span><strong>${city.lat.toFixed(1)}° N　${city.lon.toFixed(1)}° E</strong></div>
    </div>` : `
    <div class="inspector-place"><span class="inspector-label">${tile.cityCenter ? '城池中心' : '野外地块'}</span><strong>${terrain.name}</strong></div>
    <h2 class="inspector-name">${terrain.name}<span>野外地形</span></h2>
    <p class="inspector-copy">${terrain.hint}</p>
    <div class="inspector-facts">
      <div><span>步兵消耗</span><strong>${getCost(tile, 'infantry')}</strong></div>
      <div><span>骑兵消耗</span><strong>${getCost(tile, 'cavalry')}</strong></div>
      <div><span>地形位置</span><strong>经 ${tile.lon.toFixed(1)}° E　纬 ${tile.lat.toFixed(1)}° N</strong></div>
    </div>`
}

/** 格式化指定军种在该格上的移动力消耗。 */
function getCost(tile: HexTile, unit: MovementOptions['unit']): string {
  const cost = movementCost(tile, { unit, boat: boatToggle.checked, plank: plankToggle.checked })
  return Number.isFinite(cost) ? `${cost} 点移动力` : '不可通行'
}

/** 依据当前搜索词和势力筛选重绘城池目录。 */
function renderCityList(): void {
  const query = citySearchInput.value.trim().toLocaleLowerCase()
  const factionFilter = (document.querySelector<HTMLSelectElement>('#faction-filter')?.value ?? 'all') as FactionId | 'all'
  const cities = world.cities.filter((city) => {
    const matchesQuery = !query || [city.name, city.en, city.province, city.prefecture].some((field) => field.toLocaleLowerCase().includes(query))
    return matchesQuery && (factionFilter === 'all' || city.faction === factionFilter)
  })
  cityCountElement.textContent = `${world.cities.length}`
  cityVisibleCountElement.textContent = `${cities.length}`
  cityListElement.innerHTML = cities.map((city) => `
    <button class="city-row ${state.city.id === city.id ? 'city-row--active' : ''}" data-city="${city.id}" type="button">
      <i class="faction-dot" style="--faction:${FACTIONS[city.faction].color}"></i>
      <span class="city-row-name">${city.name}</span>
      <span class="city-row-region">${city.province}</span>
      <span class="city-row-arrow">↗</span>
    </button>`).join('') || '<p class="city-empty">沒有符合的城池</p>'
}

/** 绑定地图缩放、拖动、兵种、筛选和图层控制。 */
function initializeControls(): void {
  mapCanvas.addEventListener('pointerdown', (event) => {
    state.dragging = true
    state.dragMoved = false
    state.previousPointer = { x: event.clientX, y: event.clientY }
    mapCanvas.setPointerCapture(event.pointerId)
  })
  mapCanvas.addEventListener('pointermove', (event) => {
    const point = pointerWorld(event.clientX, event.clientY)
    const cell = pixelToHex(point.x, point.y)
    state.hoveredKey = hexKey(cell.q, cell.r)
    const tile = world.tiles.get(state.hoveredKey)
    if (tile) coordinatesElement.textContent = `北緯 ${Math.round(tile.lat)}°　東經 ${Math.round(tile.lon)}°`
    if (state.dragging && (event.buttons & 1)) {
      const dx = event.clientX - state.previousPointer.x
      const dy = event.clientY - state.previousPointer.y
      if (Math.abs(dx) + Math.abs(dy) > 2) state.dragMoved = true
      state.panX += dx
      state.panY += dy
      state.previousPointer = { x: event.clientX, y: event.clientY }
    }
    mapCanvas.style.cursor = state.dragging ? 'grabbing' : world.tiles.has(state.hoveredKey) ? 'pointer' : 'grab'
    scheduleMap()
  })
  mapCanvas.addEventListener('pointerup', handleMapClick)
  mapCanvas.addEventListener('pointercancel', () => { state.dragging = false })
  mapCanvas.addEventListener('pointerup', () => { state.dragging = false })
  mapCanvas.addEventListener('wheel', (event) => {
    event.preventDefault()
    zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.12 : 0.89)
  }, { passive: false })
  mapCanvas.addEventListener('contextmenu', (event) => event.preventDefault())
  cityListElement.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-city]')
    const city = world.cities.find((entry) => entry.id === button?.dataset.city)
    if (city) selectCity(city)
  })
  document.querySelectorAll<HTMLButtonElement>('[data-nav-filter]').forEach((button) => button.addEventListener('click', () => {
    document.querySelector('.topnav .active')?.classList.remove('active')
    button.classList.add('active')
    state.showBorders = button.dataset.navFilter === 'factions'
    state.showLabels = true
    document.querySelector<HTMLInputElement>('[data-layer="showBorders"]')!.checked = state.showBorders
    document.querySelector<HTMLInputElement>('[data-layer="showLabels"]')!.checked = state.showLabels
    scheduleMap()
  }))
  citySearchInput.addEventListener('input', renderCityList)
  document.querySelector('#faction-filter')?.addEventListener('change', renderCityList)
  unitSelect.addEventListener('change', updateSelection)
  boatToggle.addEventListener('change', updateSelection)
  plankToggle.addEventListener('change', updateSelection)
  document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((button) => button.addEventListener('click', () => {
    document.querySelector('.terrain-filter--active')?.classList.remove('terrain-filter--active')
    button.classList.add('terrain-filter--active')
    state.terrainFilter = button.dataset.filter ?? 'all'
    scheduleMap()
  }))
  document.querySelector<HTMLButtonElement>('#zoom-in')?.addEventListener('click', () => {
    const bounds = mapCanvas.getBoundingClientRect()
    zoomAt(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2, 1.2)
  })
  document.querySelector<HTMLButtonElement>('#zoom-out')?.addEventListener('click', () => {
    const bounds = mapCanvas.getBoundingClientRect()
    zoomAt(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2, 0.83)
  })
  document.querySelector<HTMLButtonElement>('#reset-map')?.addEventListener('click', fitMap)
  document.querySelector<HTMLButtonElement>('#mobile-details')?.addEventListener('click', () => {
    const isOpen = document.body.classList.toggle('details-open')
    document.querySelector<HTMLButtonElement>('#mobile-details')!.setAttribute('aria-expanded', String(isOpen))
  })
  document.querySelector<HTMLButtonElement>('#mobile-close')?.addEventListener('click', () => {
    document.body.classList.remove('details-open')
    document.querySelector<HTMLButtonElement>('#mobile-details')!.setAttribute('aria-expanded', 'false')
  })
  document.querySelector<HTMLButtonElement>('#locate-city')?.addEventListener('click', () => selectCity(state.city))
  routeButton.addEventListener('click', () => {
    state.pathMode = !state.pathMode
    state.routeStart = null
    routeButton.classList.toggle('tool-button--active', state.pathMode)
    routeButton.setAttribute('aria-pressed', String(state.pathMode))
    statusLine.textContent = state.pathMode ? '选取起点，再选取目的地' : '浏览模式'
    routeReport.innerHTML = state.pathMode ? '<span class="route-dot"></span>点击地图选取行军起点' : '<span class="route-dot"></span>尚未规划行军路线'
    scheduleMap()
  })
  document.querySelector<HTMLButtonElement>('#clear-route')?.addEventListener('click', () => {
    state.route = []
    state.routeStart = null
    state.pathMode = false
    routeButton.classList.remove('tool-button--active')
    routeButton.setAttribute('aria-pressed', 'false')
    routeReport.innerHTML = '<span class="route-dot"></span>尚未规划行军路线'
    statusLine.textContent = '浏览模式'
    scheduleMap()
  })
  document.querySelectorAll<HTMLInputElement>('[data-layer]').forEach((input) => input.addEventListener('change', () => {
    const key = input.dataset.layer as 'showRivers' | 'showLabels' | 'showBorders' | 'showRelief' | 'showSeaLabels'
    state[key] = input.checked
    scheduleMap()
  }))
}

/** 以鼠标位置为锚点平滑放大或縮小地图。 */
function zoomAt(clientX: number, clientY: number, factor: number): void {
  const rect = mapCanvas.getBoundingClientRect()
  const x = clientX - rect.left
  const y = clientY - rect.top
  const nextZoom = Phaser.Math.Clamp(state.zoom * factor, 0.38, 2.2)
  const scale = nextZoom / state.zoom
  state.panX = x - (x - state.panX) * scale
  state.panY = y - (y - state.panY) * scale
  state.zoom = nextZoom
  zoomReadout.textContent = `${Math.round(state.zoom * 100)}%`
  scheduleMap()
}

/** 支持加减缩放以及 Escape 退出路线规划。 */
function handleKeyboard(event: KeyboardEvent): void {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
  if (event.key === '+' || event.key === '=') zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1.2)
  if (event.key === '-') zoomAt(window.innerWidth / 2, window.innerHeight / 2, 0.83)
  if (event.key === 'Escape' && state.pathMode) {
    state.pathMode = false
    state.routeStart = null
    routeButton.classList.remove('tool-button--active')
    routeButton.setAttribute('aria-pressed', 'false')
    routeReport.innerHTML = state.route.length ? `<span class="route-dot"></span>路径已规划 · 共 ${state.route.length} 格` : '<span class="route-dot"></span>尚未规划行军路线'
    statusLine.textContent = '浏览模式'
    scheduleMap()
  }
  if (event.key.toLowerCase() === 'r') {
    state.panX = 0
    state.panY = 0
    state.positionReady = false
    resizeMap()
  }
}

/** 由 Phaser 场景逐帧驱动脏标记地图的绘制循环。 */
class AtlasRenderScene extends Phaser.Scene {
  constructor() {
    super({ key: 'AtlasRender' })
  }

  create(): void {
    this.game.events.on(Phaser.Core.Events.POST_RENDER, drawMap)
  }
}

bootAtlas()
