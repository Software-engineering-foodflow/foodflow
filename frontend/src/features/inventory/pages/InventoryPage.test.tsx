import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { invalidateStockQueries, queryKeys } from "../../../shared/api/queryKeys";
import type { Batch, Stock } from "../hooks";
import { InventoryBatchHistoryPage } from "./InventoryBatchHistoryPage";
import { InventoryBatchesPage } from "./InventoryBatchesPage";
import { InventoryPage } from "./InventoryPage";

const BASE = "/api/v1/inventory";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const stock: Stock = { ingredient_id: "5", ingredient_name: "雞胸肉", category_id: "2", category_name: "肉類",
  unit: "kg", storage_method: "REFRIGERATED", safety_stock_quantity: "10.000", is_active: true,
  physical_quantity: "9.000", available_quantity: "7.000", expired_quantity: "2.000", store_available_quantity: "7.000",
  is_low_stock: true, shortfall_quantity: "3.000" };
const batch: Batch = { id: "8", batch_number: "B-00000008", ingredient_id: "5", ingredient_name: "雞胸肉", unit: "kg",
  source_item_id: "11", receipt_id: "1", receipt_number: "GR-00000001", receipt_status: "CONFIRMED",
  supplier_id: "1", supplier_name: "青田供應商", received_date: "2026-11-06", expiry_date: "2026-11-09", days_until_expiry: 3,
  expiry_status: "EXPIRING_SOON", location_id: "3", location_name: "冷藏庫 A", initial_quantity: "8.000", remaining_quantity: "7.000", is_depleted: false };
const overview = { items: [stock], total: 1, page: 1, page_size: 20, today: "2026-11-06", warning_days: 3 };
const batchList = { items: [batch], total: 1, page: 1, page_size: 20, ingredient_id: "5", ingredient_name: "雞胸肉", unit: "kg", today: "2026-11-06", warning_days: 3 };
const transactionList = { items: [{ id: "9", type: "ISSUE", quantity_delta: "-1.000", quantity_before: "8.000", quantity_after: "7.000",
  operator_id: "2", operator_name: "小美", occurred_at: "2026-11-06T02:00:00Z", reason: "特別備料\n先取此批", is_non_fefo: true, reverses_transaction_id: null }], total: 1, page: 1, page_size: 20 };
