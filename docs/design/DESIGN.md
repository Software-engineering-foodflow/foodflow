---
name: 食序 FoodFlow
description: 餐廳後場食材管理系統的全站視覺規範。以 docs/design/storage-demo.html（預設 v=6「晨霧」）為視覺基準，建構在 Mantine 9 之上；本檔定義品牌層與元件的差異。
status: draft
updated: 2026-11-08
baseline: docs/design/storage-demo.html?v=6
ui-system: Mantine 9（frontend/src/app/theme.ts）
colors:
  # ── 主色：森林綠（對應 theme.ts 的 forest 色階，index 0–9）──
  primary-50: '#EDF7F0'
  primary-100: '#D7EADE'
  primary-200: '#B1D5BF'
  primary-300: '#87BFA0'
  primary-400: '#64AB85'
  primary-500: '#4B9E74'
  primary-600: '#3D936B'
  primary-700: '#2F805A'
  primary-800: '#236E4B'
  primary-900: '#145F3E'
  primary-950: '#0D4A2F'   # 只用於主要按鈕 hover 漸層的深端
  primary: '#236E4B'
  primary-strong: '#145F3E'
  on-primary: '#FFFFFF'
  # ── 點綴：苔黃綠（只用於漸層尾端、導覽計數徽章、背景光暈）──
  accent: '#B7C94F'
  accent-deep: '#7DA84A'
  on-accent: '#2B3410'
  # ── 中性色 ──
  text: '#1F2A24'
  text-muted: '#5D6A61'
  text-subtle: '#64746A'
  text-placeholder: '#7D8A81'
  text-disabled: '#9AA39D'
  surface: '#FFFFFF'
  surface-raised: '#FFFFFFC7'
  surface-subtle: '#FBFCF9'
  surface-header: '#F6F9F3'
  surface-selected: '#F1F7ED'
  canvas-top: '#F4F8F3'
  canvas-mid: '#F9FBF7'
  canvas-bottom: '#FFFFFF'
  line: '#E3EADF'
  line-soft: '#EFF3EC'
  line-selected: '#DFEADA'
  line-nested: '#D7E6D2'
  border-input: '#849788'
  code-bg: '#EDF3E8'
  code-fg: '#3E5A45'
  # ── 側欄 ──
  sidebar-top: '#EAF2E8'
  sidebar-mid: '#F1F7EE'
  sidebar-bottom: '#FBFDF9'
  sidebar-fg: '#3B4E42'
  sidebar-muted: '#4F6A58'
  sidebar-icon: '#6F8A79'
  # ── 狀態色（文字色 / 底色成對使用）──
  status-expired: '#B3361F'
  status-expired-bg: '#FBE9E7'
  status-today: '#A54E0E'
  status-today-bg: '#FDF0E2'
  status-soon: '#8A6D0B'
  status-soon-bg: '#F8F3DC'
  status-normal: '#2A7A4F'
  status-normal-bg: '#E5F2E9'
  status-low-stock: '#5B4FA8'
  status-low-stock-bg: '#EEEBF8'
  # ── 回饋色 ──
  danger: '#B3361F'
  danger-bg: '#FBE9E7'
  info: '#3C6F96'
  info-bg: '#E5EEF6'
  success: '#2A7A4F'
  success-bg: '#E9F4EC'
  inactive-bg: '#F0F1EF'
  focus-ring: '#2F805A'
  # ── 保存方式（圖示色 / 圖示底）──
  storage-chilled: '#2B8577'
  storage-chilled-bg: '#E2F1EC'
  storage-frozen: '#467596'
  storage-frozen-bg: '#E7EEF4'
  storage-ambient: '#7A8A24'
  storage-ambient-bg: '#F1F4DA'
