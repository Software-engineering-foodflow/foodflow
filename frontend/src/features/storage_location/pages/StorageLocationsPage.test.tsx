import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { queryKeys } from "../../../shared/api/queryKeys";
import { admin, staff } from "../../../test/renderApp";
import { StorageLocationsPage } from "./StorageLocationsPage";

const fridge = { id: 1, code: "R-01", name: "冷藏庫 A", storage_type: "REFRIGERATED",
  description: "靠門口", is_active: true, batch_count: 3, nearest_expiry_date: "2026-11-08",
  nearest_expiry_status: "EXPIRES_TODAY", nearest_days_until_expiry: 0 };
const freezer = { ...fridge, id: 2, code: "F-01", name: "冷凍庫 B", storage_type: "FROZEN",
  description: null, batch_count: 0, nearest_expiry_date: null, nearest_expiry_status: null,
  nearest_days_until_expiry: null };
const chicken = { id: 11, batch_number: "B-00000011", ingredient_id: 5, ingredient_name: "雞胸肉",
  unit: "kg", remaining_quantity: "5.000", expiry_date: "2026-11-10", current_location_id: 1,
  current_location_code: "R-01", current_location_name: "冷藏庫 A", source_status: "CONFIRMED",
  expiry_status: "EXPIRING_SOON", days_until_expiry: 2 };
const typeRow = (storage_type: string, location_count: number, batch_count: number,
  expired_count = 0, expires_today_count = 0, expiring_soon_count = 0) => ({
  storage_type, location_count, batch_count, expired_count, expires_today_count, expiring_soon_count });
const summary = { active_count: 4, total_count: 5, by_type: [
  typeRow("REFRIGERATED", 2, 6, 0, 1, 2), typeRow("FROZEN", 1, 9, 0, 0, 2), typeRow("AMBIENT", 1, 5, 1, 0, 2)] };
const batchPage = { items: [chicken], total: 1, page: 1, page_size: 100 };
const list = (items: unknown[]) => ({ items, total: items.length, page: 1, page_size: 20 });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const error = (code: string, message: string, fields: unknown[] = [], details = {}) =>
  ({ error: { code, message, fields, details } });

beforeAll(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

type Handler = (path: string, init: RequestInit) => Response | undefined;

function renderPage(employee: typeof admin, handler: Handler = () => undefined) {
  const fetchMock = vi.fn(async (path: string, init: RequestInit = {}) =>
    path.endsWith("/auth/me") ? json(employee) : handler(path, init)
      ?? (path.endsWith("/storage-locations/summary") ? json(summary) : json(list([fridge]))));
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(queryKeys.auth.all, employee);
  client.setQueryData(queryKeys.inventory.all, { cached: true });
  render(<MantineProvider env="test"><QueryClientProvider client={client}><MemoryRouter>
    <StorageLocationsPage />
  </MemoryRouter></QueryClientProvider></MantineProvider>);
  return { client, fetchMock };
}

/** 模擬寬螢幕：只有 min-width 查詢成立（表格版面）。 */
function stubWide() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("min-width"), media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {},
    removeListener: () => {}, dispatchEvent: () => false,
  }));
}

/** 管理者的編輯／刪除收在列尾「⋯」選單。 */
async function chooseRowAction(code: string, action: "編輯" | "刪除") {
  fireEvent.click(await screen.findByRole("button", { name: `${code} 的操作` }));
  fireEvent.click(await screen.findByRole("menuitem", { name: `${action} ${code}` }));
}

async function chooseStorageType(dialog: ReturnType<typeof within>, label: string) {
  fireEvent.click(dialog.getByRole("combobox", { name: /^儲存類型/ }));
  fireEvent.click(await screen.findByRole("option", { name: label }));
}

