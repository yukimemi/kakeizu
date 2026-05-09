/**
 * One-off: configure CORS on the Firebase Storage bucket so html-to-image
 * (used by the PNG / PDF exporter) can fetch user photos from the browser
 * without `Access-Control-Allow-Origin` errors.
 *
 * Run: pnpm exec tsx scripts/setup-storage-cors.ts
 *
 * Requires gcloud to be authenticated for the kakeizu-71ce1 project.
 */
import { execSync } from "node:child_process";
import { unlinkSync, writeFileSync } from "node:fs";

const BUCKET = "kakeizu-71ce1.firebasestorage.app";
const TMP = "cors.tmp.json";

const config = [
  {
    origin: ["*"],
    method: ["GET", "HEAD"],
    responseHeader: ["Content-Type", "Cache-Control"],
    maxAgeSeconds: 3600,
  },
];

writeFileSync(TMP, JSON.stringify(config, null, 2));

try {
  execSync(
    `gcloud storage buckets update gs://${BUCKET} --cors-file=${TMP}`,
    { stdio: "inherit" },
  );
  console.log(`\nCORS applied to gs://${BUCKET}`);
} finally {
  unlinkSync(TMP);
}