typography:
  display:
    fontFamily: 'Noto Sans TC'
    fontSize: 28px
    fontWeight: '900'
    lineHeight: '1.25'
    letterSpacing: 0.01em
  title:
    fontFamily: 'Noto Sans TC'
    fontSize: 18px
    fontWeight: '700'
    lineHeight: '1.4'
  stat:
    fontFamily: 'Noto Sans TC'
    fontSize: 26px
    fontWeight: '800'
    lineHeight: '1.15'
  body:
    fontFamily: 'Noto Sans TC'
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  body-strong:
    fontFamily: 'Noto Sans TC'
    fontSize: 14px
    fontWeight: '700'
    lineHeight: '1.5'
  label:
    fontFamily: 'Noto Sans TC'
    fontSize: 13px
    fontWeight: '600'
    lineHeight: '1.4'
  caption:
    fontFamily: 'Noto Sans TC'
    fontSize: 12px
    fontWeight: '400'
    lineHeight: '1.45'
  table-head:
    fontFamily: 'Noto Sans TC'
    fontSize: 12px
    fontWeight: '700'
    lineHeight: '1.4'
    letterSpacing: 0.08em
  badge:
    fontFamily: 'Noto Sans TC'
    fontSize: 12px
    fontWeight: '700'
    lineHeight: '1.4'
  code:
    fontFamily: 'JetBrains Mono'
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1.4'
rounded:
  xs: 6px
  sm: 8px
  md: 10px
  lg: 12px
  xl: 16px
  full: 9999px
spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 20px
  '6': 24px
  '8': 32px
  touch-target: 44px
  row-min: 52px
  sidebar-width: 236px
  sidebar-rail: 72px
  page-x-desktop: 32px
  page-x-tablet: 24px
  page-x-phone: 16px
  page-y: 24px
  section-gap: 20px
components:
  page-header:
    title: '{typography.display}'
    description: '{typography.body}'
    description-color: '{colors.text-muted}'
    breadcrumb: '{typography.caption}'
    icon-tile-size: 42px
    icon-tile-radius: '{rounded.lg}'
  button-primary:
    background: 'linear-gradient(135deg, {colors.primary-900}, {colors.primary-700})'
    foreground: '{colors.on-primary}'
    height: '{spacing.touch-target}'
    radius: '{rounded.lg}'
    typography: '{typography.body-strong}'
    shadow: '0 6px 14px -8px rgba(35,110,75,.7)'
  button-secondary:
    background: '{colors.surface}'
    foreground: '{colors.primary-strong}'
    border: '1px solid #D6E5D6'
    height: '{spacing.touch-target}'
    radius: '{rounded.lg}'
  button-danger:
    background: '{colors.danger}'
    foreground: '{colors.on-primary}'
    height: '{spacing.touch-target}'
    radius: '{rounded.lg}'
  input:
    background: '{colors.surface}'
    border: '1px solid {colors.border-input}'
    height: '{spacing.touch-target}'
    radius: '{rounded.md}'
    placeholder: '{colors.text-placeholder}'
  toolbar:
    background: 'linear-gradient(180deg, {colors.surface}, {colors.surface-subtle})'
    padding: '{spacing.4}'
    gap: '{spacing.3}'
    divider: '1px solid {colors.line-soft}'
  card:
    background: '{colors.surface}'
    border: '1px solid #FFFFFFE6'
    radius: '{rounded.xl}'
    shadow: '0 14px 40px -28px rgba(35,90,55,.45)'
  stat-card:
    background: '{colors.surface-raised}'
    border: '1px solid #FFFFFFF2'
    radius: '{rounded.xl}'
    shadow: '0 8px 24px -18px rgba(35,90,55,.45)'
    value: '{typography.stat}'
  table:
    head-background: '{colors.surface-header}'
    head-foreground: '{colors.text-subtle}'
    head-typography: '{typography.table-head}'
    row-divider: '1px solid {colors.line-soft}'
    row-min-height: '{spacing.row-min}'
    cell-padding-x: '{spacing.4}'
    row-selected-background: '{colors.surface-selected}'
    row-selected-border: '1px solid {colors.line-selected}'
  nested-panel:
    background: '{colors.surface}'
    border: '1px solid {colors.line-nested}'
    radius: '{rounded.lg}'
    shadow: '0 8px 22px -14px rgba(35,90,55,.45)'
  status-badge:
    typography: '{typography.badge}'
    radius: '{rounded.full}'
    padding: '2px 10px'
    dot-size: 6px
  dialog:
    background: '{colors.surface}'
    radius: '{rounded.xl}'
    shadow: '0 24px 60px -24px rgba(20,60,40,.45)'
    overlay: '#1F2A2466'
    padding: '{spacing.6}'
  sidebar-item-active:
    background: 'linear-gradient(90deg, {colors.primary-900}, {colors.primary-700})'
    foreground: '{colors.on-primary}'
    radius: '{rounded.md}'
    shadow: '0 6px 14px -8px rgba(35,110,75,.7)'
