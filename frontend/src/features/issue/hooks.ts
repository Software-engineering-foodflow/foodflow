import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { invalidateStockQueries, queryKeys } from "../../shared/api/queryKeys";
import * as api from "./api";

export type {
  IssuableIngredient, IssueLineRequest, IssueRecord, IssueResult, IssueSuggestion, IssueSuggestionRequest,
  SuggestionCandidate,
} from "./api";

export function useIssuableIngredients() {
  return useQuery({ queryKey: queryKeys.issue.ingredients,
    queryFn: ({ signal }) => api.listIssuableIngredients(signal) });
}

export function useRecentIssues() {
  return useQuery({ queryKey: queryKeys.issue.recent,
    queryFn: ({ signal }) => api.listRecentIssues(signal) });
}

/** 沖銷會把數量加回批次（AD-18）；成功後才失效。 */
export function useReverseIssue() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, reason }: { groupId: string; reason: string }) => api.reverseIssue(groupId, reason),
    onSuccess: () => invalidateStockQueries(client),
  });
}

/** 建議是唯讀查詢；body 為 null 時不發請求，改選期間保留上一次的結果。 */
export function useIssueSuggestion(body: api.IssueSuggestionRequest | null) {
  return useQuery({
    queryKey: queryKeys.issue.suggestion(body),
    queryFn: ({ signal }) => api.suggestIssue(body as api.IssueSuggestionRequest, signal),
    enabled: body !== null,
    placeholderData: keepPreviousData,
  });
}

/** 領用會改變庫存、預警與建議（AD-18）；成功後才失效。 */
export function useCreateIssue() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ body, idempotencyKey }: { body: api.IssueCreateRequest; idempotencyKey: string }) =>
      api.createIssue(body, idempotencyKey),
    onSuccess: () => invalidateStockQueries(client),
  });
}
