<!-- kata:agents:base:begin -->
## yukimemi/* shared conventions

This file is the agent-agnostic source of truth (per the
[agents.md](https://agents.md) convention). The matching
`CLAUDE.md` and `GEMINI.md` files are thin shims that point back
here so each tool's auto-load behaviour still finds something.
**Edit AGENTS.md, not the shims.**

### Git workflow

- **No direct push to `main`.** Open a PR.
  - Exception: trivial typo / whitespace / docs wording fixes.
  - Exception: standalone version bumps.
- Branch names: `feat/...`, `fix/...`, `chore/...`.
- **PR titles + bodies in English. Commit messages in English.**
- Tag-based releases: `git tag vX.Y.Z && git push origin vX.Y.Z`.

### PR review cycle

- Every PR runs reviews from **Gemini Code Assist** and
  **CodeRabbit**. Wait for both bots to post, address their
  comments (push fixes to the PR branch), and merge only after
  feedback is resolved.
- **Reply to reviewers after pushing a fix.** Reply on the
  corresponding review thread with an **@-mention**
  (`@gemini-code-assist` / `@coderabbitai`). Silent fixes are
  invisible to reviewers and cost the audit trail.
- A review thread is **settled** the moment the latest bot reply
  is ack-only ("Thank you" / "Understood" / a re-review summary
  with no new findings) or 30 minutes elapse with no actionable
  comment.
- **Merge gate**: review bots quiet AND owner explicit approval.
- Bot-authored PRs (Renovate / Dependabot) skip the bot-review
  gate; CI green + owner approval is enough.

### Worktree workflow

Use [`renri`](https://github.com/yukimemi/renri) for any
commit-bound change. From the main checkout:

```sh
renri add <branch-name>            # create a worktree (jj-first)
renri --vcs git add <branch-name>  # force a git worktree
renri remove <branch-name>         # cleanup after merge
renri prune                        # GC stale worktrees
```

Read-only inspection can stay on the main checkout.

### kata-managed sections

Several files in this repo are managed by `kata apply` from the
[`yukimemi/pj-presets`](https://github.com/yukimemi/pj-presets)
templates — the bytes between `<!-- kata:*:begin -->` and
`<!-- kata:*:end -->` markers, plus the overwrite-always files
listed in `.kata/applied.toml`. **Editing those bytes locally
won't survive the next `kata apply`** — push the change to the
upstream template repo (`yukimemi/pj-base` / `yukimemi/pj-rust` /
…) instead. The marker scopes are layered:

- `kata:agents:base:*` — language-agnostic conventions (this section).
- `kata:agents:rust:*` — added when `pj-rust` applies.
- `kata:agents:rust-cli:*` — added when `pj-rust-cli` applies.
<!-- kata:agents:base:end -->
<!-- kata:agents:pnpm:begin -->
## pnpm / TypeScript layer (kata: pj-pnpm)

This block is owned by `yukimemi/pj-pnpm` and re-applied on every
`kata apply`. Edits go upstream to the template, not to this file.

### Package manager

- **pnpm only.** `pnpm-lock.yaml` is the source of truth.
  `package-lock.json` / `yarn.lock` must not appear.
- `packageManager` in `package.json` pins the major.
- CI uses `pnpm install --frozen-lockfile`. Local dev does not —
  developers add deps with `pnpm add` / `pnpm add -D`.

### Scripts

- `pnpm dev` — start the dev server.
- `pnpm build` — `tsc -b && vite build` (or framework equivalent).
- `pnpm lint` — ESLint on the whole tree.
- `pnpm test` — Vitest run-once. `pnpm test:watch` for the loop.

### TypeScript

- Project-references layout: root `tsconfig.json` references
  `tsconfig.app.json` (browser/runtime code) and
  `tsconfig.node.json` (Vite config and any node-side scripts).
- `noEmit: true` everywhere — `tsc -b` is type-check-only; the
  bundler emits.

### .env / secrets

- Never commit `.env`. `.env.example` is the documented surface.
- Vite-exposed vars must be prefixed `VITE_` to be readable from
  browser code; anything without that prefix is server-only.
<!-- kata:agents:pnpm:end -->
<!-- kata:agents:react-web:begin -->
## Vite + React + Tailwind layer (kata: pj-react-web)

This block is owned by `yukimemi/pj-react-web` and re-applied on
every `kata apply`. Edits go upstream to the template, not to
this file.

### Stack

- **Vite** as the dev server / bundler.
- **React 19** with the `react-jsx` runtime (no `import React`).
- **TypeScript** project-references via the `pj-pnpm` root
  `tsconfig.json` → `tsconfig.app.json` (browser) +
  `tsconfig.node.json` (vite config / scripts).
- **Tailwind v3** + PostCSS + autoprefixer.
- **ESLint flat config** with `@eslint/js` recommended,
  `typescript-eslint` recommended, `eslint-plugin-react-hooks`,
  `eslint-plugin-react-refresh` (vite preset).
- **Vitest** for tests (`pnpm test` / `pnpm test:watch`).

### Dev server reachability

`vite.config.ts` is `when = "once"` (consumer territory — see
`template.toml` for why), so the starter we ship is just a
seed. The seed sets `server.host = true` and allows `.ts.net`,
`.local`, and `localhost` so Tailscale and LAN previews work
out of the box.

**Convention for every PJ on this layer**: keep the Tailscale
allowlist in `server.allowedHosts`. Even if you rewrite
`vite.config.ts` for plugins (VitePWA, Sentry, …), preserve at
minimum:

```ts
server: {
  host: true,
  allowedHosts: [".ts.net", ".local", "localhost"],
},
```

Without it the dev server rejects Tailscale / mDNS hosts with
"Blocked request" and remote previews silently break. There's
no automated guard for this since the file is consumer-owned —
treat it as a checklist item when touching `vite.config.ts`.

### Tailwind

- `tailwind.config.js` is `when = "once"` — per-project theme
  extensions (custom colours, fontFamily, keyframes) survive
  `kata apply`.
- The shared baseline only sets `content` so Tailwind picks up
  `index.html` and `src/**/*.{ts,tsx}`. Add fonts / colours /
  shadows to the project's own copy.

### `src/` skeleton

- `main.tsx`, `App.tsx`, `index.css`, `vite-env.d.ts` are all
  `when = "once"` placeholders — they boot a working "Hello"
  page after init and are otherwise free for the project to
  rewrite.

### Required deps

The framework layer doesn't ship a populated `package.json` (the
`pj-pnpm` layer ships an empty-deps scaffold instead). After
`kata init`, run:

```sh
pnpm add react react-dom
pnpm add -D vite @vitejs/plugin-react typescript \
  @types/react @types/react-dom @types/node \
  tailwindcss postcss autoprefixer \
  eslint typescript-eslint @eslint/js globals \
  eslint-plugin-react-hooks eslint-plugin-react-refresh \
  vitest
```

Pin majors to whatever the `kakeizu` reference project is using
when starting a new repo.
<!-- kata:agents:react-web:end -->
<!-- kata:agents:firebase:begin -->
## Firebase + Vercel layer (kata: pj-firebase)

This block is owned by `yukimemi/pj-firebase` and re-applied on
every `kata apply`. Edits go upstream to the template, not to
this file.

### Hosting

- **Firebase Hosting** is the primary target — `firebase deploy
  --only hosting` from local, or the `Deploy to Firebase
  Hosting` GitHub Actions workflow from `main`.
- **Vercel** runs in parallel as a same-stack mirror so PR
  previews work out of the box. Keep `vercel.json` and
  `firebase.json`'s rewrites/headers in sync — both should
  rewrite `**` → `/index.html` for SPA routing and emit
  `Cross-Origin-Opener-Policy: same-origin-allow-popups`
  (Firebase Auth popup needs this).

### Rules

- `firestore.rules` and `storage.rules` ship a permissive
  signed-in-only baseline. Replace with the project's real
  schema before shipping. Verified-email is required at the
  baseline so Google sign-in's pre-verification flow is the
  default.
- Push rules with `firebase deploy --only firestore:rules,storage`
  (or via a project-side `scripts/deploy-rules.ts` helper —
  kakeizu has one as a reference).

#### Cross-service rules IAM (one-time per project)

If `storage.rules` calls `firestore.get(...)` / `firestore.exists(...)`
to gate Storage on Firestore data, the Firebase Storage service
agent needs `roles/firebaserules.firestoreServiceAgent`. The
Firebase Console grants this automatically on first Publish of
such a rule, but the REST API / CLI deploy paths (this stack
uses CI + a local `scripts/deploy-rules.ts`) do **not** trigger
the prompt. Without it every cross-service call returns null and
rules silently 403, with no useful logs anywhere.

Grant once per project (after enabling Firebase Storage):

```sh
gcloud projects add-iam-policy-binding <PROJECT_ID> \
  --member="serviceAccount:service-<PROJECT_NUMBER>@gcp-sa-firebasestorage.iam.gserviceaccount.com" \
  --role="roles/firebaserules.firestoreServiceAgent"
```

Then re-deploy the storage ruleset (IAM doesn't apply
retroactively to a live ruleset; you need a fresh release).
Allow ~1–2 min for IAM propagation before testing.

### Env wiring

- `.env.example` documents the `VITE_FIREBASE_*` surface. Copy
  to `.env`, fill in from the Firebase console.
- The deploy workflow rewrites `.env` from secrets at build time
  (Vite inlines envs at compile time, so the build container
  needs them, not the runtime).
- Required GitHub secrets:
  - `FIREBASE_SERVICE_ACCOUNT` — JSON for a service account
    with the `Firebase Hosting Admin` role.
  - `VITE_FIREBASE_*` — one secret per `.env.example` entry.

### projectId

`firebase.json` is Tera-rendered with `{{ project.name }}` for
the hosting `site` field, but the **Firebase project ID** is a
separate thing (often a different string with a random suffix).
Replace `REPLACE_ME_FIREBASE_PROJECT_ID` in
`.github/workflows/deploy.yml` with the actual project ID before
the first deploy.

### Authorized domains

Firebase Auth's authorized-domains list is what makes
`localhost`, `*.ts.net` (Tailscale), and `*.local` (mDNS)
work for sign-in popups. Update via the Identity Toolkit REST
API (`X-Goog-User-Project: <project-id>` header required) — the
UI doesn't expose Tailscale-style hosts cleanly. See the
`reference_firebase_authorized_domains_via_gcloud` memory for
the exact PATCH call.
<!-- kata:agents:firebase:end -->
