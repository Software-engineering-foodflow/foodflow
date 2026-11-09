# 食序 FoodFlow：各系統資料表

日期：2026-11-08｜第 17 組｜B 文件資料設計草稿

依 FoodFlow 現有 schema（migration 0001）整理，共 12 張資料表、93 個欄位。資料庫欄位及限制以程式模型為準，需求語意依 SRS v3.0。

PK：主鍵；FK：外鍵；UNIQUE：單欄唯一。「可空」表示資料庫允許 NULL；未標示者為 NOT NULL。TIMESTAMPTZ 為具時區時間戳。複合唯一限制列於表後。

資料來源：`backend/app/db/models/`、migration `0001`、`docs/srs.md`、`docs/b-data-model.md`。

## （一）EMPLOYEE 員工資料表

| 欄位 | 資料型別 | PK / FK | 說明 |
| --- | --- | --- | --- |
| **id** | BIGINT | PK | 資料列主鍵，自動產生識別碼 |
| **username** | VARCHAR(64) | UNIQUE | 登入帳號，不得重複 |
| **password_hash** | VARCHAR(255) | — | 密碼雜湊，不儲存明文密碼 |
| **name** | VARCHAR(100) | — | 員工顯示姓名 |
| **role** | VARCHAR(32) | — | 權限：ADMIN／STAFF |
| **is_active** | BOOLEAN | — | 帳號是否啟用 |
| **token_version** | INTEGER | — | 驗證登入憑證的版本，用於撤銷既有登入 |
| **created_at** | TIMESTAMPTZ | — | 帳號建立時間 |


## （二）INGREDIENT_CATEGORY 食材分類資料表

| 欄位 | 資料型別 | PK / FK | 說明 |
| --- | --- | --- | --- |
| **id** | BIGINT | PK | 資料列主鍵，自動產生識別碼 |
| **code** | VARCHAR(32) | UNIQUE | 分類代碼，不得重複 |
| **name** | VARCHAR(100) | — | 分類名稱 |
| **description** | TEXT | — | 分類說明（可空） |
| **is_active** | BOOLEAN | — | 分類是否啟用 |
| **created_at** | TIMESTAMPTZ | — | 分類建立時間 |


## （三）INGREDIENT 食材資料表

| 欄位 | 資料型別 | PK / FK | 說明 |
| --- | --- | --- | --- |
| **id** | BIGINT | PK | 資料列主鍵，自動產生識別碼 |
| **name** | VARCHAR(100) | UNIQUE | 食材名稱，不得重複 |
| **category_id** | BIGINT | FK | 所屬食材分類；參照 ingredient_category.id |
| **unit** | VARCHAR(16) | — | 固定庫存單位，不做自動單位換算 |
| **storage_method** | VARCHAR(32) | — | 保存方式：REFRIGERATED／FROZEN／AMBIENT |
| **safety_stock_quantity** | NUMERIC(12,3) | — | 安全庫存量，不得小於 0；0 表示不提醒 |
| **is_active** | BOOLEAN | — | 食材是否啟用 |
| **created_at** | TIMESTAMPTZ | — | 食材建立時間 |


## （四）SUPPLIER 供應商資料表

| 欄位 | 資料型別 | PK / FK | 說明 |
| --- | --- | --- | --- |
| **id** | BIGINT | PK | 資料列主鍵，自動產生識別碼 |
| **name** | VARCHAR(100) | — | 供應商名稱 |
| **contact_person** | VARCHAR(100) | — | 聯絡人（可空） |
| **phone** | VARCHAR(32) | — | 聯絡電話（可空） |
| **other_contact** | VARCHAR(255) | — | 其他聯絡方式（可空） |
| **is_active** | BOOLEAN | — | 供應商是否啟用 |


## （五）STORAGE_LOCATION 儲存位置資料表

