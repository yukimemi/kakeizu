/**
 * Deploy the built Vite app to Firebase Hosting via REST.
 *
 * Why we deploy to Firebase Hosting at all: the project's
 * <site>.firebaseapp.com / .web.app domains share an origin with the
 * Firebase Auth handler. Hosting the app on this origin avoids the
 * tracking-prevention / third-party-storage issues that break
 * signInWithPopup and signInWithRedirect on Edge / Safari / Brave when
 * the app lives on a different origin (Vercel) than the auth handler.
 *
 * Run after `pnpm build`:
 *   pnpm exec tsx scripts/deploy-firebase-hosting.ts
 */
import { execSync } from "node:child_process";
import { readFileSync, statSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { resolve, relative, join } from "node:path";

const SITE = "kakeizu-71ce1";
const PROJECT = "kakeizu-71ce1";
const ROOT = resolve("dist");

const token = () =>
  execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();

async function api(
  method: string,
  path: string,
  body: unknown,
  t: string,
): Promise<unknown> {
  const url = `https://firebasehosting.googleapis.com/v1beta1/${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${t}`,
      "X-Goog-User-Project": PROJECT,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok)
    throw new Error(`${method} ${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

type FileEntry = { name: string; gzip: Buffer; hash: string };

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(dir)) {
    const p = join(dir, ent);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function listFiles(): FileEntry[] {
  return walk(ROOT).map((abs) => {
    const rel = "/" + relative(ROOT, abs).replace(/\\/g, "/");
    const content = readFileSync(abs);
    const gz = gzipSync(content);
    const hash = createHash("sha256").update(gz).digest("hex");
    return { name: rel, gzip: gz, hash };
  });
}

async function main() {
  const t = token();

  const version = (await api(
    "POST",
    `sites/${SITE}/versions`,
    {
      config: {
        // SPA fallback so deep links work
        rewrites: [
          { glob: "**", path: "/index.html" },
        ],
        headers: [
          {
            glob: "**",
            headers: {
              "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
            },
          },
        ],
      },
    },
    t,
  )) as { name: string };
  const versionName = version.name;
  const versionId = versionName.split("/").pop()!;
  console.log(`Created version: ${versionId}`);

  const entries = listFiles();
  console.log(`Found ${entries.length} files in dist/`);
  const filesMap: Record<string, string> = {};
  for (const e of entries) filesMap[e.name] = e.hash;

  const populate = (await api(
    "POST",
    `${versionName}:populateFiles`,
    { files: filesMap },
    t,
  )) as { uploadUrl: string; uploadRequiredHashes?: string[] };
  console.log(
    `populateFiles ok (required uploads: ${populate.uploadRequiredHashes?.length ?? 0})`,
  );

  const required = new Set(populate.uploadRequiredHashes ?? []);
  let uploaded = 0;
  for (const e of entries) {
    if (!required.has(e.hash)) continue;
    const uploadUrl = `${populate.uploadUrl}/${e.hash}`;
    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${t}`,
        "Content-Type": "application/octet-stream",
      },
      body: e.gzip as unknown as BodyInit,
    });
    if (!res.ok)
      throw new Error(
        `Upload ${e.name}: ${res.status} ${await res.text()}`,
      );
    uploaded++;
  }
  console.log(`Uploaded ${uploaded} files`);

  await api(
    "PATCH",
    `${versionName}?updateMask=status`,
    { status: "FINALIZED" },
    t,
  );
  console.log("Finalized version");

  await api(
    "POST",
    `sites/${SITE}/releases?versionName=${versionName}`,
    {},
    t,
  );
  console.log(`✓ Released. https://${SITE}.web.app  https://${SITE}.firebaseapp.com`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
