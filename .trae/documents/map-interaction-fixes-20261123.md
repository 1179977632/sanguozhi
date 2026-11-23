# 地图交互体验修复实施计划

**目标：** 补齐移动端城池搜索，消除慢拖动误点击，并统一全图总览与交互缩放的边界。

**架构：** 保留现有 TypeScript、Phaser 帧循环和 Canvas 2D 绘制架构；复用现有城池目录与详情侧栏。仅把需要单元测试的指针判定和缩放计算提取为小型纯函数模块，不重构地图或历史数据。

**技术栈：** TypeScript、Vite、Phaser、原生 Pointer Events、Node test、tsx。

---

## 一、背景与当前状态分析

已完成源代码检查，确认三个问题：

1. `src/style.css` 在宽度不超过 820px 时直接隐藏 `.left-rail`，移动端没有替代的城池检索入口；详情抽屉仅通过位移隐藏，隐藏的控件仍可能获得键盘焦点。
2. `src/main.ts` 的拖动判定只检查相邻两次移动事件的距离。连续的小幅移动不会累计触发拖动标记，松手时会错误选中地块或设置路线端点；同时缺少活动指针身份检查与完整的取消清理。
3. `fitMap()` 的缩放范围是 0.2–1.2，`focusCity()`、`zoomAt()` 的范围是 0.38–7。总览比例低于 0.38 时，第一次缩小反而可能放大。

本次不修改城池、州郡、水网、寻路规则、图层内容、历史时间点或整体视觉设计。

## 二、文件范围

| 文件 | 操作与职责 |
| --- | --- |
| `src/main.ts` | 修改移动端入口和抽屉状态、接入指针生命周期、统一总览/聚焦/缩放/窗口调整逻辑。 |
| `src/style.css` | 复用原有纸色与抽屉样式，补齐搜索抽屉、隐藏状态与窄屏按钮布局。 |
| `src/map-interaction.ts` | 新增必要的小型纯函数模块，仅负责手势位移判定与缩放计算，供实际生产代码及测试共同使用。 |
| `tests/map-interaction.test.ts` | 新增对应纯函数的回归测试。 |
| `package.json` | 将测试脚本从单个世界测试文件改为同时运行世界与交互测试。 |

不新增 UI 框架、浏览器测试依赖或文档体系；不提交 Git、不部署。

## 三、确定的交互契约

### 1. 移动端面板

- 断点保持为 `max-width: 820px`，821px 起保留双侧栏桌面布局。
- 顶栏提供“搜索城池”和“地形与行军”两个移动端按钮，各绑定 `aria-controls` 与 `aria-expanded`。
- 给现有左右侧栏分别添加 `city-panel`、`details-panel` ID；搜索侧栏增加关闭按钮，详情关闭按钮保持原入口。
- 使用唯一的 `null | 'search' | 'details'` 状态，任何时刻最多打开一个移动端面板，不复制搜索框或城池列表。
- 打开搜索后聚焦现有搜索框；打开详情后聚焦详情关闭按钮。选择搜索结果继续调用 `selectCity()`，定位地图后关闭搜索并打开详情。
- 手动关闭面板或按 Escape 后恢复到对应顶栏按钮；跨断点隐藏当前焦点时，把焦点转移到仍可见的对应控件或地图，不能留在隐藏区域。
- 隐藏面板同时设置 `inert`、`aria-hidden`，CSS 设置 `visibility: hidden` 和 `pointer-events: none`；桌面模式恢复侧栏交互及可访问状态。
- 采用非模态面板，不增加遮罩、焦点陷阱或新弹窗系统。
- Escape 优先关闭当前面板并返回，不在同一次按键中同时清除路线；面板关闭后保持既有 Escape 取消路线行为。面板关闭判断必须放在输入框/下拉框快捷键过滤之前。
- 不改变既有搜索匹配规则：城名、英文名、州、郡字段的大小写不敏感子串匹配，与势力筛选取交集；不增加简繁转换、拼音或别名搜索。
- 新增及本次触及的提示文字使用简体中文；不批量转换世界数据和其他界面文本。

