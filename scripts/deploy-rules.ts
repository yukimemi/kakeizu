/**
 * Deploys firestore.rules and storage.rules via the Firebase Rules REST API
 * using a gcloud-issued access token.
 *
 * Run: pnpm exec tsx scripts/deploy-rules.ts
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PROJECT_ID = "kakeizu-71ce1";
const STORAGE_BUCKET = "kakeizu-71ce1.firebasestorage.app";

const token = () =>
  execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();

async function api(method: string, path: string, body: unknown, t: string) {
  const url = `https://firebaserules.googleapis.com/v1/${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${t}`,
      "X-Goog-User-Project": PROJECT_ID,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok)
    throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function deploy(rulesPath: string, releaseName: string, sourceName: string) {
  const t = token();
  const content = readFileSync(rulesPath, "utf8");

  const ruleset = (await api(
    "POST",
    `projects/${PROJECT_ID}/rulesets`,
    { source: { files: [{ name: sourceName, content }] } },
    t,
  )) as { name: string };

  const rulesetName = ruleset.name;
  console.log(`Created ruleset: ${rulesetName}`);

  await api(
    "PATCH",
    `projects/${PROJECT_ID}/releases/${releaseName}`,
    {
      release: {
        name: `projects/${PROJECT_ID}/releases/${releaseName.replace("%2F", "/")}`,
        rulesetName,
      },
    },
    t,
  );
  console.log(`Released to: ${releaseName}`);
}

async function main() {
  console.log("Deploying Firestore rules...");
  await deploy("firestore.rules", "cloud.firestore", "firestore.rules");

  console.log("Deploying Storage rules...");
  await deploy(
    "storage.rules",
    `firebase.storage%2F${STORAGE_BUCKET}`,
    "storage.rules",
  );

  console.log("✓ Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
