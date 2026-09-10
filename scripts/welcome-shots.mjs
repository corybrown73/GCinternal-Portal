// Screenshot every screen of a rendered welcome page, and print it to PDF.
//   node scripts/welcome-shots.mjs <dir> <name>   (expects <dir>/<name>.html)
import { chromium } from "playwright";

const [dir, name] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
await page.goto(`file://${dir}/${name}.html`, { waitUntil: "load" });
await page.waitForTimeout(800);
const stages = await page.$$(".wp-stage");
for (let i = 0; i < stages.length; i += 1) {
  await stages[i].screenshot({ path: `${dir}/${name}-${i + 1}.png` });
}
await page.emulateMedia({ media: "print" });
await page.pdf({
  path: `${dir}/${name}.pdf`,
  width: "13.333in",
  height: "7.5in",
  printBackground: true,
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
});
await browser.close();
console.log(`${stages.length} screens, ${name}.pdf`);
