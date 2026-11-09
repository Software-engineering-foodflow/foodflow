# Epic 3 Context: 進貨與確認入庫

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

讓餐廳員工先保存收貨草稿，再將完整明細一次確認為可追溯的庫存批次與進貨異動。整個 Epic 也涵蓋歷史查詢與管理者更正錯誤入庫，目的是保持來源、效期、單價與庫存數量一致。本次核准開發限 Story 3.1、3.2；查詢及沖銷留待後續。

## Stories

- Story 3.1: 建立與編輯進貨草稿
- Story 3.2: 確認入庫
- Story 3.3: 查詢進貨單
- Story 3.4: 沖銷錯誤進貨

## Requirements & Constraints

- 管理者與一般員工均可建立、編輯及確認進貨；沖銷僅限管理者，所有營運資料需要登入。
- 草稿完全不增加庫存。每張單至少一筆食材明細；相同食材的不同效期或位置分開記錄。供應商、食材及已選位置必須有效。
- 草稿允許暫缺數量、到期日、位置；確認時三者必填。數量已填時須大於零，最多三位小數；單價選填、非負、最多兩位小數。不自動推算到期日，不做庫存單位換算。
- 進貨日不能晚於台北今天；確認時到期日不能早於進貨日或確認當天。草稿保存後主檔可能停用，確認必須重新驗證。
- 整張單全部成功或全部回滾。重送或兩人同時確認，只能為每筆明細建立一個批次及一筆進貨異動。單價隨明細保存至批次，供報廢成本計算。
- 已確認資料不能覆寫或刪除。後續沖銷保留原始資料與異動；任一批次已有領用、報廢或盤點異動即禁止整單沖銷，僅換位置不阻擋。
- 到期日必填、固定單位等仍沿用需求中標示的假設，不把假設改稱正式定案。

## Technical Decisions

- 維持 API → Service → Repository 介面的分層與建構子注入；具體實作只在組裝點建立。模型同時作為實體，不增加映射層。Service 不含 HTTP、SQL、Session 或 API schema。
- goods_receipt 模組只寫進貨單與明細；其他主檔只讀取，不呼叫其他模組的 Service 或 Repository。所有批次與庫存異動寫入交由 StockLedger。
- 每個寫入 Service 以同一 UnitOfWork 包住完整操作；Repository 與 Ledger 只能 flush。草稿更新、刪除、確認均先鎖單頭；鎖後重新讀取狀態。跨表固定先單頭再批次，使用共用列鎖 helper。
- 確認防重送使用 DRAFT → CONFIRMED 狀態機，已確認重送回 200 與目前狀態；來源明細唯一鍵作最後防線。單次確認共用新的 operation_group_id、操作者及一次取得的時間。
- 日期及時間只從注入 Clock 取得；台北日期用於日界規則。數量與金額以 Decimal 處理，API 使用十進位字串，拒絕浮點數字、科學記號及超出精度的輸入。
- 資源路徑使用 /api/v1 與複數 kebab-case，JSON 使用 snake_case。錯誤沿用 DomainError 與欄位點號路徑；狀態衝突 409、驗證失敗 422。單號由 id 產生 GR- 加八位數字，批號為 B- 加來源明細 id。
- 關聯由 Repository 明確載入，不能觸發隱性 lazy load。Schema 只能由 Alembic 改變，新增 Migration 需另外取得使用者確認。
- 單元測試使用 fake Repository、FakeStockLedger、FixedClock；列鎖、併發及防重送必須使用真實 PostgreSQL 測試資料庫。

## UX & Interaction Patterns

沿用既有 Mantine 介面、登入與導覽，不新增 UI 套件。前端頁面經 feature hooks、api 再使用共用 client，伺服器資料交由 TanStack Query。失敗保留表單輸入並定位明細欄位；只有伺服器成功才顯示完成。確認入庫成功後失效庫存、預警及相關功能快取。操作目標至少 44px，於 1024×768、1366×768 驗證；多筆明細不能依賴 hover 或水平捲動。新增頁需支援 ingredient_id 帶入第一筆食材。

## Cross-Story Dependencies

Story 3.1 依賴食材、供應商及位置的有效主檔與選用契約，不能以假資料取代正式資料庫，也不接手其他組員的 CRUD。Story 3.2 依賴草稿、共用交易與 StockLedger；3.3 再提供完整跨單查詢，3.4 才加入沖銷。FR-06 已包含確認入庫；FR-07 是查詢與沖銷。後續庫存查詢、領用、預警及報廢依賴本 Epic 產生的批次與來源關聯。
