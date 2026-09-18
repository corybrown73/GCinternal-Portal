// Screenshot the first screens of a rendered welcome page at phone width.
//   node scripts/welcome-mobile-shots.mjs <dir> <name>
import { chromium } from "playwright";
const [dir, name] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await p.goto(`file://${dir}/${name}.html`, { waitUntil: "load" });
await p.addStyleTag({ content: ".wp-side{display:none}" });
await p.waitForTimeout(500);
const boxes = await p.$$(".wp-stage-box");
for (let i = 0; i < Math.min(boxes.length, 4); i++) {
  await boxes[i].screenshot({ path: `${dir}/${name}-m${i + 1}.png` });
}
const overflow = await p.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
console.log(`${boxes.length} stages, horizontal overflow ${overflow}px`);
await b.close();
