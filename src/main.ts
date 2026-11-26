import Phaser from 'phaser'
import { createIcons, ArrowDownUp, ArrowLeft, ArrowRight, ChevronsDown, Compass, Expand, LocateFixed, Minus, Mountain, MousePointer2, Plus, RotateCcw, Search, Ship, Sparkles, X, ZoomIn, ZoomOut } from 'lucide'
import type { City, FactionId, HexTile, MovementOptions } from './world'
import { createWorld, DIRECTIONS, FACTIONS, HEX_SIZE, LAKES, MOUNTAIN_RANGES, TERRAIN, findPath, geoToPixel, hexKey, hexToPixel, movementCost, pixelToHex } from './world'
import { advanceGesture, clampZoom, fitZoom, startGesture, type PointerGesture } from './map-interaction'
import { createInitialGameState, dispatchArmy, endTurn, FACTION_START_CITY, TURN_MOVEMENT_BUDGET, type GameState } from './game-state'
import './style.css'

const app = document.querySelector<HTMLDivElement>('#app')!
const FACTION_START_LABELS: Record<FactionId, string> = {
  cao: '許縣',
  liubiao: '襄陽',
  sun: '秣陵',
  liuzhang: '成都',
  zhanglu: '南鄭',
  shixie: '龍編',
  local: '下辨',
}

