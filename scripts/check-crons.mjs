// After `npm run build`: every schedule in vercel.json must be in the Build
// Output config Vercel actually reads, and every scheduled path must be a
// route the app serves. Both failed silently once: the crons never reached
// .vercel/output/config.json, so nothing scheduled ever ran in production.
import { existsSync, readFileSync } from "node:fs";

const wanted = JSON.parse(readFileSync("vercel-crons.json", "utf8"));
const built = JSON.parse(readFileSync(".vercel/output/config.json", "utf8")).crons ?? [];
const routes = readFileSync("src/routeTree.gen.ts", "utf8");

const key = (c) => `${c.schedule} ${c.path}`;
const have = new Set(built.map(key));
const missing = wanted.filter((c) => !have.has(key(c)));
const unrouted = wanted.filter(
  (c) => !routes.includes(`'${c.path}'`) && !routes.includes(`"${c.path}"`),
);

if (missing.length || unrouted.length) {
  for (const c of missing) console.error(`not in .vercel/output/config.json: ${key(c)}`);
  for (const c of unrouted) console.error(`no route serves the cron path: ${c.path}`);
  process.exit(1);
}
console.log(`crons ok: ${wanted.length} scheduled, all in the build output, all routed`);