| 欄位 | 資料型別 | PK / FK | 說明 |
| --- | --- | --- | --- |
| **id** | BIGINT | PK | 資料列主鍵，自動產生識別碼 |
| **code** | VARCHAR(32) | UNIQUE | 位置代碼，不得重複 |
| **name** | VARCHAR(100) | — | 位置名稱 |
| **storage_type** | VARCHAR(32) | — | 儲存類型：REFRIGERATED／FROZEN／AMBIENT |
| **description** | TEXT | — | 位置說明（可空） |
| **is_active** | BOOLEAN | — | 位置是否啟用 |


## （六）GOODS_RECEIPT 進貨單資料表

| 欄位 | 資料型別 | PK / FK | 說明 |
| --- | --- | --- | --- |
| **id** | BIGINT | PK | 資料列主鍵，自動產生識別碼 |
| **supplier_id** | BIGINT | FK | 本張進貨單的供應商；參照 supplier.id |
| **receipt_date** | DATE | — | 實際進貨日期 |
| **status** | VARCHAR(32) | — | DRAFT／CONFIRMED／REVERSED |
| **created_by_id** | BIGINT | FK | 建立進貨單的員工；參照 employee.id |
| **created_at** | TIMESTAMPTZ | — | 進貨單建立時間 |
| **confirmed_at** | TIMESTAMPTZ | — | 確認入庫時間；草稿可空白（可空） |

- receipt_number 是依 id 產生的衍生屬性，不是資料庫欄位。

## （七）GOODS_RECEIPT_ITEM 進貨明細資料表

| 欄位 | 資料型別 | PK / FK | 說明 |
| --- | --- | --- | --- |
| **id** | BIGINT | PK | 資料列主鍵，自動產生識別碼 |
| **receipt_id** | BIGINT | FK | 所屬進貨單；參照 goods_receipt.id |
| **ingredient_id** | BIGINT | FK | 本筆明細的食材；參照 ingredient.id |
| **quantity** | NUMERIC(12,3) | — | 進貨數量，草稿可空白；有值時必須大於 0（可空） |
| **unit_price** | NUMERIC(12,2) | — | 進貨單價，可不填；有值時不得小於 0（可空） |
| **expiry_date** | DATE | — | 到期日，草稿可空白；確認入庫時必填（可空） |
| **location_id** | BIGINT | FK | 入庫位置，草稿可空白；確認入庫時必填；參照 storage_location.id（可空） |
| **note** | TEXT | — | 明細備註（可空） |

- 草稿可保留缺漏；確認入庫時須驗證數量、到期日與位置等必要資料。

## （八）INVENTORY_BATCH 庫存批次資料表

| 欄位 | 資料型別 | PK / FK | 說明 |
| --- | --- | --- | --- |
| **id** | BIGINT | PK | 資料列主鍵，自動產生識別碼 |
| **batch_number** | VARCHAR(32) | UNIQUE | 唯一批號 |
| **source_item_id** | BIGINT | FK / UNIQUE | 來源進貨明細；唯一限制確保每筆明細最多建立一個批次；參照 goods_receipt_item.id |
| **ingredient_id** | BIGINT | FK | 批次所屬食材；參照 ingredient.id |
| **expiry_date** | DATE | — | 批次到期日 |
| **received_date** | DATE | — | 進貨日期的不可變副本，供 FEFO 排序使用 |
| **current_location_id** | BIGINT | FK | 批次目前的唯一儲存位置；參照 storage_location.id |
| **unit_price** | NUMERIC(12,2) | — | 批次進貨單價；未知時為 NULL（可空） |
| **initial_quantity** | NUMERIC(12,3) | — | 初始入庫量，必須大於 0 |
| **remaining_quantity** | NUMERIC(12,3) | — | 剩餘量，不得小於 0；只能由 StockLedger 修改 |


## （九）INVENTORY_TRANSACTION 庫存異動資料表

