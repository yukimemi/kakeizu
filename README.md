<div align="center">

<img src="./docs/logo.svg" alt="家系図 / kakeizu" width="480" />

**家族みんなで作る、和紙のような家系図ウェブアプリ。**

代々を辿り、いまを記す ── 家族の樹を、ここから。

---

</div>

## ✨ 特徴

- 🌳 **インタラクティブな家系図** — Walker 系の自動レイアウトで、世代と兄弟関係をきれいに整列
- 🖋️ **和紙 × 朱印デザイン** — Shippori Mincho、墨色、朱の伝統的な和の配色
- 👨‍👩‍👧 **家族ごとの線色** — 親夫婦ごとに和色（藍・柳・紫・黄土・浅葱…）で識別
- 💑 **婚姻線は二重線** — 家系図の伝統表現
- 📷 **顔写真の編集** — アップロード後に円内でドラッグ&ズーム調整
- 👥 **複数家系図** — 自分の家系・配偶者の実家・友人の系譜などを切替
- 🔐 **メール招待制の共有** — オーナー / 編集者 / 閲覧者を相手のメールアドレスで招待 (Firestore allowlist と連動)
- 🪪 **「自分」を起点にした続柄表示** — ノードに「父」「祖母」「いとこ」などを朱印で重ね描き
- 🎂 **誕生日 / 年齢オプション** — 今月の誕生日一覧、存命者の満年齢表示は ON/OFF を端末ごとに保存
- 📜 **年表** — 全人物の生没を時系列にスクロール
- 🔎 **人物検索** — 漢字・カナ・部分一致でジャンプ
- 🕰️ **編集履歴と元に戻す** — 追加 / 更新 / 削除を監査ログに残し、ワンクリックで復元
- 🔄 **クロスツリーインポート** — 重複登録を避け、差分だけ再同期も可能
- 🖼️ **PNG / PDF 書き出し** — 印刷・配布用に高解像度エクスポート
- 📱 **PWA / レスポンシブ** — ホーム画面に追加してオフラインでも閲覧可

## 🛠️ 技術スタック

