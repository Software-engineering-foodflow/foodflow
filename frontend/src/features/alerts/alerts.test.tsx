import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { expect, it, vi } from "vitest";
import { AlertsPage } from "./pages/AlertsPage";

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { value: vi.fn(), configurable: true });

const expired = { status: "EXPIRED", ingredient_id: 1, ingredient_name: "鮮奶", unit: "L",
  batch_id: 9, batch_number: "B-9", location_id: 1, location_name: "冷藏庫",
  remaining_quantity: "2.125", expiry_date: "2026-11-08", days_until_expiry: -1,
  actions: [{ type: "WASTE", ingredient_id: 1, batch_id: 9, quantity: "2.125", reason: "EXPIRED" }] };
const low = { status: "LOW_STOCK", ingredient_id: 2, ingredient_name: "雞蛋", unit: "顆",
  store_available_quantity: "0.000", safety_stock_quantity: "5.000", shortfall: "5.000",
  location_available_quantity: "0.000", actions: [{ type: "CREATE_GOODS_RECEIPT", ingredient_id: 2 }] };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
function mount(role = "STAFF", override?: (url: string, options?: RequestInit) => Promise<Response>) {
  const fetch = vi.fn(async (url: string, options?: RequestInit) => {
    if (override) return override(url, options);
    if (url.includes("/auth/me")) return json({ id: 1, name: "員工", role });
    if (url.includes("/storage-locations")) return json({ items: [{ id: 1, name: "冷藏庫" }], total: 1 });
    if (url.includes("/alert-settings")) return json({ id: 1, warning_days: 3, updated_at: "2026-11-09T00:00:00Z" });
    return json({ items: url.includes("status=LOW_STOCK") ? [low] : [expired, low],
      generated_at: "2026-11-09T01:02:03Z", warning_days: 3 });
  });
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<MantineProvider env="test"><QueryClientProvider client={client}>
    <MemoryRouter><AlertsPage /></MemoryRouter>
  </QueryClientProvider></MantineProvider>);
  return { fetch, client };
}

it("顯示後端量、狀態、時間及補貨連結，員工沒有設定入口且過期沒有領用", async () => {
  mount();
  await screen.findByText("鮮奶");
  expect(screen.getByText(/2.125 L/)).toBeTruthy();
  expect(screen.getByText(/2026\/11\/9/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "預警設定" })).toBeNull();
  expect(screen.queryByRole("link", { name: /領用/ })).toBeNull();
  expect(screen.getByRole("link", { name: "建立進貨單 雞蛋" }).getAttribute("href"))
    .toBe("/goods-receipts/new?ingredient_id=2");
});

it("狀態篩選送後端並顯示篩選後清單", async () => {
  const { fetch } = mount();
  await screen.findByText("鮮奶");
  fireEvent.click(screen.getByRole("combobox", { name: "預警狀態" }));
  fireEvent.click(screen.getByRole("option", { name: "低庫存" }));
  await waitFor(() => expect(fetch.mock.calls.some(([url]) => url.includes("status=LOW_STOCK"))).toBe(true));
  await waitFor(() => expect(screen.queryByText("鮮奶")).toBeNull());
});

it("管理者設定遇到422保留輸入與欄位錯誤", async () => {
  mount("ADMIN", async (url, options) => {
    if (url.includes("/auth/me")) return json({ id: 1, role: "ADMIN" });
    if (url.includes("/storage-locations")) return json({ items: [], total: 0 });
    if (options?.method === "PATCH") return json({ error: { code: "VALIDATION_ERROR", message: "輸入資料有誤",
      details: {}, fields: [{ field: "warning_days", message: "須為非負整數" }] } }, 422);
    if (url.includes("/alert-settings")) return json({ id: 1, warning_days: 3 });
    return json({ items: [], generated_at: "2026-11-09T01:02:03Z", warning_days: 3 });
  });
  fireEvent.click(await screen.findByRole("button", { name: "預警設定" }));
  const input = await screen.findByLabelText("提前預警天數");
  fireEvent.change(input, { target: { value: "8" } });
  fireEvent.click(screen.getByRole("button", { name: "儲存設定" }));
  await screen.findByText("須為非負整數");
  expect((input as HTMLInputElement).value).toBe("8");
});

it("過期全數報廢使用預警快照，失敗保留錯誤且不顯示完成", async () => {
  const { fetch } = mount("STAFF", async (url, options) => {
    if (url.includes("/auth/me")) return json({ id: 1, role: "STAFF" });
    if (url.includes("/storage-locations")) return json({ items: [], total: 0 });
    if (options?.method === "POST") return json({ error: { code: "INSUFFICIENT_STOCK", message: "庫存已變更",
      details: { remaining_quantity: "1.000" }, fields: [] } }, 409);
    return json({ items: [expired], generated_at: "2026-11-09T01:02:03Z", warning_days: 3 });
  });
  fireEvent.click(await screen.findByRole("button", { name: "全數報廢 鮮奶 B-9" }));
  expect(screen.getByText("本次核對數量：2.125 L")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "確認報廢" }));
  await screen.findByText(/庫存已變更/);
  expect(screen.queryByText("全數報廢已完成")).toBeNull();
  const submitted = fetch.mock.calls.find(([, options]) => options?.method === "POST");
  expect(JSON.parse(submitted?.[1]?.body as string)).toMatchObject({ batch_id: 9, quantity: "2.125", reason: "EXPIRED" });
});