| 欄位 | 資料型別 | PK / FK | 說明 |
| --- | --- | --- | --- |
| **id** | BIGINT | PK | 資料列主鍵，自動產生識別碼 |
| **operation_group_id** | UUID | — | 同次操作的群組 UUID；不是獨立資料表的外鍵 |
| **batch_id** | BIGINT | FK | 本筆異動的庫存批次；參照 inventory_batch.id |
| **type** | VARCHAR(32) | — | RECEIPT／ISSUE／WASTE／ADJUSTMENT／REVERSAL |
| **quantity_delta** | NUMERIC(12,3) | — | 本次增減量，可為正數或負數 |
| **quantity_before** | NUMERIC(12,3) | — | 異動前數量 |
| **quantity_after** | NUMERIC(12,3) | — | 異動後數量；等於異動前數量加增減量，且不得小於 0 |
| **operator_id** | BIGINT | FK | 執行異動的員工；參照 employee.id |
| **occurred_at** | TIMESTAMPTZ | — | 異動確認時間 |
| **reason** | TEXT | — | 可顯示的異動原因文字 |
| **is_non_fefo** | BOOLEAN | — | 是否為非 FEFO 領用 |
| **reverses_transaction_id** | BIGINT | FK / UNIQUE | 沖銷所指向的原異動；僅 REVERSAL 必填，且同一原異動最多被直接沖銷一次；參照 inventory_transaction.id（可空） |

- 複合唯一限制：UNIQUE (operation_group_id, batch_id)；不是各欄位個別唯一。
- REVERSAL 必須指向原異動；其他類型的 reverses_transaction_id 必須為空。quantity_after = quantity_before + quantity_delta，且不得小於 0。

## （十）WASTE_RECORD 報廢紀錄資料表

| 欄位 | 資料型別 | PK / FK | 說明 |
| --- | --- | --- | --- |
| **id** | BIGINT | PK | 資料列主鍵，自動產生識別碼 |
| **batch_id** | BIGINT | FK | 報廢的庫存批次；參照 inventory_batch.id |
| **transaction_id** | BIGINT | FK / UNIQUE | 對應庫存異動，唯一；應為 WASTE 類型；參照 inventory_transaction.id |
| **quantity** | NUMERIC(12,3) | — | 報廢量，必須大於 0 |
| **reason** | VARCHAR(32) | — | EXPIRED／SPOILED／DAMAGED／OTHER |
| **note** | TEXT | — | 補充說明；選擇 OTHER 時須由 Service 要求填寫（可空） |
| **loss_amount** | NUMERIC(14,2) | — | 報廢量乘以批次單價；單價未知時為 NULL，不視為 0（可空） |
| **operator_id** | BIGINT | FK | 登記報廢的員工；參照 employee.id |
| **occurred_at** | TIMESTAMPTZ | — | 報廢確認時間 |

- 應用服務須確保 transaction_id 對應 WASTE 類型異動；單價未知時 loss_amount 為 NULL。

## （十一）BATCH_LOCATION_CHANGE 位置變更紀錄資料表

| 欄位 | 資料型別 | PK / FK | 說明 |
| --- | --- | --- | --- |
| **id** | BIGINT | PK | 資料列主鍵，自動產生識別碼 |
| **batch_id** | BIGINT | FK | 整批移位的庫存批次；參照 inventory_batch.id |
| **from_location_id** | BIGINT | FK | 移位前位置；參照 storage_location.id |
| **to_location_id** | BIGINT | FK | 移位後位置；參照 storage_location.id |
| **operator_id** | BIGINT | FK | 執行移位的員工；參照 employee.id |
| **occurred_at** | TIMESTAMPTZ | — | 移位確認時間 |
| **reason** | TEXT | — | 整批移位原因；不改變批次數量及到期日 |


## （十二）ALERT_SETTING 預警設定資料表

| 欄位 | 資料型別 | PK / FK | 說明 |
| --- | --- | --- | --- |
| **id** | BIGINT | PK | 資料列主鍵，自動產生識別碼 |
| **name** | VARCHAR(100) | — | 設定名稱 |
| **warning_days** | INTEGER | — | 全店即期預警天數，不得小於 0 |
| **created_at** | TIMESTAMPTZ | — | 設定建立時間 |
| **updated_at** | TIMESTAMPTZ | — | 最後更新時間 |
| **updated_by_id** | BIGINT | FK | 最後修改的員工；初始化時可空白；參照 employee.id（可空） |

- 業務上使用全店設定；目前 schema 未強制整張表僅能一列。