type Handler = (path: string) => Response | Promise<Response> | undefined;
function renderPage(path: string, handler: Handler = () => undefined) {
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    expect(init.method ?? "GET").toBe("GET");
    const custom = handler(url);
    if (custom) return custom;
    if (url.startsWith(`${BASE}/options/`)) return json({ items: [{ id: url.includes("categories") ? "2" : "3", name: url.includes("categories") ? "肉類" : "冷藏庫 A", is_active: false }], total: 1, page: 1, page_size: 100 });
    if (url.startsWith(`${BASE}/5/batches?`)) return json(batchList);
    if (url === `${BASE}/batches/8`) return json(batch);
    if (url.startsWith(`${BASE}/batches/8/transactions?`)) return json(transactionList);
    if (url.startsWith(`${BASE}/batches/8/location-changes?`)) return json({ items: [{ id: "1", from_location_id: "1", from_location_name: "前架", to_location_id: "3", to_location_name: "冷藏庫 A", operator_id: "2", operator_name: "小美", occurred_at: "2026-11-06T02:00:00Z", reason: "移入冷藏" }], total: 1, page: 1, page_size: 20 });
    if (url.startsWith(`${BASE}?`)) return json(overview);
    return json({ error: { code: "NOT_FOUND", message: "不存在", details: {}, fields: [] } }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([
    { path: "/inventory", element: <InventoryPage /> },
    { path: "/inventory/:ingredientId/batches", element: <InventoryBatchesPage /> },
    { path: "/inventory/batches/:batchId", element: <InventoryBatchHistoryPage /> },
    { path: "/goods-receipts/:id", element: <p>既有進貨明細</p> },
  ], { initialEntries: [path] });
  render(<MantineProvider env="test"><QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>);
  return { fetchMock, client, router };
}
async function choose(name: string, option: string) {
  fireEvent.click(screen.getByRole("combobox", { name }));
  fireEvent.click(await screen.findByRole("option", { name: option }));
}

describe("Inventory readonly query", () => {
  it("shows units, whole-store low stock and all quantities without write controls", async () => {
    renderPage("/inventory?location_id=3");
    await screen.findByRole("link", { name: "查看批次：雞胸肉" });
    expect(screen.getByText("實體量：9.000 kg")).toBeTruthy();
    expect(screen.getByText("可用量：7.000 kg")).toBeTruthy();
    expect(screen.getByText("過期量：2.000 kg")).toBeTruthy();
    expect(screen.getByText("全店可用量：7.000 kg")).toBeTruthy();
    expect(document.querySelector('[data-status="LOW_STOCK"]')).toBeTruthy();
    expect(screen.getByText(/目前位置：冷藏庫 A/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^(新增|儲存|修改|刪除|領用|報廢)/ })).toBeNull();
  });
  it("AND filters are shareable URLs, reset pagination, and include historical options", async () => {
    const { router, fetchMock } = renderPage("/inventory?page=2", (url) => url.startsWith(`${BASE}?`) ? json({ ...overview, total: 40 }) : undefined);
    await screen.findByRole("link", { name: "查看批次：雞胸肉" });
    fireEvent.change(screen.getByRole("textbox", { name: "食材名稱" }), { target: { value: "雞" } });
    await choose("分類", "肉類（停用）");
    await choose("保存方式", "冷藏");
    await choose("儲存位置", "冷藏庫 A（停用）");
    await choose("庫存狀態", "過期");
    await waitFor(() => expect(router.state.location.search).toContain("status=EXPIRED"));
    const params = new URLSearchParams(router.state.location.search);
    expect(Object.fromEntries(params)).toEqual({ search: "雞", category_id: "2", storage_method: "REFRIGERATED", location_id: "3", status: "EXPIRED" });
    expect(fetchMock.mock.calls.some(([url]) => url.includes("category_id=2") && url.includes("status=EXPIRED"))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "清除篩選" }));
    expect(router.state.location.search).toBe("");
  });
  it("preserves each level's filters and pages on return", async () => {
    const { router, fetchMock } = renderPage("/inventory?search=雞&page=2&location_id=3", (url) => url.startsWith(`${BASE}?`) ? json({ ...overview, total: 40 }) : undefined);
    fireEvent.click(await screen.findByRole("link", { name: "查看批次：雞胸肉" }));
    fireEvent.click(await screen.findByRole("link", { name: "查看異動：B-00000008" }));
    await screen.findByRole("heading", { name: "數量異動" });
    expect(screen.getByText("非 FEFO")).toBeTruthy();
    expect(screen.getByText("原因：移入冷藏")).toBeTruthy();
    expect(screen.getByText(/增減量：-1.000 kg/)).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "返回食材批次" }));
    fireEvent.click(await screen.findByRole("link", { name: "返回庫存總覽" }));
    expect(router.state.location.pathname).toBe("/inventory");
    expect(new URLSearchParams(router.state.location.search).get("page")).toBe("2");
    expect(fetchMock.mock.calls.some(([url]) => url.includes("/5/batches?location_id=3&page=1"))).toBe(true);
  });
  it.each(["-1", "bad", "0", "9007199254740992"])("normalizes invalid page %s", async (page) => {
    const { router } = renderPage(`/inventory?page=${page}`);
    await screen.findByRole("link", { name: "查看批次：雞胸肉" });
    await waitFor(() => expect(new URLSearchParams(router.state.location.search).has("page")).toBe(false));
  });
  it("returns to a valid page when results shrink", async () => {
    const { router } = renderPage("/inventory?page=5");
    await screen.findByRole("link", { name: "查看批次：雞胸肉" });
    await waitFor(() => expect(new URLSearchParams(router.state.location.search).has("page")).toBe(false));
  });
  it("renders loading, failure and retry without presenting a previous search as current", async () => {
    let resolve!: (response: Response) => void;
    let failed = true;
    renderPage("/inventory", (url) => {
      if (!url.startsWith(`${BASE}?`)) return undefined;
      if (url.includes("search=")) return failed ? json({ error: { code: "INTERNAL_ERROR", message: "查詢失敗", details: {}, fields: [] } }, 500) : json({ ...overview, items: [], total: 0 });
      return new Promise<Response>((done) => { resolve = done; });
    });
    expect(screen.getByLabelText("載入庫存資料")).toBeTruthy();
    await act(async () => resolve(json(overview)));
    await screen.findByRole("link", { name: "查看批次：雞胸肉" });
    fireEvent.change(screen.getByRole("textbox", { name: "食材名稱" }), { target: { value: "無結果" } });
    await screen.findByText("查詢失敗");
    expect(screen.queryByText("實體量：9.000 kg")).toBeNull();
    failed = false;
    fireEvent.click(screen.getByRole("button", { name: "重試查詢" }));
    expect(await screen.findByText("沒有符合條件的食材")).toBeTruthy();
  });
  it("keeps depleted and reversed history and links to the existing receipt detail", async () => {
    const { router } = renderPage("/inventory/5/batches", (url) => url.includes("/5/batches?") ? json({ ...batchList, items: [{ ...batch, is_depleted: true, remaining_quantity: "0.000", receipt_status: "REVERSED" }] }) : undefined);
    expect(await screen.findByText("已耗盡")).toBeTruthy();
    expect(screen.getByText("來源已沖銷")).toBeTruthy();
    expect(screen.queryByText("即期")).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "來源進貨單 GR-00000001" }));
    expect(await screen.findByText("既有進貨明細")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/goods-receipts/1");
  });
  it("paginates quantity and position independently and shows the reversal original", async () => {
    const { router, fetchMock } = renderPage("/inventory/batches/8?tx_page=2&location_page=3&batch_page=2", (url) => {
      if (url.includes("/transactions?")) return json({ ...transactionList, total: 60, items: [{ ...transactionList.items[0], type: "REVERSAL", reverses_transaction_id: "4", is_non_fefo: false }] });
      if (url.includes("/location-changes?")) return json({ items: [], total: 60, page: 3, page_size: 20 });
    });
    expect(await screen.findByText("沖銷原紀錄：#4")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/transactions?page=2"))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/location-changes?page=3"))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "數量異動下一頁" }));
    await waitFor(() => expect(new URLSearchParams(router.state.location.search).get("tx_page")).toBe("3"));
    expect(new URLSearchParams(router.state.location.search).get("location_page")).toBe("3");
    expect(new URLSearchParams(router.state.location.search).get("batch_page")).toBe("2");
  });
  it("shows empty histories and an empty batch list", async () => {
    const { router } = renderPage("/inventory/batches/8", (url) => url.includes("/transactions?") || url.includes("/location-changes?") || url.includes("/5/batches?") ? json({ ...batchList, items: [], total: 0 }) : undefined);
    expect(await screen.findByText("沒有數量異動紀錄")).toBeTruthy();
    expect(screen.getByText("沒有位置變更紀錄")).toBeTruthy();
    await act(async () => router.navigate("/inventory/5/batches"));
    expect(await screen.findByText("此食材目前沒有符合條件的批次")).toBeTruthy();
  });
  it("stock invalidation covers all inventory keys", async () => {
    const client = new QueryClient();
    const keys = [queryKeys.inventory.list({}), queryKeys.inventory.batches("5", {}), queryKeys.inventory.batch("8"), queryKeys.inventory.transactions("8", 1), queryKeys.inventory.locationChanges("8", 1), queryKeys.inventory.options("locations")];
    keys.forEach((key) => client.setQueryData(key, { value: true }));
    await invalidateStockQueries(client);
    keys.forEach((key) => expect(client.getQueryState(key)?.isInvalidated).toBe(true));
  });
});