---

## Brand & Style

食序 FoodFlow 用在餐廳後場：雙手常常濕的、戴著手套，螢幕旁邊就是冷藏庫和備料台。這套視覺要像一本**乾淨、可靠的庫存帳**，讓人一眼看出哪批先用、哪批該處理，不必細看就能判斷。

外觀氣質來自基準頁 v=6「晨霧」：

- **森林綠為主、苔黃綠點綴**，整體色溫偏暖。綠色帶出「新鮮、食材」的聯想，但不走生鮮電商那種飽和鮮綠。
- **淺色、帶空氣感的底**：直向淡綠漸層加右上角一抹黃綠光暈，卡片是白色或半透明白，陰影柔而低。
- **資訊為主、裝飾為輔**：裝飾只出現在頁首圖示方塊、主要按鈕和導覽選中項的漸層上。表格與表單維持素淨。
- **警示要克制**：基準頁 3a 修正定下一條原則，到期提示**只強調過期與今日到期**。其餘狀態降一階處理，避免整頁都是紅橘黃。

本規範建構在 Mantine 9 之上。沒有在這裡列出的元件與行為一律沿用 Mantine 預設；這裡只寫品牌差異。

## Colors

### 主色：森林綠

`primary-50`～`primary-900` 與 `frontend/src/app/theme.ts` 的 `forest` 色階逐一對應（index 0–9），在 Mantine 裡一律用 `forest.N` 取色，不另寫 hex。

- **`{colors.primary}`（`#236E4B`，forest.8）**：主要按鈕、導覽選中項、連結與焦點，白字對比 6.17:1。
- **`{colors.primary-strong}`（`#145F3E`，forest.9）**：展開列的名稱、次要按鈕文字、品牌字樣，白底對比 7.67:1。
- **`{colors.primary-700}`（`#2F805A`）**：漸層的**淺端上限**。基準頁的按鈕漸層原本收在 `#4B9E74`，白字只有 3.26:1，所以本規範把淺端改成 `#2F805A`（4.82:1）。深端從 `{colors.primary-900}` 起，橫跨兩階，漸層才看得出來，文字也讀得清楚。

### 點綴：苔黃綠

`{colors.accent}`（`#B7C94F`）與 `{colors.accent-deep}`（`#7DA84A`）只能用在三個地方：頁首圖示方塊的漸層尾端、側欄導覽的計數徽章（配 `{colors.on-accent}` 深字，7.17:1）、背景右上角的光暈。**不可**當文字色，也**不可**當狀態色，因為它跟「即期」的黃色太接近。

### 中性色

| Token | 值 | 用途 | 白底對比 |
|---|---|---|---|
| `text` | `#1F2A24` | 內文、表格內容、標題 | 14.4:1 |
| `text-muted` | `#5D6A61` | 說明文字、單位、次要資訊、正常狀態文字 | 5.68:1 |
| `text-subtle` | `#64746A` | 表頭、麵包屑 | 4.94:1 |
| `text-placeholder` | `#7D8A81` | 輸入框 placeholder | 3.61:1 |
| `text-disabled` | `#9AA39D` | 停用列、停用控制項 | 2.59:1（停用元素不受對比限制） |
| `border-input` | `#849788` | 輸入框外框 | 3.11:1 |
| `line` / `line-soft` | `#E3EADF` / `#EFF3EC` | 卡片框線 / 表格列分隔 | 只做分隔，不承載資訊 |

基準頁的次要文字原本是 `#76837A`、表頭是 `#7B8B80`，在 v=6 的漸層底上都低於 4.5:1，本規範各加深一階。placeholder 只做提示，所以輸入框**一定要有獨立的 label**，不可拿 placeholder 當欄位名稱。

畫布底色是三段直向漸層：`{colors.canvas-top}` → `{colors.canvas-mid}` → `{colors.canvas-bottom}`（165deg），上方淡綠、往下漸白；右上角再疊一層 `radial-gradient(700px 320px at 92% -40px, rgba(183,201,79,.11), transparent 70%)`。

### 狀態色

