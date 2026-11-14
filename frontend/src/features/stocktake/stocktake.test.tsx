import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { StocktakesPage } from "./pages/StocktakesPage";

const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
beforeAll(() => Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() }));
afterAll(() => {
  if (originalScrollIntoView) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScrollIntoView);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});
const batches = [
  { id: 1, batch_number: "B-1", ingredient_name: "雞肉", unit: "公斤",
    location_name: "冷藏庫", expiry_date: "2026-11-10", remaining_quantity: "8.000" },
  { id: 2, batch_number: "B-2", ingredient_name: "蔬菜", unit: "公斤",
    location_name: "冷藏庫", expiry_date: "2026-11-12", remaining_quantity: "0.000" },
];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
type Handler = (url: string, options?: RequestInit) => Promise<Response>;
function mount(write?: Handler, role = "ADMIN") {
  const fetch = vi.fn(async (url: string, options?: RequestInit) => {
    if (url === "/api/v1/auth/me") return json({ id: 1, name: "管理者", role });
    if (url.startsWith("/api/v1/stocktakes/batches?")) return json({
      items: batches, total: 2, page: 1, page_size: 20,
    });
    if (options?.method === "POST" && write) return write(url, options);
    throw new Error("Unexpected URL: " + url);
  });
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(<MantineProvider env="test"><QueryClientProvider client={client}>
    <StocktakesPage />
  </QueryClientProvider></MantineProvider>);
  return { fetch, invalidate };
}
async function add(id = 1, actual = "7") {
  if (!screen.queryByRole("dialog")) fireEvent.click(await screen.findByRole("button", { name: "開始多項盤點" }));
  fireEvent.click(await screen.findByRole("button", { name: `加入 B-${id}` }));
  fireEvent.change(screen.getByRole("textbox", { name: `實際量 B-${id}` }), { target: { value: actual } });
  fireEvent.change(screen.getByRole("textbox", { name: `盤點說明 B-${id}` }), { target: { value: "核對" } });
}
const previewResponse: Handler = async (_url, options) => {
  const body = JSON.parse(options?.body as string);
  return json({ lines: body.lines.map((line: { batch_id: number; actual_quantity: string; reason: string }) => ({
    ...line, reason: "日常盤點：核對", expected_quantity: line.batch_id === 1 ? "8.000" : "0.000",
    expected_transaction_id: line.batch_id === 1 ? 11 : null,
    quantity_delta: line.batch_id === 1 ? "-1.000" : "3.000",
  })) });
};
async function preview() {
  fireEvent.click(screen.getByRole("button", { name: "預覽盤點差額" }));
  await screen.findByRole("heading", { name: "盤點預覽" });
}