### 2. 指针与拖动

- 仅允许主指针、鼠标主键开始手势；已有活动手势时忽略其他指针的开始、移动和结束。
- 阈值为距离按下原点超过 **5 CSS 像素**，使用欧氏距离；距离不超过 5px 的轻微抖动仍视为点击。
- 拖动标记一旦触发即保持，即使指针随后回到按下原点，也不能转回点击。
- 地图平移仍按相邻事件位移更新，阈值只决定松手是否执行选点，不引入明显的拖动起步跳跃。
- pointerup 在唯一处理函数中依次完成最终位移更新、点击资格判断、状态与捕获清理，然后按资格调用 `handleMapClick()`。
- pointercancel、lostpointercapture 只清理活动手势，不触发城池/地块选择或路线端点。
- 保留普通点击、路线选点、滚轮缩放与原生指针捕获；不实现双指缩放或多指手势。

### 3. 缩放边界

- 地图世界边界仍由现有所有地块中心加 `HEX_SIZE` 外扩得到，可在世界初始化后计算一次。
- 最小缩放取当前视口的全图适配比例，保留现有水平 60px、垂直 155px 留白和 75px 顶部布局偏移；适配比例最多 1.2，不再使用互相冲突的固定最小值 0.2/0.38。
- 最大缩放统一保持 7。
- 全图总览、城市聚焦、滚轮/按钮/快捷键缩放及视口调整均使用相同计算结果。
- 在总览状态继续缩小保持不变，不能反向放大；从近景可以连续缩小到全图适配比例。
- 窗口变化时立即重算边界。如果原视图处于总览，重新适配全图；否则保留地图中心并按新范围钳制缩放，不能把纠正动作延迟到下一次缩小。
- 保留现有锚点缩放公式，不改变 R 键及工具栏重置按钮各自的既有含义，也不扩展修改其他快捷键。

## 四、实施步骤

### 任务 1：为真实生产计算建立回归测试

- [ ] 新增 `tests/map-interaction.test.ts`，先导入下一步将提供的函数，运行测试确认因模块未实现而失败。
- [ ] 测试使用以下明确输入与断言，不在 Node 中导入包含 DOM 初始化的 `main.ts`：

```ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { advanceGesture, clampZoom, fitZoom, startGesture } from '../src/map-interaction.ts'

test('慢速连续移动累计超过阈值后不再是点击', () => {
  let gesture = startGesture(1, 100, 100)
  for (let x = 101; x <= 106; x++) {
    gesture = advanceGesture(gesture, 1, x, 100)!.gesture
  }
  assert.equal(gesture.dragged, true)
})

test('轻微抖动仍是点击且越界后返回不会清除拖动', () => {
  const initial = startGesture(1, 100, 100)
  assert.equal(advanceGesture(initial, 1, 103, 104)!.gesture.dragged, false)
  const moved = advanceGesture(initial, 1, 106, 100)!.gesture
  assert.equal(advanceGesture(moved, 1, 100, 100)!.gesture.dragged, true)
})

test('非活动指针不影响手势且最终松手位移也能判定拖动', () => {
  const initial = startGesture(1, 100, 100)
  assert.equal(advanceGesture(initial, 2, 120, 100), null)
  const final = advanceGesture(initial, 1, 107, 100)!
  assert.equal(final.gesture.dragged, true)
  assert.equal(final.dx, 7)
  assert.equal(final.dy, 0)
})

test('总览下继续缩小不反向放大且最大缩放保持为7', () => {
  const minimum = fitZoom(360, 600, 2000, 1600)
  assert.ok(minimum < 0.38)
  assert.equal(clampZoom(minimum * 0.83, minimum), minimum)
  assert.equal(clampZoom(10, minimum), 7)
})

test('不同视口共享适配下限并在视口变大时立即钳制', () => {
  for (const width of [360, 390, 820, 821, 1440]) {
    const minimum = fitZoom(width, 900, 2000, 1600)
    assert.ok(minimum > 0 && minimum <= 1.2)
    assert.equal(clampZoom(minimum * 0.89, minimum), minimum)
  }
  const previous = fitZoom(360, 600, 2000, 1600)
  const next = fitZoom(1000, 900, 2000, 1600)
  assert.equal(clampZoom(previous, next), next)
  assert.equal(fitZoom(10000, 10000, 2000, 1600), 1.2)
})
```

