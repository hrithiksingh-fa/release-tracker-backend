import "dotenv/config";

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  credentialsEncryptionKey: process.env.CREDENTIALS_ENCRYPTION_KEY ?? "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  slackBotToken: process.env.SLACK_BOT_TOKEN ?? "",
  eodSyncCron: process.env.EOD_SYNC_CRON ?? "0 23 * * *",
  adminApiToken: process.env.ADMIN_API_TOKEN ?? "change-me",
};
