"""12 個 ORM 模型，同時作為實體類別（AD-3）。"""

from app.db.models.alert_setting import AlertSetting
from app.db.models.goods_receipt import GoodsReceipt, GoodsReceiptItem
from app.db.models.inventory import BatchLocationChange, InventoryBatch, InventoryTransaction
from app.db.models.master_data import (
    Employee,
    Ingredient,
    IngredientCategory,
    StorageLocation,
    Supplier,
)
from app.db.models.waste import WasteRecord, WasteRequest

__all__ = [
    "AlertSetting",
    "BatchLocationChange",
    "Employee",
    "GoodsReceipt",
    "GoodsReceiptItem",
    "Ingredient",
    "IngredientCategory",
    "InventoryBatch",
    "InventoryTransaction",
    "StorageLocation",
    "Supplier",
    "WasteRecord",
    "WasteRequest",
]
