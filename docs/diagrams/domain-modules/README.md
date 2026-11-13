# FoodFlow 八大功能模組局部領域類別圖

日期：2026-11-13。以目前正式整合類別圖 [PNG](../b-class-diagram.png)／[SVG](../b-class-diagram.svg)／[PlantUML](../b-class-diagram.puml)／[draw.io](../b-class-diagram.drawio) 為唯一類別與連線來源，依 B／D 文件的八大功能模組拆成 8 張局部視圖。完整正式圖保留不動。

## 八張圖表

| 圖 | 功能模組 | 對應需求 | 預覽 | 可編輯來源 |
| --- | --- | --- | --- | --- |
| 1 | 帳號與權限管理 | FR-01、FR-02 | [PNG](b-class-01-auth.png)／[SVG](b-class-01-auth.svg) | [PlantUML](b-class-01-auth.puml)／[draw.io](b-class-01-auth.drawio) |
| 2 | 基本資料與儲存位置管理 | FR-03～FR-05 | [PNG](b-class-02-master-storage.png)／[SVG](b-class-02-master-storage.svg) | [PlantUML](b-class-02-master-storage.puml)／[draw.io](b-class-02-master-storage.drawio) |
| 3 | 進貨與批次入庫管理 | FR-06、FR-07 | [PNG](b-class-03-receiving.png)／[SVG](b-class-03-receiving.svg) | [PlantUML](b-class-03-receiving.puml)／[draw.io](b-class-03-receiving.drawio) |
| 4 | 批次庫存查詢 | FR-08、FR-09 | [PNG](b-class-04-inventory-query.png)／[SVG](b-class-04-inventory-query.svg) | [PlantUML](b-class-04-inventory-query.puml)／[draw.io](b-class-04-inventory-query.drawio) |
| 5 | 食材領用與消耗登記 | FR-10、FR-11 | [PNG](b-class-05-issue.png)／[SVG](b-class-05-issue.svg) | [PlantUML](b-class-05-issue.puml)／[draw.io](b-class-05-issue.drawio) |
| 6 | 效期與低庫存預警 | FR-12～FR-14 | [PNG](b-class-06-alerts.png)／[SVG](b-class-06-alerts.svg) | [PlantUML](b-class-06-alerts.puml)／[draw.io](b-class-06-alerts.drawio) |
| 7 | 報廢與盤點管理 | FR-15、FR-16 | [PNG](b-class-07-waste-stocktake.png)／[SVG](b-class-07-waste-stocktake.svg) | [PlantUML](b-class-07-waste-stocktake.puml)／[draw.io](b-class-07-waste-stocktake.drawio) |
| 8 | 異動紀錄與統計 | FR-17、FR-18 | [PNG](b-class-08-history-reports.png)／[SVG](b-class-08-history-reports.svg) | [PlantUML](b-class-08-history-reports.puml)／[draw.io](b-class-08-history-reports.drawio) |

## 拆分規則

- 每個選入類別都保留總圖中的完整名稱、型別、可空性、屬性、方法、公開／內部標記與三區塊呈現，不把 Service 或 Repository 方法移入 Entity。
- 兩端類別都選入同一張局部圖時，完整保留原圖在它們之間的所有關聯與使用依賴，包括多重關聯、自我關聯、名稱、箭頭方向及兩端 Multiplicity。
- 跨至本視圖未選入類別的線，在完整圖或其他視圖查閱；共享類別可出現在多張圖，並非新增或複製資料表。
- 實線表示領域關聯，虛線開放箭頭表示程式使用依賴；交叉不表示分支或關聯。為讓連線與標籤清楚，重新安排各圖節點位置與折線。
- 所有 Service／StockLedger 僅沿用目前總圖已列的方法；每次選入該類別，仍保留其全部主圖成員，即使這個模組只使用其中部分方法。未補畫總圖沒有的 AlertService、WasteService、StocktakeService、ReportsService 或其他類別。
- 因此這些圖是目前總圖的功能視圖，並非各模組全部實作類別清單；例如 StockLedger.adjust() 及其他未列於總圖的方法不會在局部圖憑空新增。
- GoodsReceipt.receipt_number 的方法區標記對應 @property getter 的程式定義；實際以 receipt.receipt_number 讀取，不呼叫 receipt.receipt_number()。
- — 表示原總圖沒有列出該區成員，不代表新增方法；Python 的底線欄位採內部使用慣例表示，不代表語言強制私有。

## 核對結果

8 張圖合計涵蓋目前總圖全部 **17 個類別（12 個 Entity、4 個 Service、1 個 StockLedger 抽象契約）**、**20 條領域關聯**與 **11 條使用依賴**。12 個 Entity 的 94 個屬性成員（93 個持久化欄位與 receipt_number 衍生屬性）及總圖列出的 13 個核心公開服務／契約方法、1 個 property getter 定義，均在相關視圖中保留。

| 模組 | 本圖類別數 | 領域關聯數 | 使用依賴數 |
| --- | --- | --- | --- |
| 帳號與權限管理 | 2 | 0 | 1 |
| 基本資料與儲存位置管理 | 8 | 7 | 2 |
| 進貨與批次入庫管理 | 10 | 11 | 6 |
| 批次庫存查詢 | 8 | 12 | 1 |
| 食材領用與消耗登記 | 7 | 5 | 4 |
| 效期與低庫存預警 | 5 | 3 | 0 |
| 報廢與盤點管理 | 6 | 7 | 2 |
| 異動紀錄與統計 | 8 | 12 | 1 |

各圖有重複共用物件及關聯，上表不能直接相加作為系統總數。類別區塊逐字擷取自正式 PlantUML；PNG／SVG 類別卡片取自正式 SVG，只平移位置，保留既有文字、換行、字體、配色及屬性／方法分隔線。

已完成：8 份 PlantUML 語法檢查、8 份 SVG 與 8 份 draw.io XML 檢查、8 張高解析 PNG 渲染；逐圖比對類別成員、關聯及 Cardinality；確認類別框、標籤沒有互相重疊，連線沒有穿過類別內容，文字未超出類別框或標籤底框。圖中仍可能有線與線交叉，交叉不代表關聯匯合。

## 維護與使用

PNG 為 2 倍解析度輸出，範圍為 2880 × 1300 至 5360 × 3460 像素；SVG 可直接放大。PNG／SVG 與 draw.io 使用本次固定排版，PlantUML 保存相同類別及連線內容，但自動排版可能不同。要延續目前畫面排版，請使用各圖 draw.io 編輯檔。

依據：[B 文件八大模組說明](../../b-analysis-sections-3-5.md)／[D 文件八大模組說明](../../d-object-design-sections-1-2.md)／[SRS](../../srs.md)。本次沒有修改完整正式類別圖、B／D Word 或 Markdown 正文、ER 圖、循序圖、資料庫 Schema、程式碼或既有 AI 紀錄；使用者原有未提交修改保留，未 commit 或 push。
