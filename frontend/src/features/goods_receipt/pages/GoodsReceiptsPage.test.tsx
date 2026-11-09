import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { queryKeys } from "../../../shared/api/queryKeys";
import type { Draft, Receipt } from "../api";
import { GoodsReceiptsPage } from "./GoodsReceiptsPage";

const BASE = "/api/v1/goods-receipts";
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const draft: Receipt = { id: 1, receipt_number: "GR-00000001", supplier_id: 1, supplier_name: "青田供應商",
  receipt_date: "2026-11-06", status: "DRAFT", created_by_id: 2, created_by_name: "員工",
  created_at: "2026-11-06T02:00:00Z", confirmed_at: null,
  items: [{ id: 11, ingredient_id: 5, ingredient_name: "雞胸肉", unit: "kg", quantity: "2.125",
    unit_price: "0.00", expiry_date: "2026-11-20", location_id: 3, location_name: "冷藏庫 A", note: null }] };
const options = { suppliers: [{ id: 1, name: "青田供應商" }], ingredients: [{ id: 5, name: "雞胸肉", unit: "kg" }],
  locations: [{ id: 3, name: "冷藏庫 A", code: "R-01" }] };
type Handler = (path: string, init: RequestInit) => Response | Promise<Response> | undefined;

function renderPage(path: string, handler: Handler = () => undefined, initial: Receipt = draft) {
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const custom = handler(url, init);
    if (custom) return custom;
    const kind = Object.keys(options).find((kind) => url.startsWith(`${BASE}/options/${kind}?`)) as keyof typeof options | undefined;
    if (kind) return json({ items: options[kind], total: options[kind].length, page: 1, page_size: 100 });
    if (url === `${BASE}/1` && (init.method ?? "GET") === "GET") return json(initial);
    return json({ error: { code: "NOT_FOUND", message: "不存在", details: {}, fields: [] } }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  client.setQueryData(queryKeys.inventory.all, { stock: true });
  const router = createMemoryRouter([
    { path: "/goods-receipts", element: <GoodsReceiptsPage /> },
    { path: "/goods-receipts/new", element: <GoodsReceiptsPage /> },
    { path: "/goods-receipts/:receiptId", element: <GoodsReceiptsPage /> },
  ], { initialEntries: [path] });
  render(<MantineProvider env="test"><QueryClientProvider client={client}>
    <RouterProvider router={router} />
  </QueryClientProvider></MantineProvider>);
  return { fetchMock, client, router };
}

async function choose(name: RegExp, option: string, section?: HTMLElement) {
  const scope = section ? within(section) : screen;
  fireEvent.click(scope.getByRole("combobox", { name }));
  fireEvent.click(await screen.findByRole("option", { name: option }));
}
function change(name: RegExp, value: string, section?: HTMLElement) {
  fireEvent.change((section ? within(section) : screen).getByLabelText(name), { target: { value } });
}

describe("GoodsReceiptsPage", () => {
  it("creates two lines, navigates, edits existing ids, confirms and invalidates stock", async () => {
    let stored = structuredClone(draft);
    let posted: Draft | undefined;
    let patched: Draft | undefined;
    const { client, router } = renderPage("/goods-receipts/new", (path, init) => {
      if (path === BASE && init.method === "POST") {
        posted = JSON.parse(String(init.body));
        stored = { ...draft, ...posted!, items: posted!.items.map((item, index) => ({
          ...draft.items[0], ...item, id: 11 + index,
        })) };
        return json(stored, 201);
      }
      if (path === `${BASE}/1` && init.method === "PATCH") {
        patched = JSON.parse(String(init.body));
        stored = { ...stored, ...patched!, items: patched!.items.map((item) => ({ ...draft.items[0], ...item, id: item.id! })) };
        return json(stored);
      }
      if (path.endsWith("/confirm")) {
        stored = { ...stored, status: "CONFIRMED", confirmed_at: "2026-11-06T03:00:00Z" };
        return json(stored);
      }
      if (path === `${BASE}/1`) return json(stored);
    });
    await choose(/^供應商/, "青田供應商");
    change(/^進貨日期/, "2026-11-06");
    await choose(/^食材/, "雞胸肉");
    change(/^數量/, "2.125"); change(/^單價/, "0"); change(/^到期日/, "2026-11-20");
    await choose(/^入庫位置/, "R-01 冷藏庫 A");
    fireEvent.click(screen.getByRole("button", { name: "新增明細" }));
    const second = screen.getByRole("region", { name: "明細 2" });
    await choose(/^食材/, "雞胸肉", second);
    change(/^數量/, "1", second); change(/^到期日/, "2026-11-21", second);
    await choose(/^入庫位置/, "R-01 冷藏庫 A", second);
    fireEvent.click(screen.getByRole("button", { name: "儲存草稿" }));
    expect(await screen.findByText("草稿已建立")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/goods-receipts/1");
    expect(posted?.items).toHaveLength(2);
    expect(posted?.items[0].unit_price).toBe("0");
    expect(posted?.items[1].unit_price).toBeNull();
    change(/^數量/, "4.5", screen.getByRole("region", { name: "明細 1" }));
    fireEvent.click(screen.getByRole("button", { name: "確認入庫" }));
    expect(await screen.findByText("進貨已確認入庫")).toBeTruthy();
    expect(patched?.items.map((item) => item.id)).toEqual([11, 12]);
    expect(patched?.items[0].quantity).toBe("4.5");
    expect(screen.queryByRole("button", { name: "儲存草稿" })).toBeNull();
    expect((screen.getAllByLabelText(/^數量/)[0] as HTMLInputElement).matches(":disabled")).toBe(true);
    await waitFor(() => expect(client.getQueryState(queryKeys.inventory.all)?.isInvalidated).toBe(true));
  }, 15000);

  it("keeps failed input, displays the exact line field, and shows no success", async () => {
    renderPage("/goods-receipts/1", (_, init) => init.method === "PATCH"
      ? json({ error: { code: "VALIDATION_ERROR", message: "數量錯誤", details: {},
        fields: [{ field: "items.0.quantity", message: "數量須大於 0" }] } }, 422) : undefined);
    await screen.findByText("GR-00000001");
    change(/^數量/, "0"); change(/^備註/, "保留這段備註");
    fireEvent.click(screen.getByRole("button", { name: "儲存草稿" }));
    expect(await screen.findByText("數量須大於 0")).toBeTruthy();
    expect((screen.getByLabelText(/^數量/) as HTMLInputElement).value).toBe("0");
    expect((screen.getByLabelText(/^備註/) as HTMLTextAreaElement).value).toBe("保留這段備註");
    expect(screen.queryByText("草稿已儲存")).toBeNull();
  });

  it("blocks duplicate submits while the request is pending", async () => {
    let finish!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { finish = resolve; });
    const { fetchMock } = renderPage("/goods-receipts/1", (_, init) => init.method === "PATCH" ? pending : undefined);
    await screen.findByText("GR-00000001");
    const form = screen.getByRole("button", { name: "儲存草稿" }).closest("form")!;
    fireEvent.submit(form); fireEvent.submit(form);
    await waitFor(() => expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(1));
    expect((screen.getByRole("button", { name: "確認入庫" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { finish(json(draft)); });
    expect(await screen.findByText("草稿已儲存")).toBeTruthy();
  });

  it("prefills ingredient_id even beyond the first option page", async () => {
    const many = Array.from({ length: 100 }, (_, index) => ({ id: index + 1, name: `食材${index + 1}`, unit: "kg" }));
    const { fetchMock } = renderPage("/goods-receipts/new?ingredient_id=101", (path) => {
      if (path.includes("/options/ingredients?")) {
        const page = new URL(path, "http://test").searchParams.get("page");
        return json({ items: page === "1" ? many : [{ id: 101, name: "第101筆食材", unit: "kg" }], total: 101, page: Number(page), page_size: 100 });
      }
    });
    await waitFor(() => expect((screen.getByRole("combobox", { name: /^食材/ }) as HTMLInputElement).value).toBe("第101筆食材"));
    expect(fetchMock.mock.calls.some(([url]) => url.includes("ingredients?page=2"))).toBe(true);
    expect((screen.getByLabelText(/^到期日/) as HTMLInputElement).value).toBe("");
  });

  it("opens a known receipt number without requesting a cross-receipt list", async () => {
    const { router, fetchMock } = renderPage("/goods-receipts");
    change(/^進貨單號/, "GR-00000001");
    fireEvent.click(screen.getByRole("button", { name: "開啟進貨單" }));
    expect(await screen.findByText("GR-00000001")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/goods-receipts/1");
    expect(fetchMock.mock.calls.some(([path]) => path === BASE)).toBe(false);
  });

  it("shows confirmed receipts and disabled references as read only", async () => {
    const { fetchMock } = renderPage("/goods-receipts/1", (path) => path.includes("/options/")
      ? json({ items: [], total: 0, page: 1, page_size: 100 }) : undefined,
    { ...draft, status: "CONFIRMED", confirmed_at: "2026-11-06T03:00:00Z" });
    expect(await screen.findByText("此單為唯讀。")).toBeTruthy();
    await waitFor(() => expect((screen.getByRole("combobox", { name: /^供應商/ }) as HTMLInputElement).value).toBe("青田供應商（已停用）"));
    expect((screen.getByRole("combobox", { name: /^食材/ }) as HTMLInputElement).matches(":disabled")).toBe(true);
    expect(screen.queryByRole("button", { name: "確認入庫" })).toBeNull();
    expect(screen.queryByRole("button", { name: "刪除草稿" })).toBeNull();
    expect(screen.getByText("確認時間：2026/11/06 11:00")).toBeTruthy();
    expect(fetchMock.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
  });

  it("retries a lost confirmation after saving edits once with canonical item ids", async () => {
    let attempts = 0;
    let stored = structuredClone(draft);
    let patched: Draft | undefined;
    const { fetchMock } = renderPage("/goods-receipts/1", (path, init) => {
      if (init.method === "PATCH") {
        patched = JSON.parse(String(init.body));
        stored = { ...stored, items: patched!.items.map((item) => ({ ...draft.items[0], ...item, id: item.id ?? 12 })) };
        return json(stored);
      }
      if (path.endsWith("/confirm")) {
        attempts += 1;
        stored = { ...stored, status: "CONFIRMED", confirmed_at: "2026-11-06T03:00:00Z" };
        if (attempts === 1) return Promise.reject(new TypeError("connection lost"));
        return json(stored);
      }
    });
    await screen.findByText("GR-00000001");
    change(/^數量/, "7.125");
    fireEvent.click(screen.getByRole("button", { name: "新增明細" }));
    await choose(/^食材/, "雞胸肉", screen.getByRole("region", { name: "明細 2" }));
    fireEvent.click(screen.getByRole("button", { name: "確認入庫" }));
    expect(await screen.findByText("無法連線到伺服器，請確認網路後再試")).toBeTruthy();
    expect((within(screen.getByRole("region", { name: "明細 1" })).getByLabelText(/^數量/) as HTMLInputElement).value).toBe("7.125");
    fireEvent.click(screen.getByRole("button", { name: "確認入庫" }));
    expect(await screen.findByText("進貨已確認入庫")).toBeTruthy();
    expect(attempts).toBe(2);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(1);
    expect(patched?.items[0].id).toBe(11);
    expect(stored.items.map((item) => item.id)).toEqual([11, 12]);
  });

  it("clears an existing location to null when saving a draft", async () => {
    let sent: Draft | undefined;
    renderPage("/goods-receipts/1", (_, init) => {
      if (init.method === "PATCH") {
        sent = JSON.parse(String(init.body));
        return json({ ...draft, items: [{ ...draft.items[0], location_id: null, location_name: null }] });
      }
    });
    await screen.findByText("GR-00000001");
    fireEvent.click(await screen.findByRole("button", { name: "清除入庫位置" }));
    fireEvent.click(screen.getByRole("button", { name: "儲存草稿" }));
    expect(await screen.findByText("草稿已儲存")).toBeTruthy();
    expect(sent?.items[0].location_id).toBeNull();
    expect((screen.getByRole("combobox", { name: /^入庫位置/ }) as HTMLInputElement).value).toBe("");
  });

  it("refreshes pristine quantities and line count before confirming the displayed receipt", async () => {
    let stored = structuredClone(draft);
    let confirmed: Receipt | undefined;
    const { client, fetchMock } = renderPage("/goods-receipts/1", (path) => {
      if (path.endsWith("/confirm")) {
        confirmed = structuredClone(stored);
        stored = { ...stored, status: "CONFIRMED" };
        return json(stored);
      }
      if (path === `${BASE}/1`) return json(stored);
    });
    await screen.findByText("GR-00000001");
    stored = { ...draft, items: [{ ...draft.items[0], quantity: "8.500" }, { ...draft.items[0], id: 12, quantity: "3.000" }] };
    await act(async () => { await client.invalidateQueries({ queryKey: queryKeys.goodsReceipt.detail(1) }); });
    expect(screen.getAllByLabelText(/^數量/).map((node) => (node as HTMLInputElement).value)).toEqual(["8.500", "3.000"]);
    fireEvent.click(screen.getByRole("button", { name: "確認入庫" }));
    expect(await screen.findByText("進貨已確認入庫")).toBeTruthy();
    expect(confirmed?.items.map((item) => [item.id, item.quantity])).toEqual([[11, "8.500"], [12, "3.000"]]);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
  });

  it("preserves dirty edits across background refresh and applies canonical saved rows", async () => {
    let stored = structuredClone(draft);
    let sent: Draft | undefined;
    const { client } = renderPage("/goods-receipts/1", (path, init) => {
      if (init.method === "PATCH") {
        sent = JSON.parse(String(init.body));
        stored = { ...draft, items: [{ ...draft.items[0], id: 21, quantity: "6.000" }, { ...draft.items[0], id: 22, quantity: "2.000" }] };
        return json(stored);
      }
      if (path === `${BASE}/1`) return json(stored);
    });
    await screen.findByText("GR-00000001");
    change(/^數量/, "6"); change(/^備註/, "正在編輯");
    stored = { ...draft, items: [] };
    await act(async () => { await client.invalidateQueries({ queryKey: queryKeys.goodsReceipt.detail(1) }); });
    expect((screen.getByLabelText(/^數量/) as HTMLInputElement).value).toBe("6");
    expect((screen.getByLabelText(/^備註/) as HTMLTextAreaElement).value).toBe("正在編輯");
    fireEvent.click(screen.getByRole("button", { name: "儲存草稿" }));
    expect(await screen.findByText("草稿已儲存")).toBeTruthy();
    expect(sent?.items[0].id).toBe(11);
    expect(screen.getAllByLabelText(/^數量/).map((node) => (node as HTMLInputElement).value)).toEqual(["6.000", "2.000"]);
    change(/^備註/, "繼續編輯", screen.getByRole("region", { name: "明細 1" }));
    fireEvent.click(screen.getByRole("button", { name: "儲存草稿" }));
    await waitFor(() => expect(sent?.items.map((item) => item.id)).toEqual([21, 22]));
  });

  it("rejects unsafe direct receipt ids without requesting a rounded id", async () => {
    const { fetchMock } = renderPage("/goods-receipts/9007199254740993");
    expect(await screen.findByText("進貨單號格式錯誤")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["CONFIRMED", "REVERSED"] as const)("replaces dirty values with canonical rows when the remote receipt becomes %s", async (status) => {
    let stored = structuredClone(draft);
    const { client } = renderPage("/goods-receipts/1", (path) => path === `${BASE}/1` ? json(stored) : undefined);
    await screen.findByText("GR-00000001");
    change(/^數量/, "6");
    stored = { ...draft, status, items: [{ ...draft.items[0], quantity: "9.000" }] };
    await act(async () => { await client.invalidateQueries({ queryKey: queryKeys.goodsReceipt.detail(1) }); });
    expect(await screen.findByText("此單為唯讀。")).toBeTruthy();
    await waitFor(() => expect((screen.getByLabelText(/^數量/) as HTMLInputElement).value).toBe("9.000"));
  });

  it("keeps historical names neutral while options load or fail and formats Taipei time", async () => {
    let finish!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { finish = resolve; });
    renderPage("/goods-receipts/1", (path) => path.includes("/options/") ? pending : undefined);
    await screen.findByText("GR-00000001");
    expect((screen.getByRole("combobox", { name: /^供應商/ }) as HTMLInputElement).value).toBe("青田供應商");
    expect(screen.getByText("建立人：員工 · 2026/11/06 10:00")).toBeTruthy();
    await act(async () => { finish(json({ error: { code: "INTERNAL_ERROR", message: "選單失敗", details: {}, fields: [] } }, 500)); });
    expect((screen.getByRole("combobox", { name: /^供應商/ }) as HTMLInputElement).value).toBe("青田供應商");
    expect((screen.getByRole("combobox", { name: /^食材/ }) as HTMLInputElement).value).toBe("雞胸肉");
  });

  it("deletes only after confirming and navigates back after server success", async () => {
    const { fetchMock, router } = renderPage("/goods-receipts/1", (_, init) => init.method === "DELETE"
      ? new Response(null, { status: 204 }) : undefined);
    fireEvent.click(await screen.findByRole("button", { name: "刪除草稿" }));
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "確認刪除" }));
    expect(await screen.findByText("草稿已刪除")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/goods-receipts");
  });
});

describe("FR07 query and reversal", () => {
  const confirmed: Receipt = { ...draft, status: "CONFIRMED", confirmed_at: "2026-11-06T03:00:00Z",
    items: [{ ...draft.items[0], batch_id: 91, batch_number: "B-00000011" }] };
  const admin = { id: 2, name: "店長", role: "ADMIN", is_active: true };

  it("combines URL filters, paginates, resets the page and preserves filters after returning", async () => {
    const { router, fetchMock } = renderPage("/goods-receipts?supplier_id=1&ingredient_id=5&page=2", (path) => {
      if (path.startsWith(`${BASE}?`)) return json({ items: [draft], total: 41, page: 2, page_size: 20 });
    });
    const open = await screen.findByRole("link", { name: "查看 GR-00000001" });
    expect(fetchMock.mock.calls.some(([path]) => path.includes("supplier_id=1") && path.includes("ingredient_id=5") && path.includes("page=2"))).toBe(true);
    expect(fetchMock.mock.calls.filter(([path]) => path.includes("/options/")).every(([path]) => path.includes("include_inactive=true"))).toBe(true);
    fireEvent.click(open);
    await screen.findByRole("button", { name: "確認入庫" });
    fireEvent.click(screen.getByRole("link", { name: "返回進貨" }));
    await screen.findByRole("link", { name: "查看 GR-00000001" });
    expect(router.state.location.search).toContain("page=2");
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    await waitFor(() => expect(router.state.location.search).toContain("page=3"));
    change(/^查詢單號/, "GR-00000001");
    await waitFor(() => expect(router.state.location.search).not.toContain("page="));
    expect(router.state.location.search).toContain("supplier_id=1");
  });

  it("shows empty results and retries a failed query", async () => {
    let failed = true;
    renderPage("/goods-receipts", (path) => path.startsWith(`${BASE}?`)
      ? failed ? json({ error: { code: "INTERNAL_ERROR", message: "查詢失敗", fields: [], details: {} } }, 500)
        : json({ items: [], total: 0, page: 1, page_size: 20 }) : undefined);
    expect(await screen.findByText("查詢失敗")).toBeTruthy();
    failed = false;
    fireEvent.click(screen.getByRole("button", { name: "重試查詢" }));
    expect(await screen.findByText("沒有符合條件的進貨單")).toBeTruthy();
  });

  it("keeps the reason on failure, blocks duplicate requests and shows original reversal information", async () => {
    let stored = confirmed;
    let finish!: (response: Response) => void;
    let attempt = 0;
    const { fetchMock, client } = renderPage("/goods-receipts/1", (path, init) => {
      if (path === "/api/v1/auth/me") return json(admin);
      if (path === `${BASE}/1` && (init.method ?? "GET") === "GET") return json(stored);
      if (path.endsWith("/reverse")) {
        attempt++;
        if (attempt === 1) return json({ error: { code: "RULE_VIOLATION", message: "請以盤點調整處理", fields: [], details: {} } }, 422);
        return new Promise<Response>((resolve) => { finish = resolve; });
      }
    }, confirmed);
    expect(await screen.findByText(/來源批次：B-00000011/)).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "整單沖銷" }));
    expect(within(screen.getByRole("dialog")).getByText("沖銷單據：GR-00000001")).toBeTruthy();
    expect(within(screen.getByRole("dialog")).getByText("共 1 筆明細：雞胸肉 2.125 kg")).toBeTruthy();
    change(/^沖銷原因/, "錯誤入庫");
    fireEvent.click(screen.getByRole("button", { name: "確認沖銷" }));
    expect(await screen.findByText("請以盤點調整處理")).toBeTruthy();
    expect((screen.getByLabelText(/^沖銷原因/) as HTMLTextAreaElement).value).toBe("錯誤入庫");
    const button = screen.getByRole("button", { name: "確認沖銷" });
    fireEvent.click(button); fireEvent.click(button);
    await waitFor(() => expect(fetchMock.mock.calls.filter(([path]) => path.endsWith("/reverse"))).toHaveLength(2));
    stored = { ...confirmed, status: "REVERSED", reversed_at: "2026-11-06T04:00:00Z", reversed_by_name: "店長", reversed_by_id: 2, reversal_reason: "錯誤入庫" };
    await act(async () => finish(json(stored)));
    expect(await screen.findByText("進貨已整單沖銷")).toBeTruthy();
    expect(await screen.findByText("沖銷人：店長")).toBeTruthy();
    expect(screen.getByText("沖銷原因：錯誤入庫")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "整單沖銷" })).toBeNull();
    await waitFor(() => expect(client.getQueryState(queryKeys.inventory.all)?.isInvalidated).toBe(true));
    const sent = fetchMock.mock.calls.find(([path]) => path.endsWith("/reverse"))!;
    expect(JSON.parse(String(sent[1]?.body))).toEqual({ reason: "錯誤入庫" });
  });

  it.each(["STAFF", "ADMIN"])("limits reversal controls by role and state: %s", async (role) => {
    renderPage("/goods-receipts/1", (path) => path === "/api/v1/auth/me" ? json({ ...admin, role }) : undefined,
      role === "ADMIN" ? { ...confirmed, status: "REVERSED", reversed_at: "2026-11-06T04:00:00Z", reversed_by_name: "店長", reversal_reason: "先前沖銷" } : confirmed);
    await screen.findByText("此單為唯讀。");
    expect(screen.queryByRole("button", { name: "整單沖銷" })).toBeNull();
    if (role === "ADMIN") expect(await screen.findByText("沖銷原因：先前沖銷")).toBeTruthy();
  });
});

