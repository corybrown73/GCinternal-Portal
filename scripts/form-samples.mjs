// Renders a first-page mock-up of every form in the library, in the page
// style, to public/form-samples/<industry>-<name>.png (1200 × 900, the 4:3 the
// card shows). Input: a JSON array of {name, industry, description, tags}
// (scripts/form-samples.json, exported from form_templates).
//
//   node scripts/form-samples.mjs
//
// The fields are read out of each description: the phrases between commas,
// colons and dashes become the labelled boxes a crew would fill in; the tags
// decide whether the page carries a photo well, a signature line, a GPS stamp
// or a pass/fail column. A mock-up, plainly: the real form is built with the
// customer on day one.
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as lucide from "lucide-react";

const rows = JSON.parse(readFileSync(new URL("./form-samples.json", import.meta.url), "utf8"));
const OUT = new URL("../public/form-samples/", import.meta.url);
mkdirSync(OUT, { recursive: true });
const WM = readFileSync(
  new URL("../public/branding/gocanvas-wordmark-navy.png", import.meta.url),
).toString("base64");

export const slug = (industry, name) =>
  `${industry}-${name}`
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const clean = (s) =>
  s
    .replace(/\(.*?\)/g, "")
    .replace(/\b(the|a|an|each|every|any|with|and|or|of|per|by|for|at|on|to|from)\b\s*$/i, "")
    .replace(/^\s*(the|a|an|each|every|any|with|and|or)\s+/i, "")
    .trim();

const GENERIC = {
  jsa: ["Task step", "Hazard identified", "Control in place", "PPE required", "Crew sign-off"],
  report: [
    "What happened",
    "Where",
    "People involved",
    "Immediate action taken",
    "Follow-up owner",
  ],
  talk: ["Topic", "Presenter", "Duration", "Key points covered", "Attendees"],
  default: [
    "Description",
    "Location / area",
    "Condition found",
    "Action taken",
    "Follow-up needed",
  ],
};
function fieldsFrom(description, name = "") {
  let first = description.split(/\.\s/)[0] ?? description;
  const listy = first.includes(":") || (first.match(/,/g) ?? []).length >= 3;
  if (!listy) {
    if (/jsa|safety analysis/i.test(name)) return GENERIC.jsa;
    if (/toolbox/i.test(name)) return GENERIC.talk;
    if (/report|incident|near-miss/i.test(name)) return GENERIC.report;
    return GENERIC.default;
  }
  if (first.includes(":")) first = first.slice(first.indexOf(":") + 1);
  const parts = first
    .split(/[,:;—–]|\band\b/)
    .map(clean)
    .filter(
      (p) =>
        p.length > 2 &&
        p.length < 38 &&
        !/^(what|how|who|one|the)\b/i.test(p) &&
        /^[A-Za-z]/.test(p),
    );
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(cap(p));
    if (out.length >= 7) break;
  }
  return out;
}

/**
 * The icon a form wears: the thing you'd draw on the folder. Matched on the
 * name first, then the tags, then the industry, so a JSA gets the hard hat
 * whether it is on a building site or a lease.
 */
