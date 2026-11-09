import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { invalidateStockQueries, queryKeys } from "../../shared/api/queryKeys";
import * as api from "./api";

export { PAGE_SIZE } from "./api";
export type { Master, MasterBody, Resource, Filters } from "./api";

export function mutationFields(error: unknown): Record<string, string> {
  if (error && typeof error === "object" && "fields" in error && Array.isArray(error.fields)) {
    return Object.fromEntries(error.fields.map((f: { field: string; message: string }) => [f.field, f.message]));
  }
  return {};
}

export function useMasters(resource: api.Resource, filters: api.Filters) {
  return useQuery({ queryKey: queryKeys.masterData.list(resource, filters),
    queryFn: ({ signal }) => api.listMasters(resource, filters, signal) });
}
export function useActiveMasters(resource: api.Resource, enabled = true, activeOnly = true) {
  return useQuery({ queryKey: queryKeys.masterData.options(resource, activeOnly), enabled,
    queryFn: ({ signal }) => api.listActiveMasters(resource, signal, activeOnly) });
}
export function useMasterMutation(resource: api.Resource) {
  const client = useQueryClient();
  return useMutation({ mutationFn: async (input: { body: api.MasterBody; id?: number } | { deleteId: number }): Promise<api.Master | void> =>
    "deleteId" in input ? api.deleteMaster(resource, input.deleteId) : api.saveMaster(resource, input.body, input.id),
  onSuccess: async () => {
    await client.invalidateQueries({ queryKey: queryKeys.masterData.all });
    if (resource !== "suppliers") await invalidateStockQueries(client);
    else await client.invalidateQueries({ queryKey: queryKeys.goodsReceipt.all });
  } });
}
