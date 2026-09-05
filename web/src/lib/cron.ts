import cron from "node-cron";
import { refreshOwnedPrices, snapshotPortfolios } from "./portfolio";
import { importTcgcsv } from "./tcgcsv";

const globalForCron = globalThis as unknown as { __collectrCron?: boolean };

/** Daily price refresh at 03:30 local time + a snapshot at startup so charts always have today. */
export function startCron() {
  if (globalForCron.__collectrCron) return;
  globalForCron.__collectrCron = true;
  const schedule = process.env.PRICE_REFRESH_CRON ?? "30 3 * * *";
  cron.schedule(schedule, async () => {
    console.log("[cron] importing TCGCSV prices...");
    try {
      const r = await importTcgcsv();
      console.log(`[cron] tcgcsv: ${r.products} products, ${r.priced} priced, ${r.historyRows} history rows, ${r.errors.length} errors`);
    } catch (err) {
      console.error("[cron] tcgcsv import failed", err);
    }
    console.log("[cron] refreshing owned card prices...");
    try {
      const r = await refreshOwnedPrices();
      console.log(`[cron] done: refreshed ${r.refreshed}, failed ${r.failed}, skipped ${r.skipped} of ${r.total}`);
    } catch (err) {
      console.error("[cron] refresh failed", err);
    }
  });
  setTimeout(() => snapshotPortfolios().catch((e) => console.error("[cron] snapshot failed", e)), 5000);
  console.log(`[cron] scheduled price refresh (${schedule})`);
}
