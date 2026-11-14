---
title: '食材異動總覽與下鑽明細'
type: 'refactor'
created: '2026-11-14'
status: 'done'
route: 'dispatch'
baseline_commit: '1358fd8fd02c4d14a395e08eef9c837403fc5091'
review_loop_iteration: 0
context: ['{project-root}/AGENTS.md', '{project-root}/docs/design/DESIGN.md']
---

<frozen-after-approval>
## Intent
將數量異動由扁平流水帳改為食材期間總覽與右側 Drawer；食材及數量優先，其他追溯資訊在後，膠囊底色、圓點與文字共同表意。保留前一輪成果，使用者已明確要求繼續實作本次詳細需求。

## Boundaries & Constraints
沿用後端 API、schema、Mantine 與既有 DataTable/PageHeader。不得改帳本或新增資料表，不 commit/push。報表完全唯讀；不將不同單位相加。主表無庫存連結，抽屜只有一個食材庫存入口；不顯示操作群組 UUID。盤點選取後輸入移到該批次下方，保留預覽、冪等、原子確認與權限控制。

## I/O & Edge-Case Matrix
| 情境 | 行為 |
| --- | --- |
| 區間超過一頁 | 全部分頁載入成功才顯示彙總，取消及錯誤不可顯示局部總數 |
| 不同單位 | KPI逐單位列示，不混算公斤與包 |
| 期初／期末 | 採既有 stock API，不以第一筆／最後一筆批次量冒充食材總量 |
| 報廢、盤虧或非FEFO | 食材優先置頂，可快速只看關注食材 |
| 搜尋 | 名稱、食材ID及批號匹配食材，總覽仍統計整個食材區間 |
| Drawer | 固定情境標題、公式、四類Tabs、筆數、新到舊明細；ESC關閉保留主畫面 |
| 追溯URL | transaction_id可直接查看該筆；批次篩選仍可追溯，不重複庫存連結 |
| 盤點加入 | 所選批次下立即出現輸入；翻頁搜尋不丟已選內容 |
</frozen-after-approval>

## Code Map
- `frontend/src/features/reports/api.ts`：現有 transactions 分頁最多100，stock提供全食材期間淨值。
- `reports/hooks.ts`、`reports/pages/ReportsPage.tsx`：改查詢與主次畫面，保留位置異動及管理員報廢統計。
- `reports/components/TransactionTable.tsx`：明細重排、膠囊、tooltip、移除UUID與重複連結。
- `frontend/src/features/stocktake/pages/StocktakesPage.tsx`：選取區下展開輸入，hooks維持既有交易語意。

## Tasks & Acceptance
- [x] reports資料聚合：全分頁、防不完整結果、精確三位小數、各單位KPI、關注排序與搜尋。
- [x] reports總覽與Drawer：日期預設台北本月，日期驗證、摘要、Tabs、唯一庫存入口、原始追溯。
- [x] stocktake選取項下方輸入與回歸測試。
- [x] feature測試、lint/build、1024/1366瀏覽器檢視、獨立審查。

Given完整區間，when選取食材，then只顯示該食材明細且公式與後端統計相同。
Given抽屜開啟，when ESC關閉，then主畫面搜尋、日期、捲動及焦點保留。
Given1024與1366寬，when檢視主表及抽屜，then無頁面橫向溢出，主要目標至少44px。

## Design Notes
區間進貨筆數／總量採實際RECEIPT事件；損耗採WASTE與負ADJUSTMENT事件，標明未扣沖銷的事件口徑。期初期末公式採後端淨進貨、淨領用、淨報廢及淨調整，包含沖銷，避免公式失衡。載入中不顯示舊區間數字；分頁總筆數變化或重複ID提示重試。

## Implementation Notes
管理員歷史編輯／註解與沿用API的限制尚待選擇，另列待確認需求；本規格先完成明確授權的報表及盤點布局。前一輪三個共用測試變更仍待批准，不混入本次改動。

### 交付驗證（2026-11-14）
- 最終 `npm.cmd test -- --run src/features/reports src/features/stocktake src/features/waste`：5檔 **50 passed**。
- `npm.cmd run lint`、`npm.cmd run build`（含TypeScript）通過；仍有原有單一bundle大於500kB提醒。`git diff --check`通過。
- 三層獨立審查完成，保留的問題全部修正；edge與verification原審查者複核已解。blind修後複核因代理使用額度失敗，由主代理讀碼及回歸測試核對其保留的7項，未宣稱blind另一次複核成功。
- 實際瀏覽器搭配mock API：1024×768與1366×768通過總覽/Drawer、四Tabs、唯一庫存入口、ESC捲動保留、盤點項下輸入、無橫向溢出與JS錯誤。截圖已逐張檢視；詳見 [驗證紀錄](../verification/reports-master-detail/README.md)。
- 真實服務唯讀HTTP檢查通過，來源庫前後一致；此輪沒有資料庫／API修改、沒有commit/push。
- 初始分支既有dirty內容保留。本規格done僅指明確授權的報表重構與盤點布局；管理員歷史紀錄編輯／註解仍需釐清與既有API限制的衝突，不列已交付。

