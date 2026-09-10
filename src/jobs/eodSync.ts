import cron from "node-cron";
import { env } from "../env.js";
import { runEodSync } from "../services/syncService.js";

export function scheduleEodSync() {
  cron.schedule(env.eodSyncCron, async () => {
    console.log(`[eod-sync] starting (cron: ${env.eodSyncCron})`);
    try {
      const result = await runEodSync();
      console.log("[eod-sync] finished", result);
    } catch (err) {
      console.error("[eod-sync] failed", err);
    }
  });
  console.log(`[eod-sync] scheduled with cron "${env.eodSyncCron}"`);
}
