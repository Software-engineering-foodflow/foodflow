import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { queryKeys } from "../../../shared/api/queryKeys";
import { admin, staff } from "../../../test/renderApp";
import { IngredientCategoriesPage } from "./IngredientCategoriesPage";
import { IngredientsPage } from "./IngredientsPage";
import { SuppliersPage } from "./SuppliersPage";

const category = { id: 1, code: "MEAT", name: "肉類", description: null, is_active: true };
const ingredient = { id: 2, name: "雞肉", category_id: 1, category_name: "肉類", unit: "kg",
  storage_method: "REFRIGERATED", safety_stock_quantity: "2.500", is_active: true };
const supplier = { id: 3, name: "青田", contact_person: "小王", phone: null, other_contact: null, is_active: true };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const list = (items: unknown[]) => ({ items, total: items.length, page: 1, page_size: 20 });
type Handler = (url: string, init: RequestInit) => Response | Promise<Response> | undefined;

beforeAll(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); });

function setup(resource = "ingredient-categories", employee = admin, handler: Handler = () => undefined) {
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    if (url.endsWith("/auth/me")) return json(employee);
    const handled = handler(url, init);
    if (handled) return await handled;
    return json(list(url.includes("/ingredient-categories") ? [category] : url.includes("/ingredients") ? [ingredient] : [supplier]));
  });
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(queryKeys.auth.all, employee);
  client.setQueryData(queryKeys.inventory.all, { cached: true });
  const Page = resource === "ingredients" ? IngredientsPage : resource === "suppliers" ? SuppliersPage : IngredientCategoriesPage;
  render(<MantineProvider env="test"><QueryClientProvider client={client}><MemoryRouter><Page /></MemoryRouter></QueryClientProvider></MantineProvider>);
  return { client, fetchMock };
}