it.each(["ADMIN", "STAFF"])("allows %s to navigate inventory query pages without write actions", async (role) => {
  const { renderApp, admin } = await import("../../../test/renderApp");
  const { fetchMock, router } = renderApp("/", { ...admin, role });
  fetchMock.mockImplementation(async (url: string) => {
    if (url.endsWith("/me")) return json({ ...admin, role });
    if (url.startsWith(`${BASE}/options/`)) return json({ items: [], total: 0, page: 1, page_size: 100 });
    if (url.startsWith(`${BASE}?`)) return json(overview);
    if (url.includes("/5/batches?")) return json(batchList);
    if (url === `${BASE}/batches/8`) return json(batch);
    if (url.includes("/transactions?")) return json(transactionList);
    if (url.includes("/location-changes?")) return json({ items: [], total: 0, page: 1, page_size: 20 });
    return json({ status: "ok", database: "ok" });
  });
  await act(async () => router.navigate("/inventory"));
  fireEvent.click(await screen.findByRole("link", { name: "查看批次：雞胸肉" }));
  fireEvent.click(await screen.findByRole("link", { name: "查看異動：B-00000008" }));
  await screen.findByRole("heading", { name: "數量異動" });
  expect(screen.queryByRole("button", { name: /^(新增|儲存|修改|刪除|領用|報廢)/ })).toBeNull();
});