狀態色永遠**文字加顏色一起出現**，不可單用顏色表達狀態。顯示文字與色票只定義在 `frontend/src/shared/ui/statusBadgeMap.ts`（AD-23）；狀態本身由後端的 `classify_expiry` 與 `LowStockRule` 判定，前端不自行計算。

| 狀態 | 後端值 | 文字 / 底 | 對比 | 視覺強度 |
|---|---|---|---|---|
| 過期 | `EXPIRED` | `#B3361F` / `#FBE9E7` | 5.17:1 | **強**：實心底色膠囊 |
| 今日到期 | `EXPIRES_TODAY` | `#A54E0E` / `#FDF0E2` | 5.07:1 | **強**：實心底色膠囊 |
| 低庫存 | `LOW_STOCK` | `#5B4FA8` / `#EEEBF8` | 5.71:1 | **強**：實心底色膠囊 |
| 即期 | `EXPIRING_SOON` | `#8A6D0B` / 透明 | 4.91:1（白底） | **中**：只有圓點加文字，不填底 |
| 正常 | `NORMAL` | `#5D6A61` / 透明 | 5.68:1 | **弱**：灰字，不加圓點 |

- **今日到期**：基準頁原本是 `#BB5A12`，只有 4.09:1，本規範加深為 `#A54E0E`。
- **即期／正常降階**：沿用基準頁 3a 修正。在預警首頁的分區標題、篩選標籤等「這一區全是即期」的情境，即期可以改用實心膠囊（`{colors.status-soon}` / `{colors.status-soon-bg}`）。
- **低庫存** `[ASSUMPTION]`：基準頁沒有這個狀態。色相沿用現行 `statusBadgeMap` 的 violet，理由是要跟紅、橘、黃、綠都分得開。它代表「要補貨」，需要採購處理，所以列為強提示。
- 現行 `statusBadgeMap.ts` 使用 Mantine 內建的 `red`/`orange`/`yellow`/`violet`/`green`，要改成上表的 hex 值，才會跟本規範一致。

### 回饋色

- `{colors.danger}` 與過期同色，但語意不同：危險按鈕、表單錯誤、錯誤橫幅用 `danger`；資料狀態用 `status-expired`。兩組 token 分開命名，之後才能分別調整。
- `{colors.info}` / `{colors.info-bg}`：一般提示，例如「依到期日排序」說明或背景同步中，4.58:1。
- `{colors.success}` / `{colors.success-bg}`：「啟用」標籤、成功通知，4.66:1。`{colors.inactive-bg}` 是「停用」標籤的底。

### 保存方式色

冷藏、冷凍、常溫各有一組圖示色與淺底，**只用在圖示方塊**，旁邊一定要寫「冷藏／冷凍／常溫」文字。圖示屬於非文字元素，三組對淺底都達到 3:1 以上（3.82、4.22、3.41）。不可拿保存方式色當文字色或狀態色。

## Typography

- **字體**：Noto Sans TC（400 / 500 / 700 / 900）承擔全站文字；JetBrains Mono 600 只用於代碼與批號，例如 `R-01`、`FL-1105`。兩者都從 Google Fonts 載入，fallback 為 `system-ui, sans-serif` 與 `monospace`。
- **數字一律 `font-variant-numeric: tabular-nums`**，讓數量、日期、批次數在表格裡上下對齊。

| 角色 | 規格 | 用在 |
|---|---|---|
| `display` | 28 / 900 / 1.25 | 頁面 h1，每頁一個 |
| `title` | 18 / 700 | 卡片標題、對話框標題、空狀態標題 |
| `stat` | 26 / 800 | 摘要卡數值 |
| `body` | 14 / 400 / 1.5 | 內文、表格內容、輸入值 |
| `body-strong` | 14 / 700 | 表格主欄（名稱）、按鈕文字 |
| `label` | 13 / 600 | 表單 label、篩選選項 |
| `caption` | 12 / 400 | 說明、麵包屑、單位、時間戳 |
| `table-head` | 12 / 700 / 字距 0.08em | 表頭 |
| `badge` | 12 / 700 | 狀態標籤、計數徽章 |
| `code` | JetBrains Mono 12 / 600 | 代碼、批號 |

基準頁的字級很零碎（11、11.5、12、12.5、13、13.5、14.5、27），本規範整理成上表。最小字級統一提高到 12px，內文從 13.5px 提高到 14px，因為平板通常放在一臂外的工作台上看。`[ASSUMPTION]`

