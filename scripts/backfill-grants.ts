/**
 * Seed config/accessGrants from existing tree.memberInfo + invitedEmails.
 * Idempotent — safe to re-run.
 *
 * Run: pnpm exec tsx scripts/backfill-grants.ts
 */
import { execSync } from "node:child_process";

const PROJECT_ID = "kakeizu-71ce1";

function token() {
  return execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();
}

type FsValue = {
  stringValue?: string;
  arrayValue?: { values?: FsValue[] };
  mapValue?: { fields?: Record<string, FsValue> };
};
function unwrap(v: FsValue): unknown {
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.arrayValue) return (v.arrayValue.values ?? []).map(unwrap);
  if (v.mapValue) {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v.mapValue.fields ?? {})) {
      out[k] = unwrap(val);
    }
    return out;
  }
  return undefined;
}
function wrap(v: unknown): FsValue {
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v))
    return { arrayValue: { values: v.map(wrap) } };
  if (v && typeof v === "object") {
    const fields: Record<string, FsValue> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      fields[k] = wrap(val);
    }
    return { mapValue: { fields } };
  }
  throw new Error(`unwrap-cannot-handle: ${typeof v}`);
}

async function main() {
  const t = token();
  const headers = {
    Authorization: `Bearer ${t}`,
    "X-Goog-User-Project": PROJECT_ID,
    "Content-Type": "application/json",
  };

  // List trees
  const treesUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/trees?pageSize=300`;
  const treesRes = await fetch(treesUrl, { headers });
  const treesJson = (await treesRes.json()) as {
    documents?: Array<{
      name: string;
      fields?: Record<string, FsValue>;
    }>;
  };
  const trees = treesJson.documents ?? [];
  console.log(`Loaded ${trees.length} trees`);

  type Grant = { email: string; treeId: string };
  const grantsKey = new Set<string>();
  const grants: Grant[] = [];
  const allowedEmails = new Set<string>();

  for (const t of trees) {
    const treeId = t.name.split("/").pop()!;
    const memberInfo = (unwrap({ mapValue: { fields: t.fields?.memberInfo?.mapValue?.fields ?? {} } }) ?? {}) as Record<
      string,
      { email?: string }
    >;
    const invitedEmails = (unwrap(t.fields?.invitedEmails ?? { arrayValue: { values: [] } }) ?? []) as string[];
    for (const info of Object.values(memberInfo)) {
      const email = info?.email?.toLowerCase();
      if (!email) continue;
      const k = `${email}|${treeId}`;
      if (!grantsKey.has(k)) {
        grantsKey.add(k);
        grants.push({ email, treeId });
        allowedEmails.add(email);
      }
    }
    for (const e of invitedEmails) {
      const email = e.toLowerCase();
      const k = `${email}|${treeId}`;
      if (!grantsKey.has(k)) {
        grantsKey.add(k);
        grants.push({ email, treeId });
        allowedEmails.add(email);
      }
    }
  }
  console.log(`Computed ${grants.length} grants for ${allowedEmails.size} emails`);

  // Write grants doc
  const grantsUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/config/accessGrants`;
  const body = {
    fields: {
      grants: wrap(grants),
      updatedAt: { timestampValue: new Date().toISOString() },
    },
  };
  const r = await fetch(grantsUrl, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`PATCH grants: ${r.status} ${await r.text()}`);
  console.log("Wrote config/accessGrants");

  // Reconcile allowlist (add missing, leave others — we don't want to
  // revoke without explicit removal flow).
  const accessUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/config/access`;
  const cur = (await (await fetch(accessUrl, { headers })).json()) as {
    fields?: { allowedEmails?: FsValue };
  };
  const existing = new Set(
    ((unwrap(cur.fields?.allowedEmails ?? { arrayValue: { values: [] } }) ?? []) as string[]).map(
      (e) => e.toLowerCase(),
    ),
  );
  for (const e of allowedEmails) existing.add(e);
  const merged = [...existing];
  const r2 = await fetch(`${accessUrl}?updateMask.fieldPaths=allowedEmails&updateMask.fieldPaths=updatedAt`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      fields: {
        allowedEmails: wrap(merged),
        updatedAt: { timestampValue: new Date().toISOString() },
      },
    }),
  });
  if (!r2.ok) throw new Error(`PATCH access: ${r2.status} ${await r2.text()}`);
  console.log(`Reconciled allowedEmails (${merged.length} total)`);

  console.log("✓ Done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