it("報廢成功移除預警並使用重查的伺服器時間", async () => {
  let removed = false;
  const { client } = mount("STAFF", async (url, options) => {
    if (url.includes("/auth/me")) return json({ id: 1, role: "STAFF" });
    if (url.includes("/storage-locations")) return json({ items: [], total: 0 });
    if (options?.method === "POST") { removed = true; return json({ id: 1 }); }
    return json({ items: removed ? [] : [expired], generated_at: removed ? "2026-11-09T02:03:04Z" : "2026-11-09T01:02:03Z", warning_days: 3 });
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  fireEvent.click(await screen.findByRole("button", { name: "全數報廢 鮮奶 B-9" }));
  fireEvent.click(screen.getByRole("button", { name: "確認報廢" }));
  await screen.findByText("全數報廢已完成");
  await screen.findByText("目前沒有需要處理的食材");
  expect(screen.queryByText("鮮奶")).toBeNull();
  expect(screen.getByText(/10:03:04/)).toBeTruthy();
  expect(invalidate.mock.calls.some(([options]) => options?.queryKey?.[0] === "inventory")).toBe(true);
});

it("設定快取存在但重查失敗時不能按鈕或表單提交", async () => {
  let failRefresh = false;
  const { fetch } = mount("ADMIN", async (url) => {
    if (url.includes("/auth/me")) return json({ id: 1, role: "ADMIN" });
    if (url.includes("/storage-locations")) return json({ items: [], total: 0 });
    if (url.includes("/alert-settings")) {
      if (failRefresh) return json({ error: { code: "INTERNAL_ERROR", message: "讀取失敗", details: {}, fields: [] } }, 500);
      return json({ id: 1, warning_days: 3 });
    }
    return json({ items: [], generated_at: "2026-11-09T01:02:03Z", warning_days: 3 });
  });
  fireEvent.click(await screen.findByRole("button", { name: "預警設定" }));
  await screen.findByLabelText("提前預警天數");
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  failRefresh = true;
  fireEvent.click(screen.getByRole("button", { name: "預警設定" }));
  await screen.findByText("無法載入設定");
  expect(screen.queryByLabelText("提前預警天數")).toBeNull();
  const save = screen.getByRole("button", { name: "儲存設定" });
  expect((save as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(save);
  fireEvent.submit(save.closest("form")!);
  expect(fetch.mock.calls.filter(([, options]) => options?.method === "PATCH")).toHaveLength(0);
});

it("設定儲存0後關框、失效庫存查詢並移除即期及更新伺服器時間", async () => {
  let warningDays = 3;
  const soon = { ...expired, ingredient_id: 3, ingredient_name: "豆腐", batch_id: 10, batch_number: "B-10",
    status: "EXPIRING_SOON", days_until_expiry: 2, actions: [{ type: "ISSUE", ingredient_id: 3, batch_id: 10 }] };
  const { fetch, client } = mount("ADMIN", async (url, options) => {
    if (url.includes("/auth/me")) return json({ id: 1, role: "ADMIN" });
    if (url.includes("/storage-locations")) return json({ items: [], total: 0 });
    if (url.includes("/alert-settings")) {
      if (options?.method === "PATCH") warningDays = JSON.parse(options.body as string).warning_days;
      return json({ id: 1, warning_days: warningDays });
    }
    return json({ items: warningDays === 0 ? [] : [soon], warning_days: warningDays,
      generated_at: warningDays === 0 ? "2026-11-09T03:04:05Z" : "2026-11-09T01:02:03Z" });
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  await screen.findByRole("link", { name: "領用 豆腐 B-10" });
  fireEvent.click(screen.getByRole("button", { name: "預警設定" }));
  fireEvent.change(await screen.findByLabelText("提前預警天數"), { target: { value: "0" } });
  fireEvent.click(screen.getByRole("button", { name: "儲存設定" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await screen.findByText("目前沒有需要處理的食材");
  expect(screen.queryByText("豆腐")).toBeNull();
  expect(screen.getByText(/11:04:05/)).toBeTruthy();
  const patch = fetch.mock.calls.find(([, options]) => options?.method === "PATCH");
  expect(JSON.parse(patch?.[1]?.body as string)).toEqual({ warning_days: 0 });
  expect(invalidate.mock.calls.some(([options]) => options?.queryKey?.[0] === "inventory")).toBe(true);
});

it("位置篩選送location_id、區分全店與位置量，清除後恢復全清單", async () => {
  const locationLow = { ...low, store_available_quantity: "4.000", location_available_quantity: "1.000", shortfall: "1.000" };
  const { fetch } = mount("STAFF", async (url) => {
    if (url.includes("/auth/me")) return json({ id: 1, role: "STAFF" });
    if (url.includes("/storage-locations")) return json({ items: [{ id: 1, name: "冷藏庫" }, { id: 2, name: "備料冰箱" }], total: 2 });
    const selected = new URL(url, "http://localhost").searchParams.get("location_id") === "2";
    return json({ items: selected ? [locationLow] : [expired, low], generated_at: "2026-11-09T01:02:03Z", warning_days: 3 });
  });
  await screen.findByText("鮮奶");
  fireEvent.click(screen.getByRole("combobox", { name: "儲存位置" }));
  fireEvent.click(await screen.findByRole("option", { name: "備料冰箱" }));
  await waitFor(() => expect(fetch.mock.calls.some(([url]) => url.includes("location_id=2"))).toBe(true));
  await screen.findByText("全店可用 4.000 顆");
  expect(screen.getByText("此位置可用 1.000 顆")).toBeTruthy();
  expect(screen.queryByText("鮮奶")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "清除篩選" }));
  await screen.findByText("鮮奶");
  expect(screen.getByText("全店可用 0.000 顆")).toBeTruthy();
  expect(screen.queryByText("此位置可用 1.000 顆")).toBeNull();
  expect((screen.getByRole("combobox", { name: "儲存位置" }) as HTMLInputElement).value).toBe("全部位置");
});