执行命令：`npx tsx --test tests/map-interaction.test.ts`。预期：新增模块未实现时失败；不得用跳过测试掩盖失败。

### 任务 2：实现小型纯函数并通过上述测试

- [ ] 新增 `src/map-interaction.ts`，内容仅限以下类型和函数，保持函数级中文注释：

```ts
export interface PointerGesture {
  pointerId: number
  originX: number
  originY: number
  lastX: number
  lastY: number
  maxDistance: number
  dragged: boolean
}

/** 记录主指针按下位置，供整个手势累计判定。 */
export function startGesture(pointerId: number, x: number, y: number): PointerGesture {
  return { pointerId, originX: x, originY: y, lastX: x, lastY: y, maxDistance: 0, dragged: false }
}

/** 只更新活动指针并保持已经触发的拖动标记。 */
export function advanceGesture(gesture: PointerGesture, pointerId: number, x: number, y: number): { gesture: PointerGesture; dx: number; dy: number } | null {
  if (gesture.pointerId !== pointerId) return null
  const maxDistance = Math.max(gesture.maxDistance, Math.hypot(x - gesture.originX, y - gesture.originY))
  return {
    gesture: { ...gesture, lastX: x, lastY: y, maxDistance, dragged: gesture.dragged || maxDistance > 5 },
    dx: x - gesture.lastX,
    dy: y - gesture.lastY,
  }
}

/** 根据视口与世界范围计算全图适配下限。 */
export function fitZoom(width: number, height: number, worldWidth: number, worldHeight: number): number {
  return Math.min(1.2, Math.max(80, width - 60) / worldWidth, Math.max(80, height - 155) / worldHeight)
}

/** 将任意缩放值限制在全图适配下限与统一上限内。 */
export function clampZoom(zoom: number, minimum: number): number {
  return Math.max(minimum, Math.min(zoom, 7))
}
```

- [ ] 在 `package.json` 把 `test` 改为 `tsx --test tests/world.test.ts tests/map-interaction.test.ts`，保留其他脚本与依赖。
- [ ] 运行 `npm test`，预期既有世界测试与新增交互测试全部通过；这仅证明计算逻辑，不代替浏览器验证。

### 任务 3：补齐移动端搜索及面板生命周期

- [ ] 在 `main.ts` 的现有顶栏加入按钮组，给左右侧栏添加稳定 ID，给搜索侧栏添加关闭按钮；示例目标结构如下，不复制侧栏内容：

```html
<div class="mobile-actions">
  <button id="mobile-search" class="mobile-panel-toggle" type="button" aria-controls="city-panel" aria-expanded="false">搜索城池</button>
  <button id="mobile-details" class="mobile-panel-toggle" type="button" aria-controls="details-panel" aria-expanded="false">地形与行军</button>
</div>
```

搜索框添加 `aria-label="搜索城池或州郡"`，占位文字改为 `寻找城池、州郡…`；关闭按钮使用 `type="button"` 与简体中文可访问名称。

- [ ] 在 `main.ts` 增加 `mobilePanel`、媒体查询对象及有函数级中文注释的 `setMobilePanel()`，统一执行：
  1. 根据是否移动端规范化目标状态。
  2. 设置 `search-open`、`details-open` body 类与两个按钮的展开状态。
  3. 根据可见性同步侧栏 `inert` 与 `aria-hidden`。
  4. 打开时聚焦目标面板控件；关闭时恢复当前面板对应入口的焦点；跨断点时避免聚焦隐藏的移动按钮。
