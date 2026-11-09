import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "../../shared/api/queryKeys";
import * as api from "./api";

export type { Batch, Stock, Transaction, LocationChange, Option } from "./api";
export function useInventory(filters: api.Filters) {
  return useQuery({ queryKey: queryKeys.inventory.list(filters), queryFn: ({ signal }) => api.overview(filters, signal) });
}
export function useInventoryBatches(id: string, filters: api.BatchFilters) {
  return useQuery({ queryKey: queryKeys.inventory.batches(id, filters), queryFn: ({ signal }) => api.batches(id, filters, signal) });
}
export function useInventoryBatch(id: string) {
  return useQuery({ queryKey: queryKeys.inventory.batch(id), queryFn: ({ signal }) => api.batch(id, signal) });
}
export function useInventoryTransactions(id: string, page: number) {
  return useQuery({ queryKey: queryKeys.inventory.transactions(id, page), queryFn: ({ signal }) => api.transactions(id, page, signal) });
}
export function useInventoryLocationChanges(id: string, page: number) {
  return useQuery({ queryKey: queryKeys.inventory.locationChanges(id, page), queryFn: ({ signal }) => api.locationChanges(id, page, signal) });
}
export function useInventoryOptions(kind: "categories" | "locations") {
  return useQuery({ queryKey: queryKeys.inventory.options(kind), queryFn: ({ signal }) => api.options(kind, signal) });
}
