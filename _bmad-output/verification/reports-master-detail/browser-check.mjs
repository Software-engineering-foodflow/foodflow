// UI-only fixtures: no business data writes. API aggregation is covered separately by Vitest.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from 'file:///C:/Users/USER/Documents/playwright-demo/node_modules/playwright-core/index.mjs';
const output = new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const base = 'http://127.0.0.1:18866';
const tx = (id, ingredient, name, unit, type, delta, before, after, nonFefo = false) => ({ id,
  ingredient_id: ingredient, ingredient_name: name, unit, type, quantity_delta: delta,
  quantity_before: before, quantity_after: after, batch_id: ingredient, batch_number: `B-${ingredient}`,
  operation_group_id: 'hidden-operation-uuid', operator_id: 1, operator_name: '小郭',
  occurred_at: `2026-11-14T03:00:${String(id).padStart(2, '0')}Z`, reason: type === 'WASTE' ? '過期' : '核對',
  is_non_fefo: nonFefo, reverses_transaction_id: null, source_receipt_id: 1,
  source_receipt_number: 'GR-00000001', source_item_id: ingredient });
const items = [tx(1,11,'冷凍蝦仁','包','RECEIPT','5.000','0.000','5.000'),
  tx(2,11,'冷凍蝦仁','包','WASTE','-2.000','5.000','3.000'),
  tx(3,11,'冷凍蝦仁','包','ADJUSTMENT','-1.000','3.000','2.000'),
  tx(4,11,'冷凍蝦仁','包','ISSUE','-1.000','2.000','1.000',true),
  tx(5,12,'冷凍水餃','盒','RECEIPT','5.000','0.000','5.000'),
  tx(6,13,'高麗菜','公斤','RECEIPT','3.000','0.000','3.000')];
const stock = [11,12,13].map(id => { const t = items.find(t=>t.ingredient_id===id); return {
  ingredient_id:id, ingredient_name:t.ingredient_name, unit:t.unit, opening:'0.000',
  receipt:id===13?'3.000':'5.000', issue:id===11?'1.000':'0.000', waste:id===11?'2.000':'0.000',
  adjustment:id===11?'-1.000':'0.000', closing:id===11?'1.000':id===12?'5.000':'3.000' }; });
const batches = stock.map(s=>({id:s.ingredient_id, ingredient_id:s.ingredient_id, ingredient_name:s.ingredient_name,
  batch_number:`B-${s.ingredient_id}`, unit:s.unit, remaining_quantity:s.closing,
  expiry_date:'2026-12-01',location_name:'冷凍庫',source_receipt_id:1,source_status:'CONFIRMED'}));
const browser = await chromium.launch({headless:true, executablePath:'C:/Users/USER/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe'});
const results=[];
try {
  for(const width of [1024,1366]) {
    const context=await browser.newContext({viewport:{width,height:768}});
    await context.route('**/api/v1/**',async route=>{
      const url=new URL(route.request().url()); let body;
      if(url.pathname.endsWith('/auth/me')) body={id:1,name:'管理員',role:'ADMIN',username:'ui',is_active:true};
      else if(url.pathname.endsWith('/reports/stock')) body=stock;
      else if(url.pathname.endsWith('/reports/waste')) body=[];
      else if(/inventory-transactions\/\d+$/.test(url.pathname)) body=items.find(t=>t.id===Number(url.pathname.split('/').at(-1)));
      else if(url.pathname.endsWith('/inventory-transactions')) body={items:[...items].reverse(),total:items.length,page:1,page_size:100};
      else if(url.pathname.endsWith('/stocktakes/batches')) body={items:batches,total:batches.length,page:1,page_size:20};
      else body={items:[],total:0,page:1,page_size:20};
      await route.fulfill({json:body});
    });
    const page=await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${base}/reports?start_date=2026-11-01&end_date=2026-11-14`);
    const table=page.getByRole('table',{name:'食材期間總覽'});
    await table.waitFor();
    assert.equal(await table.getByRole('link',{name:/庫存/}).count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
    await page.screenshot({path:`${output}/${width}-master.png`,fullPage:true,animations:'disabled'});
    const row=table.getByRole('row').filter({hasText:'冷凍蝦仁'});
    await row.scrollIntoViewIfNeeded();
    const scroll=await page.evaluate(()=>window.scrollY);
    await row.getByRole('button').click();
    const drawer=page.getByRole('dialog');await drawer.waitFor();
    assert.equal(await drawer.getByRole('link',{name:/庫存/}).count(),1);
    assert.equal(await drawer.getByText(/hidden-operation-uuid/).count(),0);
    const tabs=drawer.getByRole('tab');assert.equal(await tabs.count(),4);
    await drawer.getByRole('tab',{name:/非 FEFO/}).click();
    await drawer.getByRole('table').waitFor();
    assert.equal(await drawer.getByRole('table').getByRole('row').count(),2);
    await drawer.getByRole('tab',{name:/全部異動/}).click();
    await page.waitForTimeout(300);
    await page.screenshot({path:`${output}/${width}-drawer.png`,animations:'disabled'});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
    await page.keyboard.press('Escape');await drawer.waitFor({state:'hidden'});
    assert(Math.abs(await page.evaluate(()=>window.scrollY)-scroll)<2);
    await page.goto(`${base}/stocktakes`);
    await page.getByRole('button',{name:'開始多項盤點'}).click();
    await page.getByRole('button',{name:'加入 B-11',exact:true}).click();
    const input=page.getByRole('textbox',{name:'實際量 B-11',exact:true});await input.waitFor();
    assert(await input.evaluate(el=>el.closest('tr')?.previousElementSibling?.textContent.includes('B-11')));
    await input.fill('1.500');
    await page.waitForTimeout(300);
    await page.screenshot({path:`${output}/${width}-stocktake-inline.png`,animations:'disabled'});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
    assert.deepEqual(errors,[]);
    results.push({width,mode:'mock API / actual browser',masterDrawer:true,inlineStocktake:true,noOverflow:true,scrollPreserved:true,errors});
    await context.close();
  }
  await fs.writeFile(`${output}/browser-results.json`,JSON.stringify(results,null,2));
  console.log(JSON.stringify(results));
} finally { await browser.close(); }
