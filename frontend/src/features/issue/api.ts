import { API_PREFIX, request } from "../../shared/api/client";
import type { components } from "../../shared/api/schema";

export type IssuableIngredient = components["schemas"]["IssuableIngredientResponse"];
export type IssuableIngredientList = components["schemas"]["IssuableIngredientList"];
export type IssueSuggestionRequest = components["schemas"]["IssueSuggestionRequest"];
export type IssueSuggestion = components["schemas"]["IssueSuggestionResponse"];
export type SuggestionCandidate = components["schemas"]["SuggestionLineResponse"];
export type IssueLineRequest = components["schemas"]["IssueLineRequest"];
export type IssueCreateRequest = components["schemas"]["IssueCreateRequest"];
export type IssueResult = components["schemas"]["IssueResponse"];
export type IssueRecord = components["schemas"]["IssueRecordResponse"];
export type IssueRecordList = components["schemas"]["IssueRecordList"];

/** 最近領用紀錄顯示的筆數（後端上限 50）。 */
export const RECENT_LIMIT = 20;

const BASE = `${API_PREFIX}/issues`;

/** 有可用量的食材（含停用，FR-03：停用食材的既有庫存仍可領用）。 */
export function listIssuableIngredients(signal?: AbortSignal) {
  return request<IssuableIngredientList>(`${BASE}/ingredients`, { signal });
}

/** 不上鎖、不扣庫存：quantity 取得 FEFO 建議；lines 檢查改選的明細是否非 FEFO（AD-12）。 */
export function suggestIssue(body: IssueSuggestionRequest, signal?: AbortSignal) {
  return request<IssueSuggestion>(`${BASE}/suggestions`, { method: "POST", body, signal });
}

/** 最近幾次領用，新到舊。 */
export function listRecentIssues(signal?: AbortSignal) {
  return request<IssueRecordList>(`${BASE}?limit=${RECENT_LIMIT}`, { signal });
}

/** 沖銷整次領用；已沖銷過時回目前狀態。 */
export function reverseIssue(groupId: string, reason: string) {
  return request<IssueRecord>(`${BASE}/${groupId}/reversal`, { method: "POST", body: { reason } });
}

/** 確認領用；同一把 key 重送回原結果（AD-8）。 */
export function createIssue(body: IssueCreateRequest, idempotencyKey: string) {
  return request<IssueResult>(BASE, { method: "POST", body, idempotencyKey });
}
