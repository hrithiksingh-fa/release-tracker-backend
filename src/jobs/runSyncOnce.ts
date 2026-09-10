// Manual one-off sync, for testing without waiting for the cron schedule:
//   npm run sync:run
import { runEodSync } from "../services/syncService.js";

runEodSync()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
