# FoodFlow 功能模組局部領域類別圖

由既有完整領域類別圖拆分，保留原版，不變更資料模型。依 D 文件八大功能模組安排；同一個共用類別可以出現在多張圖中，各圖均保留該類別完整屬性、型別、可空性及衍生屬性。

| 圖 | 功能模組 | 需求 | 預覽 | 原始檔 |
| --- | --- | --- | --- | --- |
| 1 | 帳號與權限管理 | FR-01、FR-02 | [PNG](b-class-01-auth.png)／[SVG](b-class-01-auth.svg) | [PlantUML](b-class-01-auth.puml) |
| 2 | 基本資料與儲存位置管理 | FR-03～FR-05 | [PNG](b-class-02-master-storage.png)／[SVG](b-class-02-master-storage.svg) | [PlantUML](b-class-02-master-storage.puml) |
| 3 | 進貨與批次入庫管理 | FR-06、FR-07 | [PNG](b-class-03-receiving.png)／[SVG](b-class-03-receiving.svg) | [PlantUML](b-class-03-receiving.puml) |
| 4 | 批次庫存查詢 | FR-08、FR-09 | [PNG](b-class-04-inventory-query.png)／[SVG](b-class-04-inventory-query.svg) | [PlantUML](b-class-04-inventory-query.puml) |
| 5 | 食材領用與消耗登記 | FR-10、FR-11 | [PNG](b-class-05-issue.png)／[SVG](b-class-05-issue.svg) | [PlantUML](b-class-05-issue.puml) |
| 6 | 效期與低庫存預警 | FR-12～FR-14 | [PNG](b-class-06-alerts.png)／[SVG](b-class-06-alerts.svg) | [PlantUML](b-class-06-alerts.puml) |
| 7 | 報廢與盤點管理 | FR-15、FR-16 | [PNG](b-class-07-waste-stocktake.png)／[SVG](b-class-07-waste-stocktake.svg) | [PlantUML](b-class-07-waste-stocktake.puml) |
| 8 | 異動紀錄與統計 | FR-17、FR-18 | [PNG](b-class-08-history-reports.png)／[SVG](b-class-08-history-reports.svg) | [PlantUML](b-class-08-history-reports.puml) |

## 圖表範圍與閱讀方式

- 原始完整圖：[PNG](../b-class-diagram.png)／[SVG](../b-class-diagram.svg)／[PlantUML](../b-class-diagram.puml)。
- 局部圖依操作用途選入核心與相關物件，不代表將資料表重新分配、複製或新增。
- 對每張圖選入的類別，若原圖在它們之間存在關聯，就完整保留，包括自我關聯及同一對類別的多條關聯；跨至未選入類別的關聯在其他視圖或完整圖查閱。
- 帳號圖只含 Employee；角色是屬性，不憑空新增 Role 類別。
- 預警設定與食材／批次之間的計算協作不是原圖資料關聯，因此使用註解，不新增連線。
- 盤點、領用與報表使用既有實體，不新增 Stocktake、Issue 或 Report 資料表類別。
- from_location 與 to_location 分別表示原位置與新位置；保留各自多重度。
- reverses 自我關聯的兩端仍為 0..1，不因圖面調整變更規則。

## 內容核對

八張圖合計涵蓋原圖全部 12 個類別、94 個成員（93 個持久化欄位及 receipt_number 衍生屬性）與 20 條關聯。類別區塊直接從原始 PlantUML 擷取；關聯僅移除總覽版的 norank 排版設定，端點、名稱與多重度保留。

本次不修改完整圖、ER 圖、B／C／D 文件正文、Word 文件、Schema 或程式碼。可先比較圖面，再決定是否放入 D 文件。
