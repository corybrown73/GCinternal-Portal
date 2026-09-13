// Smoke test: rasterise one static QA screen with html-to-image in Chromium,
// then build a one-slide PPTX from it in node with pptxgenjs.
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import pptxgen from "pptxgenjs";

const dir = process.argv[2];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto(`file://${dir}/integ.html`);
await page.addScriptTag({ path: "node_modules/html-to-image/dist/html-to-image.js" });
// The static QA page references /branding/... which file:// cannot serve.
const wordmark = `data:image/png;base64,${readFileSync("public/branding/gocanvas-wordmark-navy.png").toString("base64")}`;
await page.evaluate((src) => {
  for (const img of document.querySelectorAll('img[src^="/branding/"]')) img.src = src;
}, wordmark);
await page.waitForTimeout(800);
const BLANK =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const dataUrls = await page.evaluate(async (blank) => {
  const nodes = Array.from(document.querySelectorAll(".wp-screen")).slice(0, 3);
  const out = [];
  for (const n of nodes) {
    out.push(
      await window.htmlToImage.toPng(n, {
        width: 1280,
        height: 720,
        pixelRatio: 2,
        backgroundColor: "#fff",
        imagePlaceholder: blank,
      }),
    );
  }
  return out;
}, BLANK);
await browser.close();
writeFileSync(`${dir}/raster-1.png`, Buffer.from(dataUrls[0].split(",")[1], "base64"));
const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";
for (const data of dataUrls) {
  const s = pptx.addSlide();
  s.addImage({ data, x: 0, y: 0, w: "100%", h: "100%" });
  s.addNotes("Test notes");
}
await pptx.writeFile({ fileName: `${dir}/raster-test.pptx` });
console.log("ok", dataUrls.length, "slides");