app.innerHTML = `
  <main class="atlas">
    <section id="faction-start" class="start-screen" role="dialog" aria-modal="true" aria-labelledby="start-title">
      <div class="start-panel">
        <div class="start-seal">漢</div>
        <p id="start-message" class="start-kicker">建安十三年 · 群雄並起</p>
        <h1 id="start-title">擇一方勢力<br />以定天下</h1>
        <p class="start-copy">選擇起兵之處。麾下初有一萬兵，城池歸屬將隨戰局更迭。</p>
        <div class="faction-choices" role="group" aria-label="選擇開局勢力">
          ${Object.entries(FACTIONS).map(([id, faction]) => `<button class="faction-choice" type="button" data-start-faction="${id}"><i class="faction-dot" style="--faction:${faction.color}"></i><span>${faction.name}</span><small>${FACTION_START_LABELS[id as FactionId]}起兵</small></button>`).join('')}
        </div>
      </div>
    </section>
    <header class="topbar">
      <div class="brand-lockup">
        <div class="brand-seal">漢</div>
        <div><div class="brand-name">群雄地志</div><div class="brand-meta">TIANXIA · STRATEGIC ATLAS</div></div>
      </div>
      <nav class="topnav" aria-label="地图图层">
        <button class="active" type="button" data-nav-filter="overview">天下形势</button>
        <button type="button" data-nav-filter="factions">州界（示意）</button>
        <button type="button" data-nav-filter="cities">列郡城邑</button>
      </nav>
      <div class="era-label">建安十三年（208）· 劉表病逝前</div>
      <div class="mobile-actions">
        <button id="mobile-search" class="mobile-panel-toggle" type="button" aria-controls="city-panel" aria-expanded="false">搜索城池</button>
        <button id="mobile-details" class="mobile-panel-toggle" type="button" aria-controls="details-panel" aria-expanded="false">地形与行军</button>
      </div>
    </header>
    <div class="workspace">
      <aside id="city-panel" class="left-rail" aria-label="城池检索">
        <div class="rail-head">
          <div class="mobile-search-head"><span>城池检索</span><button id="mobile-search-close" class="mobile-close" type="button" aria-label="关闭城池搜索"><i data-lucide="x"></i></button></div>
          <div class="eyebrow">REALMS OF HAN</div>
          <div class="rail-heading"><h2>州郡城邑</h2><span id="city-count"></span></div>
        </div>
        <label class="search-wrap"><i data-lucide="search"></i><input id="city-search" type="search" aria-label="搜索城池或州郡" placeholder="寻找城池、州郡…" autocomplete="off" /></label>
        <select id="faction-filter" class="faction-select" aria-label="按势力筛选">
          <option value="all">全部勢力</option><option value="cao">曹操</option><option value="liubiao">劉表</option><option value="sun">孫權</option><option value="liuzhang">劉璋</option><option value="zhanglu">張魯</option><option value="shixie">士燮</option><option value="local">地方/待考</option>
        </select>
        <div class="city-list-head">CITY INDEX · <span id="city-visible-count">0</span></div>
        <div id="city-list" class="city-list"></div>
        <div class="rail-bottom"><strong>城邑控制示意，非疆界</strong><br /><small>建安十三年（208）· 劉表病逝前</small><div class="faction-legend">
          <span class="legend-entry"><i class="faction-dot" style="--faction:#aa826c"></i>曹操</span>
          <span class="legend-entry"><i class="faction-dot" style="--faction:#91a58a"></i>劉表</span>
          <span class="legend-entry"><i class="faction-dot" style="--faction:#668b91"></i>孫權</span>
          <span class="legend-entry"><i class="faction-dot" style="--faction:#b99a6b"></i>劉璋</span>
          <span class="legend-entry"><i class="faction-dot" style="--faction:#9c8ca8"></i>張魯</span>
          <span class="legend-entry"><i class="faction-dot" style="--faction:#9a777e"></i>士燮</span>
          <span class="legend-entry"><i class="faction-dot" style="--faction:#a5a18e"></i>地方/待考</span>
        </div></div>
      </aside>

      <section class="map-shell" aria-label="建安十三年战略地图">
        <div class="map-ribbon"><div class="map-edition"><strong>漢末山川圖</strong><em>建安十三年 · 成都近覽</em></div><div class="map-coordinates"><span id="coordinates">北緯 30°　東經 104°</span><span class="map-coordinate-seal">天地四方 · 州郡可行</span></div></div>
        <div class="map-status"><i class="map-status-dot"></i><span id="status-line">拖動以遊覽地圖 · 滾輪縮放</span></div>
        <div class="canvas-wrap"><canvas id="map" aria-label="尖顶六边形三国地形地图，可拖动浏览并点击地块" tabindex="0"></canvas></div>
        <div class="map-compass">北<span>↑</span></div>
        <div class="map-toolbar">
          <button id="locate-city" class="tool-button" type="button" aria-label="定位所选城池" title="定位所选城池"><i data-lucide="locate-fixed"></i></button>
          <button id="zoom-in" class="tool-button" type="button" aria-label="放大地图" title="放大"><i data-lucide="plus"></i></button>
          <button id="zoom-out" class="tool-button" type="button" aria-label="缩小地图" title="缩小"><i data-lucide="minus"></i></button>
          <span class="zoom-readout" id="zoom-readout">480%</span><span class="toolbar-divider"></span>
          <button id="reset-map" class="tool-button" type="button" aria-label="重置地图视角" title="重置视角"><i data-lucide="expand"></i></button>
        </div>
        <div class="map-scale" id="map-scale">約 130 里</div>
        <div class="map-legend"><div class="map-legend-title">山川地势</div><div class="terrain-swatches">
          <span class="terrain-item"><i class="terrain-swatch" style="background:#c8c58d"></i>平原</span><span class="terrain-item"><i class="terrain-swatch" style="background:#8eaa7d"></i>林地</span><span class="terrain-item"><i class="terrain-swatch" style="background:#b69b76"></i>山地</span><span class="terrain-item"><i class="terrain-swatch" style="background:#7f8280"></i>山脉</span><span class="terrain-item"><i class="terrain-swatch" style="background:#8bb2a2"></i>江河湖泊</span><span class="terrain-item"><i class="terrain-swatch" style="background:#a6baaa"></i>沼澤</span>
        </div></div>
      </section>

      <aside id="details-panel" class="right-rail" aria-label="地形和行军详情">
        <section class="detail-section">
          <div class="detail-head"><h3>城邑誌</h3><button id="mobile-close" class="mobile-close" type="button" aria-label="关闭详情"><i data-lucide="x"></i></button><span class="detail-index">01 / 03</span></div>
          <div id="inspector" class="inspector"></div>
        </section>
        <section class="detail-section">
          <div class="detail-head"><h3>军势行军</h3><span class="detail-index">TURN</span></div>
          <div class="game-turn-row"><span>当前回合</span><strong id="turn-number">第 1 回合</strong></div>
          <div id="game-status" class="game-status"></div>
          <button id="restart-campaign" class="secondary-action restart-campaign" type="button" hidden>重新选择势力</button>
          <button id="end-turn" class="route-cta game-turn-button" type="button">结束回合</button>
          <label class="select-label" for="unit-select">行军编制</label>
          <select id="unit-select" class="unit-select">
            <option value="infantry">步卒 · 平原通行</option><option value="cavalry">骑兵 · 机动行军</option><option value="supply">辎重 · 粮车补给</option>
          </select>
          <div class="toggle-row"><span>舟船 · 渡河行水</span><input id="boat-toggle" class="toggle" type="checkbox" /></div>
          <div class="toggle-row"><span>栈道 · 翻越山隘</span><input id="plank-toggle" class="toggle" type="checkbox" /></div>
          <div id="route-report" class="route-report"><i class="route-dot"></i>尚未规划路线</div>
          <button id="army-plan" class="route-cta" type="button" aria-pressed="false">选择出征目的地</button>
          <button id="dispatch-army" class="route-cta" type="button" disabled>派遣军队</button>
          <button id="route-button" class="secondary-action route-preview-button" type="button" aria-pressed="false">自由路线预览</button>
          <button id="clear-route" class="secondary-action" type="button">清除路线</button>
          <div class="movement-costs"><div><span>平原步卒</span><strong>1 移动力</strong></div><div><span>丘陵步卒</span><strong>2 移动力</strong></div><div><span>河流步卒</span><strong class="danger">須乘舟</strong></div></div>
        </section>
        <section class="detail-section">
          <div class="detail-head"><h3>圖層與示意</h3><span class="detail-index">LAYERS</span></div>
          <div class="layer-list">
            <label class="layer-row"><input data-layer="showRelief" type="checkbox" checked />山川地勢</label>
            <label class="layer-row"><input data-layer="showLabels" type="checkbox" checked />城池標記</label>
            <label class="layer-row"><input data-layer="showBorders" type="checkbox" />州界（示意）</label>
            <small>依城邑歸屬近似生成，非歷史疆域；不繪郡界。</small>
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
const armyPlanButton = document.querySelector<HTMLButtonElement>('#army-plan')!
const dispatchButton = document.querySelector<HTMLButtonElement>('#dispatch-army')!
const endTurnButton = document.querySelector<HTMLButtonElement>('#end-turn')!
const gameStatusElement = document.querySelector<HTMLElement>('#game-status')!
const turnNumberElement = document.querySelector<HTMLElement>('#turn-number')!
const statusLine = document.querySelector<HTMLElement>('#status-line')!
const coordinatesElement = document.querySelector<HTMLElement>('#coordinates')!
const zoomReadout = document.querySelector<HTMLElement>('#zoom-readout')!
const cityCountElement = document.querySelector<HTMLElement>('#city-count')!
const cityVisibleCountElement = document.querySelector<HTMLElement>('#city-visible-count')!
const initialCity = world.cities.find((city) => city.id === 'chengdu')!
const factionStartScreen = document.querySelector<HTMLElement>('#faction-start')!
const startMessage = document.querySelector<HTMLElement>('#start-message')!
const startTitle = document.querySelector<HTMLElement>('#start-title')!
const provinceByTile = new Map(Array.from(world.tiles, ([key, tile]) => {
  const nearest = world.cities.reduce((closest, city) => Math.hypot(tile.x - hexToPixel(city.q, city.r).x, tile.y - hexToPixel(city.q, city.r).y) < Math.hypot(tile.x - hexToPixel(closest.q, closest.r).x, tile.y - hexToPixel(closest.q, closest.r).y) ? city : closest)
  return [key, nearest.province] as const
}))
const worldBounds = (() => {
  let left = Infinity
  let right = -Infinity
  let top = Infinity
  let bottom = -Infinity
  for (const tile of world.tiles.values()) {
    left = Math.min(left, tile.x)
    right = Math.max(right, tile.x)
    top = Math.min(top, tile.y)
    bottom = Math.max(bottom, tile.y)
  }
  return {
    left: left - HEX_SIZE,
    right: right + HEX_SIZE,
    top: top - HEX_SIZE,
    bottom: bottom + HEX_SIZE,
  }
})()
let phaserGame: Phaser.Game | undefined

let gameState: GameState = createInitialGameState(world, 'liuzhang')

const state = {
  city: initialCity,
  selectedTile: world.tiles.get(hexKey(initialCity.q, initialCity.r)) ?? null,
  panX: 0,
  panY: 0,
  zoom: 0.55,
  dirty: true,
  gesture: null as PointerGesture | null,
  hoveredKey: '',
  route: [] as HexTile[],
  routeCost: 0,
  routeStart: null as HexTile | null,
  /** 已提交查询的起点，独立于选点过程中的临时起点。 */
  routeFrom: null as HexTile | null,
  /** 已提交查询的终点，配置变化时据此重新寻路。 */
  routeTo: null as HexTile | null,
  pathMode: false,
  armyPlanning: false,
  pendingDispatch: false,
  terrainFilter: 'all',
  showLabels: true,
  showBorders: false,
  showRelief: true,
  showSeaLabels: true,
  positionReady: false,
}

const dpr = Math.min(window.devicePixelRatio || 1, 2)
const mobileViewport = window.matchMedia('(max-width: 820px)')
const cityPanelElement = document.querySelector<HTMLElement>('#city-panel')!
const detailsPanelElement = document.querySelector<HTMLElement>('#details-panel')!
const mobileSearchButton = document.querySelector<HTMLButtonElement>('#mobile-search')!
const mobileDetailsButton = document.querySelector<HTMLButtonElement>('#mobile-details')!
let mobilePanel: 'search' | 'details' | null = null
let resizeObserver: ResizeObserver | undefined
let viewportWidth = 0
let viewportHeight = 0

/** 同步移动端抽屉可见性、可访问性和焦点。 */
function setMobilePanel(panel: 'search' | 'details' | null, moveFocus = true): void {
  const previousPanel = mobilePanel
  mobilePanel = mobileViewport.matches ? panel : null
  document.body.classList.toggle('search-open', mobilePanel === 'search')
  document.body.classList.toggle('details-open', mobilePanel === 'details')
  mobileSearchButton.setAttribute('aria-expanded', String(mobilePanel === 'search'))
  mobileDetailsButton.setAttribute('aria-expanded', String(mobilePanel === 'details'))
  const searchHidden = mobileViewport.matches && mobilePanel !== 'search'
  const detailsHidden = mobileViewport.matches && mobilePanel !== 'details'
  cityPanelElement.inert = searchHidden
  detailsPanelElement.inert = detailsHidden
  cityPanelElement.setAttribute('aria-hidden', String(searchHidden))
  detailsPanelElement.setAttribute('aria-hidden', String(detailsHidden))
  if (!moveFocus) return
  if (mobilePanel === 'search') citySearchInput.focus()
  else if (mobilePanel === 'details') document.querySelector<HTMLButtonElement>('#mobile-close')!.focus()
  else if (previousPanel) {
    if (mobileViewport.matches) (previousPanel === 'search' ? mobileSearchButton : mobileDetailsButton).focus()
    else mapCanvas.focus()
  }
}

/** 在响应式断点变化时关闭移动抽屉并将焦点移出隐藏控件。 */
function handleMobileBreakpointChange(): void {
  const active = document.activeElement
  const focusWasInSearch = cityPanelElement.contains(active)
  const focusWasInDetails = detailsPanelElement.contains(active)
  const focusWasInHiddenNavigation = active instanceof HTMLElement && active.closest('.topnav') !== null
  setMobilePanel(null, false)
  if (!mobileViewport.matches && active instanceof HTMLElement && (active.classList.contains('mobile-close') || mobileSearchButton.contains(active) || mobileDetailsButton.contains(active))) {
    mapCanvas.focus()
  } else if (mobileViewport.matches && (focusWasInSearch || focusWasInHiddenNavigation)) {
    mobileSearchButton.focus()
  } else if (mobileViewport.matches && focusWasInDetails) {
    mobileDetailsButton.focus()
  }
}

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
  mobileViewport.addEventListener('change', handleMobileBreakpointChange)
  setMobilePanel(null, false)
  resizeMap()
  initializeControls()
  renderCityList()
  updateSelection()
  createIcons({
    icons: { ArrowDownUp, ArrowLeft, ArrowRight, ChevronsDown, Compass, Expand, LocateFixed, Minus, Mountain, MousePointer2, Plus, RotateCcw, Search, Ship, Sparkles, X, ZoomIn, ZoomOut },
  })
}

/** 根据当前视口计算与全图总览一致的最小缩放比例。 */
function minimumZoomForViewport(width: number, height: number): number {
  return fitZoom(Math.floor(width), Math.floor(height), worldBounds.right - worldBounds.left, worldBounds.bottom - worldBounds.top)
}

/** 调整地图分辨率，并在视口变化时维持总览或当前地图中心。 */
function resizeMap(): void {
  const bounds = mapCanvas.parentElement!.getBoundingClientRect()
  const width = Math.max(1, Math.floor(bounds.width))
  const height = Math.max(1, Math.floor(bounds.height))
  const oldCenterX = viewportWidth ? (viewportWidth / 2 - state.panX) / state.zoom : 0
  const oldCenterY = viewportHeight ? (viewportHeight / 2 - state.panY) / state.zoom : 0
  const wasOverview = state.positionReady && viewportWidth > 0 &&
    Math.abs(state.zoom - minimumZoomForViewport(viewportWidth, viewportHeight)) < 1e-6
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
  viewportWidth = width
  viewportHeight = height
  if (!state.positionReady) focusCity(initialCity, 4.8)
  else if (wasOverview) fitMap()
  else {
    state.zoom = clampZoom(state.zoom, minimumZoomForViewport(width, height))
    state.panX = width / 2 - oldCenterX * state.zoom
    state.panY = height / 2 - oldCenterY * state.zoom
  }
  scheduleMap()
}

/** 以指定城池为中心打开区域近景，突出周边行军格距。 */
function focusCity(city: City, zoom: number): void {
  const bounds = mapCanvas.parentElement!.getBoundingClientRect()
  const center = hexToPixel(city.q, city.r)
  state.zoom = clampZoom(zoom, minimumZoomForViewport(bounds.width, bounds.height))
  state.panX = bounds.width / 2 - center.x * state.zoom
  state.panY = bounds.height / 2 - center.y * state.zoom
  state.positionReady = true
  document.querySelector<HTMLElement>('.map-edition em')!.textContent = `建安十三年 · ${city.name}近覽`
  scheduleMap()
}

/** 将所有可行地块纳入视口，并为标题和工具栏留白。 */
function fitMap(): void {
  const bounds = mapCanvas.parentElement!.getBoundingClientRect()
  const { left, right, top, bottom } = worldBounds
  state.zoom = minimumZoomForViewport(bounds.width, bounds.height)
  state.panX = bounds.width / 2 - (left + right) / 2 * state.zoom
  state.panY = 75 + (bounds.height - 155) / 2 - (top + bottom) / 2 * state.zoom
  state.positionReady = true
  document.querySelector<HTMLElement>('.map-edition em')!.textContent = '建安十三年 · 全域總覽'
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

/** 读取战局中的城池动态归属；地图史料数据保持不变。 */
function getCityOwner(city: City): FactionId {
  return gameState.cityStates[city.id]?.owner ?? city.faction
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
  const viewport = { left: -state.panX / state.zoom, top: -state.panY / state.zoom, right: (-state.panX + bounds.width) / state.zoom, bottom: (-state.panY + bounds.height) / state.zoom }
  const visibleTiles = Array.from(world.tiles.values()).filter((tile) => {
    const { x, y } = hexToPixel(tile.q, tile.r)
    return x >= viewport.left - 24 && x <= viewport.right + 24 && y >= viewport.top - 24 && y <= viewport.bottom + 24
  })
  for (const tile of visibleTiles) drawTile(context, tile)
  drawRelief(context)
  if (state.showBorders) drawProvinceLines(context, visibleTiles)
  if (state.showSeaLabels) drawSeaLabels(context)
  drawRoute(context)
  drawMarchingRoute(context)
  drawCityTerritories(context, visibleTiles)
  drawCities(context, visibleTiles)
  drawArmyMarker(context)
  drawHover(context)
  context.restore()
  state.dirty = false
}

/** 按世界生成器的山脊折线与湖岸多边形绘制地貌标注。 */
function drawRelief(context: CanvasRenderingContext2D): void {
  if (!state.showRelief) return
  context.save()
  context.lineJoin = 'round'
  context.lineCap = 'round'
  for (const lake of LAKES) {
    context.beginPath()
    lake.points.forEach(({ lon, lat }, index) => {
      const point = geoToPixel(lon, lat)
      index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y)
    })
    context.closePath()
    context.fillStyle = 'rgba(103,157,153,.34)'
    context.fill('evenodd')
    context.strokeStyle = '#548a87'
    context.lineWidth = HEX_SIZE * 0.18
    context.stroke()
    lake.islands?.forEach((island) => {
      context.beginPath()
      island.forEach(({ lon, lat }, index) => {
        const point = geoToPixel(lon, lat)
        index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y)
      })
      context.closePath()
      context.fillStyle = 'rgba(200,197,141,.92)'
      context.fill()
      context.strokeStyle = '#548a87'
      context.stroke()
    })
    const label = geoToPixel(lake.label.lon, lake.label.lat)
    context.fillStyle = '#426f72'
    context.font = `${11 / state.zoom}px "Noto Serif SC", serif`
    context.textAlign = 'center'
    context.fillText(lake.name, label.x, label.y)
  }
  for (const range of MOUNTAIN_RANGES) {
    const label = geoToPixel(range.label.lon, range.label.lat)
    context.fillStyle = 'rgba(91,75,57,.8)'
    context.font = `${11 / state.zoom}px "Noto Serif SC", serif`
    context.textAlign = 'center'
    context.fillText(range.name, label.x, label.y)
  }
  context.restore()
}

/** 在一枚尖顶六边形内标出高辨识度的地形色块和河湖水面。 */
function drawTile(context: CanvasRenderingContext2D, tile: HexTile): void {
  const { x, y } = hexToPixel(tile.q, tile.r)
  const tileSeed = Math.abs((tile.q * 73856093) ^ (tile.r * 19349663))
  const filtered = state.terrainFilter === 'all' || (state.terrainFilter === 'water' ? tile.terrain === 'river' || tile.terrain === 'lake' || tile.terrain === 'coast' : state.terrainFilter === 'highland' ? tile.terrain === 'hill' || tile.terrain === 'mountain' : state.terrainFilter === tile.terrain)
  context.beginPath()
  pathHex(context, x, y, HEX_SIZE - 0.035)
  // 每格轻微偏移同色系明度；起伏越高颜色越深，让山核与山麓形成层次。
  const base = TERRAIN[tile.terrain].color
  const relief = tile.relief ?? 0
  const shift = (tileSeed % 9) - 4
  const elevation = tile.terrain === 'mountain' ? -40 * Math.max(0, relief - 0.55) / 0.45 : tile.terrain === 'hill' ? -12 * Math.max(0, relief - 0.2) : 0
  const tint = shift * 2 + elevation
  const red = Math.max(0, Math.min(255, ((base >> 16) & 255) + tint))
  const green = Math.max(0, Math.min(255, ((base >> 8) & 255) + tint))
  const blue = Math.max(0, Math.min(255, (base & 255) + tint))
  context.fillStyle = state.terrainFilter !== 'all' && !filtered ? '#e1e1d5' : `rgb(${red},${green},${blue})`
  context.globalAlpha = 0.97
  context.fill()
  context.globalAlpha = 1
  context.strokeStyle = 'rgba(83,83,71,.2)'
  context.lineWidth = HEX_SIZE * 0.025
  context.stroke()
  if (state.terrainFilter !== 'all' && filtered) {
    context.beginPath()
    pathHex(context, x, y, HEX_SIZE * 0.78)
    context.strokeStyle = '#876d4a'
    context.lineWidth = HEX_SIZE * 0.12
    context.stroke()
  }
  if (!state.showRelief || tile.cityCenter) return
  context.save()
  context.translate(x, y)
  context.scale(HEX_SIZE / 9, HEX_SIZE / 9)
  context.globalAlpha = 0.5
  if (tile.terrain === 'plain') {
    // 平原用稀疏的草簇和短田垄点出地表差异，避免空白一片。
    if (tileSeed % 3 === 0) {
      context.strokeStyle = '#9a9663'
      context.lineWidth = 0.6
      context.beginPath()
      const tuftX = (tileSeed % 7) - 3
      const tuftY = ((tileSeed >> 3) % 7) - 3
      context.moveTo(tuftX, tuftY + 1.2)
      context.lineTo(tuftX - 0.9, tuftY - 0.8)
      context.moveTo(tuftX, tuftY + 1.2)
      context.lineTo(tuftX + 0.9, tuftY - 0.6)
      context.stroke()
    }
  } else if (tile.terrain === 'forest') {
    context.fillStyle = '#3d6552'
    const treeCount = 2 + tileSeed % 3
    for (let tree = 0; tree < treeCount; tree++) {
      const treeSeed = (tileSeed + tree * 23) % 31
      const treeX = -3 + (treeSeed % 7)
      const treeY = -1.6 + ((treeSeed >> 2) % 5)
      const size = 0.55 + (treeSeed % 4) * 0.16
      context.beginPath()
      context.moveTo(treeX, treeY - 4 * size)
      context.lineTo(treeX - 2.6 * size, treeY + 2.3 * size)
      context.lineTo(treeX + 2.6 * size, treeY + 2.3 * size)
      context.closePath()
      context.fill()
    }
  } else if (tile.terrain === 'hill' || tile.terrain === 'mountain') {
    const peakCount = tile.terrain === 'mountain' ? 2 + (relief > 0.82 ? 1 : tileSeed % 2) : 1 + (relief > 0.5 ? 1 : tileSeed % 2)
    const heightScale = 0.8 + relief * 0.35
    for (let peak = 0; peak < peakCount; peak++) {
      const peakSeed = (tileSeed + peak * 17) % 29
      const peakX = peakCount === 1 ? (peakSeed % 5) - 2 : -2.7 + peak * (tile.terrain === 'mountain' ? 2.7 : 3.2) + (peakSeed % 3) * 0.35
      const peakY = -1.4 + (peakSeed % 4) * 0.32
      const width = (1.8 + peakSeed % 4 * 0.42) * (0.9 + relief * 0.2)
      const height = ((tile.terrain === 'mountain' ? 2.9 : 1.8) + peakSeed % 4 * 0.38) * heightScale
      context.beginPath()
      context.moveTo(peakX - width, 2.7)
      context.lineTo(peakX - width * 0.23, peakY - height)
      context.lineTo(peakX + width * 0.12, peakY - height * 0.18)
      context.lineTo(peakX + width * 0.35, peakY - height * 0.62)
      context.lineTo(peakX + width, 2.7)
      context.closePath()
      context.fillStyle = peakSeed % 2 ? '#72674f' : '#877a60'
      context.fill()
      context.strokeStyle = '#675c4c'
      context.lineWidth = tile.terrain === 'mountain' ? 0.52 : 0.34
      context.stroke()
      context.beginPath()
      context.moveTo(peakX - width * 0.23, peakY - height)
      context.lineTo(peakX + width * 0.12, peakY - height * 0.18)
      context.lineTo(peakX + width * 0.35, peakY - height * 0.62)
      // 只有最高的一批山核才显出浅色雪线。
      context.strokeStyle = tile.terrain === 'mountain' && relief > 0.86 ? '#efe9d6' : '#c2b699'
      context.lineWidth = 0.42
      context.stroke()
    }
  } else if (tile.terrain === 'marsh') {
    context.strokeStyle = '#527b76'
    context.lineWidth = 1
    const sway = ((tileSeed % 5) - 2) * 0.5
    context.beginPath()
    context.moveTo(-3.5, -1)
    context.quadraticCurveTo(sway, -2.5, 3.5, -1)
    context.moveTo(-3, 1.5)
    context.quadraticCurveTo(-sway, 0, 3, 1.5)
    context.stroke()
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

/** 将城域填充、内格线和外城墙全部裁切在中心加六邻格的并集内。 */
function drawCityTerritories(context: CanvasRenderingContext2D, visibleTiles: HexTile[]): void {
  const visibleCityIds = new Set(visibleTiles.filter((tile) => tile.cityId).map((tile) => tile.cityId))
  const edgeIndices = [1, 0, 5, 4, 3, 2]
  for (const city of world.cities) {
    if (!visibleCityIds.has(city.id)) continue
    const footprint = city.tileKeys.map((key) => world.tiles.get(key)!)
    const selected = city.id === state.city.id
    const owner = getCityOwner(city)
    const color = `#${FACTIONS[owner].ink.toString(16).padStart(6, '0')}`
    context.save()
    context.fillStyle = selected ? '#f4dfaa' : FACTIONS[owner].color
    context.globalAlpha = selected ? 0.42 : 0.23
    for (const tile of footprint) {
      context.beginPath()
      pathHex(context, tile.x, tile.y, HEX_SIZE * 0.96)
      context.fill()
    }
    context.globalAlpha = 1
    context.strokeStyle = color
    context.lineWidth = HEX_SIZE * 0.1
    context.beginPath()
    for (const tile of footprint) {
      for (let direction = 0; direction < DIRECTIONS.length; direction++) {
        const [dq, dr] = DIRECTIONS[direction]
        if (world.tiles.get(hexKey(tile.q + dq, tile.r + dr))?.cityId === city.id) continue
        const startAngle = -Math.PI / 2 + edgeIndices[direction] * Math.PI / 3
        const endAngle = startAngle + Math.PI / 3
        context.moveTo(tile.x + Math.cos(startAngle) * HEX_SIZE, tile.y + Math.sin(startAngle) * HEX_SIZE)
        context.lineTo(tile.x + Math.cos(endAngle) * HEX_SIZE, tile.y + Math.sin(endAngle) * HEX_SIZE)
      }
    }
    context.lineWidth = HEX_SIZE * (selected ? 0.15 : 0.11)
    context.lineJoin = 'miter'
    context.stroke()
    context.restore()
  }
}

