/** AD-18：query key 以 feature 名稱開頭，全部集中在這裡。 */

import { QueryClient } from "@tanstack/react-query";

import { ApiError } from "./client";

const MAX_QUERY_RETRIES = 3;

export const queryKeys = {
  health: { all: ["health"] },
  auth: { all: ["auth"] },
  employees: {
    all: ["employees"],
    list: (filters: { search: string; role: string; status: string; page: number }) =>
      ["employees", filters] as const,
  },
  masterData: { all: ["master-data"] },
  storageLocations: {
    all: ["storage-locations"],
    list: (filters: { search: string; storageType: string; status: string; page: number }) =>
      ["storage-locations", filters] as const,
    active: ["storage-locations", "active"],
    batches: (locationId: number) => ["storage-locations", "batches", locationId] as const,
  },
  goodsReceipt: {
    all: ["goods-receipt"],
    list: (filters: object) => ["goods-receipt", "list", filters] as const,
    detail: (id: number | undefined) => ["goods-receipt", "detail", id] as const,
    options: (kind: string, includeInactive = false) => ["goods-receipt", "options", kind, includeInactive] as const,
  },
  inventory: {
    all: ["inventory"],
    list: (filters: object) => ["inventory", "list", filters] as const,
    options: (kind: string) => ["inventory", "options", kind] as const,
    batches: (id: string, filters: object) => ["inventory", "batches", id, filters] as const,
    batch: (id: string) => ["inventory", "batch", id] as const,
    transactions: (id: string, page: number) => ["inventory", "transactions", id, page] as const,
    locationChanges: (id: string, page: number) => ["inventory", "location-changes", id, page] as const,
  },
  issue: { all: ["issue"] },
  alerts: { all: ["alerts"] },
  waste: { all: ["waste"] },
  stocktake: { all: ["stocktake"] },
  reports: { all: ["reports"] },
} as const;

const STOCK_QUERY_ROOTS = [
  queryKeys.inventory.all,
  queryKeys.alerts.all,
  queryKeys.issue.all,
  queryKeys.goodsReceipt.all,
  queryKeys.waste.all,
  queryKeys.stocktake.all,
  queryKeys.reports.all,
];

/**
 * 以下 mutation 成功後一律呼叫：數量異動、換位置、進貨確認與沖銷、
 * 食材與分類變更、預警設定變更。
 */
export async function invalidateStockQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all(
    STOCK_QUERY_ROOTS.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
}

export function createQueryClient(): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // 4xx 重試也不會變成功。
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status >= 400 && error.status < 500) &&
          failureCount < MAX_QUERY_RETRIES,
      },
    },
  });
  queryClient.setQueryDefaults(queryKeys.alerts.all, { staleTime: 0 });
  queryClient.setQueryDefaults(queryKeys.inventory.all, { staleTime: 0 });
  return queryClient;
}