describe("StorageLocationsPage", () => {
  it("lets staff browse with Chinese storage type labels but hides write actions", async () => {
    const { fetchMock } = renderPage(staff);

    expect(await screen.findByText("冷藏庫 A")).toBeTruthy();
    const row = screen.getByText("R-01").closest("[data-location]") as HTMLElement;
    expect(within(row).getByText("冷藏")).toBeTruthy();
    expect(within(row).getByText("啟用")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "新增位置" })).toBeNull();
    expect(screen.queryByRole("button", { name: "R-01 的操作" })).toBeNull();
    expect(fetchMock.mock.calls.every(([, init]) => (init?.method ?? "GET") === "GET")).toBe(true);
  });

  it("creates a location and refreshes location and stock queries", async () => {
    let body: unknown;
    const { client } = renderPage(admin, (_, init) => {
      if (init.method === "POST") {
        body = JSON.parse(String(init.body));
        return json({ ...fridge, id: 2, code: "F-01", name: "冷凍庫 B", storage_type: "FROZEN",
          description: null }, 201);
      }
    });
    fireEvent.click(await screen.findByRole("button", { name: "新增位置" }));
    const dialog = within(await screen.findByRole("dialog"));
    fireEvent.change(dialog.getByLabelText(/^位置代碼/), { target: { value: " F-01 " } });
    fireEvent.change(dialog.getByLabelText(/^名稱/), { target: { value: "冷凍庫 B" } });
    await chooseStorageType(dialog, "冷凍");
    fireEvent.submit(dialog.getByRole("button", { name: "儲存" }).closest("form")!);

    expect(await screen.findByText("儲存位置已建立")).toBeTruthy();
    expect(body).toEqual({ code: "F-01", name: "冷凍庫 B", storage_type: "FROZEN", description: null });
    await waitFor(() => expect(client.getQueryState(queryKeys.inventory.all)?.isInvalidated).toBe(true));
  });

  it("keeps the form open with inputs and marks the code field on duplicate", async () => {
    renderPage(admin, (_, init) => init.method === "POST"
      ? json(error("DUPLICATE", "位置代碼已存在", [{ field: "code", message: "位置代碼已存在，請換一個代碼" }]), 409)
      : undefined);
    fireEvent.click(await screen.findByRole("button", { name: "新增位置" }));
    const dialog = within(await screen.findByRole("dialog"));
    fireEvent.change(dialog.getByLabelText(/^位置代碼/), { target: { value: "R-01" } });
    fireEvent.change(dialog.getByLabelText(/^名稱/), { target: { value: "重複的" } });
    await chooseStorageType(dialog, "常溫");
    fireEvent.submit(dialog.getByRole("button", { name: "儲存" }).closest("form")!);

    expect(await dialog.findByText("位置代碼已存在，請換一個代碼")).toBeTruthy();
    expect((dialog.getByLabelText(/^位置代碼/) as HTMLInputElement).value).toBe("R-01");
    expect((dialog.getByLabelText(/^名稱/) as HTMLInputElement).value).toBe("重複的");
    expect(screen.queryByText("儲存位置已建立")).toBeNull();
  });

  it("requires a storage type before sending", async () => {
    const { fetchMock } = renderPage(admin);
    fireEvent.click(await screen.findByRole("button", { name: "新增位置" }));
    const dialog = within(await screen.findByRole("dialog"));
    fireEvent.change(dialog.getByLabelText(/^位置代碼/), { target: { value: "X" } });
    fireEvent.submit(dialog.getByRole("button", { name: "儲存" }).closest("form")!);

    expect(await dialog.findByText("請選擇儲存類型")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("shows how many batches block deactivation and keeps the location active", async () => {
    let sent: { is_active?: boolean } = {};
    renderPage(admin, (_, init) => {
      if (init.method === "PATCH") {
        sent = JSON.parse(String(init.body));
        return json(error("REFERENCED", "此位置仍有 2 個批次有剩餘量，不能停用",
          [{ field: "is_active", message: "位置上仍有剩餘庫存" }], { batch_count: 2 }), 409);
      }
    });
    await chooseRowAction("R-01", "編輯");
    const dialog = within(await screen.findByRole("dialog"));
    fireEvent.click(dialog.getByLabelText(/^啟用此位置/));
    fireEvent.submit(dialog.getByRole("button", { name: "儲存" }).closest("form")!);

    expect(await dialog.findByText("此位置仍有 2 個批次有剩餘量，不能停用")).toBeTruthy();
    expect(dialog.getByText("位置上仍有剩餘庫存")).toBeTruthy();
    expect(sent.is_active).toBe(false);
    expect((dialog.getByLabelText(/^啟用此位置/) as HTMLInputElement).checked).toBe(false);
  });

  it("explains a referenced location must be deactivated instead of deleted", async () => {
    renderPage(admin, (_, init) => init.method === "DELETE"
      ? json(error("REFERENCED", "此位置已被進貨或庫存紀錄使用，不能刪除，請改用停用"), 409)
      : undefined);
    await chooseRowAction("R-01", "刪除");
    const dialog = within(await screen.findByRole("dialog"));
    fireEvent.click(dialog.getByRole("button", { name: "確認刪除" }));

    expect(await dialog.findByText("此位置已被進貨或庫存紀錄使用，不能刪除，請改用停用")).toBeTruthy();
    expect(screen.queryByText("儲存位置已刪除")).toBeNull();
  });

  it("sends search, type and status filters as API query parameters", async () => {
    const { fetchMock } = renderPage(staff);
    await screen.findByText("冷藏庫 A");
    fireEvent.change(screen.getByLabelText("搜尋代碼或名稱"), { target: { value: " R-0 " } });
    fireEvent.click(screen.getByRole("combobox", { name: "儲存類型" }));
    fireEvent.click(await screen.findByRole("option", { name: "冷凍" }));
    fireEvent.click(screen.getByRole("combobox", { name: "狀態" }));
    fireEvent.click(await screen.findByRole("option", { name: "啟用" }));

    await waitFor(() => {
      const url = new URL(String(fetchMock.mock.calls.at(-1)![0]), "http://test");
      expect(Object.fromEntries(url.searchParams)).toEqual({
        page: "1", page_size: "20", search: "R-0", storage_type: "FROZEN", is_active: "true",
      });
    });
  });

  it("closes the dialog and refreshes stock queries after a successful edit", async () => {
    const { client } = renderPage(admin, (_, init) => init.method === "PATCH"
      ? json({ ...fridge, is_active: false }) : undefined);
    await chooseRowAction("R-01", "編輯");
    const dialog = within(await screen.findByRole("dialog"));
    fireEvent.click(dialog.getByLabelText(/^啟用此位置/));
    fireEvent.submit(dialog.getByRole("button", { name: "儲存" }).closest("form")!);

    expect(await screen.findByText("儲存位置已更新")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(client.getQueryState(queryKeys.inventory.all)?.isInvalidated).toBe(true));
  });

  it("deletes an unreferenced location and refreshes stock queries", async () => {
    const { client } = renderPage(admin, (_, init) => init.method === "DELETE"
      ? new Response(null, { status: 204 }) : undefined);
    await chooseRowAction("R-01", "刪除");
    const dialog = within(await screen.findByRole("dialog"));
    fireEvent.click(dialog.getByRole("button", { name: "確認刪除" }));

    expect(await screen.findByText("儲存位置已刪除")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(client.getQueryState(queryKeys.inventory.all)?.isInvalidated).toBe(true));
  });
  /** 批次清單、啟用位置清單與換位置請求的共用 mock。 */
  function batchHandler(onMove?: (init: RequestInit) => Response): Handler {
    return (path, init) => {
      if (path.includes("/storage-locations/1/batches")) return json(batchPage);
      if (path.includes("is_active=true&page_size=100")) return json(list([fridge, freezer]));
      if (path.includes("/inventory-batches/11/location") && onMove) return onMove(init);
    };
  }

  async function openBatches() {
    fireEvent.click(await screen.findByRole("button", { name: "查看 R-01 的批次" }));
    return within(await screen.findByLabelText("R-01 的批次"));
  }

  it("keeps phone cards short by moving edit and delete into a menu", async () => {
    // 模擬 390 寬的手機：只有 max-width 查詢成立。
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("max-width"), media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {},
      removeListener: () => {}, dispatchEvent: () => false,
    }));
    renderPage(admin, batchHandler());

    const card = within((await screen.findByText("冷藏庫 A")).closest("[data-location]") as HTMLElement);
    expect(card.queryByRole("button", { name: "編輯 R-01" })).toBeNull();
    fireEvent.click(card.getByRole("button", { name: "R-01 的操作" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "編輯 R-01" }));

    expect(await screen.findByRole("dialog", { name: "編輯儲存位置" })).toBeTruthy();
  });

  it("scrolls the expanded location to the top so its batches are in view", async () => {
    renderPage(staff, batchHandler());
    const card = (await screen.findByText("冷藏庫 A")).closest("[data-location]") as HTMLElement;
    // 記錄捲動當下批次是否已顯示：第一次展開時要等批次載入、頁面變高後才捲，否則捲不到位。
    const batchesShown: boolean[] = [];
    const scrollIntoView = vi.fn(() => { batchesShown.push(!!screen.queryByLabelText("R-01 的批次")); });
    card.scrollIntoView = scrollIntoView;

    await openBatches();
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: "start" })));
    expect(batchesShown).toEqual([true]);

    scrollIntoView.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "收合 R-01 的批次" }));
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("lets staff expand a location to see its stocked batches without move actions", async () => {
    renderPage(staff, batchHandler());

    const batches = await openBatches();

    expect(batches.getByText("雞胸肉")).toBeTruthy();
    expect(batches.getByText("B-00000011")).toBeTruthy();
    // 數量與單位分開排版，以整段文字比對。
    expect(batches.getByText((_, el) => el?.tagName === "P" && el.textContent === "5.000 kg")).toBeTruthy();
    expect(batches.getByText("到期日 2026-11-10")).toBeTruthy();
    expect(batches.getByText("即期 · 剩 2 天")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "換位置 B-00000011" })).toBeNull();
  });

  it("uses tables with batch count, nearest expiry and a row menu on wide screens", async () => {
    // jsdom 預設 matchMedia 一律不符合（卡片版面）；這裡模擬寬螢幕（1024 以上都用表格）。
    stubWide();
    renderPage(admin, (path, init) => path.includes("/storage-locations?")
      ? json(list([fridge, freezer])) : batchHandler()(path, init));

    const row = (await screen.findByText("冷藏庫 A")).closest("tr")!;
    expect(Array.from(row.closest("table")!.querySelectorAll("thead th")).map((th) => th.textContent))
      .toEqual(["代碼", "名稱", "類型", "批次", "最近到期", "狀態", "操作與批次"]);
    expect(within(row).getByText("R-01")).toBeTruthy();
    expect(within(row).getByText("冷藏")).toBeTruthy();
    expect(within(row).getByText("3 批")).toBeTruthy();
    expect(within(row).getByText("今日到期")).toBeTruthy();
    expect(within(row).queryByRole("button", { name: "編輯 R-01" })).toBeNull();
    fireEvent.click(within(row).getByRole("button", { name: "R-01 的操作" }));
    expect(await screen.findByRole("menuitem", { name: "編輯 R-01" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "刪除 R-01" })).toBeTruthy();
    // 沒有剩餘批次的位置：最近到期顯示「—」。
    const empty = screen.getByText("冷凍庫 B").closest("tr")!;
    expect(within(empty).getByText("0 批")).toBeTruthy();
    expect(within(empty).getByText("—")).toBeTruthy();
    expect(screen.queryByText(/共 [0-9]+ 個位置/)).toBeNull();

    const batches = await openBatches();
    expect(screen.getByRole("table", { name: "R-01 的批次" })).toBeTruthy();
    expect(batches.getByText("2026-11-10")).toBeTruthy();
    expect(batches.getByText("即期 · 剩 2 天")).toBeTruthy();
    expect(batches.getByRole("button", { name: "換位置 B-00000011" })).toBeTruthy();
  });

  it("shows breadcrumb and summary cards from the summary API", async () => {
    renderPage(staff, batchHandler());

    expect(screen.getByRole("navigation", { name: "麵包屑" }).textContent).toBe("基本資料 / 儲存位置");
    const cards = within(await screen.findByLabelText("位置摘要"));
    const card = (label: string) => within(cards.getByText(label).closest<HTMLElement>("[data-summary-card]")!);
    await waitFor(() => expect(card("啟用中位置").getByText("4")).toBeTruthy());
    expect(card("啟用中位置").getByText("共 5 個 · 1 停用")).toBeTruthy();
    expect(card("冷藏").getByText("2")).toBeTruthy();
    // 今日到期優先於即期。
    expect(card("冷藏").getByText("6 批 · 1 今日到期")).toBeTruthy();
    expect(card("冷凍").getByText("9 批 · 2 即期")).toBeTruthy();
    // 只放最緊急的一項：過期優先於即期。
    expect(card("常溫").getByText("5 批 · 1 過期")).toBeTruthy();
  });

  it("guides admins to create the first location when there are none", async () => {
    renderPage(admin, (path) => path.includes("/storage-locations?") ? json(list([])) : undefined);

    expect(await screen.findByText("還沒有儲存位置")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "新增第一個位置" }));
    expect(await screen.findByRole("dialog", { name: "新增儲存位置" })).toBeTruthy();
  });

  it("tells the user when a location has more batches than shown", async () => {
    renderPage(staff, (path) => path.includes("/storage-locations/1/batches")
      ? json({ ...batchPage, total: 130 }) : undefined);

    await openBatches();

    expect(screen.getByText("共 130 個批次，只顯示到期日最早的 1 個。")).toBeTruthy();
  });

  it("moves a batch to another active location and refreshes stock queries", async () => {
    let sent: unknown;
    const { client, fetchMock } = renderPage(admin, batchHandler((init) => {
      sent = JSON.parse(String(init.body));
      return json({ ...chicken, current_location_id: 2, current_location_code: "F-01",
        current_location_name: "冷凍庫 B" });
    }));
    await openBatches();
    fireEvent.click(screen.getByRole("button", { name: "換位置 B-00000011" }));
    const dialog = within(await screen.findByRole("dialog"));
    fireEvent.click(dialog.getByRole("combobox", { name: /^移到/ }));
    expect(screen.queryByRole("option", { name: "R-01 冷藏庫 A" })).toBeNull();
    fireEvent.click(await screen.findByRole("option", { name: "F-01 冷凍庫 B" }));
    fireEvent.change(dialog.getByLabelText(/^原因/), { target: { value: " 冷藏庫除霜 " } });
    fireEvent.submit(dialog.getByRole("button", { name: "確認換位置" }).closest("form")!);

    expect(await screen.findByText("批次 B-00000011 已移到 F-01 冷凍庫 B")).toBeTruthy();
    expect(sent).toEqual({ to_location_id: 2, reason: "冷藏庫除霜" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(client.getQueryState(queryKeys.inventory.all)?.isInvalidated).toBe(true));
    // 原位置的批次清單要重新抓取，搬走的批次才會消失。
    expect(fetchMock.mock.calls.filter(([path]) =>
      String(path).includes("/storage-locations/1/batches")).length).toBeGreaterThan(1);
  });

  it("keeps the reason and marks the target field when the move is rejected", async () => {
    renderPage(admin, batchHandler(() => json(error("RULE_VIOLATION", "目標位置不存在或已停用",
      [{ field: "to_location_id", message: "請選擇啟用中的儲存位置" }]), 422)));
    await openBatches();
    fireEvent.click(screen.getByRole("button", { name: "換位置 B-00000011" }));
    const dialog = within(await screen.findByRole("dialog"));
    fireEvent.click(dialog.getByRole("combobox", { name: /^移到/ }));
    fireEvent.click(await screen.findByRole("option", { name: "F-01 冷凍庫 B" }));
    fireEvent.change(dialog.getByLabelText(/^原因/), { target: { value: "除霜" } });
    fireEvent.submit(dialog.getByRole("button", { name: "確認換位置" }).closest("form")!);

    expect(await dialog.findByText("請選擇啟用中的儲存位置")).toBeTruthy();
    expect(dialog.getByText("目標位置不存在或已停用")).toBeTruthy();
    expect((dialog.getByLabelText(/^原因/) as HTMLTextAreaElement).value).toBe("除霜");
  });

  it("requires a target before sending the move", async () => {
    const { fetchMock } = renderPage(admin, batchHandler());
    await openBatches();
    fireEvent.click(screen.getByRole("button", { name: "換位置 B-00000011" }));
    const dialog = within(await screen.findByRole("dialog"));
    fireEvent.submit(dialog.getByRole("button", { name: "確認換位置" }).closest("form")!);

    expect(await dialog.findByText("請選擇目標位置")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([path]) => String(path).includes("/inventory-batches/"))).toBe(false);
  });
});