it("keeps valid batch results while location-name loading fails and recovers", async () => {
  let failing = true;
  renderPage("/inventory/5/batches?location_id=3", (url) => {
    if (url.includes("/options/locations") && failing) return json({ error: { code: "INTERNAL_ERROR", message: "位置讀取失敗", details: {}, fields: [] } }, 500);
  });
  expect(await screen.findByText("無法載入所選位置名稱")).toBeTruthy();
  expect(await screen.findByRole("link", { name: "查看異動：B-00000008" })).toBeTruthy();
  expect(screen.getByText("僅顯示所選儲存位置的批次。")).toBeTruthy();
  failing = false;
  fireEvent.click(screen.getByRole("button", { name: "重試位置名稱" }));
  expect(await screen.findByText("僅顯示冷藏庫 A的批次。")).toBeTruthy();
  await waitFor(() => expect(screen.queryByText("無法載入所選位置名稱")).toBeNull());
});

it("fetches historical options beyond 100 entries and sends the selected second-page ID", async () => {
  const { fetchMock } = renderPage("/inventory", (url) => {
    if (!url.includes("/options/categories?")) return undefined;
    const page = new URL(url, "http://localhost").searchParams.get("page");
    const items = page === "1" ? Array.from({ length: 100 }, (_, index) => ({ id: String(index + 1), name: `分類 ${index + 1}`, is_active: true })) : [{ id: "101", name: "第二頁分類", is_active: false }];
    return json({ items, total: 101, page: Number(page), page_size: 100 });
  });
  await choose("分類", "第二頁分類（停用）");
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.startsWith(`${BASE}?`) && url.includes("category_id=101"))).toBe(true));
  expect(fetchMock.mock.calls.some(([url]) => url.includes("/options/categories?page=2&page_size=100"))).toBe(true);
});

it("names filter-clear controls by field", async () => {
  const { router } = renderPage("/inventory?category_id=2&storage_method=REFRIGERATED&location_id=3&status=EXPIRED");
  await screen.findByRole("link", { name: "查看批次：雞胸肉" });
  for (const [label, key] of [["分類", "category_id"], ["保存方式", "storage_method"], ["儲存位置", "location_id"], ["庫存狀態", "status"]]) {
    const control = screen.getByRole("button", { name: `清除${label}篩選` });
    expect(control.getAttribute("aria-hidden")).toBe("false");
    fireEvent.click(control);
    await waitFor(() => expect(new URLSearchParams(router.state.location.search).has(key)).toBe(false));
  }
});

