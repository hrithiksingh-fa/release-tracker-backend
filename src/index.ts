import { createApp } from "./app.js";
import { env } from "./env.js";
import { scheduleEodSync } from "./jobs/eodSync.js";

const app = createApp();

app.listen(env.port, () => {
  console.log(`release-tracker-backend listening on :${env.port}`);
  scheduleEodSync();
});