describe("管理者盤點", () => {
  it("員工不載入批次且不能預覽確認", async () => {
    const { fetch } = mount(undefined, "STAFF");
    await screen.findByText("只有管理者可以盤點。");
    expect(fetch.mock.calls.map(call => call[0])).toEqual(["/api/v1/auth/me"]);
    expect(screen.queryByRole("button", { name: "預覽盤點差額" })).toBeNull();
  });

  it("多筆預覽傳送字串及版本；成功失效八組查詢並顯示持久化結果", async () => {
    const { fetch, invalidate } = mount(async (url, options) => {
      if (url === "/api/v1/stocktakes/preview") return previewResponse(url, options);
      return json({ operation_group_id: "g", occurred_at: "2026-11-07T00:00:00Z", lines: [
        { batch_id: 1, transaction_id: 12, quantity_before: "8.000", quantity_delta: "-1.000", quantity_after: "7.000" },
        { batch_id: 2, transaction_id: 13, quantity_before: "0.000", quantity_delta: "3.000", quantity_after: "3.000" },
      ] });
    });
    await add(); await add(2, "3");
    await preview();
    expect(screen.getByText("-1.000")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "確認盤點" }));
    await screen.findByText("盤點已完成");
    const call = fetch.mock.calls.find(([url]) => url === "/api/v1/stocktakes")!;
    expect(JSON.parse(call[1]?.body as string)).toEqual({ lines: [
      { batch_id: 1, actual_quantity: "7", reason: "日常盤點：核對", expected_quantity: "8.000", expected_transaction_id: 11 },
      { batch_id: 2, actual_quantity: "3", reason: "日常盤點：核對", expected_quantity: "0.000", expected_transaction_id: null },
    ] });
    expect(invalidate.mock.calls.map(call => call[0]?.queryKey?.[0]).sort())
      .toEqual(["alerts", "goods-receipt", "inventory", "issue", "reports", "stocktake", "storage-locations", "waste"]);
    expect(screen.queryByRole("button", { name: "確認盤點" })).toBeNull();
    expect(screen.getByText(/調整後 7.000/)).toBeTruthy();
  });

  it.each(["actual", "reason", "add", "remove"])("預覽後修改 %s 清除舊預覽", async kind => {
    mount(previewResponse);
    await add(); await preview();
    if (kind === "actual") fireEvent.change(screen.getByRole("textbox", { name: "實際量 B-1" }), { target: { value: "6" } });
    if (kind === "reason") fireEvent.change(screen.getByRole("textbox", { name: "盤點說明 B-1" }), { target: { value: "重新核對" } });
    if (kind === "add") fireEvent.click(screen.getByRole("button", { name: "加入 B-2" }));
    if (kind === "remove") fireEvent.click(screen.getByRole("button", { name: "移除 B-1" }));
    expect(screen.queryByRole("button", { name: "確認盤點" })).toBeNull();
  });

  it("409保留輸入、顯示最新量，清除預覽且刷新庫存", async () => {
    const { invalidate } = mount(async (url, options) => url.endsWith("/preview") ? previewResponse(url, options) :
      json({ error: { code: "STALE_QUANTITY", message: "庫存已變更", details: {
        batch_id: 1, current_quantity: "6.000", current_transaction_id: 14,
      }, fields: [] } }, 409));
    await add(); await preview();
    fireEvent.click(screen.getByRole("button", { name: "確認盤點" }));
    await screen.findByText(/最新帳面量：6.000/);
    await waitFor(() => expect(screen.queryByRole("button", { name: "確認盤點" })).toBeNull());
    expect((screen.getByRole("textbox", { name: "實際量 B-1" }) as HTMLInputElement).value).toBe("7");
    expect((screen.getByRole("textbox", { name: "盤點說明 B-1" }) as HTMLInputElement).value).toBe("核對");
    expect(screen.queryByText("盤點已完成")).toBeNull();
    expect(invalidate).toHaveBeenCalledTimes(8);
  });

  it("網路失敗可重試相同預覽；pending禁止編輯與連按；無差額成功有明確提示", async () => {
    let attempts = 0;
    let resolve: (response: Response) => void = () => {};
    const { fetch } = mount(async (url, options) => {
      if (url.endsWith("/preview")) return previewResponse(url, options);
      if (++attempts === 1) throw new TypeError("offline");
      return new Promise<Response>(done => { resolve = done; });
    });
    await add(1, "8"); await preview();
    fireEvent.click(screen.getByRole("button", { name: "確認盤點" }));
    await screen.findByRole("alert");
    const confirm = screen.getByRole("button", { name: "確認盤點" });
    fireEvent.click(confirm); fireEvent.click(confirm);
    await waitFor(() => expect(attempts).toBe(2));
    expect((screen.getByRole("textbox", { name: "實際量 B-1" }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "移除 B-1" }) as HTMLButtonElement).disabled).toBe(true);
    const writes = fetch.mock.calls.filter(([url]) => url === "/api/v1/stocktakes");
    expect(writes[0][1]?.body).toBe(writes[1][1]?.body);
    resolve(json({ operation_group_id: "g", occurred_at: "2026-11-07T00:00:00Z", lines: [
      { batch_id: 1, transaction_id: null, quantity_before: "8.000", quantity_delta: "0.000", quantity_after: "8.000" },
    ] }));
    await screen.findByText(/無差額，未新增異動/);
  });

  it("預覽pending不重複送出；422欄位錯誤保留輸入", async () => {
    let resolve: (response: Response) => void = () => {};
    const { fetch } = mount(() => new Promise<Response>(done => { resolve = done; }));
    await add(1, "-1");
    const button = screen.getByRole("button", { name: "預覽盤點差額" });
    fireEvent.click(button); fireEvent.click(button);
    await waitFor(() => expect(fetch.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1));
    resolve(json({ error: { code: "VALIDATION_ERROR", message: "輸入資料有誤", details: {},
      fields: [{ field: "lines.0.actual_quantity", message: "數量不可為負數" }] } }, 422));
    await screen.findByText("數量不可為負數");
    expect((screen.getByRole("textbox", { name: "實際量 B-1" }) as HTMLInputElement).value).toBe("-1");
    expect(screen.queryByRole("button", { name: "確認盤點" })).toBeNull();
  });
});