使用者原始詳細視覺驗收（補足規格摘要，非新增需求）：
- 必須是3張KPI卡：期間總進貨筆數/總量、期間報廢與損耗總量（過期、破損等非正常消耗）、異常關注食材數。
- 主表欄位為大字粗體食材(含ID及單位)、大字數量膠囊(進貨、消耗/報廢)、期初→期末、狀態膠囊、`查看明細（共X筆）›`。整列可點並hover高亮；說明「點擊任一食材可展開該期間的詳細批次與異動流水帳」。
- Pill必須淺底+9999圓角+左圓點+同色深色粗體，數量也包在膠囊裡；進貨/正常綠、盤盈/非FEFO橙、報廢/盤虧紅。不可只給文字數量著色或用類型標籤取代數量膠囊。
- Drawer四Tabs固定為`全部異動`、`報廢 / 盤虧`、`進貨入庫`、`非 FEFO 紀錄`並各顯示筆數。
- Drawer標題含大字名稱ID、日期及唯一庫存按鈕；庫存必須連實際食材批次路由 `/inventory/{id}/batches`，現有 InventoryPage 不讀 ingredient_id query。
- Drawer明細順序：食材/類型+增減量膠囊與前後量、批次與來源追溯、原因/FEFO、時間/操作者。正數帶+，否的FEFO小字，負盤點紅。大字16–18px。
- 所有統計算式及盤點差額需Tooltip（含鍵盤focus），顯示白話計算；Drawer公式包含所有淨值及單位。
- `transaction_id`深連結必須在Drawer顯示，不另在主表之上重建單筆扁平表。

## Verification
Vitest涵蓋跨頁、單位、損耗、搜尋、Tabs、抽屜關閉及盤點輸入位置；npm lint/build；真瀏覽器兩尺寸。

## Review Triage Log

| 發現 | 判定與處理 | 證據 |
| --- | --- | --- |
| Blind1 清除空日期讓位置API422 | medium / patch | locationParams直接複製含空日期的URL，後端date欄位拒絕空字串。 |
| Blind2 歷史追溯丟日期 | medium / patch | Link重建只有batch/transaction參數，新的預設本月會誤導舊紀錄情境。 |
| Blind3 深連結刷新仍顯示cached數值 | medium / patch | detail的row不受ready限制，balance直接讀cache；要求分離單筆與當期統計載入狀態。 |
| Blind4 獨立API快照不同 | medium / patch | transactions與stock查詢分開，期間新增異動可使兩者不一致；用sum(delta)=closing-opening核對，失配提示重試。 |
| Blind5 大區間全載入成本 | low / reject額外複雜化 | 使用者明確要求既有API前端聚合，現有API僅100筆分頁，載入有狀態與取消；未證明目前規模失效。不增伺服器彙總API或虛擬化依賴。 |
| Blind6 聚合throw使畫面中斷 | medium / patch | 跨頁期間食材單位可能改變，summarize會throw；需轉為可重試錯誤。 |
| Blind7 原因欄位錯誤未顯示 | medium / patch | reason_kind會被reason前綴排除且Select無field error；補精準欄位映射。 |
| Blind8 Tooltip禁touch | low / reject | 本次明確要求Hover，已有鍵盤focus與可見口徑文字；觸控展開另需互動狀態，非直接缺陷修正。 |
| Blind9 清除未清dateError | low / patch | clear handler未setDateError，錯誤訊息殘留；直接清空及回歸。 |
| Edge1 空日期 | medium / patch | 與Blind1同根因，保留獨立紀錄。 |
| Edge2 聚合例外 | medium / patch | 與Blind6同根因，保留獨立紀錄。 |
| Edge3 深連結cache | medium / patch | 與Blind3同根因，保留獨立紀錄。 |
| Verification1 本地篩選無結果斷言 | medium / patch | 原測試只有請求無filter及空fixture，不能抓出刪除predicate；補 populated fixture經表單驗證。 |
| Verification2 原因control到preview缺測 | medium / patch | 既有fixture固定回DAILY，未驗證PERIODIC/OTHER；補request-sensitive fixture。 |
| 實際視覺截字 | medium / patch，已修 | 1024截圖發現Badge label ellipsis，改允許完整顯示、雙異常標籤及欄寬。 |
| 主表未區分領用、報廢、盤虧 | medium / patch | 使用者明確要總消耗／報廢，目前只有合計損耗，補分類數量而KPI仍採損耗總和。 |

修後結論：上表所有patch項目已完成並通過相關測試；僅Blind5、8保留原reject判定。新增一致性驗證、local filters結果、歷史連結、日期清除、單筆刷新、盤點欄位／序列化回歸，沒有以改規格代替修程式。
