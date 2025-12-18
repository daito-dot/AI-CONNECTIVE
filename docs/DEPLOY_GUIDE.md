# AI Connective デプロイガイド

## 概要

このドキュメントでは、AI Connective を AWS にデプロイする手順を説明します。

### アーキテクチャ

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   CloudFront    │────▶│   API Gateway   │────▶│     Lambda      │
│   + Amplify     │     │                 │     │  (Node.js 20)   │
│   (Frontend)    │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                                    ┌────────────────────┼────────────────────┐
                                    ▼                                         ▼
                          ┌─────────────────┐                       ┌─────────────────┐
                          │   AWS Bedrock   │                       │  Google Gemini  │
                          │ Claude/Nova/etc │                       │   Flash/Pro     │
                          └─────────────────┘                       └─────────────────┘
```

---

## Part 1: フロントエンド（AWS Amplify）

### 1-1. Amplify アプリの作成

1. AWS Console → **Amplify** を検索
2. **「新しいアプリを作成」** をクリック
3. **「GitHub」** を選択して認証
4. リポジトリ `AI-CONNECTIVE` を選択
5. ブランチ `main` を選択

### 1-2. ビルド設定

`amplify.yml` が自動検出されます。内容:

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: dist
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
```

### 1-3. 環境変数の設定

Amplify Console → **「アプリの設定」** → **「環境変数」**

| 変数名 | 値 |
|--------|-----|
| `VITE_API_ENDPOINT` | （バックエンドデプロイ後に設定） |

### 1-4. WAF設定の確認

**重要**: WAF（Web Application Firewall）が有効だと403エラーになります。

Amplify Console → **「アプリの設定」** → **「ファイアウォール」** → 無効化

### 1-5. デプロイ

**「保存してデプロイ」** をクリック。ビルドログで以下を確認:

```
✓ 32 modules transformed.
dist/index.html                  1.53 kB
dist/assets/index-XXXXX.js     215.69 kB
```

---

## Part 2: バックエンド（AWS SAM + Lambda）

### 2-1. AWS CloudShell を開く

1. AWS Console → 右上の **ターミナルアイコン (>_)** をクリック
2. リージョンが **「東京 (ap-northeast-1)」** になっていることを確認

### 2-2. リポジトリをクローン

```bash
cd ~
rm -rf AI-CONNECTIVE
git clone https://github.com/YOUR_USERNAME/AI-CONNECTIVE.git
cd AI-CONNECTIVE/backend
```

### 2-3. 依存関係をインストール

```bash
npm install
```

### 2-4. SAM ビルド

**重要**: CloudShell では esbuild をグローバルインストールできないため、npm 経由で実行します。

```bash
npm run sam:build
```

これは `package.json` の以下のスクリプトを実行:
```json
{
  "scripts": {
    "sam:build": "sam build"
  },
  "dependencies": {
    "esbuild": "^0.24.0"
  }
}
```

#### よくあるエラーと解決策

| エラー | 原因 | 解決策 |
|--------|------|--------|
| `Cannot find esbuild` | esbuild が PATH にない | `npm run sam:build` を使用 |
| `arm64 image not found` | アーキテクチャ不一致 | `template.yaml` で `x86_64` を指定 |

### 2-5. SAM デプロイ

```bash
npm run sam:deploy
```

対話形式で以下を入力:

| 質問 | 入力値 |
|------|--------|
| Stack Name | `ai-connective-api` |
| AWS Region | `ap-northeast-1` |
| Parameter GeminiApiKey | あなたのGemini APIキー |
| Parameter Environment | `prod` |
| Confirm changes before deploy | `y` |
| Allow SAM CLI IAM role creation | `y` |
| Disable rollback | `y` |
| ChatFunction has no authentication | `y` |
| ModelsFunction has no authentication | `y` |
| Save arguments to configuration file | `y` |
| SAM configuration file | Enter（デフォルト） |
| SAM configuration environment | Enter（デフォルト） |