/** 在城心格内绘制城楼，城名以屏幕字号置于七格城墙之外。 */
function drawCities(context: CanvasRenderingContext2D, visibleTiles: HexTile[]): void {
  const visibleCityIds = new Set(visibleTiles.filter((tile) => tile.cityId).map((tile) => tile.cityId))
  context.save()
  for (const city of world.cities) {
    if (!visibleCityIds.has(city.id)) continue
    const { x, y } = hexToPixel(city.q, city.r)
    const color = `#${FACTIONS[getCityOwner(city)].ink.toString(16).padStart(6, '0')}`
    const selected = state.city.id === city.id
    context.beginPath()
    pathHex(context, x, y, HEX_SIZE * 0.76)
    context.fillStyle = '#f5edda'
    context.fill()
    context.strokeStyle = color
    context.lineWidth = HEX_SIZE * 0.12
    context.stroke()
    context.fillStyle = color
    const size = HEX_SIZE * 0.5
    context.fillRect(x - size, y - size * 0.25, size * 2, size)
    for (let turret = -1; turret <= 1; turret++) {
      context.fillRect(x + turret * size * 0.7 - size * 0.2, y - size * 0.65, size * 0.4, size * 0.65)
    }
    context.fillStyle = '#f5edda'
    context.fillRect(x - size * 0.18, y + size * 0.15, size * 0.36, size * 0.6)
    if (state.showLabels || selected) {
      const labelY = y - HEX_SIZE * 3 - 5 / state.zoom
      context.textAlign = 'center'
      context.font = `${selected ? 700 : 600} ${(selected ? 14 : 12) / state.zoom}px "Noto Serif SC", serif`
      context.lineWidth = 3 / state.zoom
      context.strokeStyle = 'rgba(239,238,221,.96)'
      context.strokeText(city.name, x, labelY)
      context.fillStyle = selected ? '#5a3f32' : '#574d43'
      context.fillText(city.name, x, labelY)
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

/** 绘制正在执行的军队路线，以实线区别于规划预览。 */
function drawMarchingRoute(context: CanvasRenderingContext2D): void {
  if (gameState.army.status !== 'marching') return
  const remaining = gameState.army.pathKeys.slice(gameState.army.nextTileIndex - 1)
    .map((key) => world.tiles.get(key))
    .filter((tile): tile is HexTile => Boolean(tile))
  if (remaining.length < 2) return
  context.save()
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.lineWidth = 2.5 / state.zoom
  context.strokeStyle = 'rgba(125,55,43,.9)'
  context.beginPath()
  remaining.forEach((tile, index) => {
    const { x, y } = hexToPixel(tile.q, tile.r)
    index ? context.lineTo(x, y) : context.moveTo(x, y)
  })
  context.stroke()
  context.restore()
}

/** 以固定屏幕尺寸标出当前军队位置，保持缩放后的标记清晰可见。 */
function drawArmyMarker(context: CanvasRenderingContext2D): void {
  const tile = world.tiles.get(gameState.army.positionKey)
  if (!tile) return
  const { x, y } = hexToPixel(tile.q, tile.r)
  const screenScale = 1 / state.zoom
  context.save()
  context.beginPath()
  context.arc(x, y, 9 * screenScale, 0, Math.PI * 2)
  context.fillStyle = '#f5efdc'
  context.fill()
  context.strokeStyle = '#7f352c'
  context.lineWidth = 1.5 * screenScale
  context.stroke()
  context.beginPath()
  context.arc(x, y, 7 * screenScale, 0, Math.PI * 2)
  context.fillStyle = '#a14a3a'
  context.fill()
  context.fillStyle = '#fff8e8'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.font = `700 ${10 * screenScale}px "Noto Sans SC", sans-serif`
  context.fillText('军', x, y)
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

/** 根据当前指针事件更新地图平移并记录累计手势距离。 */
function advanceMapPointer(event: PointerEvent): boolean {
  const gesture = state.gesture
  if (!gesture) return false
  const update = advanceGesture(gesture, event.pointerId, event.clientX, event.clientY)
  if (!update) return false
  state.gesture = update.gesture
  state.panX += update.dx
  state.panY += update.dy
  return true
}

/** 开始主指针的地图拖动手势并捕获指针。 */
function handleMapPointerDown(event: PointerEvent): void {
  if (!event.isPrimary || event.button !== 0 || state.gesture) return
  state.gesture = startGesture(event.pointerId, event.clientX, event.clientY)
  mapCanvas.setPointerCapture(event.pointerId)
  mapCanvas.style.cursor = 'grabbing'
}

/** 更新地图悬停信息，并仅响应当前活动指针的拖动。 */
function handleMapPointerMove(event: PointerEvent): void {
  if (state.gesture && state.gesture.pointerId !== event.pointerId) return
  const point = pointerWorld(event.clientX, event.clientY)
  const cell = pixelToHex(point.x, point.y)
  state.hoveredKey = hexKey(cell.q, cell.r)
  const tile = world.tiles.get(state.hoveredKey)
  if (tile) coordinatesElement.textContent = `北纬 ${Math.round(tile.lat)}°　東經 ${Math.round(tile.lon)}°`
  const gesture = state.gesture
  if (gesture?.pointerId === event.pointerId && event.pointerType === 'mouse' && !(event.buttons & 1)) {
    cancelMapPointer(event.pointerId, true)
  } else if (advanceMapPointer(event)) {
    mapCanvas.style.cursor = 'grabbing'
  } else if (!state.gesture) {
    mapCanvas.style.cursor = world.tiles.has(state.hoveredKey) ? 'pointer' : 'grab'
  }
  scheduleMap()
}

/** 结束活动手势；可选地释放捕获且绝不将取消操作视为点击。 */
function cancelMapPointer(pointerId: number, releaseCapture = false): void {
  if (state.gesture?.pointerId !== pointerId) return
  state.gesture = null
  mapCanvas.style.cursor = world.tiles.has(state.hoveredKey) ? 'pointer' : 'grab'
  if (releaseCapture && mapCanvas.hasPointerCapture(pointerId)) mapCanvas.releasePointerCapture(pointerId)
}

/** 完成最终位移判定、清理手势并仅在轻触时处理地图点击。 */
function handleMapPointerUp(event: PointerEvent): void {
  const gesture = state.gesture
  if (!gesture || gesture.pointerId !== event.pointerId) return
  advanceMapPointer(event)
  const isClick = !state.gesture!.dragged && event.button === 0
  cancelMapPointer(event.pointerId, true)
  scheduleMap()
  if (isClick) handleMapClick(event)
}

/** 仅清理匹配指针的已取消或已失去捕获的手势。 */
function handleMapPointerCancel(event: PointerEvent): void {
  cancelMapPointer(event.pointerId)
}

/** 把地图点击映射到相邻真实格并更新侧栏。 */
function handleMapClick(event: PointerEvent): void {
  if (event.button !== 0) return
  const point = pointerWorld(event.clientX, event.clientY)
  const cell = pixelToHex(point.x, point.y)
  const tile = world.tiles.get(hexKey(cell.q, cell.r))
  if (!tile) return
  if (state.armyPlanning) {
    selectArmyDestination(tile)
    return
  }
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
    state.routeCost = 0
    state.routeFrom = null
    state.routeTo = null
    statusLine.textContent = '选择一个目的地'
    routeReport.innerHTML = `<span class="route-dot"></span>出发于 ${TERRAIN[tile.terrain].name} · 再点选目的地`
    scheduleMap()
    return
  }
  state.routeFrom = state.routeStart
  state.routeTo = tile
  state.routeStart = null
  state.pathMode = false
  routeButton.classList.remove('tool-button--active')
  routeButton.setAttribute('aria-pressed', 'false')
  refreshRoute()
}

/** 以军队当前位置为起点选择并预览出征目的地。 */
function selectArmyDestination(tile: HexTile): void {
  const position = world.tiles.get(gameState.army.positionKey)
  if (!position) return
  state.routeFrom = position
  state.routeTo = tile
  state.routeStart = null
  state.armyPlanning = false
  state.pendingDispatch = true
  armyPlanButton.setAttribute('aria-pressed', 'false')
  armyPlanButton.textContent = '重新选择目的地'
  refreshRoute()
  if (mobileViewport.matches) {
    setMobilePanel('details')
    routeReport.scrollIntoView({ block: 'center' })
  }
}

/** 按当前行军配置重算已提交路线；无路时清空旧线但保留起终点，便于恢复装备后自动重算。 */
function refreshRoute(): void {
  if (!state.routeFrom || !state.routeTo) return
  const start = world.tiles.get(hexKey(state.routeFrom.q, state.routeFrom.r))
  const end = world.tiles.get(hexKey(state.routeTo.q, state.routeTo.r))
  if (!start || !end) return
  const path = findPath(world, start, end, readMovementOptions())
  if (!path || (state.pendingDispatch && path.tiles.length < 2)) {
    state.route = []
    state.routeCost = 0
    dispatchButton.disabled = true
    routeReport.innerHTML = '<span class="route-dot route-dot--danger"></span>此路不通或目的地与当前位置相同'
    statusLine.textContent = '无法到达此处'
    scheduleMap()
    return
  }
  state.route = path.tiles
  state.routeCost = path.cost
  const steps = path.tiles.length - 1
  routeReport.innerHTML = `<span class="route-dot"></span>${steps} 格行程 <strong>${path.cost} 移动力</strong>`
  statusLine.textContent = `路径已规划 · 共 ${steps} 格`
  dispatchButton.disabled = !state.pendingDispatch
  scheduleMap()
}

/** 行军配置变化后同步地形详情与已规划路线。 */
function applyMovementChange(): void {
  updateSelection()
  if (gameState.army.status === 'marching') {
    unitSelect.value = gameState.army.movementOptions.unit
    boatToggle.checked = gameState.army.movementOptions.boat
    plankToggle.checked = gameState.army.movementOptions.plank
    syncGameStatus()
    return
  }
  refreshRoute()
}

/** 将军队所在格显示为城池名称或地理坐标。 */
function describeLocation(tile: HexTile | undefined): string {
  const city = tile?.cityId ? world.cities.find((entry) => entry.id === tile.cityId) : undefined
  return city?.name ?? (tile ? `${tile.lon.toFixed(1)}°E · ${tile.lat.toFixed(1)}°N` : '未知位置')
}

/** 同步回合、军队位置和行军结果到军势面板。 */
function syncGameStatus(movementSummary?: string): void {
  turnNumberElement.textContent = `第 ${gameState.turn} 回合`
  const location = describeLocation(world.tiles.get(gameState.army.positionKey))
  const destination = gameState.army.destinationKey ? world.tiles.get(gameState.army.destinationKey) : undefined
  const destinationLabel = describeLocation(destination)
  const status = gameState.army.status === 'marching'
    ? `行军中：${location} → ${destinationLabel}`
    : gameState.army.status === 'arrived'
      ? `已抵达：${location}`
      : gameState.army.status === 'defeated'
        ? '军队全灭 · 此局已败'
        : `待命：${location}`
  const faction = FACTIONS[gameState.playerFaction]
  const battle = gameState.lastBattle
  const battleSummary = battle
    ? `${world.cities.find((city) => city.id === battle.cityId)?.name}战报：${battle.outcome === 'victory' ? '攻城胜利并占领' : '攻城失利'} · 我军损失 ${battle.attackerLosses.toLocaleString('zh-CN')} · 守军损失 ${battle.defenderLosses.toLocaleString('zh-CN')}`
    : ''
  gameStatusElement.innerHTML = `<strong><i class="faction-dot" style="--faction:${faction.color}"></i>${faction.name} · ${status}</strong><span>军力 ${gameState.army.troops.toLocaleString('zh-CN')} · ${movementSummary ?? `每回合最多移动 ${TURN_MOVEMENT_BUDGET} 点`}</span>${battleSummary ? `<span class="battle-status">${battleSummary}</span>` : ''}`
  endTurnButton.disabled = gameState.army.status !== 'marching'
  armyPlanButton.disabled = gameState.army.status === 'marching' || gameState.army.status === 'defeated'
  unitSelect.disabled = gameState.army.status === 'marching' || gameState.army.status === 'defeated'
  boatToggle.disabled = gameState.army.status === 'marching' || gameState.army.status === 'defeated'
  plankToggle.disabled = gameState.army.status === 'marching' || gameState.army.status === 'defeated'
  dispatchButton.disabled = !state.pendingDispatch || state.route.length < 2 || gameState.army.status === 'marching' || gameState.army.status === 'defeated'
  document.querySelector<HTMLButtonElement>('#restart-campaign')!.hidden = gameState.army.status !== 'defeated'
}

/** 从界面读取步兵、骑兵、辎重及工具选项。 */
function readMovementOptions(): MovementOptions {
  return { unit: unitSelect.value as MovementOptions['unit'], boat: boatToggle.checked, plank: plankToggle.checked }
}

/** 把视口移动到指定古城并更新选中信息。 */
function selectCity(city: City): void {
  state.city = city
  state.selectedTile = world.tiles.get(hexKey(city.q, city.r)) ?? null
  focusCity(city, Math.max(state.zoom, 4.8))
  updateSelection()
  renderCityList()
  if (mobileViewport.matches) setMobilePanel('details')
  scheduleMap()
}

/** 刷新右侧的州郡、势力、地形与移动力摘要。 */
function updateSelection(): void {
  const tile = state.selectedTile
  if (!tile) return
  const city = tile.cityId ? world.cities.find((entry) => entry.id === tile.cityId) : undefined
  const terrain = TERRAIN[tile.terrain]
  const owner = city ? getCityOwner(city) : undefined
  const faction = owner ? FACTIONS[owner] : undefined
  const cityState = city ? gameState.cityStates[city.id] : undefined
  inspectorElement.innerHTML = city ? `
    <div class="inspector-place"><span class="inspector-label">州 · 郡國級歸屬</span><strong>${city.province} · ${city.prefecture}</strong></div>
    <h2 class="inspector-name">${city.name}<span>${city.en}</span></h2>
    <p class="inspector-copy">${city.description}</p>
    <div class="inspector-facts">
      <div><span>当前城主</span><strong><i class="faction-dot" style="--faction:${faction!.color}"></i>${faction!.name}</strong></div>
      <div><span>驻守兵力</span><strong>${(cityState?.garrison ?? 0).toLocaleString('zh-CN')} 人 · 城防 ${cityState?.defenseBonus ?? 0}%</strong></div>
      <div><span>城域规模</span><strong>七格 · ${terrain.name}</strong></div>
      <div><span>地理坐标</span><strong>${city.lat.toFixed(1)}° N　${city.lon.toFixed(1)}° E</strong></div>
    </div>` : `
    <div class="inspector-place"><span class="inspector-label">${tile.cityCenter ? '城池中心' : '野外地块'}</span><strong>${terrain.name}</strong></div>
    <h2 class="inspector-name">${terrain.name}<span>${tile.landform ?? '野外地形'}</span></h2>
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
    return matchesQuery && (factionFilter === 'all' || getCityOwner(city) === factionFilter)
  })
  cityCountElement.textContent = `${world.cities.length}`
  cityVisibleCountElement.textContent = `${cities.length}`
  cityListElement.innerHTML = cities.map((city) => `
    <button class="city-row ${state.city.id === city.id ? 'city-row--active' : ''}" data-city="${city.id}" type="button">
      <i class="faction-dot" style="--faction:${FACTIONS[getCityOwner(city)].color}"></i>
      <span class="city-row-name">${city.name}</span>
      <span class="city-row-region">${city.province}</span>
      <span class="city-row-arrow">↗</span>
    </button>`).join('') || '<p class="city-empty">沒有符合的城池</p>'
}

/** 绑定地图手势、移动面板、缩放、兵种、筛选和图层控制。 */
function initializeControls(): void {
  mapCanvas.addEventListener('pointerdown', handleMapPointerDown)
  mapCanvas.addEventListener('pointermove', handleMapPointerMove)
  mapCanvas.addEventListener('pointerup', handleMapPointerUp)
  mapCanvas.addEventListener('pointercancel', handleMapPointerCancel)
  mapCanvas.addEventListener('lostpointercapture', handleMapPointerCancel)
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
  unitSelect.addEventListener('change', applyMovementChange)
  boatToggle.addEventListener('change', applyMovementChange)
  plankToggle.addEventListener('change', applyMovementChange)
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
  mobileSearchButton.addEventListener('click', () => setMobilePanel(mobilePanel === 'search' ? null : 'search'))
  mobileDetailsButton.addEventListener('click', () => setMobilePanel(mobilePanel === 'details' ? null : 'details'))
  document.querySelector<HTMLButtonElement>('#mobile-search-close')?.addEventListener('click', () => setMobilePanel(null))
  document.querySelector<HTMLButtonElement>('#mobile-close')?.addEventListener('click', () => setMobilePanel(null))
  document.querySelector<HTMLButtonElement>('#locate-city')?.addEventListener('click', () => selectCity(state.city))
  document.querySelectorAll<HTMLButtonElement>('[data-start-faction]').forEach((button) => button.addEventListener('click', () => {
    const faction = button.dataset.startFaction as FactionId
    gameState = createInitialGameState(world, faction)
    const city = world.cities.find((entry) => entry.id === FACTION_START_CITY[faction])!
    state.city = city
    state.selectedTile = world.tiles.get(hexKey(city.q, city.r)) ?? null
    startTitle.innerHTML = '擇一方勢力<br />以定天下'
    factionStartScreen.classList.add('start-screen--hidden')
    startMessage.textContent = `${FACTIONS[faction].name} · ${city.name}起兵`
    renderCityList()
    updateSelection()
    syncGameStatus()
    focusCity(city, 4.8)
    scheduleMap()
  }))
  armyPlanButton.addEventListener('click', () => {
    if (gameState.army.status === 'marching') return
    state.armyPlanning = !state.armyPlanning
    state.pendingDispatch = false
    state.pathMode = false
    state.routeStart = null
    state.routeFrom = null
    state.routeTo = null
    state.route = []
    state.routeCost = 0
    armyPlanButton.setAttribute('aria-pressed', String(state.armyPlanning))
    armyPlanButton.textContent = state.armyPlanning ? '点击地图选择目的地' : '选择出征目的地'
    routeButton.classList.remove('tool-button--active')
    routeButton.setAttribute('aria-pressed', 'false')
    routeReport.innerHTML = '<span class="route-dot"></span>尚未规划路线'
    statusLine.textContent = state.armyPlanning ? '选择地图上的行军目的地' : '浏览模式'
    syncGameStatus()
    if (state.armyPlanning && mobileViewport.matches) setMobilePanel(null)
    scheduleMap()
  })
  dispatchButton.addEventListener('click', () => {
    if (!state.routeTo || !state.pendingDispatch) return
    const result = dispatchArmy(gameState, world, hexKey(state.routeTo.q, state.routeTo.r), readMovementOptions())
    if (!result.ok) {
      routeReport.innerHTML = '<span class="route-dot route-dot--danger"></span>派遣失败：请重新选择可达目的地'
      return
    }
    gameState = result.state
    const destinationLabel = describeLocation(state.routeTo)
    state.route = []
    state.routeCost = 0
    state.routeStart = null
    state.routeFrom = null
    state.routeTo = null
    state.pendingDispatch = false
    armyPlanButton.textContent = '选择出征目的地'
    routeReport.innerHTML = `<span class="route-dot"></span>军队已出发 · 目标 ${destinationLabel}`
    statusLine.textContent = '军队已出发'
    syncGameStatus()
    scheduleMap()
  })
  endTurnButton.addEventListener('click', () => {
    const result = endTurn(gameState, world)
    gameState = result.state
    const location = describeLocation(world.tiles.get(gameState.army.positionKey))
    const summary = result.battle
      ? `${world.cities.find((city) => city.id === result.battle!.cityId)?.name}攻城${result.battle.outcome === 'victory' ? '得胜 · 城池已归我军' : '失利 · 退回原格'} · 损失 ${result.battle.attackerLosses.toLocaleString('zh-CN')} 人`
      : result.arrived
        ? `本回合移动 ${result.movementSpent} 点 · 已到达目的地`
        : `本回合移动 ${result.movementSpent} 点 · ${result.movedKeys.length} 格 · 当前 ${location}`
    routeReport.innerHTML = `<span class="route-dot${result.battle?.outcome === 'defeat' ? ' route-dot--danger' : ''}"></span>${summary}`
    statusLine.textContent = result.battle
      ? summary
      : result.arrived
        ? `行军抵达 · ${location}`
        : `第 ${gameState.turn} 回合 · 行军推进 ${result.movedKeys.length} 格`
    if (result.battle) {
      const city = world.cities.find((entry) => entry.id === result.battle!.cityId)!
      state.city = city
      state.selectedTile = world.tiles.get(result.battle.entryKey) ?? world.tiles.get(hexKey(city.q, city.r)) ?? null
    }
    updateSelection()
    renderCityList()
    syncGameStatus(summary)
    scheduleMap()
  })
  document.querySelector<HTMLButtonElement>('#restart-campaign')?.addEventListener('click', () => {
    factionStartScreen.classList.remove('start-screen--hidden')
    startMessage.textContent = '全軍覆沒 · 請另擇勢力再起'
    startTitle.innerHTML = '此役已敗<br />東山再起'
  })
  routeButton.addEventListener('click', () => {
    state.pathMode = !state.pathMode
    state.armyPlanning = false
    state.pendingDispatch = false
    state.routeStart = null
    state.route = []
    state.routeCost = 0
    state.routeFrom = null
    state.routeTo = null
    armyPlanButton.setAttribute('aria-pressed', 'false')
    armyPlanButton.textContent = '选择出征目的地'
    routeButton.classList.toggle('tool-button--active', state.pathMode)
    routeButton.setAttribute('aria-pressed', String(state.pathMode))
    statusLine.textContent = state.pathMode ? '选取起点，再选取目的地' : '浏览模式'
    routeReport.innerHTML = state.pathMode ? '<span class="route-dot"></span>点击地图选取行军起点' : '<span class="route-dot"></span>尚未规划行军路线'
    syncGameStatus()
    scheduleMap()
  })
  document.querySelector<HTMLButtonElement>('#clear-route')?.addEventListener('click', () => {
    state.route = []
    state.routeCost = 0
    state.routeStart = null
    state.routeFrom = null
    state.routeTo = null
    state.pathMode = false
    state.armyPlanning = false
    state.pendingDispatch = false
    armyPlanButton.setAttribute('aria-pressed', 'false')
    armyPlanButton.textContent = '选择出征目的地'
    routeButton.classList.remove('tool-button--active')
    routeButton.setAttribute('aria-pressed', 'false')
    routeReport.innerHTML = '<span class="route-dot"></span>尚未规划路线'
    statusLine.textContent = '浏览模式'
    syncGameStatus()
    scheduleMap()
  })
  document.querySelectorAll<HTMLInputElement>('[data-layer]').forEach((input) => input.addEventListener('change', () => {
    const key = input.dataset.layer as 'showLabels' | 'showBorders' | 'showRelief' | 'showSeaLabels'
    state[key] = input.checked
    scheduleMap()
  }))
  syncGameStatus()
}

/** 以鼠标位置为锚点平滑放大或縮小地图。 */
function zoomAt(clientX: number, clientY: number, factor: number): void {
  const rect = mapCanvas.getBoundingClientRect()
  const x = clientX - rect.left
  const y = clientY - rect.top
  const nextZoom = clampZoom(state.zoom * factor, minimumZoomForViewport(rect.width, rect.height))
  const scale = nextZoom / state.zoom
  state.panX = x - (x - state.panX) * scale
  state.panY = y - (y - state.panY) * scale
  state.zoom = nextZoom
  zoomReadout.textContent = `${Math.round(state.zoom * 100)}%`
  scheduleMap()
}

/** 支持键盘缩放、Escape 关闭移动面板或退出路线规划。 */
function handleKeyboard(event: KeyboardEvent): void {
  if (event.key === 'Escape' && mobilePanel) {
    event.preventDefault()
    setMobilePanel(null)
    return
  }
  if (event.key === 'Escape' && (state.pathMode || state.armyPlanning || state.pendingDispatch)) {
    state.pathMode = false
    state.armyPlanning = false
    state.pendingDispatch = false
    state.routeStart = null
    state.route = []
    state.routeCost = 0
    state.routeFrom = null
    state.routeTo = null
    armyPlanButton.setAttribute('aria-pressed', 'false')
    armyPlanButton.textContent = '选择出征目的地'
    routeButton.classList.remove('tool-button--active')
    routeButton.setAttribute('aria-pressed', 'false')
    routeReport.innerHTML = '<span class="route-dot"></span>尚未规划路线'
    statusLine.textContent = '浏览模式'
    syncGameStatus()
    scheduleMap()
  }
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
  if (event.key === '+' || event.key === '=') zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1.2)
  if (event.key === '-') zoomAt(window.innerWidth / 2, window.innerHeight / 2, 0.83)
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
