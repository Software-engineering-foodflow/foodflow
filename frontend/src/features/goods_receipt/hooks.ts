import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { invalidateStockQueries, queryKeys } from "../../shared/api/queryKeys";
import * as api from "./api";

export { ApiError } from "./api";
export type { Draft, Option, Receipt } from "./api";

export function useReceipt(id: number | undefined) {
  return useQuery({ queryKey: queryKeys.goodsReceipt.detail(id), enabled: id !== undefined,
    queryFn: ({ signal }) => api.getReceipt(id!, signal) });
}
export function useReceiptOptions(kind: api.OptionKind, includeInactive = false) {
  return useQuery({ queryKey: queryKeys.goodsReceipt.options(kind, includeInactive),
    queryFn: ({ signal }) => api.getOptions(kind, signal, includeInactive) });
}
export function useSaveReceipt() {
  const client = useQueryClient();
  return useMutation({ mutationFn: api.saveReceipt, onSuccess: (receipt) => {
    client.setQueryData(queryKeys.goodsReceipt.detail(receipt.id), receipt);
    void client.invalidateQueries({ queryKey: ["goods-receipt", "list"] });
  } });
}
export function useConfirmReceipt() {
  const client = useQueryClient();
  return useMutation({ mutationFn: api.confirmReceipt, onSuccess: async (receipt) => {
    client.setQueryData(queryKeys.goodsReceipt.detail(receipt.id), receipt);
    await invalidateStockQueries(client);
  } });
}
export function useDeleteReceipt() {
  const client = useQueryClient();
  return useMutation({ mutationFn: api.deleteReceipt, onSuccess: (_, id) => {
    client.removeQueries({ queryKey: queryKeys.goodsReceipt.detail(id) });
    void client.invalidateQueries({ queryKey: ["goods-receipt", "list"] });
  } });
}

export function useReceipts(filters: api.ReceiptFilters) {
  return useQuery({ queryKey: queryKeys.goodsReceipt.list(filters),
    queryFn: ({ signal }) => api.listReceipts(filters, signal) });
}
export function useReverseReceipt() {
  const client = useQueryClient();
  return useMutation({ mutationFn: api.reverseReceipt, onSuccess: async (receipt) => {
    client.setQueryData(queryKeys.goodsReceipt.detail(receipt.id), receipt);
    await invalidateStockQueries(client);
  } });
}