## Layout & Spacing

間距以 4 為基準：`{spacing.1}` 4 → `{spacing.2}` 8 → `{spacing.3}` 12 → `{spacing.4}` 16 → `{spacing.5}` 20 → `{spacing.6}` 24 → `{spacing.8}` 32。基準頁裡的 10、14、18、34 一律取最近的級距。

**頁面結構**（由上而下）：頁面標題列 → 摘要卡列（選用）→ 主卡片（工具列＋表格）。各區塊之間的距離是 `{spacing.section-gap}` 20px。

**觸控尺寸**：所有可點擊目標至少 `{spacing.touch-target}` 44×44px，包括按鈕、輸入框、下拉選單、表格內的展開鈕與「換位置」等列內操作、側欄導覽項、對話框關閉鈕。視覺比 44px 小的元素（例如 34px 的展開圖示），可點擊範圍仍要擴到 44px（加 `ff-hit-44` class，例如 30px 的側欄收合鈕）。表格列高至少 `{spacing.row-min}` 52px。

**斷點與版型** `[ASSUMPTION]`：

| 裝置 | 寬度 | 側欄 | 頁面左右邊距 | 摘要卡 | 資料呈現 |
|---|---|---|---|---|---|
| 電腦 | ≥ 1280px | 完整，236px | 32px | 4 欄 | 表格 |
| 平板橫向（主要目標 1024×768） | 1024–1279px | 完整，236px | 24px | 4 欄 | 表格；次要欄位可隱藏 |
| 平板直向／小筆電 | 768–1023px | 收成 72px 圖示列 | 24px | 2 欄 | 表格；次要欄位隱藏 |
| 手機 | < 768px | 收進頂部列的抽屜 | 16px | 2 欄 | 卡片清單，見〈卡片〉 |

1024×768 是最主要的驗收尺寸：側欄 236px，內容區約 740px，要能放下 7 欄表格且不出現橫向捲動。進貨、領用、報廢、預警四頁另外要在 1366×768 檢查（AD-23）。768px 高度扣掉標題列和工具列之後，表格至少要露出 5 列。

## Elevation & Depth

陰影一律是**帶綠色調、向下偏移、負擴散**的柔光（`rgba(35,90,55,…)`），不用中性灰陰影。深度只分四層：

| 層級 | 陰影 | 用在 |
|---|---|---|
| 0 平面 | 無 | 表格列、工具列、輸入框 |
| 1 浮起 | `0 8px 24px -18px rgba(35,90,55,.45)` | 摘要卡、巢狀面板（`0 8px 22px -14px`） |
| 2 卡片 | `0 14px 40px -28px rgba(35,90,55,.45)` | 主卡片 |
| 3 覆蓋 | `0 24px 60px -24px rgba(20,60,40,.45)` | 對話框、抽屜、下拉選單 `[ASSUMPTION]` |

主要按鈕、導覽選中項、頁首圖示方塊有自己的**色光陰影**（`0 6px 14px -8px rgba(35,110,75,.7)`），用來把視線拉到唯一的主要動作上，其他元素不可借用。

摘要卡底色是 78% 不透明的白（`{colors.surface-raised}`）加 `backdrop-filter: blur(6px)`，讓底下的漸層隱約透出。主卡片則是實心白，確保表格可讀。

## Shapes

| Token | 值 | 用在 |
|---|---|---|
| `xs` | 6px | 代碼標籤 |
| `sm` | 8px | 表格內的小圖示方塊（28px）、列內小按鈕 |
| `md` | 10px | 輸入框、下拉選單、側欄導覽項、展開鈕 |
| `lg` | 12px | 按鈕、巢狀面板、頁首圖示方塊（42px） |
| `xl` | 16px | 主卡片、摘要卡、對話框 |
| `full` | 9999px | 狀態標籤、計數徽章、頭像 |

原則是**越外層越圓**：卡片 16 → 卡片裡的面板 12 → 面板裡的控制項 10 → 最小元件 6–8。只有狀態類元素用膠囊形，一看到圓膠囊就知道「這是狀態」。

## Components

### 圖示風格