### 2-6. デプロイ完了

成功すると以下が出力されます:

```
CloudFormation outputs from deployed stack
-------------------------------------------
Key                 ApiEndpoint
Description         API Gateway endpoint URL
Value               https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/prod
-------------------------------------------
```

**この URL をコピー！**

---

## Part 3: フロントエンドとバックエンドの接続

### 3-1. Amplify 環境変数を更新

Amplify Console → **「アプリの設定」** → **「環境変数」**

| 変数名 | 値 |
|--------|-----|
| `VITE_API_ENDPOINT` | `https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/prod` |

### 3-2. 再デプロイ

Amplify Console → **「ホスティング」** → **「デプロイ」** → **「このバージョンを再デプロイ」**

---

## Part 4: Bedrock モデルアクセス

### 4-1. モデルアクセスの確認

2024年以降、Bedrock モデルは**自動的に有効化**されます。

AWS Console → **Bedrock** → **「モデルカタログ」** でモデルを確認できます。

### 4-2. 初回利用時（Anthropic モデル）

Anthropic Claude モデルは初回利用時にユースケースの入力が必要な場合があります。

---

## トラブルシューティング

### フロントエンド 403 エラー

1. **WAF が有効** → 無効化する
2. **CloudFront キャッシュ** → キャッシュを無効化
3. **ビルド出力が空** → `index.html` に `<script type="module" src="/index.tsx"></script>` があるか確認

### バックエンド esbuild エラー

```
Error: Cannot find esbuild
```

**解決策**: `npm run sam:build` を使用（直接 `sam build` を実行しない）

### バックエンド アーキテクチャエラー

```
Error: No such image: public.ecr.aws/sam/build-nodejs20.x:latest-arm64
```

**解決策**: `template.yaml` で `Architectures: - x86_64` を指定

---

## ファイル構成

```
AI-CONNECTIVE/
├── frontend
│   ├── App.tsx
│   ├── index.html
│   ├── index.tsx
│   ├── types.ts
│   ├── vite.config.ts
│   ├── package.json
│   └── amplify.yml
│
├── backend/
│   ├── src/
│   │   ├── handlers/
│   │   │   └── chat.ts
│   │   ├── services/
│   │   │   ├── bedrock.ts
│   │   │   └── gemini.ts
│   │   ├── config/
│   │   │   └── models.ts
│   │   └── types/
│   │       └── index.ts
│   ├── template.yaml
│   ├── package.json
│   └── tsconfig.json
│
└── docs/
    └── DEPLOY_GUIDE.md
```

---

## 対応モデル一覧

| Provider | モデル | 特徴 |
|----------|--------|------|
| **Anthropic** | Claude Opus 4.5 | 最高性能 |
| **Anthropic** | Claude Sonnet 4.5 | バランス型 |
| **Anthropic** | Claude Haiku 4.5 | 高速・低コスト |
| **Amazon** | Nova 2 Pro | マルチモーダル |
| **Amazon** | Nova 2 Lite | コスパ最強 |
| **Meta** | Llama 4 Scout | 軽量高性能 |
| **Meta** | Llama 3.3 70B | 大規模モデル |
| **Mistral** | Mistral Large 2 | 欧州製・高性能 |
| **DeepSeek** | DeepSeek R1 | コード特化 |
| **Google** | Gemini 2.5 Flash | 高速 |
| **Google** | Gemini 2.5 Pro | Google最高性能 |

---

## コスト目安

| サービス | 無料枠 | 超過時 |
|----------|--------|--------|
| Amplify Hosting | 月1000ビルド分（12ヶ月） | $0.01/ビルド分 |
| Lambda | 月100万リクエスト（永久） | $0.20/100万リクエスト |
| API Gateway | 月100万リクエスト（12ヶ月） | $3.50/100万リクエスト |
| Bedrock | なし | モデルにより異なる |
| Gemini API | 無料枠あり | 従量課金 |
