import { chromium } from 'file:///C:/Users/USER/Documents/playwright-demo/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';
const root = 'C:/Users/USER/AppData/Local/Temp/foodflow-ui-review';
const fixture = JSON.parse(await fs.readFile(`${root}/fixture.json`, 'utf8'));
const browser = await chromium.launch({headless:true, executablePath:'C:/Users/USER/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe'});
const results=[];
try {
 for (const width of [1024,1366]) {
  const context=await browser.newContext({viewport:{width,height:768}});
  await context.addCookies([{name:'foodflow_session', value:fixture.token, url:'http://127.0.0.1:18766'}]);
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const capture=async (name) => {
   await page.screenshot({path:`${root}/${width}-${name}.png`,fullPage:true});
   results.push({width,name,metrics:await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
     smallTargets:[...document.querySelectorAll('button,input,[role="combobox"],a')].filter(e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0).map(e=>({text:e.textContent?.trim()||e.getAttribute('aria-label')||e.tagName,height:e.getBoundingClientRect().height,width:e.getBoundingClientRect().width})).filter(e=>e.height<43.9||e.width<43.9)}))});
  };
  await page.goto('http://127.0.0.1:18766/waste-records');
  await page.getByRole('button',{name:'新增報廢申請'}).waitFor();
  await capture('waste');
  await page.getByRole('button',{name:'新增報廢申請'}).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('dialog').waitFor();
  await page.getByRole('button',{name:/選擇 B-/}).first().click();
  await page.getByRole('textbox',{name:'報廢數量'}).fill('1');
  await capture('waste-modal');
  await page.keyboard.press('Tab');
  const trap=await page.evaluate(()=>!!document.activeElement?.closest('[role="dialog"]'));
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.goto('http://127.0.0.1:18766/stocktakes');
  await page.getByRole('button',{name:'開始多項盤點'}).waitFor();
  await capture('stocktake');
  await page.getByRole('button',{name:'開始多項盤點'}).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button',{name:/加入 B-/}).first().click();
  await page.getByRole('textbox',{name:/實際量/}).fill('4');
  await page.getByRole('button',{name:'預覽盤點差額'}).click();
  await page.getByRole('heading',{name:'盤點預覽'}).waitFor();
  await capture('stocktake-modal');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.getByRole('button',{name:'開始多項盤點'}).click();
  const preserved=await page.getByRole('textbox',{name:/實際量/}).inputValue();
  await page.keyboard.press('Escape');
  await page.goto('http://127.0.0.1:18766/reports?start_date=2026-11-01&end_date=2026-11-30');
  await page.getByRole('heading',{name:'期初期末統計'}).waitFor();
  await page.getByRole('table',{name:'期初期末統計'}).waitFor();
  await capture('reports');
  results.push({width,keyboard:{enterOpens:true,escapeCloses:true,focusWithinModal:trap,stocktakeInputPreserved:preserved==='4'},errors});
  await context.close();
 }
 console.log(JSON.stringify(results,null,2));
 await fs.writeFile(`${root}/results.json`,JSON.stringify(results,null,2));
} finally {await browser.close();}