- 線條圖示，`viewBox="0 0 24 24"`、`fill="none"`、`stroke="currentColor"`、`stroke-width="1.8"`、圓角端點與轉角，與 `frontend/src/shared/ui/icons.tsx` 一致。
- 尺寸只用三種：**16px**（按鈕內、列內操作）、**18px**（預設，側欄導覽與工具列）、**20px**（摘要卡、頁首方塊）。
- 純裝飾圖示要設 `aria-hidden`；沒有文字的圖示按鈕一定要有 `aria-label`。
- **圖示方塊**：圖示放在圓角淺底方塊裡，代表「這是一類東西」。保存方式用 `storage-*` 色，其他用 `primary-50` 底配 `primary-800` 圖示。尺寸分 28px（表格）、40px（摘要卡）、42px（頁首，漸層底配白圖示）。
- 新圖示沿用同一套線條規格，畫進 `icons.tsx`，不要另外引入外部圖示庫的實心或雙色風格。

### 頁面標題列

- **結構**：左側由上而下是麵包屑（`{typography.caption}`、`{colors.text-subtle}`，以「 / 」分隔）、h1（左側 42px 漸層圖示方塊，間距 12px，接著是 `{typography.display}` 標題）、說明（`{typography.body}`、`{colors.text-muted}`，與標題文字左緣對齊，也就是縮排 54px）。右側放**一個**主要按鈕，與標題區底部對齊。
- **用法**：每頁只能有一個，作為頁面的 h1，對應 `shared/ui/PageHeader`。說明控制在一句話內。手機版主要按鈕移到標題下方，改為全寬。

### 工具列（搜尋、篩選、主要按鈕）

- **位置**：主卡片的頂部，背景是白到 `{colors.surface-subtle}` 的直向淡漸層，下方以 `{colors.line-soft}` 分隔。
- **排列**：搜尋框（`flex: 1`，左側放 18px 搜尋圖示）→ 篩選下拉（固定寬約 150px，可放多個）→ 需要時最右側放卡片層級的主要按鈕。元件之間距離 `{spacing.3}`。
- **輸入框**：高 44px、`{rounded.md}`、`{colors.border-input}` 外框、白底。聚焦時外框改為 `{colors.focus-ring}`，外加 2px 光暈。
- **篩選**：下拉選單的預設值寫「全部類型」「全部狀態」這類完整文字，不要用空白。已套用篩選時下拉要有視覺差異（`primary-50` 底、`primary-strong` 字），旁邊顯示「清除篩選」。
- **主要按鈕**：頁面層級的主要動作放在標題列，工具列不再重複放一樣的按鈕。
- **平板／手機**：寬度不夠時，篩選收成一個「篩選」按鈕，點開後用抽屜顯示；搜尋框維持可見。

### 按鈕

| 變體 | 外觀 | 用途 |
|---|---|---|
| 主要 | `{colors.primary-900}`→`{colors.primary-700}` 漸層、白字、色光陰影 | 每個畫面最多一個：新增、送出、確認 |
| 次要 | 白底、`#D6E5D6` 框、`{colors.primary-strong}` 字 | 取消、匯出、列內操作（例如「換位置」） |
| 危險 | `{colors.danger}` 實心、白字 | 報廢、刪除、停用的最後確認 |
| 文字 | 無底、`{colors.primary-strong}` 字 | 清除篩選、次要連結 |

所有按鈕高 44px、`{rounded.lg}`、`{typography.body-strong}`，圖示與文字相距 8px。停用時用 `{colors.text-disabled}` 字配 `{colors.line-soft}` 底，不加陰影。載入中保留原寬度，文字換成轉圈圖示加「處理中…」。

### 資料表格