| | |
|---|---|
| Runtime | Vite + React 19 + TypeScript |
| Tree canvas | [@xyflow/react](https://reactflow.dev/) (React Flow v12) |
| Auto layout | [@dagrejs/dagre](https://github.com/dagrejs/dagre) + Walker 系カスタム |
| Auth / DB / Storage | Firebase (Authentication / Firestore / Storage) |
| Forms | react-hook-form + zod |
| Routing | react-router-dom v7 |
| Dates | date-fns |
| Export | html-to-image + jsPDF |
| Styling | Tailwind CSS v3 |
| PWA | vite-plugin-pwa (Workbox) |
| Test | Vitest |
| Fonts | Shippori Mincho · Noto Sans JP · JetBrains Mono |

## 🚀 セットアップ

### 1. Firebase プロジェクトを用意

1. [Firebase Console](https://console.firebase.google.com/) で新規プロジェクト作成
2. **Authentication** → Sign-in method → **Google** を有効化
3. **Firestore Database** を作成（本番モード）
4. **Storage** を有効化（Spark プランの場合 Blaze へアップグレードが必要）

### 2. セキュリティルール

```sh
# 開発者の gcloud で REST 経由でデプロイするスクリプトを同梱
pnpm exec tsx scripts/deploy-rules.ts
```

または `firestore.rules` / `storage.rules` の内容を Firebase Console に手動で貼り付け。

> Storage rules が `firestore.get(...)` を呼んで Firestore のメンバーシップを確認するため、初回のみ Firebase Storage の SA に `roles/firebaserules.firestoreServiceAgent` を付与する必要があります（手順は [AGENTS.md](./AGENTS.md) の "Cross-service rules IAM" 節を参照）。

### 3. Web アプリ登録 + 環境変数

Firebase Console の Project Settings → Web アプリを登録 → 設定値を `.env` に埋める。

```sh
cp .env.example .env
# .env を編集
```

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

### 4. 起動

```sh
pnpm install
pnpm dev
```

→ <http://localhost:5173> で Google サインイン

## 🚢 デプロイ

本番は **Firebase Hosting** が主、**Vercel** は PR プレビュー用のミラーとして並走しています。

### Firebase Hosting (本番)

`main` への push で `.github/workflows/deploy.yml` が走り、`firestore.rules` / `storage.rules` をデプロイしてから `dist/` を Firebase Hosting (`live` channel) に配信します。

必要な GitHub Secrets:
- `FIREBASE_SERVICE_ACCOUNT` — Firebase Hosting Admin 権限を持つ SA の JSON
- `VITE_FIREBASE_*` — `.env.example` の各エントリを 1 つずつ

ローカルからの手動デプロイは `pnpm exec tsx scripts/deploy-firebase-hosting.ts`。

### Vercel (PR プレビュー)

`vercel.json` を同梱済み。

1. <https://vercel.com> で GitHub アカウントを連携 → このレポを Import
2. Framework Preset は自動で Vite を検出
3. Environment Variables に `.env` の値を貼り付け（`VITE_FIREBASE_*`）
4. Deploy

push のたびに自動デプロイされ、PR には preview URL が付きます。
カスタムドメインを使う場合は Vercel 側で設定したあと、Firebase Console の **Authentication → Settings → 承認済みドメイン** にもそのドメインを追加してください。

## 🏛️ アーキテクチャ概要

### データモデル

```
trees/{treeId}                    # 家系図
  ├─ ownerId, name
  ├─ memberIds:    [uid, ...]                       # array-contains 検索用
  ├─ memberRoles:  { uid: 'owner' | 'editor' | 'viewer' }
  ├─ memberInfo:   { uid: { email, displayName } }  # 表示名キャッシュ
  ├─ invitedEmails: [email, ...]                    # 未承認招待 (sign-in 時に claim)
  └─ pendingRoles:  { email: role }

persons/{personId}                # 人物
  ├─ treeId
  ├─ lastName, firstName, *Kana, gender, birthDate, deathDate
  ├─ photoUrl, photoTransform     # 写真 + クロップ/ズーム情報
  ├─ postalCode, address
  ├─ phones[], emails[], socials  # 構造化された連絡先
  ├─ memo
  ├─ importedFromId               # 他ツリーからの取り込み元
  └─ deletedAt, deletedBy         # ソフトデリート (履歴から復元可能)

relationships/{relId}             # つながり
  ├─ treeId
  ├─ type: 'parent' | 'spouse'
  ├─ from, to
  └─ deletedAt, deletedBy         # ソフトデリート

auditEvents/{eventId}             # 編集履歴 (top-level)
  ├─ treeId, ts, actor, actorEmail, actorName
  ├─ type:        'create' | 'update' | 'delete' | 'restore'
  ├─ targetType:  'person' | 'relationship'
  ├─ before, after, summary       # 日本語サマリーを書き込み時に確定
  └─ revertOfId?                  # revert 元イベントへのリンク

config/access                     # メール allowlist (Firestore / Storage rules が参照)
  ├─ allowedEmails: [email, ...]
  └─ adminEmails:   [email, ...]  # 失効防止対象
config/accessGrants
  └─ grants: [{ email, treeId }]  # tree 削除時に orphan を一括 revoke
```

### レイアウトアルゴリズム

`src/layout/treeLayout.ts` で:

1. **dagre** で初期世代割り（rankdir: TB）
2. 配偶者を同じ世代に揃える（嫁・婿入り側を相方の世代に移動）
3. **Walker 系**で各サブツリーの幅を計算 → 親を子の中央に配置
4. 義理側（in-laws）の親夫婦は子の真上に satellite として配置
5. 兄弟は生年月日順にソート、配偶者の実家側に近い側に寄せる

### 共有の仕組み（メール招待）

オーナーが招待相手のメールアドレスを `trees/{treeId}` の `invitedEmails` / `pendingRoles` に登録すると、同時にグローバル allowlist (`config/access.allowedEmails`) と `config/accessGrants` に grant が記録されます。

招待された人が Google でサインインすると、`claimEmailInvites()` が `invitedEmails` から自分のメールを見つけて `memberIds` / `memberRoles` / `memberInfo` を埋め、未承認エントリは消えます。

招待のキャンセル・メンバー解除・ツリー削除のいずれでも `accessGrants` 経由で allowlist が再計算されるので、孤立した write 権限が残らない仕組みです (`adminEmails` は常に保護)。Cloud Functions は不要で、すべて Firestore のセキュリティルールと普通の write で完結します。

## 🤖 開発者 / エージェント向けドキュメント

エージェント (Claude Code, Gemini Code Assist 等) と人間の双方が参照する開発規約・ワークフロー・kata テンプレート構成は [AGENTS.md](./AGENTS.md) にまとまっています。

## 📜 ライセンス

MIT — `LICENSE` を参照。

## 🙏 謝辞

このアプリの設計と実装は [Claude Code](https://claude.ai/code) (Anthropic) との共同作業で生まれました。