- [ ] 替换现有详情按钮与关闭按钮的零散状态修改，绑定两个入口和关闭按钮；媒体查询 change 时重置移动状态并恢复桌面侧栏。
- [ ] `selectCity()` 保持原有地图定位、详情更新和列表刷新，仅把原移动端直接加 class 改为 `setMobilePanel('details')`。
- [ ] `handleKeyboard()` 在输入控件过滤之前处理“Escape 关闭移动面板并返回”；其他快捷键和路线清除代码保持原行为。
- [ ] 在 `style.css` 中将移动端 `.left-rail { display: none; }` 替换为左侧抽屉，复用右侧抽屉的边框、阴影、顶部/底部留白与宽度。搜索抽屉从左侧滑入，详情仍从右侧滑入；只在不超过 820px 时应用定位和隐藏规则。
- [ ] 增加以下等效的状态样式，保留桌面默认布局：

```css
.mobile-actions { display: none; }

@media (max-width: 820px) {
  .mobile-actions { display: flex; gap: 6px; flex-shrink: 0; }
  .mobile-panel-toggle { min-height: 36px; padding: 6px 9px; border: 1px solid var(--rule); background: #eeede2; color: #716d61; font-size: 11px; }
  .left-rail, .right-rail { visibility: hidden; pointer-events: none; }
  .search-open .left-rail, .details-open .right-rail { visibility: visible; pointer-events: auto; transform: translateX(0); }
  .left-rail { display: flex; position: absolute; z-index: 6; left: 8px; top: 9px; bottom: 9px; width: min(282px, calc(100vw - 24px)); border: 1px solid var(--rule); box-shadow: 0 5px 20px #24231b20; transform: translateX(calc(-100% - 10px)); transition: transform .2s; }
  .left-rail .search-wrap input, .left-rail .faction-select { min-height: 40px; }
  .left-rail .search-wrap input { font-size: 16px; }
  .left-rail .city-row { min-height: 40px; }
}
```

合并而非重复冲突的既有 `.mobile-details`、`.mobile-close` 规则；保证 360px 顶栏两个按钮与品牌不重叠。搜索框放大字号只作用于移动端，避免手机聚焦输入框导致不必要的页面自动缩放。

### 任务 4：接入完整指针生命周期

- [ ] 在 `main.ts` 导入纯函数与 `PointerGesture` 类型，用一个 `PointerGesture | null` 代替 `state.dragging`、`state.dragMoved`、`state.previousPointer`，清理所有旧引用。
- [ ] 将 pointerdown/move/up/cancel/lostpointercapture 提取为有函数级中文注释的命名处理函数；`initializeControls()` 只负责绑定，其他非指针控件绑定保持不变。
- [ ] pointerdown 仅在 `event.isPrimary && event.button === 0 && gesture === null` 时调用 `startGesture()` 并捕获指针。
- [ ] pointermove 使用 `advanceGesture()` 更新活动指针、累计平移；保持原有悬停与坐标信息更新，不让第二指针污染当前手势。鼠标移动事件显示主键已释放时，只取消手势，不执行点击。
- [ ] 合并现有两个 pointerup 监听器，更新最终位移后保存 `!gesture.dragged && event.button === 0` 的点击资格，再清空活动状态、恢复光标并在仍持有捕获时释放；仅符合资格时调用 `handleMapClick()`。
- [ ] 从 `handleMapClick()` 移除依赖旧拖动字段的判断，保留鼠标主键及后续地块/城市/路线选点处理。
- [ ] pointercancel 与 lostpointercapture 仅清理匹配的活动指针，清理必须可重复调用且不得选点；释放捕获前先清空活动状态，避免 lostpointercapture 二次触发改变业务结果。

### 任务 5：统一缩放与视口调整

