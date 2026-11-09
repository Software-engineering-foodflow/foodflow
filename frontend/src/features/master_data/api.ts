import { API_PREFIX, request } from "../../shared/api/client";
import type { components } from "../../shared/api/schema";

export type Category = components["schemas"]["IngredientCategoryResponse"];
export type Ingredient = components["schemas"]["IngredientResponse"];
export type Supplier = components["schemas"]["SupplierResponse"];
export type Master = Category | Ingredient | Supplier;
export type Resource = "ingredient-categories" | "ingredients" | "suppliers";
export type MasterBody = components["schemas"]["IngredientCategoryCreate"] |
  components["schemas"]["IngredientCategoryUpdate"] | components["schemas"]["IngredientCreate"] |
  components["schemas"]["IngredientUpdate"] | components["schemas"]["SupplierCreate"] |
  components["schemas"]["SupplierUpdate"];
export type MasterList = components["schemas"]["IngredientCategoryList"] |
  components["schemas"]["IngredientList"] | components["schemas"]["SupplierList"];
export interface Filters { search: string; status: string; category: string; storage: string; page: number }
export const PAGE_SIZE = 20;

export function listMasters(resource: Resource, filters: Filters, signal?: AbortSignal) {
  const params = new URLSearchParams({ page: String(filters.page), page_size: String(PAGE_SIZE) });
  if (filters.search.trim()) params.set("search", filters.search.trim());
  if (filters.status) params.set("is_active", filters.status);
  if (filters.category) params.set("category_id", filters.category);
  if (filters.storage) params.set("storage_method", filters.storage);
  return request<MasterList>(`${API_PREFIX}/${resource}?${params}`, { signal });
}

/** 有效選單逐頁取齊，不能以 API 單頁上限截斷。 */
export async function listActiveMasters(resource: Resource, signal?: AbortSignal, activeOnly = true): Promise<Master[]> {
  const items: Master[] = [];
  let page = 1;
  let total: number;
  do {
    const result = await request<MasterList>(`${API_PREFIX}/${resource}?${activeOnly ? "is_active=true&" : ""}page_size=100&page=${page}`, { signal });
    items.push(...result.items);
    total = result.total;
    page += 1;
  } while (items.length < total);
  return items;
}

export function saveMaster(resource: Resource, body: MasterBody, id?: number) {
  return request<Master>(`${API_PREFIX}/${resource}${id === undefined ? "" : `/${id}`}`, {
    method: id === undefined ? "POST" : "PATCH", body,
  });
}
export function deleteMaster(resource: Resource, id: number) {
  return request<void>(`${API_PREFIX}/${resource}/${id}`, { method: "DELETE" });
}
