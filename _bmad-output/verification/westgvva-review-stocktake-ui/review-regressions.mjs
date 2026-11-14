// 僅連隔離服務；fixture 含測試登入資訊，必須置於版控外。
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const base = process.env.UI_TEST_BASE;
assert(base?.startsWith("http://127.0.0.1:"));
const fixture = JSON.parse(await fs.readFile(process.env.UI_FIXTURE, "utf8"));
assert(/^foodflow_ui_.*_test$/.test(fixture.database));
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH });
const results = [];
try {
  for (const width of [1024, 1366]) {
    const context = await browser.newContext({ viewport: { width, height: 768 } });
    await context.addCookies([{ name: "foodflow_session", value: fixture.token, url: base }]);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const batchId = fixture.batches[0];
    const quantity = async () => (await (await context.request.get(`${base}/api/v1/waste-records/batches/${batchId}`)).json()).remaining_quantity;
    const before = await quantity();
    await page.goto(`${base}/waste-records?batch_id=${batchId}`);
    await page.getByRole("button", { name: "全數報廢申請", exact: true }).click();
    await page.getByRole("button", { name: "送出全數報廢審核", exact: true }).click();
    await page.getByRole("dialog", { name: "全數報廢申請", exact: true }).waitFor({ state: "hidden" });
    await page.getByRole("dialog", { name: "報廢申請", exact: true }).waitFor({ state: "hidden" });
    assert(await page.getByRole("status").filter({ hasText: "報廢申請已送出" }).isVisible());
    assert.equal(await quantity(), before);
    await page.goBack();
    await page.getByRole("textbox", { name: "報廢數量", exact: true }).waitFor();
    assert.equal(await page.getByRole("dialog").count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    await page.screenshot({ path: `${process.env.UI_EVIDENCE_DIR}/${width}-review-back.png`, fullPage: true, animations: "disabled" });
    results.push({ width, fullSuccessClosesBothDialogs: true, pendingLeavesStockUnchanged: true, backReopensBatch: true, noHorizontalOverflow: true, pageErrors: errors });
    assert.deepEqual(errors, []);
    await context.close();
  }
  await fs.writeFile(`${process.env.UI_EVIDENCE_DIR}/review-results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally { await browser.close(); }