- [ ] 世界创建后计算现有世界外接矩形，给 `main.ts` 增加一个根据当前视口调用 `fitZoom()` 的小型函数并添加中文函数注释。
- [ ] `fitMap()` 使用该适配比例和已有留白/居中公式；`focusCity()` 与 `zoomAt()` 都调用 `clampZoom()`，删除三个入口中不一致的固定最小值。
- [ ] `zoomAt()` 保持现有锚点公式：

```ts
const nextZoom = clampZoom(state.zoom * factor, minimum)
const scale = nextZoom / state.zoom
state.panX = x - (x - state.panX) * scale
state.panY = y - (y - state.panY) * scale
state.zoom = nextZoom
```

- [ ] `resizeMap()` 在更新视口尺寸前记录旧中心对应的世界位置及旧总览比例。旧比例与 `state.zoom` 的差小于 `1e-6` 时视为总览并重新 `fitMap()`；其他已初始化视图使用新下限钳制后，令旧世界中心落在新视口中心；未初始化时保留原有成都近景初始化。
- [ ] 所有路径继续通过 `scheduleMap()` 更新比例读数与脏标记，不增加额外绘制循环。

## 五、验证步骤与通过条件

### 自动验证

- [ ] 运行 `npm test`：所有世界与交互测试通过。保留既有黄河、淮水两项 `river-pending` 预期，不修改世界回归断言以迁就界面改动。
- [ ] 运行 `npm run build`：TypeScript 检查与 Vite 构建成功。完整保存命令输出，不使用会掩盖退出状态的输出截断管道。
- [ ] 检查改动范围；不丢弃用户已有改动，不提交构建缓存、临时浏览器脚本或截图到源代码目录。

### 浏览器验证

开发服务器使用现有 `npm run dev`，不新增测试框架。浏览器自动化前加载可用浏览器操作指南。

| 场景 | 明确通过条件 |
| --- | --- |
| 360px、390px、820px | 搜索/详情入口可见且不重叠；搜索可打开、输入“成都”、筛选并选中；地图定位，搜索关闭，详情打开；重开搜索保留筛选内容。 |
| 821px、桌面宽度 | 左右侧栏恢复，检索、详情控件均可操作；移动按钮隐藏；没有残留 inert 或隐藏焦点。 |
| 面板互斥与键盘 | 搜索和详情不同时打开；关闭按钮和 Escape 正常；搜索输入框内也能按 Escape 关闭；隐藏面板无法 Tab 进入，关闭后焦点回到可见入口。 |
| 普通点击与轻微抖动 | 点击及不超过 5px 抖动仍正常选中；路线模式下正常设置端点。 |
| 慢拖动与往返拖动 | 多次约 1px 移动累计超过 5px 时只平移，不改变选中地块、城市或路线端点；越阈值再返回也不误点。 |
| 取消与指针身份 | 指针取消/失去捕获后无选点、无残留抓取光标；无关第二指针不能结束活动手势。若当前工具不能产生该类真实事件，明确记录限制，不将纯函数测试冒充浏览器事件验证。 |
| 总览与连续缩放 | 重置到全图后继续点击缩小或向下滚轮，比例不增加；可以放大后连续缩小回适配比例；放大不超过 700%；缩放锚点不明显跳动。 |
| 视口调整 | 总览跨窄/宽屏后保持全图适配；城市近景保持中心且比例在新边界内；下一次缩小不出现反向放大。 |

桌面浏览器视口与触摸模拟只能证明对应模拟环境；没有实际手机验证时，不声称已验证手机软键盘、真机触摸或双指操作。

## 六、假设与交付边界

- 现有 40 城及历史/水网成果是稳定基线，本次仅修改交互及其测试。
- 不增加搜索简繁兼容、多点触控、历史行政扩展或全站文字转换。
- 所有新增或修改的命名函数补充简体中文函数级注释，遵循现有代码风格。
- 用户确认本计划后直接按任务顺序实施、验证并汇报结果；不再次规划或重复索取执行确认。
- 最终说明实际修复内容、测试/构建结果和浏览器验证边界；不把未执行的真机检查写成已通过。
