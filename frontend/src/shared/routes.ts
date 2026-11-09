/** AD-23：路徑常數，以及預警動作對應的路由與參數。 */

export const routes = {
  home: "/",
  login: "/login",
  employees: "/employees",
  issueNew: "/issues/new",
  wasteRecordNew: "/waste-records/new",
  goodsReceiptNew: "/goods-receipts/new",
  goodsReceiptDetail: "/goods-receipts/:receiptId",
  inventory: "/inventory",
  inventoryBatches: "/inventory/:ingredientId/batches",
  inventoryBatchHistory: "/inventory/batches/:batchId",
  goodsReceipts: "/goods-receipts",
  issues: "/issues",
  wasteRecords: "/waste-records",
  stocktakes: "/stocktakes",
  reports: "/reports",
  ingredients: "/ingredients",
  ingredientCategories: "/ingredient-categories",
  suppliers: "/suppliers",
  storageLocations: "/storage-locations",
} as const;

/** 對應後端 AlertAction；alerts API 完成後改用 schema.d.ts 產生的型別。 */
export interface AlertActionTarget {
  type: "ISSUE" | "WASTE" | "CREATE_GOODS_RECEIPT";
  ingredient_id: number;
  batch_id?: number | null;
}

export function alertActionPath(action: AlertActionTarget): string {
  switch (action.type) {
    case "ISSUE":
      return `${routes.issueNew}?ingredient_id=${action.ingredient_id}`;
    case "WASTE":
      if (action.batch_id == null) {
        throw new Error("WASTE 動作必須帶 batch_id");
      }
      return `${routes.wasteRecordNew}?batch_id=${action.batch_id}`;
    case "CREATE_GOODS_RECEIPT":
      return `${routes.goodsReceiptNew}?ingredient_id=${action.ingredient_id}`;
  }
}