- **外框**：放在主卡片內，與工具列共用一張卡片。
- **表頭**：`{colors.surface-header}` 底、`{typography.table-head}`、`{colors.text-subtle}`，左右 padding 16px。
- **列**：最小高度 52px，列與列之間用 1px `{colors.line-soft}` 分隔，不用斑馬紋。主欄（名稱）用 `{typography.body-strong}`，代碼與批號用代碼標籤（`{colors.code-bg}`／`{colors.code-fg}`、`{rounded.xs}`）。
- **數字**：數量靠右對齊，數值用 `body-strong`，單位用 `caption` 加 `text-muted`（例如「**12.500** kg」）。日期置中，用 tabular-nums。數量直接顯示後端回傳的字串，前端不做運算。
- **展開列**：選中或展開的列底色為 `{colors.surface-selected}`，上方加 1px `{colors.line-selected}`，名稱改為 `{colors.primary-strong}`。展開鈕在列尾，選中時改為漸層底、白色箭頭，箭頭轉 180°。展開內容是巢狀面板：白底、`{rounded.lg}`、`{colors.line-nested}` 框、層級 1 陰影，面板標題列寫明排序方式，例如「依到期日排序，最早到期在前」。
- **停用列**：整列文字改為 `{colors.text-disabled}`，狀態欄顯示「停用」標籤。停用列不隱藏，排在啟用列後面。
- **空值**：顯示「—」並配 `{colors.text-disabled}`，不留空白。
- **手機**：不顯示表格，改用卡片清單。

### 卡片

- **主卡片**：白底、`{rounded.xl}`、半透明白框、層級 2 陰影、`overflow: hidden`，裡面通常是工具列加表格。
- **摘要卡**：用在頁首下方的統計列。左側放 40px 圖示方塊，右側由上而下是標籤（`caption`、`text-muted`）、數值（`{typography.stat}`）、補充說明（`caption`，例如「9 個批次 · 2 即期」）。數值是**目前篩選範圍的總數**。電腦與平板橫向排 4 欄，手機排 2 欄。
- **手機清單卡**：取代表格列。第一行左邊是名稱（`body-strong`），右邊是狀態標籤；第二行是代碼與次要欄位（`caption`）；列內操作放在底部，維持 44px 高。卡片 `{rounded.lg}`、層級 1 陰影，卡片之間相距 `{spacing.3}`。
- 卡片裡不再放卡片，需要分組時用巢狀面板。

### 表單與對話框

- **表單欄位**：label 放在欄位上方（`{typography.label}`、`{colors.text}`），必填欄位在 label 後加「（必填）」文字，不只靠星號。欄位與 label 相距 6px，欄位之間相距 `{spacing.4}`，說明文字放在欄位下方（`caption`、`text-muted`）。
- **欄位錯誤**：外框改為 `{colors.danger}`，下方顯示錯誤文字（`caption`、`{colors.danger}`，前面加警示圖示），錯誤文字取代說明文字。後端 422 回來的 `fields` 要對應到各欄位。
- **數字與日期欄位**：數量欄位右側固定顯示單位。日期用 `@mantine/dates`，觸控時點開的是月曆，不要求手動輸入格式。
- **對話框**：白底、`{rounded.xl}`、層級 3 陰影、`#1F2A2466` 遮罩、內距 24px。寬度分兩種：確認型 440px，表單型 560px；手機一律全寬，從底部滑出。標題用 `{typography.title}`，右上角放 44px 關閉鈕。底部操作列靠右，主要按鈕在最右側，取消在左側。
- **破壞性確認**（報廢、停用）：標題直接寫出後果，例如「報廢 鮮奶 FL-1105 共 3 L？」。確認鈕用危險變體，文字寫出動作本身（「確認報廢」），不要用「確定」。

### 狀態標籤

- 對應 `shared/ui/StatusBadge`：膠囊形、`{typography.badge}`、左右 padding 10px，文字前有 6px 圓點（顏色同文字色）。
- 視覺強度依〈Colors › 狀態色〉：過期、今日到期、低庫存用實心底；即期只有圓點加文字；正常是灰字、沒有圓點。
- 可以附上天數，例如「已過期 1 天」「今天到期」「還有 2 天」。天數由後端回傳，標籤文字的**開頭一定是狀態詞**，方便掃讀。
- 一個項目同時有效期與低庫存狀態時並排顯示，效期在前，最多兩個標籤。
- **啟用／停用**標籤是另一種元件，不是 StatusBadge：「啟用」用 `{colors.success}` 字配 `{colors.success-bg}` 底，「停用」用 `{colors.text-muted}` 字配 `{colors.inactive-bg}` 底，都是膠囊加圓點，字重 600。

### 空狀態 `[ASSUMPTION]`

基準頁沒有這個畫面，以下依基準頁的語彙推導：