describe("FR07 review regressions", () => {
  it.each(["1.5", "Infinity", "9007199254740992", "-2", "0"])("normalizes invalid URL page %s", async (page) => {
    const { fetchMock } = renderPage(`/goods-receipts?page=${page}`, (path) => path.startsWith(`${BASE}?`)
      ? json({ items: [], total: 0, page: 1, page_size: 20 }) : undefined);
    await screen.findByText("沒有符合條件的進貨單");
    const request = fetchMock.mock.calls.find(([path]) => path.startsWith(`${BASE}?`))![0];
    expect(new URL(request, "http://test").searchParams.get("page")).toBe("1");
  });

  it("recovers to the last valid page when a deletion reduces the total", async () => {
    let total = 21;
    const { client, router } = renderPage("/goods-receipts?page=2&supplier_id=1", (path) => {
      if (!path.startsWith(`${BASE}?`)) return undefined;
      const page = Number(new URL(path, "http://test").searchParams.get("page"));
      return json({ items: total === 20 && page === 2 ? [] : [draft], total, page, page_size: 20 });
    });
    await screen.findByRole("link", { name: "查看 GR-00000001" });
    total = 20;
    await act(async () => { await client.invalidateQueries({ queryKey: ["goods-receipt", "list"] }); });
    await waitFor(() => expect(router.state.location.search).not.toContain("page="));
    expect(router.state.location.search).toContain("supplier_id=1");
    expect(await screen.findByRole("link", { name: "查看 GR-00000001" })).toBeTruthy();
    expect(screen.queryByText("沒有符合條件的進貨單")).toBeNull();
  });

  it("preserves query context through create, detail, delete and known-number navigation", async () => {
    const search = "supplier_id=1&date_from=2026-11-01";
    const { router } = renderPage(`/goods-receipts?${search}`, (path, init) => {
      if (path.startsWith(`${BASE}?`)) return json({ items: [], total: 0, page: 1, page_size: 20 });
      if (path === BASE && init.method === "POST") return json(draft, 201);
      if (path === `${BASE}/1` && init.method === "DELETE") return new Response(null, { status: 204 });
    });
    fireEvent.click(screen.getByRole("link", { name: "建立進貨草稿" }));
    await screen.findByRole("button", { name: "儲存草稿" });
    expect(router.state.location.search).toBe(`?${search}`);
    fireEvent.click(screen.getByRole("button", { name: "儲存草稿" }));
    await screen.findByRole("button", { name: "刪除草稿" });
    expect(router.state.location.search).toBe(`?${search}`);
    fireEvent.click(screen.getByRole("button", { name: "刪除草稿" }));
    fireEvent.click(await screen.findByRole("button", { name: "確認刪除" }));
    await screen.findByRole("button", { name: "開啟進貨單" });
    expect(router.state.location.search).toBe(`?${search}`);
    change(/^進貨單號/, "GR-00000001");
    fireEvent.click(screen.getByRole("button", { name: "開啟進貨單" }));
    await screen.findByRole("button", { name: "刪除草稿" });
    expect(router.state.location.search).toBe(`?${search}`);
    fireEvent.click(screen.getByRole("link", { name: "返回進貨" }));
    await screen.findByRole("button", { name: "開啟進貨單" });
    expect(router.state.location.search).toBe(`?${search}`);
  });
});
