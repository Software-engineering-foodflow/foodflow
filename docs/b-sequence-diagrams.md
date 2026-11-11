# FoodFlow 兩個 Use Case 的實作循序圖

依 docs/team-tasks.md 指定的「確認入庫」與「FEFO 領用」編製，對應既有使用案例 UC-06、UC-11。程式檢視基準：`ebb0c32dc5b5fc91f5a546bd797793959bb90941`；日期：2026-11-11。

| Use Case | 功能 | 預覽與原始檔 |
| --- | --- | --- |
| UC-06 | 確認入庫（FR-06、FR-07） | [PNG](diagrams/b-sequence-receipt-confirmation.png)／[SVG](diagrams/b-sequence-receipt-confirmation.svg)／[PlantUML](diagrams/b-sequence-receipt-confirmation.puml) |
| UC-11 | FEFO 建議及確認領用（FR-10、FR-11） | [PNG](diagrams/b-sequence-fefo-issue.png)／[SVG](diagrams/b-sequence-fefo-issue.svg)／[PlantUML](diagrams/b-sequence-fefo-issue.puml) |

## UC-06：確認入庫

以前端已有草稿為起點，繪出確認入庫的完整服務處理；建立及一般編輯草稿不另拆圖。按確認時若表單有變更，前端先以 PATCH 儲存（獨立交易），成功才送確認；未變更則跳過儲存。確認在同一業務交易內鎖定單頭、檢查狀態與明細、逐筆建立批次及進貨異動，再更新單據狀態。

- 單據已確認時直接查回目前狀態，不再次入庫，不使用 Idempotency-Key。
- 確認必填數量、到期日及位置；到期日不得早於進貨日或今天；仍須檢查啟用關聯資料、數值精度與單據日期。
- receive() 會先查進貨日期，建立暫為零餘量的批次並 flush，再透過進貨異動入帳；不是直接將全數庫存寫入後不留異動。
- GoodsReceiptService 在交易區塊內求得 get() 的回傳資料；離開 UnitOfWork 成功 commit 後，才實際回到 Controller。
- 404 為單據不存在；409 包含狀態／唯一限制衝突；422 為輸入或規則錯誤；未預期錯誤回 500。驗證或寫入失敗時全部 rollback。

## UC-11：FEFO 領用

分成「建議」與「確認」兩個階段，放在同一張循序圖。建議只讀、不鎖批次、不扣庫存；需求量不足即拒絕。FEFO 依到期日、進貨日、批號及批次 id 排序。員工改選可用批次時，重新送 suggestions 的 lines 取得非 FEFO 標記。

確認先依 id 遞增鎖定該食材所有正餘量批次，再檢查 Idempotency-Key。新操作在鎖內依序檢查單位與批次，先以 ManualStrategy 驗證實際配量，再用 FefoStrategy 重算同總量基準，偏離建議且缺原因時拒絕。每批扣量及異動寫入置於同一交易，不會部分成功。

- 同 key 同批次配量，依既有異動重建原結果，不讀目前餘量當作原結果，不再次扣量。check_replay 只比較批次及數量，不比較 reason、operator_id 或 ingredient_id。
- 同 key 不同配量回 409 DUPLICATE。首次與成功重放都回 HTTP 200。
- 錯誤分類：不存在／跨食材批次 404；過期 422；超量 409；非 FEFO 缺原因 422。其他 Schema／單位驗證依既有 422 處理。
- 今日到期仍可用，過期不可領用。候選批次不是只鎖畫面中被選取的批次。
- 前端同內容重試保留 key；內容改變或成功後換 key；成功才失效庫存、領用與預警相關快取。

## 畫法與範圍

1. 前端生命線合併 page、hook 與 api；Controller 生命線包含統一錯誤 handler，細節見原始檔。
2. Repository 生命線表示注入的 SQLAlchemy 實作；StockLedger 是共用庫存寫入介面與實作，不能誤畫成 Controller 直接寫入資料庫。
3. 策略生命線合併兩個獨立的策略實例，訊息以 FefoStrategy／ManualStrategy 方法名稱區分，沒有新增 Strategy 實體或服務。
4. Clock 與純 helper 的細部互動以訊息文字或註解摘要，未另加生命線；圖不是逐行執行記錄。
5. 各 alt 分支表示成功、重放與失敗情境；失敗在實際拋出例外處立即中止，不先完成成功分支再 rollback。
6. UnitOfWork.transaction() 不自行呼叫 begin()；圖以交易區塊進出及實際 Session.commit()／rollback() 說明交易邊界。
7. 本次僅新增兩張循序圖與說明，不修改 B／D Word、既有圖表、Schema 或程式，不 commit 或 push。

## 程式對照

| 流程 | 來源 |
| --- | --- |
| 前端儲存／確認入庫 | [GoodsReceiptsPage](../frontend/src/features/goods_receipt/pages/GoodsReceiptsPage.tsx)、[hooks](../frontend/src/features/goods_receipt/hooks.ts)、[api](../frontend/src/features/goods_receipt/api.ts) |
| 進貨 API 與確認規則 | [router](../backend/app/modules/goods_receipt/router.py)、[Service](../backend/app/modules/goods_receipt/service.py)、[SQLAlchemy Repository](../backend/app/modules/goods_receipt/repository_sqlalchemy.py) |
| 領用前端與 key 生命週期 | [IssuesPage](../frontend/src/features/issue/pages/IssuesPage.tsx)、[hooks](../frontend/src/features/issue/hooks.ts)、[useIdempotencyKey](../frontend/src/shared/hooks/useIdempotencyKey.ts) |
| 領用 API 與規則 | [router](../backend/app/modules/issue/router.py)、[Service](../backend/app/modules/issue/service.py)、[Repository](../backend/app/modules/issue/repository_sqlalchemy.py)、[schemas](../backend/app/modules/issue/schemas.py) |
| 批次策略 | [FEFO](../backend/app/modules/issue/strategies/fefo_strategy.py)、[Manual](../backend/app/modules/issue/strategies/manual_strategy.py)、[組裝點](../backend/app/modules/issue/dependencies.py) |
| 共用庫存及交易 | [StockLedger](../backend/app/modules/inventory/ledger_sqlalchemy.py)、[UnitOfWork](../backend/app/core/uow.py)、[for_update](../backend/app/core/db.py) |
| 驗證、防重送與錯誤 | [身分驗證](../backend/app/modules/auth/dependencies.py)、[check_replay](../backend/app/core/idempotency.py)、[錯誤型別](../backend/app/core/errors.py) |

程式與測試交叉核對以現有 integration/test_goods_receipts.py、integration/test_issues.py 為輔；本次未執行資料庫或程式測試，不宣稱重新通過整合測試。
