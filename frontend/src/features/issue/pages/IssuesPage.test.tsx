import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { theme } from "../../../app/theme";
import { queryKeys } from "../../../shared/api/queryKeys";
import { staff } from "../../../test/renderApp";
import { IssuesPage } from "./IssuesPage";

const ingredientOption = (overrides: Record<string, unknown>) => ({
  id: 5, name: "雞胸肉", unit: "公斤", category_id: 1, category_name: "肉品海鮮",
  storage_method: "REFRIGERATED", available_quantity: "13.000", is_active: true,
  nearest_expiry_date: "2026-11-01", nearest_expiry_status: "EXPIRING_SOON", nearest_days_until_expiry: 1,
  is_low_stock: false, allows_fraction: true, ...overrides,
});
const chicken = ingredientOption({});
const cabbage = ingredientOption({ id: 6, name: "高麗菜", category_id: 2, category_name: "蔬菜",
  available_quantity: "4.000", nearest_expiry_status: "NORMAL", nearest_days_until_expiry: 6, is_low_stock: true });
const eggs = ingredientOption({ id: 7, name: "雞蛋", unit: "顆", category_id: 3, category_name: "乳品蛋類",
  available_quantity: "30.000", nearest_expiry_status: "NORMAL", is_active: false,
  allows_fraction: false });
const candidate = (overrides: Record<string, unknown>) => ({
  batch_id: 1, batch_number: "B-00000001", location_id: 1, location_code: "R-01",
  location_name: "冷藏庫 A", remaining_quantity: "5.000", expiry_date: "2026-11-01",
  expiry_status: "EXPIRING_SOON", days_until_expiry: 1, fefo_quantity: "3.000", quantity: "3.000",
  is_non_fefo: false, ...overrides,
});
const a = candidate({});
const b = candidate({ batch_id: 2, batch_number: "B-00000002", remaining_quantity: "8.000",
  expiry_date: "2026-11-07", expiry_status: "NORMAL", days_until_expiry: 7, fefo_quantity: "0.000",
  quantity: "0.000" });
const suggestion = (candidates: unknown[], requested = "3.000") => ({
  ingredient_id: 5, ingredient_name: "雞胸肉", unit: "公斤", requested_quantity: requested,
  available_quantity: "13.000", candidates, allows_fraction: true,
});
const switchedToB = suggestion([
  { ...a, fefo_quantity: "1.000", quantity: "0.000" },
  { ...b, quantity: "1.000", is_non_fefo: true },
], "1.000");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const error = (code: string, message: string, fields: unknown[] = [], details = {}) =>
  ({ error: { code, message, fields, details } });

