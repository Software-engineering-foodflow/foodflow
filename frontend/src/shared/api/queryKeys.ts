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
  storageLocations: { all: ["storage-locations"] },
  goodsReceipt: { all: ["goods-receipt"] },
  inventory: { all: ["inventory"] },
  issue: { all: ["issue"] },
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