it("preserves exact BIGINT response strings in inventory, batch-history and receipt navigation", async () => {
  const ingredientId = "9007199254740993";
  const batchId = "9007199254740995";
  const receiptId = "9007199254740997";
  const { router, fetchMock } = renderPage("/inventory", (url) => {
    if (url.startsWith(`${BASE}?`)) return json({ ...overview, items: [{ ...stock, ingredient_id: ingredientId }] });
    if (url.startsWith(`${BASE}/${ingredientId}/batches?`)) return json({ ...batchList, ingredient_id: ingredientId, items: [{ ...batch, id: batchId, ingredient_id: ingredientId, receipt_id: receiptId }] });
    if (url === `${BASE}/batches/${batchId}`) return json({ ...batch, id: batchId, ingredient_id: ingredientId, receipt_id: receiptId });
    if (url.includes(`/batches/${batchId}/`)) return json({ items: [], total: 0, page: 1, page_size: 20 });
  });
  const batches = await screen.findByRole("link", { name: "查看批次：雞胸肉" });
  expect(batches.getAttribute("href")).toBe(`/inventory/${ingredientId}/batches`);
  fireEvent.click(batches);
  const history = await screen.findByRole("link", { name: "查看異動：B-00000008" });
  expect(history.getAttribute("href")).toBe(`/inventory/batches/${batchId}`);
  fireEvent.click(history);
  const source = await screen.findByRole("link", { name: "來源進貨單 GR-00000001" });
  expect(source.getAttribute("href")).toBe(`/goods-receipts/${receiptId}`);
  expect(fetchMock.mock.calls.some(([url]) => url === `${BASE}/batches/${batchId}`)).toBe(true);
  fireEvent.click(source);
  expect(router.state.location.pathname).toBe(`/goods-receipts/${receiptId}`);
});

it("roundtrips nondefault overview, batch, quantity and location pages", async () => {
  const { router } = renderPage("/inventory?search=雞&page=2&category_id=2&location_id=3", (url) => {
    if (url.startsWith(`${BASE}?`)) return json({ ...overview, total: 80 });
    if (url.includes("/5/batches?")) return json({ ...batchList, total: 80 });
    if (url.includes("/transactions?")) return json({ ...transactionList, total: 100 });
    if (url.includes("/location-changes?")) return json({ items: [], total: 100, page: 1, page_size: 20 });
  });
  fireEvent.click(await screen.findByRole("link", { name: "查看批次：雞胸肉" }));
  fireEvent.click(await screen.findByRole("button", { name: "食材批次第 3 頁" }));
  fireEvent.click(await screen.findByRole("link", { name: "查看異動：B-00000008" }));
  fireEvent.click(await screen.findByRole("button", { name: "數量異動第 4 頁" }));
  fireEvent.click(screen.getByRole("button", { name: "位置變更第 5 頁" }));
  fireEvent.click(screen.getByRole("link", { name: "返回食材批次" }));
  await screen.findByRole("link", { name: "查看異動：B-00000008" });
  expect(Object.fromEntries(new URLSearchParams(router.state.location.search))).toEqual({ search: "雞", page: "2", category_id: "2", location_id: "3", batch_page: "3", tx_page: "4", location_page: "5" });
  fireEvent.click(screen.getByRole("link", { name: "返回庫存總覽" }));
  expect(router.state.location.pathname).toBe("/inventory");
  fireEvent.click(await screen.findByRole("link", { name: "查看批次：雞胸肉" }));
  fireEvent.click(await screen.findByRole("link", { name: "查看異動：B-00000008" }));
  expect(new URLSearchParams(router.state.location.search).get("tx_page")).toBe("4");
  expect(new URLSearchParams(router.state.location.search).get("location_page")).toBe("5");
});

it("corrects simultaneous shrinking history totals without overwriting sibling pages or parent filters", async () => {
  let resolveTransactions!: (response: Response) => void;
  let resolveLocations!: (response: Response) => void;
  const { router } = renderPage("/inventory/batches/8?search=雞&category_id=2&location_id=3&page=2&batch_page=3&tx_page=4&location_page=5", (url) => {
    if (url.includes("/transactions?page=4")) return new Promise<Response>((done) => { resolveTransactions = done; });
    if (url.includes("/location-changes?page=5")) return new Promise<Response>((done) => { resolveLocations = done; });
    if (url.includes("/transactions?")) return json({ ...transactionList, total: 25 });
    if (url.includes("/location-changes?")) return json({ items: [], total: 45, page: 3, page_size: 20 });
  });
  await screen.findByRole("heading", { name: "數量異動" });
  await act(async () => {
    resolveTransactions(json({ ...transactionList, items: [], total: 25 }));
    resolveLocations(json({ items: [], total: 45, page: 5, page_size: 20 }));
  });
  await waitFor(() => expect(Object.fromEntries(new URLSearchParams(router.state.location.search))).toEqual({ search: "雞", category_id: "2", location_id: "3", page: "2", batch_page: "3", tx_page: "2", location_page: "3" }));
});
