import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../shared/api/queryKeys";
import * as api from "./api";
export type { Transaction } from "./api";
export function useAllTransactions(params: string, enabled: boolean) {
  return useQuery({ queryKey: queryKeys.reports.query("all-transactions", params),
    queryFn: ({ signal }) => api.allTransactions(params, signal), enabled });
}
export function useTransactions(params: string) {
  return useQuery({ queryKey: queryKeys.reports.query("transactions", params),
    queryFn: ({ signal }) => api.transactions(params, signal) });
}
export function useTransaction(id: string | null) {
  return useQuery({ queryKey: queryKeys.reports.query("transaction", id ?? ""),
    queryFn: ({ signal }) => api.transaction(id!, signal), enabled: !!id });
}
export function useLocations(params: string) {
  return useQuery({ queryKey: queryKeys.reports.query("locations", params),
    queryFn: ({ signal }) => api.locations(params, signal) });
}
export function useStockReport(params: string, enabled: boolean) {
  return useQuery({ queryKey: queryKeys.reports.query("stock", params),
    queryFn: ({ signal }) => api.stock(params, signal), enabled });
}
export function useWasteReport(params: string, enabled: boolean) {
  return useQuery({ queryKey: queryKeys.reports.query("waste", params),
    queryFn: ({ signal }) => api.waste(params, signal), enabled });
}
export const transactionLabels: Record<string, string> = {
  RECEIPT: "進貨", ISSUE: "領用", WASTE: "報廢", ADJUSTMENT: "盤點調整", REVERSAL: "沖銷",
};
