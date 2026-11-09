import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { invalidateStockQueries, queryKeys } from "../../shared/api/queryKeys";
import * as api from "./api";

export type {
  LocationBatch, StorageLocation, StorageLocationCreate, StorageLocationFilters, StorageLocationRow,
  StorageLocationSummary, StorageLocationUpdate, StorageTypeSummary,
} from "./api";
export { PAGE_SIZE } from "./api";

/** 位置的代碼、名稱與啟用狀態會出現在庫存、預警與進貨畫面，所以一併失效（AD-18）。 */
async function invalidateLocations(client: QueryClient) {
  await Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.storageLocations.all }),
    invalidateStockQueries(client),
  ]);
}

export function useStorageLocations(filters: api.StorageLocationFilters) {
  return useQuery({ queryKey: queryKeys.storageLocations.list(filters),
    queryFn: ({ signal }) => api.listStorageLocations(filters, signal) });
}
export function useStorageLocationSummary() {
  return useQuery({ queryKey: queryKeys.storageLocations.summary,
    queryFn: ({ signal }) => api.getStorageLocationSummary(signal) });
}
export function useCreateStorageLocation() {
  const client = useQueryClient();
  return useMutation({ mutationFn: api.createStorageLocation,
    onSuccess: () => invalidateLocations(client) });
}
export function useUpdateStorageLocation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: api.StorageLocationUpdate }) =>
      api.updateStorageLocation(id, body),
    onSuccess: () => invalidateLocations(client),
  });
}
export function useDeleteStorageLocation() {
  const client = useQueryClient();
  return useMutation({ mutationFn: api.deleteStorageLocation,
    onSuccess: () => invalidateLocations(client) });
}
export function useActiveStorageLocations(enabled: boolean) {
  return useQuery({ queryKey: queryKeys.storageLocations.active,
    queryFn: ({ signal }) => api.listActiveStorageLocations(signal), enabled });
}
export function useLocationBatches(locationId: number) {
  return useQuery({ queryKey: queryKeys.storageLocations.batches(locationId),
    queryFn: ({ signal }) => api.listLocationBatches(locationId, signal) });
}
/** 換位置會改變庫存、預警頁顯示的位置（AD-18）。 */
export function useMoveBatch() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ batchId, body }: { batchId: number; body: api.BatchMoveRequest }) =>
      api.moveBatch(batchId, body),
    onSuccess: () => invalidateLocations(client),
  });
}