const ICONS = [
  [/toolbox/i, "Toolbox"],
  [/jsa|job safety|safety|hazard|workplace exam|observation/i, "HardHat"],
  [/lockout|tagout|loto/i, "Lock"],
  [/boiler/i, "Flame"],
  [/chiller/i, "Thermometer"],
  [/backflow|drain|leak inspection|water heater|rough-in/i, "Droplets"],
  [/fire/i, "Flame"],
  [/blast/i, "Bomb"],
  [/spill|release|stormwater|groundwater|water|hydrant/i, "Droplets"],
  [/sampl|custody|lab/i, "FlaskConical"],
  [/waste|manifest/i, "Trash2"],
  [/solar/i, "Sun"],
  [/wind/i, "Wind"],
  [/battery|storage site/i, "BatteryCharging"],
  [/energy audit|substation|pole|line patrol|outage|cathodic|meter/i, "Zap"],
  [/vehicle|dvir|pre-trip|forklift|haul|trailer|yard/i, "Truck"],
  [/delivery|lading|pickup|receiving|material order/i, "Package"],
  [/damage|storm|incident|near-miss/i, "TriangleAlert"],
  [/timesheet|shift|downtime/i, "Clock"],
  [/refrigerant|air quality|hvac|start-up/i, "Thermometer"],
  [/pressure|gauging|tank|leak|valve|pipeline|dig|excavation/i, "Gauge"],
  [/roof/i, "Home"],
  [/move-in|move-out|unit turn|property|facility|move \//i, "Building2"],
  [/quote|estimate|survey|proposal|satisfaction/i, "FileText"],
  [
    /work order|service ticket|service call|field service ticket|maintenance|commissioning|installation|equipment/i,
    "Wrench",
  ],
  [
    /daily field|daily job|field report|field log|site assessment|well site|right-of-way|patrol/i,
    "MapPin",
  ],
  [/quality|production|5s|housekeeping/i, "Factory"],
  [/attendance|handover|vendor/i, "Users"],
  [/inspection|checklist|walkthrough|audit|verification|examination/i, "ClipboardCheck"],
];
const INDUSTRY_ICON = {
  Construction: "HardHat",
  Energy: "Zap",
  Environmental: "Leaf",
  Facilities: "Building2",
  "Field Service": "Wrench",
  HVAC: "Thermometer",
  Logistics: "Truck",
  Manufacturing: "Factory",
  Mining: "Mountain",
  "Oil & Gas": "Fuel",
  Pipeline: "Gauge",
  "Property Management": "KeyRound",
  Roofing: "Home",
  Utilities: "Zap",
};
export function iconFor(t) {
  const hay = `${t.name} ${(t.tags ?? []).join(" ")}`;
  const hit = ICONS.find(([re]) => re.test(hay));
  return (hit && hit[1]) || INDUSTRY_ICON[t.industry] || "ClipboardCheck";
}
function iconSvg(name, size) {
  const C = lucide[name] ?? lucide.ClipboardCheck;
  return renderToStaticMarkup(createElement(C, { size, strokeWidth: 1.75, color: "#ffffff" }));
}

function unitFor(label) {
  const l = label.toLowerCase();
  if (/temp|superheat|subcool|°/.test(l)) return "°F";
  if (/pressure|psi|gauge/.test(l)) return "psi";
  if (/volt|potential|rectifier/.test(l)) return "V";
  if (/amp|draw/.test(l)) return "A";
  if (/humid|charge|soil|percent/.test(l)) return "%";
  if (/hour|run|time|duration/.test(l)) return "hrs";
  if (/volume|gal|purge|quantity/.test(l)) return "gal";
  if (/co2|ppm|particulate|dust|noise/.test(l)) return "ppm";
  if (/depth|thickness|width|grade|length|clearance/.test(l)) return "in";
  if (/flow/.test(l)) return "gpm";
  return "";
}

function html(t) {
  const tags = (t.tags ?? []).map((x) => x.toLowerCase());
  const has = (...k) => k.some((x) => tags.some((tg) => tg.includes(x)));
  const fields = fieldsFrom(t.description ?? "", t.name);
  const checklist =
    /checklist|inspection|audit|examination|pre-use|pre-shift|pre-trip|walkthrough|patrol|jsa|safety analysis/i.test(
      t.name,
    );
  const readings = has("readings");
  const photos = has("photo");
  const signature = has("signature", "acceptance", "approval", "sign");
  const gps = has("gps", "route");
  const head = [
    ["Date", "09 / 18 / 2026"],
    [
      has("customer", "tenant", "billing", "ticket", "delivery", "work order")
        ? "Customer"
        : "Site / location",
      "",
    ],
    [
      has("vehicle", "dvir", "fleet", "forklift", "equipment")
        ? "Unit / asset #"
        : has("well", "lease")
          ? "Lease / well"
          : "Job / reference #",
      "",
    ],
    [
      has("inspection", "audit", "examination", "patrol")
        ? "Inspector"
        : has("driver", "dvir")
          ? "Driver"
          : "Completed by",
      "",
    ],
  ];
  const rowsHtml = fields
    .map((f, i) => {
      if (checklist)
        return `<tr><td class="lbl">${f}</td><td class="pf"><span class="bx"></span> Pass</td><td class="pf"><span class="bx"></span> Fail</td><td class="pf"><span class="bx"></span> N/A</td><td class="note"></td></tr>`;
      if (readings)
        return `<tr><td class="lbl">${f}</td><td class="val"></td><td class="unit">${unitFor(f)}</td><td class="note"></td></tr>`;
      return `<tr><td class="lbl">${f}</td><td class="val" colspan="3"></td></tr>`;
    })
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap">
<style>
  html,body{margin:0}
  body{width:1200px;height:900px;overflow:hidden;background:#eef2f7;font-family:"Plus Jakarta Sans",system-ui,sans-serif;color:#0a1628;display:flex;align-items:flex-start;justify-content:center}
  .page{position:relative;width:1020px;height:1320px;margin-top:36px;background:#fff;box-shadow:0 12px 40px rgba(7,43,87,.16);padding:56px 64px;box-sizing:border-box}
  .top{display:flex;justify-content:space-between;align-items:flex-start}
  .eyebrow{font-size:12px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#039de7;margin:0 0 8px}
  h1{font-size:40px;font-weight:800;letter-spacing:-.03em;line-height:1.05;color:#072b57;margin:0}
  .rule{width:56px;height:4px;border-radius:2px;background:#f37021;margin:14px 0 12px}
  .sub{font-size:14px;color:#556477;margin:0;max-width:640px;line-height:1.45}
  .wm{height:22px}
  .mark{display:flex;flex-direction:column;align-items:flex-end;gap:18px}
  .disc{width:124px;height:124px;border-radius:32px;background:linear-gradient(160deg,#29b1f0 0%,#039de7 50%,#12509b 100%);display:inline-flex;align-items:center;justify-content:center;box-shadow:0 14px 30px rgba(7,43,87,.22)}
  .tag{display:inline-block;margin-top:10px;padding:3px 10px;border-radius:999px;background:#12509b;color:#fff;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
  .head{display:grid;grid-template-columns:1fr 1fr;gap:12px 24px;margin:28px 0 22px}
  .head div{border-bottom:1.5px solid #cfdcec;padding:6px 0 8px;display:flex;justify-content:space-between;font-size:13px}
  .head b{font-weight:700;color:#072b57}
  .head span{color:#6b7a90;font-family:ui-monospace,monospace}
  h2{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#6b7a90;margin:22px 0 8px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  td{border:1.5px solid #d6effb;padding:10px 12px;height:22px}
  td.lbl{width:38%;font-weight:600;color:#072b57;background:#f7fbfe}
  td.pf{width:11%;white-space:nowrap;color:#556477}
  td.unit{width:8%;color:#6b7a90}
  .bx{display:inline-block;width:14px;height:14px;border:1.5px solid #12509b;border-radius:3px;vertical-align:-2px;margin-right:4px}
  .wells{display:grid;grid-template-columns:${photos ? "1fr 1fr" : "1fr"};gap:16px;margin-top:18px}
  .well{border:1.5px dashed #b9d9ef;border-radius:12px;height:120px;display:flex;align-items:center;justify-content:center;gap:10px;color:#6b7a90;font-size:12px;font-weight:600}
  .sig{margin-top:22px;display:grid;grid-template-columns:2fr 1fr;gap:24px}
  .sig div{border-bottom:1.5px solid #072b57;padding-bottom:6px;height:44px;display:flex;align-items:flex-end;font-size:11px;color:#6b7a90;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
  .stamp{position:absolute;right:64px;top:56px;text-align:right;font-size:11px;color:#6b7a90;line-height:1.5}
  .stamp b{display:block;color:#1da25c;font-weight:800}
</style></head><body><div class="page">
  <div class="top"><div>
    <p class="eyebrow">${t.industry} · page 1</p>
    <h1>${t.name}</h1>
    <div class="rule"></div>
    <p class="sub">${(t.description ?? "").split(/\.\s/)[0]}.</p>
    <span class="tag">GoCanvas form</span>
  </div><div class="mark"><span class="disc">${iconSvg(iconFor(t), 64)}</span><img class="wm" src="data:image/png;base64,${WM}"></div></div>
  ${gps ? `<div class="stamp" style="top:110px"><b>GPS · time stamped</b>38.9072° N, 77.0369° W<br>captured on submit</div>` : ""}
  <div class="head">${head.map(([k, v]) => `<div><b>${k}</b><span>${v}</span></div>`).join("")}</div>
  <h2>${checklist ? "Checklist" : readings ? "Readings" : "Details"}</h2>
  <table>${rowsHtml}</table>
  <div class="wells">
    ${photos ? `<div class="well">📷 &nbsp;Photos — tap to add (required)</div>` : ""}
    <div class="well">Notes / observations</div>
  </div>
  ${signature ? `<div class="sig"><div>Signature</div><div>Date</div></div>` : ""}
</div></body></html>`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await browser.newPage({
    viewport: { width: 1200, height: 900 },
    deviceScaleFactor: 1,
  });
  let n = 0;
  for (const t of rows) {
    await page.setContent(html(t), { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const file = fileURLToPath(new URL(`${slug(t.industry, t.name)}.png`, OUT));
    await page.screenshot({ path: file, type: "png" });
    n++;
  }
  await browser.close();
  writeFileSync(
    fileURLToPath(new URL("./form-samples.sql", import.meta.url)),
    rows
      .map(
        (t) =>
          `update form_templates set image_path = '/form-samples/${slug(t.industry, t.name)}.png' where id = '${t.id}' and image_path is null;`,
      )
      .join("\n") + "\n",
  );
  console.log(`rendered ${n} samples`);
}