describe("master data", () => {
  it.each([["ingredient-categories", "肉類"], ["ingredients", "雞肉"], ["suppliers", "青田"]])("staff can browse %s without maintenance actions", async (resource, name) => {
    setup(resource, staff);
    expect(await screen.findByText(name)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^新增/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^編輯/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^刪除/ })).toBeNull();
  });

  it("creates a category and invalidates stock caches", async () => {
    let sent: unknown;
    const { client } = setup("ingredient-categories", admin, (_, init) => {
      if (init.method === "POST") { sent = JSON.parse(String(init.body)); return json({ ...category, name: "蔬菜", code: "VEG" }, 201); }
    });
    fireEvent.click(await screen.findByRole("button", { name: "新增分類" }));
    const dialog = within(await screen.findByRole("dialog"));
    fireEvent.change(dialog.getByLabelText("名稱（必填）"), { target: { value: " 蔬菜 " } });
    fireEvent.change(dialog.getByLabelText("分類代碼（必填）"), { target: { value: " VEG " } });
    fireEvent.click(dialog.getByRole("button", { name: "儲存" }));
    expect(await screen.findByText("蔬菜 已建立")).toBeTruthy();
    expect(sent).toEqual({ name: "蔬菜", code: "VEG", description: null });
    expect(client.getQueryState(queryKeys.inventory.all)?.isInvalidated).toBe(true);
    expect(screen.getByRole("button", { name: "關閉通知" }).style.getPropertyValue("--cb-size")).toContain("2.75rem");
  });

  it("keeps duplicate values and maps backend fields", async () => {
    setup("ingredient-categories", admin, (_, init) => init.method === "POST" ? json({ error: {
      code: "DUPLICATE", message: "分類代碼已存在", fields: [{ field: "code", message: "請更換分類代碼" }], details: {},
    } }, 409) : undefined);
    fireEvent.click(await screen.findByRole("button", { name: "新增分類" }));
    const dialog = within(await screen.findByRole("dialog"));
    fireEvent.change(dialog.getByLabelText("名稱（必填）"), { target: { value: "新分類" } });
    fireEvent.change(dialog.getByLabelText("分類代碼（必填）"), { target: { value: "MEAT" } });
    fireEvent.click(dialog.getByRole("button", { name: "儲存" }));
    expect(await dialog.findByText("請更換分類代碼")).toBeTruthy();
    expect((dialog.getByLabelText("名稱（必填）") as HTMLInputElement).value).toBe("新分類");
    expect(screen.queryByText(/已建立/)).toBeNull();
  });

  it("requires named deactivation confirmation and refreshes stock", async () => {
    let sent: { is_active?: boolean } = {};
    const { client } = setup("ingredients", admin, (_, init) => {
      if (init.method === "PATCH") { sent = JSON.parse(String(init.body)); return json({ ...ingredient, is_active: false }); }
    });
    fireEvent.click(await screen.findByRole("button", { name: "編輯 雞肉" }));
    const dialog = within(await screen.findByRole("dialog"));
    fireEvent.click(dialog.getByRole("button", { name: "停用" }));
    const confirm = within(await screen.findByRole("dialog", { name: "停用 雞肉？" }));
    expect(confirm.getByText("停用後不能用於新進貨，既有庫存仍可領用、報廢與查詢。")).toBeTruthy();
    fireEvent.click(confirm.getByRole("button", { name: "確認停用" }));
    expect(await screen.findByText("雞肉 已更新")).toBeTruthy();
    expect(sent.is_active).toBe(false);
    expect(client.getQueryState(queryKeys.inventory.all)?.isInvalidated).toBe(true);
  });

  it("keeps a referenced delete dialog open", async () => {
    setup("suppliers", admin, (_, init) => init.method === "DELETE" ? json({ error: {
      code: "REFERENCED", message: "供應商已有進貨紀錄", fields: [], details: {},
    } }, 409) : undefined);
    fireEvent.click(await screen.findByRole("button", { name: "刪除 青田" }));
    const dialog = within(await screen.findByRole("dialog", { name: "刪除 青田？" }));
    fireEvent.click(dialog.getByRole("button", { name: "確認刪除" }));
    expect(await dialog.findByText("供應商已有進貨紀錄")).toBeTruthy();
  });

  it("loads every active category page for ingredient selection", async () => {
    const { fetchMock } = setup("ingredients", admin, (url) => {
      if (url.includes("/ingredient-categories?is_active=true")) {
        return json({ items: url.includes("page=2") ? [{ ...category, id: 101, name: "第101分類" }] :
          Array.from({ length: 100 }, (_, i) => ({ ...category, id: i + 1, name: `分類${i + 1}` })), total: 101, page: url.includes("page=2") ? 2 : 1, page_size: 100 });
      }
    });
    fireEvent.click(await screen.findByRole("button", { name: "新增食材" }));
    const dialog = within(await screen.findByRole("dialog"));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes("is_active=true&page_size=100&page=2"))).toBe(true));
    fireEvent.click(dialog.getByRole("combobox", { name: "分類（必填）" }));
    expect(await screen.findByRole("option", { name: "第101分類" })).toBeTruthy();
  });

  it("keeps a saving form open when Escape is pressed", async () => {
    let resolveSave!: (response: Response) => void;
    setup("ingredient-categories", admin, (_, init) => init.method === "POST"
      ? new Promise<Response>(resolve => { resolveSave = resolve; }) : undefined);
    fireEvent.click(await screen.findByRole("button", { name: "新增分類" }));
    const modal = await screen.findByRole("dialog");
    const dialog = within(modal);
    fireEvent.change(dialog.getByLabelText("名稱（必填）"), { target: { value: "新分類" } });
    fireEvent.change(dialog.getByLabelText("分類代碼（必填）"), { target: { value: "NEW" } });
    fireEvent.click(dialog.getByRole("button", { name: "儲存" }));
    await waitFor(() => expect(dialog.queryByRole("button", { name: "Close modal" })).toBeNull());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBe(modal);
    resolveSave(json({ ...category, name: "新分類", code: "NEW" }, 201));
    expect(await screen.findByText("新分類 已建立")).toBeTruthy();
  });

  it("shows a loading skeleton, supports retry and distinguishes filtered empty results", async () => {
    let resolveList!: (response: Response) => void;
    let first = true;
    setup("ingredient-categories", admin, () => {
      if (first) { first = false; return new Promise<Response>(resolve => { resolveList = resolve; }); }
      return json(list([]));
    });
    expect(screen.getByRole("status", { name: "載入分類中" })).toBeTruthy();
    resolveList(json({ error: { code: "INTERNAL_ERROR", message: "暫時無法查詢", fields: [], details: {} } }, 500));
    expect(await screen.findByText("暫時無法查詢")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "重試" }));
    expect(await screen.findByText("還沒有分類")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("搜尋代碼或名稱"), { target: { value: "不存在" } });
    expect(await screen.findByText("沒有符合條件的分類")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "清除篩選" })[0]);
    expect(await screen.findByText("還沒有分類")).toBeTruthy();
  });

  it("sends the selected page and resets paging on search", async () => {
    const { fetchMock } = setup("ingredient-categories", admin, () => json({ ...list([category]), total: 21 }));
    await screen.findByText("肉類");
    expect(screen.getByRole("button", { name: "上一頁" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "下一頁" })).toBeTruthy();
    for (const control of within(screen.getByLabelText("分類分頁")).getAllByRole("button")) {
      expect(control.style.minWidth).toBe("44px");
      expect(control.style.height).toBe("44px");
    }
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes("page=2"))).toBe(true));
    fireEvent.change(screen.getByLabelText("搜尋代碼或名稱"), { target: { value: " 肉 " } });
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes("page=1") && url.includes("search=%E8%82%89"))).toBe(true));
  });

  it("creates a supplier with a contact method and refreshes receipt options", async () => {
    let sent: unknown;
    const { client } = setup("suppliers", admin, (_, init) => {
      if (init.method === "POST") { sent = JSON.parse(String(init.body)); return json(supplier, 201); }
    });
    client.setQueryData(queryKeys.goodsReceipt.all, { cached: true });
    fireEvent.click(await screen.findByRole("button", { name: "新增供應商" }));
    const dialog = within(await screen.findByRole("dialog"));
    fireEvent.change(dialog.getByLabelText("名稱（必填）"), { target: { value: "青田" } });
    fireEvent.change(dialog.getByLabelText("電話"), { target: { value: " 02-12345678 " } });
    fireEvent.click(dialog.getByRole("button", { name: "儲存" }));
    expect(await screen.findByText("青田 已建立")).toBeTruthy();
    expect(sent).toEqual({ name: "青田", phone: "02-12345678", contact_person: null, other_contact: null });
    expect(client.getQueryState(queryKeys.goodsReceipt.all)?.isInvalidated).toBe(true);
  });

  it("returns to an available page after a background refresh removes the last page", async () => {
    let shrunk = false;
    const { client, fetchMock } = setup("ingredient-categories", admin, url => {
      const page = new URL(url, "http://test").searchParams.get("page");
      return json({ items: page === "2" ? (shrunk ? [] : [{ ...category, name: "末頁分類" }]) : [{ ...category, name: "留存分類" }],
        total: shrunk ? 1 : 21, page: Number(page), page_size: 20 });
    });
    await screen.findByText("留存分類");
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    await screen.findByText("末頁分類");
    shrunk = true;
    await client.invalidateQueries({ queryKey: queryKeys.masterData.all });
    expect(await screen.findByText("留存分類")).toBeTruthy();
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.includes("page=1")).length).toBeGreaterThan(1));
    expect(screen.queryByText("還沒有分類")).toBeNull();
  });

  it.each([["create", "12.345"], ["edit", "4.567"], ["create", ""]])(
    "serializes ingredient %s quantity %s and renders the saved response",
    async (action, quantity) => {
      let saved = { ...ingredient };
      let sent: Record<string, unknown> = {};
      setup("ingredients", admin, (url, init) => {
        if (init.method === "POST" || init.method === "PATCH") {
          sent = JSON.parse(String(init.body));
          saved = { ...saved, name: String(sent.name), category_id: Number(sent.category_id),
            unit: String(sent.unit), storage_method: String(sent.storage_method),
            safety_stock_quantity: String(sent.safety_stock_quantity || "0.000") };
          return json(saved, init.method === "POST" ? 201 : 200);
        }
        if (url.includes("/ingredients?")) return json(list([saved]));
      });
      fireEvent.click(await screen.findByRole("button", { name: action === "create" ? "新增食材" : "編輯 雞肉" }));
      const dialog = within(await screen.findByRole("dialog"));
      for (const label of ["名稱（必填）", "分類（必填）", "庫存單位（必填）", "保存方式（必填）"]) {
        expect(dialog.getByLabelText(label, { selector: "input" }).getAttribute("aria-required")).toBe("true");
      }
      fireEvent.change(dialog.getByLabelText("名稱（必填）"), { target: { value: " 測試食材 " } });
      fireEvent.change(dialog.getByLabelText("庫存單位（必填）"), { target: { value: " kg " } });
      if (action === "create") {
        fireEvent.click(dialog.getByRole("combobox", { name: "分類（必填）" }));
        fireEvent.click(await screen.findByRole("option", { name: "肉類" }));
        fireEvent.click(dialog.getByRole("combobox", { name: "保存方式（必填）" }));
        fireEvent.click(await screen.findByRole("option", { name: "冷藏" }));
      }
      if (quantity) fireEvent.change(dialog.getByLabelText("安全庫存量"), { target: { value: quantity } });
      fireEvent.click(dialog.getByRole("button", { name: "儲存" }));
      expect(await screen.findByText(`測試食材 已${action === "create" ? "建立" : "更新"}`)).toBeTruthy();
      expect(sent).toEqual({ name: "測試食材", category_id: 1, unit: "kg", storage_method: "REFRIGERATED",
        safety_stock_quantity: quantity, ...(action === "edit" ? { is_active: true } : {}) });
      expect(await screen.findByText(quantity || "0.000")).toBeTruthy();
    },
  );

  it("preserves the entered quantity when the backend rejects its precision", async () => {
    setup("ingredients", admin, (_, init) => init.method === "PATCH" ? json({ error: {
      code: "VALIDATION_ERROR", message: "輸入資料有誤", details: {},
      fields: [{ field: "safety_stock_quantity", message: "小數最多三位" }],
    } }, 422) : undefined);
    fireEvent.click(await screen.findByRole("button", { name: "編輯 雞肉" }));
    const dialog = within(await screen.findByRole("dialog"));
    fireEvent.change(dialog.getByLabelText("安全庫存量"), { target: { value: "1.2345" } });
    fireEvent.click(dialog.getByRole("button", { name: "儲存" }));
    expect(await dialog.findByText("小數最多三位")).toBeTruthy();
    expect((dialog.getByLabelText("安全庫存量") as HTMLInputElement).value).toBe("1.2345");
  });

  it("labels the immediately applied filter dialog action as close", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("max-width"),
      media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }));
    const { fetchMock } = setup();
    fireEvent.click(await screen.findByRole("button", { name: "篩選" }));
    const dialog = within(await screen.findByRole("dialog", { name: "篩選" }));
    fireEvent.click(dialog.getByRole("combobox", { name: "狀態" }));
    fireEvent.click(await screen.findByRole("option", { name: "啟用" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes("is_active=true"))).toBe(true));
    fireEvent.click(dialog.getByRole("button", { name: "關閉篩選" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
