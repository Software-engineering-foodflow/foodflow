// node shot.cjs <html> <out.png> [query] [scale] [pad]
const { chromium } = require('playwright');
(async () => {
  const [, , html, out, q = '', scale = '2', pad = '150'] = process.argv;
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1900, height: 1600 }, deviceScaleFactor: Number(scale) });
  await p.goto('file://' + require('path').resolve(html) + (q ? '?' + q : ''));
  await p.waitForTimeout(300);
  const c = await p.locator('#canvas').boundingBox();
  const f = await p.locator('.hlframe').count() ? await p.locator('.hlframe').boundingBox() : null;
  if (f) {
    const P = Number(pad);
    const y = Math.max(c.y, f.y - P), y2 = Math.min(c.y + c.height, f.y + f.height + P + 40);
    await p.screenshot({ path: out, clip: { x: c.x, y, width: c.width, height: y2 - y } });
  } else {
    await p.locator('#canvas').screenshot({ path: out });
  }
  await b.close();
})();