it("加入後輸入緊接所選批次列，關閉重開仍保留", async () => {
  mount(); await add(1, "7");
  const button = screen.getByRole("button", { name: "加入 B-1" });
  const row = button.closest("tr")!;
  expect(row.nextElementSibling?.contains(screen.getByRole("textbox", { name: "實際量 B-1" }))).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "關閉盤點（保留輸入）" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "開始多項盤點" }));
  expect((await screen.findByRole("textbox", { name: "實際量 B-1" }) as HTMLInputElement).value).toBe("7");
});
it("搜尋隱藏已選批次仍保留可編輯輸入", async () => {
  const { fetch } = mount(); await add(1, "7");
  fetch.mockResolvedValueOnce(json({ items: [batches[1]], total: 1, page: 1, page_size: 20 }));
  fireEvent.change(screen.getByRole("textbox", { name: "搜尋食材或批號" }), { target: { value: "蔬菜" } });
  await waitFor(() => expect(screen.queryByRole("button", { name: "加入 B-1" })).toBeNull());
  expect((screen.getByRole("textbox", { name: "實際量 B-1" }) as HTMLInputElement).value).toBe("7");
});
it("定期與其他必填、切換清週期、預覽以請求內容正規化原因", async () => {
  const { fetch } = mount(async (_url, options) => {
    const body = JSON.parse(options?.body as string);
    return json({ lines: body.lines.map((line: { batch_id: number; actual_quantity: string; reason_kind: string; period: string | null; note: string }) => ({ ...line, reason: `${line.reason_kind}/${line.period ?? '無週期'}：${line.note}`, expected_quantity: '8.000', expected_transaction_id: 11, quantity_delta: '-1.000' })) });
  });
  await add();
  const choose = async (label: string, option: string) => { fireEvent.click(screen.getByRole('combobox', { name: label })); fireEvent.click(await screen.findByRole('option', { name: option })); };
  await choose('盤點原因 B-1', '定期');
  expect((screen.getByRole('button', { name: '預覽盤點差額' }) as HTMLButtonElement).disabled).toBe(true);
  await choose('盤點週期 B-1（必填）', '每月');
  await preview();
  expect(screen.getByText('PERIODIC/MONTHLY：核對')).toBeTruthy();
  await choose('盤點原因 B-1', '其他');
  fireEvent.change(screen.getByRole('textbox', { name: '盤點說明 B-1（必填）' }), { target: { value: '' } });
  expect((screen.getByRole('button', { name: '預覽盤點差額' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByRole('textbox', { name: '盤點說明 B-1（必填）' }), { target: { value: '特殊核對' } });
  await preview();
  expect(screen.getByText('OTHER/無週期：特殊核對')).toBeTruthy();
  const writes = fetch.mock.calls.filter(([url]) => url.endsWith('/preview'));
  expect(JSON.parse(writes.at(-1)![1]?.body as string).lines[0]).toMatchObject({ reason_kind: 'OTHER', period: null, note: '特殊核對' });
  await choose('盤點原因 B-1', '定期');
  expect((screen.getByRole('combobox', { name: '盤點週期 B-1（必填）' }) as HTMLInputElement).value).toBe('');
});
it("非當頁已選批次的422原因、週期、說明錯誤可見", async () => {
  const { fetch } = mount(async () => json({ error: { code: 'VALIDATION_ERROR', message: '輸入錯誤', details: {}, fields: [{ field: 'lines.0.reason_kind', message: '原因無效' }, { field: 'lines.0.period', message: '週期無效' }, { field: 'lines.0.note', message: '說明無效' }] } }, 422));
  await add();
  fireEvent.click(screen.getByRole('combobox', { name: '盤點原因 B-1' })); fireEvent.click(await screen.findByRole('option', { name: '定期' }));
  fireEvent.click(screen.getByRole('combobox', { name: '盤點週期 B-1（必填）' })); fireEvent.click(await screen.findByRole('option', { name: '每月' }));
  fetch.mockResolvedValueOnce(json({ items: [batches[1]], total: 1, page: 1, page_size: 20 }));
  fireEvent.change(screen.getByRole('textbox', { name: '搜尋食材或批號' }), { target: { value: '蔬菜' } });
  await waitFor(() => expect(screen.queryByRole('button', { name: '加入 B-1' })).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: '預覽盤點差額' }));
  await screen.findByText('原因無效');
  expect(screen.getByRole('combobox', { name: '盤點原因 B-1' }).getAttribute('aria-invalid')).toBe('true');
  expect(screen.getByRole('combobox', { name: '盤點週期 B-1（必填）' }).getAttribute('aria-invalid')).toBe('true');
  expect(screen.getByRole('textbox', { name: '盤點說明 B-1' }).getAttribute('aria-invalid')).toBe('true');
});
