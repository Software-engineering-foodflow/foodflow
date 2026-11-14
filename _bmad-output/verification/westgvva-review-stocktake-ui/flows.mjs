import { chromium } from 'file:///C:/Users/USER/Documents/playwright-demo/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const root='C:/Users/USER/AppData/Local/Temp/foodflow-ui-review';
const fixture=JSON.parse(await fs.readFile(`${root}/fixture.json`,'utf8'));
const browser=await chromium.launch({headless:true, executablePath:'C:/Users/USER/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe'});
const results=[];
try {for(const width of [1024,1366]) {
 const context=await browser.newContext({viewport:{width,height:768}});
 await context.addCookies([{name:'foodflow_session',value:fixture.token,url:'http://127.0.0.1:18766'}]);
 const page=await context.newPage();
 const base='http://127.0.0.1:18766';
 const before=await (await context.request.get(`${base}/api/v1/waste-records/batches/${fixture.batches[0]}`)).json();
 const afterApprove=before;
 await page.goto(`${base}/stocktakes`);
 await page.getByRole('button',{name:'開始多項盤點'}).click(); console.log('opened',width);
 const add=page.getByRole('button',{name:/加入 B-/});
 await add.first().click();await add.nth(1).click();
 assert.equal(await add.first().isDisabled(),true);
 await page.getByRole('textbox',{name:/實際量/}).first().fill(afterApprove.remaining_quantity);
 await page.getByRole('textbox',{name:/實際量/}).nth(1).fill('8');
 console.log('added',width); const kind=page.getByRole('combobox',{name:/盤點原因/}).first();
 await kind.click();await page.getByRole('option',{name:'定期',exact:true}).click();
 console.log('requires details',width); assert.equal(await page.getByRole('button',{name:'預覽盤點差額'}).isDisabled(),true);
 await page.getByRole('combobox',{name:/盤點週期/}).click();
 await page.getByRole('option',{name:'每月',exact:true}).click();
 await page.getByRole('combobox',{name:/盤點原因/}).nth(1).scrollIntoViewIfNeeded();
 await page.getByRole('combobox',{name:/盤點原因/}).nth(1).focus();
 await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
 console.log('requires details',width); assert.equal(await page.getByRole('button',{name:'預覽盤點差額'}).isDisabled(),true);
 await page.getByRole('textbox',{name:/盤點說明/}).nth(1).fill('現場核對');
 await page.getByRole('button',{name:'預覽盤點差額'}).click();
 await page.getByRole('heading',{name:'盤點預覽'}).waitFor();
 await page.getByRole('button',{name:'確認盤點'}).scrollIntoViewIfNeeded();
 await page.screenshot({path:`${root}/${width}-stocktake-preview.png`,fullPage:true});
 assert.equal(await page.getByRole('table',{name:'盤點預覽'}).getByText('0.000',{exact:true}).count(),2);
 for(let i=0;i<30;i++){await page.keyboard.press('Tab');assert(await page.evaluate(()=>!!document.activeElement?.closest('[role="dialog"]')));}
 await page.getByRole('button',{name:'確認盤點'}).click();
 // The persisted success must be visible to the user, not hidden behind the modal.
 const result=page.getByText('盤點已完成', {exact:true});
 await result.waitFor();
 await page.getByRole('dialog').waitFor({state:'hidden'});
 await page.screenshot({path:`${root}/${width}-stocktake-success.png`,fullPage:true});
 results.push({width,
  duplicateSelectionBlocked:true,periodRequired:true,otherNoteRequired:true,serverPreviewZeroDelta:true,
  focusTrapped30Tabs:true,successVisible:await result.isVisible(),modalAfterSuccess:await page.getByRole('dialog').count()});
 await context.close();
}
await fs.writeFile(`${root}/flow-results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{await browser.close();}
