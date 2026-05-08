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
- 🔐 **役割別の招待制共有** — オーナー / 編集者 / 閲覧者
- 🔄 **クロスツリーインポート** — 重複登録を避け、差分だけ再同期も可能
- 📱 **レスポンシブ** — PC でもスマホでも

## 🛠️ 技術スタック

| | |
|---|---|
| Runtime | Vite + React 19 + TypeScript |
| Tree canvas | [@xyflow/react](https://reactflow.dev/) (React Flow v12) |
| Auto layout | [@dagrejs/dagre](https://github.com/dagrejs/dagre) + Walker 系カスタム |
| Auth / DB / Storage | Firebase (Authentication / Firestore / Storage) |
| Forms | react-hook-form + zod |
| Styling | Tailwind CSS v3 |
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

## 🚢 デプロイ (Vercel)

`vercel.json` を同梱済み。

1. <https://vercel.com> で GitHub アカウント連携 → このレポを Import
2. Framework Preset は自動で Vite 検出
3. Environment Variables に `.env` の値を貼り付け（VITE_FIREBASE_*）
4. Deploy

push のたびに自動デプロイされ、PR には preview URL が付きます。

カスタムドメイン使う場合は Vercel の Domain 設定 →  Firebase Console の **Authentication → Settings → 承認済みドメイン** にもそのドメインを追加。

## 🏛️ アーキテクチャ概要

### データモデル

```
trees/{treeId}                    # 家系図
  ├─ ownerId, name
  ├─ memberIds: [uid, ...]
  └─ memberRoles: { uid: 'owner' | 'editor' | 'viewer' }

persons/{personId}                # 人物
  ├─ treeId
  ├─ lastName, firstName, kana, birthDate, gender, ...
  ├─ photoUrl, photoTransform     # 写真とクロップ情報
  └─ importedFromId?              # 他ツリーからの取り込み元

relationships/{relId}             # つながり
  ├─ treeId
  ├─ type: 'parent' | 'spouse'
  └─ from, to
```

### レイアウトアルゴリズム

`src/layout/treeLayout.ts` で:

1. **dagre** で初期世代割り（rankdir: TB）
2. 配偶者を同じ世代に揃える（嫁・婿入り側を相方の世代に移動）
3. **Walker 系**で各サブツリーの幅を計算 → 親を子の中央に配置
4. 義理側（in-laws）の親夫婦は子の真上に satellite として配置
5. 兄弟は生年月日順にソート、配偶者の実家側に近い側に寄せる

### 共有の仕組み（シェアコード方式）

メールアドレスを使わず、各ユーザーの uid を「シェアコード」として相手に送ってもらい、オーナーが追加するシンプル方式（Cloud Functions 不要）。Firestore rules でアクセス制御。

## 📜 ライセンス

MIT — `LICENSE` を参照。

## 🙏 謝辞

このアプリの設計と実装は [Claude Code](https://claude.ai/code) (Anthropic) との共同作業で生まれました。