- 放在卡片內容區正中央，上下各留 48px：一個 48px 的圖示方塊（`primary-50` 底、`primary-800` 圖示），下面是標題（`{typography.title}`）、一句說明（`body`、`text-muted`），最後是一個次要按鈕，例如「新增第一個儲存位置」。
- 要分兩種情境：**真的沒有資料**時引導新增；**篩選後沒有結果**時寫「沒有符合條件的位置」，按鈕是「清除篩選」。
- 預警首頁「沒有任何預警」是好消息：用 `{colors.success}` 圖示，標題寫「目前沒有需要處理的食材」。

### 錯誤與載入狀態 `[ASSUMPTION]`

- **載入**：表格與卡片第一次載入時用骨架（Mantine `Skeleton`，`{colors.line-soft}` 底），骨架列數和列高跟實際列相同，避免載入完版面跳動。重新整理資料時保留舊內容，只在卡片右上角顯示小轉圈。全頁轉圈只用在登入後第一次載入。
- **區塊錯誤**（查詢失敗）：在卡片內容區顯示 `{colors.danger-bg}` 底的橫幅，內容是警示圖示、一句原因（「無法載入儲存位置」）和「重試」次要按鈕。不可把整頁換成錯誤頁。
- **操作錯誤**（送出失敗）：在對話框或表單頂部顯示同款橫幅，已輸入的內容要保留。`409 INSUFFICIENT_STOCK` 這類業務錯誤直接寫出可以採取的行動，例如「剩餘量只有 2.000 L，請調整數量」。
- **成功通知**：用 Mantine `Notification`，放在右上角（手機在頂部），左側加 `{colors.success}` 色條，4 秒後消失；內容要包含被操作的對象名稱。
- **離線或連線中斷**：頁面頂部常駐一條 `{colors.info-bg}` 橫條，寫「連線中斷，資料可能不是最新」。

### 側欄導覽

- 背景是 `{colors.sidebar-top}` → `{colors.sidebar-bottom}` 的直向漸層，右緣有 1px 內陰影。品牌區由 34px 漸層 logo 方塊、「食序 FoodFlow」（17 / 900）和「餐廳食材管理」小字組成，下方用細線分隔。
- 導覽項高 44px、`{rounded.md}`、18px 圖示，文字 14px、`{colors.sidebar-fg}`。選中項用漸層底、白字、色光陰影。子項縮排 40px，左側有一條 1px 的引導線。計數徽章用 `{colors.accent}` 底配 `{colors.on-accent}` 字。
- 分組標題用 `caption`、`{colors.sidebar-muted}`、字距 0.12em。
- 底部是目前使用者卡：頭像、姓名、角色，以及登出入口。

## Do's and Don'ts

| Do | Don't |
|---|---|
| 狀態一律文字加顏色，透過 `StatusBadge` 顯示 | 只用顏色、圖示或底色表達狀態 |
| 只有過期、今日到期、低庫存用實心狀態標籤 | 每一列都塗上顏色，讓整張表變成紅綠燈 |
| 所有可點擊目標至少 44×44px，包括列內操作 | 把操作藏在 hover 或 Tooltip 裡（平板沒有 hover） |
| 每個畫面只有一個主要（漸層）按鈕 | 在工具列、列內、標題列重複放主要按鈕 |
| 漸層淺端最淺到 `{colors.primary-700}` | 白字壓在 `#4B9E74` 或更淺的綠上 |
| 顏色從 token 或 Mantine 的 `forest.N` 取用 | 在元件裡直接寫 hex 值 |
| 代碼、批號用 JetBrains Mono 代碼標籤 | 用等寬字體顯示一般文字或數量 |
| 數字用 tabular-nums，數量靠右，單位降為次要字色 | 前端自己計算剩餘天數、差額或狀態 |
| 陰影用帶綠色調的負擴散柔光 | 用中性灰的硬陰影或多層疊加陰影 |
| 在 1024×768 驗收，不出現橫向捲動 | 只在大螢幕上檢查版面 |
| 苔黃綠只用於漸層尾端、徽章與背景光暈 | 把苔黃綠當文字色或狀態色 |
| 停用的項目改為淡色並排在後面 | 直接隱藏停用的項目，讓使用者找不到 |

> 本檔與 `storage-demo.html` 衝突時，**以本檔為準**。基準頁是視覺來源，本檔已修正其中對比不足與字級零碎的部分。