beforeAll(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

interface Call { path: string; body: unknown; key: string | undefined }
type Handler = (path: string, body: unknown) => Response | undefined;

function renderPage(handler: Handler, path = "/issues/new?ingredient_id=5", records: unknown[] = []) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (input: string, init: RequestInit = {}) => {
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    const headers = (init.headers ?? {}) as Record<string, string>;
    calls.push({ path: input, body, key: headers["Idempotency-Key"] });
    if (input.endsWith("/issues/ingredients")) return json({ items: [chicken, cabbage, eggs] });
    if (input.includes("/issues?limit=")) return json({ items: records });
    return handler(input, body) ?? json(error("NOT_FOUND", "not stubbed"), 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(queryKeys.auth.all, staff);
  client.setQueryData(queryKeys.inventory.all, { cached: true });
  render(<MantineProvider theme={theme} env="test"><QueryClientProvider client={client}>
    <MemoryRouter initialEntries={[path]}><IssuesPage /></MemoryRouter>
  </QueryClientProvider></MantineProvider>);
  return { client, calls };
}

/** 建議 API：quantity 模式回 FEFO 建議，lines 模式回改選 B 的結果。 */
const suggestions: Handler = (path, body) => {
  if (!path.endsWith("/issues/suggestions")) return undefined;
  return json((body as { lines?: unknown }).lines ? switchedToB : suggestion([a, b]));
};

async function getSuggestion(quantity = "3") {
  await waitFor(() => expect(screen.getByRole<HTMLInputElement>("combobox", { name: /^食材/ }).value)
    .toBe("雞胸肉"));
  fireEvent.change(screen.getByRole("textbox", { name: /^需要數量/ }), { target: { value: quantity } });
  fireEvent.click(screen.getByRole("button", { name: "取得建議" }));
  await screen.findByRole("textbox", { name: "B-00000001 領用量" });
}

const row = (batch: string) => screen.getByText(batch).closest("tr") as HTMLElement;
const quantityInput = (batch: string) =>
  screen.getByRole<HTMLInputElement>("textbox", { name: `${batch} 領用量` });

async function switchToB() {
  fireEvent.change(quantityInput("B-00000001"), { target: { value: "" } });
  fireEvent.change(quantityInput("B-00000002"), { target: { value: "1" } });
  return screen.findByRole("textbox", { name: /^沒有照先到期先使用的原因/ });
}

describe("IssuesPage", () => {
  it("preselects the ingredient from the alert link and shows the FEFO suggestion", async () => {
    const { calls } = renderPage(suggestions);

    await getSuggestion();

    expect(calls.find((call) => call.path.endsWith("/suggestions"))?.body)
      .toEqual({ ingredient_id: 5, quantity: "3" });
    expect(within(row("B-00000001")).getByText("冷藏庫 A")).toBeTruthy();
    expect(within(row("B-00000001")).getByText("即期")).toBeTruthy();
    expect(within(row("B-00000002")).getByText("正常")).toBeTruthy();
    expect(quantityInput("B-00000001").value).toBe("3");
    expect(quantityInput("B-00000002").value).toBe("");
    expect(screen.queryByText("非 FEFO")).toBeNull();
  });

  it("rechecks changed lines with the backend and asks for a reason only when it says non-FEFO", async () => {
    const { calls } = renderPage(suggestions);
    await getSuggestion();

    await switchToB();

    const check = calls.filter((call) => call.path.endsWith("/suggestions")).at(-1);
    expect(check?.body).toEqual({ ingredient_id: 5, lines: [{ batch_id: 2, quantity: "1" }] });
    expect(within(row("B-00000002")).getByText("非 FEFO")).toBeTruthy();
    expect(screen.getByText(/^本次領用/).textContent).toContain("本次領用 1 公斤・全部可用 13 公斤");
  });

  it("confirms with an idempotency key, refreshes stock queries and rotates the key", async () => {
    const result = { operation_group_id: "g", lines: [{ transaction_id: 9, batch_id: 1,
      batch_number: "B-00000001", quantity: "3.000", quantity_after: "2.000", is_non_fefo: false,
      reason: "領用" }] };
    const { client, calls } = renderPage((path, body) =>
      path.endsWith("/api/v1/issues") ? json(result) : suggestions(path, body));
    await getSuggestion();

    fireEvent.click(screen.getByRole("button", { name: "確認領用" }));

    expect(await screen.findByText("已領用 雞胸肉")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("領用 3 公斤，剩 2 公斤");
    const first = calls.find((call) => call.path.endsWith("/api/v1/issues"));
    expect(first?.body).toEqual({ ingredient_id: 5, lines: [{ batch_id: 1, quantity: "3" }] });
    expect(first?.key).toMatch(/^[0-9a-f-]{36}$/);
    await waitFor(() => expect(client.getQueryState(queryKeys.inventory.all)?.isInvalidated).toBe(true));
    expect(screen.queryByRole("textbox", { name: "B-00000001 領用量" })).toBeNull();

    await getSuggestion();
    fireEvent.click(screen.getByRole("button", { name: "確認領用" }));
    await waitFor(() => expect(calls.filter((call) => call.path.endsWith("/api/v1/issues"))).toHaveLength(2));
    const second = calls.filter((call) => call.path.endsWith("/api/v1/issues"))[1];
    expect(second.key).not.toBe(first?.key);
  });

  it("keeps the inputs and marks the reason on the right row when the backend rejects it", async () => {
    let submitted: unknown;
    renderPage((path, body) => {
      if (!path.endsWith("/api/v1/issues")) return suggestions(path, body);
      submitted = body;
      return json(error("RULE_VIOLATION", "沒有照先到期先使用領用的批次，必須填寫原因",
        [{ field: "lines.0.reason", message: "請填寫沒有照先到期先使用的原因" }]), 422);
    });
    await getSuggestion();
    await switchToB();

    fireEvent.click(screen.getByRole("button", { name: "確認領用" }));

    expect(await screen.findByText("請填寫沒有照先到期先使用的原因")).toBeTruthy();
    expect(submitted).toEqual({ ingredient_id: 5, lines: [{ batch_id: 2, quantity: "1" }] });
    expect(screen.getByText("領用沒有完成，庫存未變動")).toBeTruthy();
    expect(quantityInput("B-00000002").value).toBe("1");
  });

  it("sends the reason with the non-FEFO line", async () => {
    let submitted: unknown;
    renderPage((path, body) => {
      if (!path.endsWith("/api/v1/issues")) return suggestions(path, body);
      submitted = body;
      return json({ operation_group_id: "g", lines: [] });
    });
    await getSuggestion();
    const reason = await switchToB();

    fireEvent.change(reason, { target: { value: "A 在冷藏庫最裡面" } });
    fireEvent.click(screen.getByRole("button", { name: "確認領用" }));

    await waitFor(() => expect(submitted).toEqual({ ingredient_id: 5,
      lines: [{ batch_id: 2, quantity: "1", reason: "A 在冷藏庫最裡面" }] }));
  });

  it("shows the available quantity from the backend when stock is short", async () => {
    renderPage((path) => path.endsWith("/suggestions")
      ? json(error("INSUFFICIENT_STOCK", "可用量不足", [],
        { batch_id: null, remaining_quantity: null, available_quantity: "13.000" }), 409)
      : undefined);
    await waitFor(() => expect(screen.getByRole<HTMLInputElement>("combobox", { name: /^食材/ }).value)
      .not.toBe(""));

    fireEvent.change(screen.getByRole("textbox", { name: /^需要數量/ }), { target: { value: "14" } });
    fireEvent.click(screen.getByRole("button", { name: "取得建議" }));

    expect(await screen.findByText("可用量只有 13 公斤，請調整數量")).toBeTruthy();
  });

  it("explains when the linked ingredient has nothing to issue", async () => {
    renderPage(() => undefined, "/issues/new?ingredient_id=99");

    expect(await screen.findByText(/這項食材目前沒有可領用的庫存/)).toBeTruthy();
  });
  it("explains which batch is short when a recheck is rejected", async () => {
    renderPage((path, body) => (path.endsWith("/suggestions") && (body as { lines?: unknown }).lines)
      ? json(error("INSUFFICIENT_STOCK", "可用量不足", [],
        { batch_id: 2, remaining_quantity: "8.000", available_quantity: "13.000" }), 409)
      : suggestions(path, body));
    await getSuggestion();

    fireEvent.change(quantityInput("B-00000002"), { target: { value: "9" } });

    expect(await screen.findByText("批次 B-00000002剩餘量只有 8 公斤（可用量 13 公斤），請調整數量"))
      .toBeTruthy();
  });

  it("marks a recheck field error on the row it belongs to", async () => {
    renderPage((path, body) => (path.endsWith("/suggestions") && (body as { lines?: unknown }).lines)
      ? json(error("RULE_VIOLATION", "批次 B-00000002 已過期，不能領用",
        [{ field: "lines.0.batch_id", message: "已過期的批次請改用報廢" }]), 422)
      : suggestions(path, body));
    await getSuggestion();

    fireEvent.change(quantityInput("B-00000001"), { target: { value: "" } });
    fireEvent.change(quantityInput("B-00000002"), { target: { value: "1" } });

    expect(await within(row("B-00000002")).findByText("已過期的批次請改用報廢")).toBeTruthy();
  });

  it("reuses the key when the same lines are resubmitted and rotates it after an edit", async () => {
    let attempts = 0;
    const { calls } = renderPage((path, body) => {
      if (!path.endsWith("/api/v1/issues")) return suggestions(path, body);
      attempts += 1;
      return json(error("INTERNAL_ERROR", "伺服器暫時無法處理"), 500);
    });
    await getSuggestion();
    const confirmButton = () => screen.getByRole<HTMLButtonElement>("button", { name: "確認領用" });
    const issueKeys = () => calls.filter((call) => call.path.endsWith("/api/v1/issues")).map((call) => call.key);

    fireEvent.click(confirmButton());
    await screen.findByText("領用沒有完成，庫存未變動");
    fireEvent.click(confirmButton());
    await waitFor(() => expect(attempts).toBe(2));
    expect(issueKeys()[0]).toBe(issueKeys()[1]);

    fireEvent.change(quantityInput("B-00000001"), { target: { value: "2" } });
    await waitFor(() => expect(confirmButton().disabled).toBe(false));
    fireEvent.click(confirmButton());
    await waitFor(() => expect(attempts).toBe(3));
    expect(issueKeys()[2]).not.toBe(issueKeys()[0]);
  });

  it("shows the table again when the same suggestion is requested twice", async () => {
    const { calls } = renderPage(suggestions);
    await getSuggestion();

    fireEvent.click(screen.getByRole("button", { name: "取得建議" }));

    await waitFor(() => expect(calls.filter((call) => call.path.endsWith("/suggestions"))).toHaveLength(2));
    expect(await screen.findByRole("textbox", { name: "B-00000001 領用量" })).toBeTruthy();
  });

  it("does not send a reason that is hidden after switching back to FEFO", async () => {
    let checks = 0;
    let submitted: unknown;
    renderPage((path, body) => {
      if (path.endsWith("/api/v1/issues")) {
        submitted = body;
        return json({ operation_group_id: "g", lines: [] });
      }
      if (path.endsWith("/suggestions") && (body as { lines?: unknown }).lines) {
        checks += 1;
        return json(checks === 1 ? switchedToB : suggestion([
          { ...a, fefo_quantity: "1.000", quantity: "1.000" }, { ...b, fefo_quantity: "0.000", quantity: "0.000" },
        ], "1.000"));
      }
      return suggestions(path, body);
    });
    await getSuggestion();
    fireEvent.change(await switchToB(), { target: { value: "先拿外面那包" } });

    fireEvent.change(quantityInput("B-00000002"), { target: { value: "" } });
    fireEvent.change(quantityInput("B-00000001"), { target: { value: "1" } });
    await waitFor(() => expect(screen.queryByRole("textbox", { name: /^沒有照先到期先使用的原因/ })).toBeNull());
    await waitFor(() => expect(screen.getByRole<HTMLButtonElement>("button", { name: "確認領用" }).disabled)
      .toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "確認領用" }));

    await waitFor(() => expect(submitted).toEqual({ ingredient_id: 5, lines: [{ batch_id: 1, quantity: "1" }] }));
  });
  it("filters ingredients by category and shows backend statuses on each option", async () => {
    renderPage(() => undefined, "/issues/new");
    fireEvent.click(await screen.findByRole("combobox", { name: /^食材/ }));
    await screen.findByRole("group", { name: "依分類篩選食材" });

    fireEvent.click(screen.getByRole("button", { name: "蔬菜" }));

    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getByText("高麗菜")).toBeTruthy();
    expect(within(listbox).queryByText("雞胸肉")).toBeNull();
    const option = within(listbox).getByRole("option", { name: /高麗菜/ });
    expect(within(option).getByText("低庫存")).toBeTruthy();
    expect(within(option).getByText("冷藏・可用 4 公斤")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "全部" }));
    expect(await within(screen.getByRole("listbox")).findByText("雞胸肉")).toBeTruthy();
    const eggsOption = within(screen.getByRole("listbox")).getByRole("option", { name: /雞蛋/ });
    expect(within(eggsOption).getByText("已停用")).toBeTruthy();
    const chickenOption = within(screen.getByRole("listbox")).getByRole("option", { name: /雞胸肉/ });
    expect(within(chickenOption).getByText("即期")).toBeTruthy();
  });

  it("selects an ingredient from the list and searches by name", async () => {
    renderPage(() => undefined, "/issues/new");
    const picker = await screen.findByRole<HTMLInputElement>("combobox", { name: /^食材/ });

    fireEvent.change(picker, { target: { value: "高麗" } });
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).queryByText("雞胸肉")).toBeNull();
    fireEvent.click(within(listbox).getByRole("option", { name: /高麗菜/ }));

    await waitFor(() => expect(picker.value).toBe("高麗菜"));
    const described = (picker.getAttribute("aria-describedby") ?? "").split(" ")
      .map((id) => document.getElementById(id)?.textContent);
    expect(described).toContain("冷藏・可用 4 公斤");
  });

  it("explains how to enter grams for a kilogram ingredient", async () => {
    renderPage(suggestions);

    expect(await screen.findByText("最多三位小數，例如 0.25 公斤 = 250 公克")).toBeTruthy();
  });

  it("lists recent issues grouped per operation with non-FEFO reasons", async () => {
    renderPage(suggestions, "/issues/new?ingredient_id=5", [{
      operation_group_id: "g-1", occurred_at: "2026-10-31T02:15:00Z", operator_name: "王小明",
      ingredient_id: 5, ingredient_name: "雞胸肉", unit: "公斤", reversal: null,
      lines: [
        { transaction_id: 3, batch_id: 1, batch_number: "B-00000001", quantity: "5.000", quantity_after: "0.000",
          is_non_fefo: false, reason: "領用" },
        { transaction_id: 4, batch_id: 2, batch_number: "B-00000002", quantity: "1.000", quantity_after: "7.000",
          is_non_fefo: true, reason: "A 在冷藏庫最裡面" },
      ],
    }]);

    const table = await screen.findByRole("table", { name: "最近領用紀錄" });
    const record = within(table).getByText("王小明").closest("tr") as HTMLElement;
    expect(within(record).getByText("雞胸肉")).toBeTruthy();
    expect(within(record).getByText("非 FEFO：A 在冷藏庫最裡面")).toBeTruthy();
    expect(within(record).getAllByText(/^B-0000000[12]$/)).toHaveLength(2);
  });

  it("shows an empty state before the first issue", async () => {
    renderPage(suggestions);

    expect(await screen.findByText("還沒有領用紀錄")).toBeTruthy();
  });
  it("tells the user a counted unit only takes whole numbers", async () => {
    renderPage(() => undefined, "/issues/new?ingredient_id=7");

    expect(await screen.findByText("「顆」只能填整數")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: /^需要數量/ }).getAttribute("inputmode")).toBe("numeric");
  });

  it("explains how to pick another batch when there is more than one", async () => {
    renderPage(suggestions);
    await getSuggestion();

    expect(screen.getByText("想改拿別的批次？")).toBeTruthy();
  });

  it("shows no batch-switching hint when only one batch can be issued", async () => {
    renderPage((path) => path.endsWith("/suggestions") ? json(suggestion([a])) : undefined);
    await getSuggestion();

    expect(screen.queryByText("想改拿別的批次？")).toBeNull();
    expect(screen.queryByText(/不會有非 FEFO/)).toBeNull();
  });

  it("keeps the ingredient list open while switching categories", async () => {
    renderPage(() => undefined, "/issues/new");
    const picker = await screen.findByRole("combobox", { name: /^食材/ });
    picker.focus();
    fireEvent.click(picker);
    const header = (await screen.findByRole("group", { name: "依分類篩選食材" })).parentElement as HTMLElement;

    // 分類在下拉裡：按下時不搶走輸入框的焦點，點擊只換分類，清單維持開啟。
    expect(fireEvent.mouseDown(screen.getByRole("button", { name: "蔬菜" }))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "蔬菜" }));

    expect(document.activeElement).toBe(picker);
    expect(within(screen.getByRole("listbox")).getByText("高麗菜")).toBeTruthy();
    expect(header.isConnected).toBe(true);
    expect(picker.getAttribute("aria-expanded")).toBe("true");
  });

  it("reverses an issue with a reason and shows it as reversed", async () => {
    const record = {
      operation_group_id: "g-1", occurred_at: "2026-10-31T02:15:00Z", operator_name: "王小明",
      ingredient_id: 5, ingredient_name: "雞胸肉", unit: "公斤", reversal: null,
      lines: [{ transaction_id: 3, batch_id: 1, batch_number: "B-00000001", quantity: "3.000",
        quantity_after: "2.000", is_non_fefo: false, reason: "領用" }],
    };
    let reversed: unknown;
    const { client } = renderPage((path, body) => {
      if (path.endsWith("/g-1/reversal")) {
        reversed = body;
        return json({ ...record, reversal: { occurred_at: "2026-10-31T03:00:00Z", operator_name: "王小明",
          reason: "數量填錯" } });
      }
      return suggestions(path, body);
    }, "/issues/new?ingredient_id=5", [record]);

    fireEvent.click(await screen.findByRole("button", { name: /^沖銷 .*雞胸肉領用$/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("B-00000001 加回 3 公斤");
    fireEvent.change(within(dialog).getByRole("textbox", { name: /^沖銷原因/ }), { target: { value: "數量填錯" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "確認沖銷" }));

    await waitFor(() => expect(reversed).toEqual({ reason: "數量填錯" }));
    await waitFor(() => expect(client.getQueryState(queryKeys.inventory.all)?.isInvalidated).toBe(true));
  });

  it("shows who reversed an issue and why, without a second reverse button", async () => {
    renderPage(suggestions, "/issues/new?ingredient_id=5", [{
      operation_group_id: "g-2", occurred_at: "2026-10-31T02:15:00Z", operator_name: "王小明",
      ingredient_id: 5, ingredient_name: "雞胸肉", unit: "公斤",
      reversal: { occurred_at: "2026-10-31T03:00:00Z", operator_name: "李店長", reason: "數量填錯" },
      lines: [{ transaction_id: 3, batch_id: 1, batch_number: "B-00000001", quantity: "3.000",
        quantity_after: "2.000", is_non_fefo: false, reason: "領用" }],
    }]);

    const table = await screen.findByRole("table", { name: "最近領用紀錄" });
    expect(within(table).getByText("已沖銷")).toBeTruthy();
    expect(within(table).getByText(/由 李店長 沖銷：數量填錯/)).toBeTruthy();
    expect(within(table).queryByRole("button", { name: /^沖銷/ })).toBeNull();
  });
});
