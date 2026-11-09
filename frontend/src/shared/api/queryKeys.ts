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
  masterData: {
    all: ["master-data"],
    list: (resource: string, filters: unknown) => ["master-data", resource, filters] as const,
    options: (resource: string, activeOnly: boolean) => ["master-data", resource, "options", activeOnly] as const,
  },
  storageLocations: {
    all: ["storage-locations"],
    list: (filters: { search: string; storageType: string; status: string; page: number }) =>
      ["storage-locations", filters] as const,
    active: ["storage-locations", "active"],
    summary: ["storage-locations", "summary"],
    batches: (locationId: number) => ["storage-locations", "batches", locationId] as const,
  },
  goodsReceipt: { all: ["goods-receipt"] },
  inventory: { all: ["inventory"] },
  issue: {
    all: ["issue"],
    ingredients: ["issue", "ingredients"],
    recent: ["issue", "recent"],
    suggestion: (body: unknown) => ["issue", "suggestion", body] as const,
  },
  alerts: { all: ["alerts"] },
  waste: { all: ["waste"],
    batches: (search: string, page: number) => ["waste", "batches", search, page] as const,
    batch: (id: number | null) => ["waste", "batch", id] as const,
    records: (page: number) => ["waste", "records", page] as const,
  },
  stocktake: { all: ["stocktake"],
    batches: (search: string, page: number) => ["stocktake", "batches", search, page] as const,
  },
  reports: { all: ["reports"],
    query: (kind: string, params: string) => ["reports", kind, params] as const,
  },
} as const;

const STOCK_QUERY_ROOTS = [
  // 位置清單與摘要含批次數、最近到期與效期統計，庫存變動後也要更新。
  queryKeys.storageLocations.all,
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
