---
title: 'FoodFlow 管理者盤點與嚴格舊預覽驗證'
type: 'feature'
created: '2026-11-07'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '5a673669e2e407e526efb1ed55ce22980847ae9e'
context:
  - '{project-root}/_bmad-output/specs/spec-westgvva-inventory-management/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-westgvva-inventory-management/acceptance.md'
  - '{project-root}/docs/srs.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-foodflow-2026-11-05/ARCHITECTURE-SPINE.md'
---
<frozen-after-approval reason="原始使用者已授權FR-16，最新指示自主續作；嚴格驗證來自原始需求">
## Intent
管理者輸入多批次實際盤點量與原因，先看帳面量及差額，再確認原子調整。預覽後任何數量異動即拒絕舊確認，包括改回同量。保留已完成報廢/報表工作，不做無關重構。
## Boundaries & Constraints
沿用既有schema、StockLedger、UoW、Clock、auth、Decimal及前端元件，不修改共用帳本契約。來源REVERSED不可調整。只管理者可列盤點批次、預覽、確認；伺服器檢查。新API仍用/api/v1與既有錯誤格式。
禁止commit/push/部署、環境變更、依賴升級、G紀錄彙整。沒有真DB不可宣稱併發/回滾通過。
## I/O & Edge-Case Matrix
| Given | When | Then |
| --- | --- | --- |
| 管理者；兩批帳面8和2 | 預覽實際7與3，原因必填 | 顯示帳面/實際/差額，預覽不寫入；確認兩筆ADJUSTMENT同群組一次時間 |
| 員工或未登入 | 列批次、預覽、確認 | 403或401，沒有資料修改 |
| 0、負數、四位小數、重複批次、空原因 | 輸入 | 0合法；其他拒絕422，原因trim後不可空 |
| 已預覽，另一操作改量 | 確認 | 409 STALE_QUANTITY及最新量，整批不寫入，要求重新預覽 |
| 預覽後扣量再補回原量 | 確認 | 最新異動編號不同，同樣409 |
| 第一筆有效，第二筆過時或REVERSED | 確認 | 全部回滾，沒有部分成功 |
| 實際等於帳面 | 確認 | 無ADJUSTMENT；正常回應，不製造零量異動 |
| 第一次已成功但回應遺失 | 重送相同預覽 | 不再調整；可回409要求重新核對，不冒稱新增成功 |
| 預覽後編輯實際量、原因或批次 | 前端確認 | 清除舊預覽，必須再預覽 |
| 409或網路錯誤 | 前端 | 保留輸入，顯示錯誤，409清除預覽要求重新核對；pending禁止連按 |
</frozen-after-approval>
## Code Map
- backend/app/modules/inventory/{ledger,ledger_sqlalchemy}.py：lock_batches依ID排序；adjust無差額回None，唯一寫庫存入口。
- backend/app/db/models/{inventory,goods_receipt,master_data}.py：批次與異動；交易max(id)代表每批數量版本，來源狀態需在鎖內重新查詢。
- backend/app/core/{uow,clock,errors,types,dependencies}.py與auth/dependencies.py：使用既有交易與登入。
- backend/app/modules/waste及reports：可參考分層，不跨模組呼叫Repository/Service。
- frontend/src/features/stocktake/pages/StocktakePage.tsx既有佔位；router已接路由；共用client.request不會自動加API_PREFIX，api.ts須自行加。
## Tasks & Acceptance
- [x] stocktake模組六層與main掛路由：GET /stocktakes/batches（搜尋/分頁，包括零量且排除已沖銷）、POST /stocktakes/preview、POST /stocktakes。模組自有讀取，不接管FR08。
- [x] 預覽在同一UoW取得批次鎖後讀取數量及max(transaction.id)，回expected_quantity、expected_transaction_id及差額；來源狀態重讀，確保快照一致。確認同樣鎖全部批次→驗所有數量/版本/來源→全數adjust；不要先寫第一筆再驗第二筆。沒有異動用null版本。
- [x] 新schemas使用Decimal字串且拒絕非法精度與負值，差額允許負值；批次ID正整數，原因長度符合DB。回應由既存異動quantity_after或no-op快照建構。
- [x] 前端api→hooks→Page，管理者守衛、批次選擇及多筆表單、原因、預覽表、確認/錯誤/成功、失效七組庫存查詢。前端不以浮點計算金額/差額，使用伺服器資料。
- [x] 單元API/Service與前端行為測試；整合測試含同量改回、鎖/競態、回滾與重送。真DB未設定時只報阻擋。
- [x] 更新API conventions與生成schema.d.ts、必要router測試；只story6.3與epic6更新in-progress，不標done。
## Verification
backend uv run pytest tests/unit，uv run ruff check .，uv run lint-imports；frontend npm.cmd run gen:api、npm.cmd run lint、npm.cmd test、npm.cmd run build。整合測試嘗試一次，缺TEST_DATABASE_URL如實記錄；不得安裝DB或修改環境。
## Design Notes
與AD-8差異為原始使用者嚴格要求；不改既有資料庫schema與帳本。無差額可重送，因完全無寫入；有差額成功重送由版本/數量衝突拒絕，可接受409，無需新持久化冪等表。位置變更不屬數量版本。
## Implementation Notes
## Spec Change Log
## Review Triage Log

## 2026-11-08 實作證據
程式與測試已交付；勾選不代表真DB驗收通過。單元181、前端120通過；Ruff/分層/lint/型別/build通過。整合7案收集後因TEST_DATABASE_URL缺少而setup失敗，人工尺寸待驗。主流程接手完成驗證；保留全部既有成果。

最終全專案驗證以主實作規格的Review Triage Log及docs/westgvva-verification.md第10節為準：backend189、frontend125通過，真DB/人工驗收未完成，保留in-review。
