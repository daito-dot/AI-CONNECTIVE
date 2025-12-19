# AI Connective デプロイガイド

AWS Amplify（フロントエンド）+ SAM/Lambda（バックエンド）によるマルチモデルAIチャットアプリケーションのデプロイ手順。

## アーキテクチャ

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   AWS Amplify   │────▶│  API Gateway    │────▶│  Lambda (SAM)   │
│   (Frontend)    │     │  (REST API)     │     │  (Backend)      │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                                          ┌──────────────┼──────────────┐
                                          ▼              ▼              ▼
                                    ┌──────────┐  ┌──────────┐  ┌──────────┐
                                    │ Bedrock  │  │ Bedrock  │  │  Gemini  │
                                    │ (Claude) │  │ (Nova等) │  │   API    │
                                    └──────────┘  └──────────┘  └──────────┘
```

## 前提条件

1. **AWSアカウント**
   - Bedrock モデルアクセスが有効化されていること
   - IAM権限: Lambda, API Gateway, CloudFormation, S3

2. **Google Cloud**
   - Gemini API キーを取得済み

3. **GitHub**
   - リポジトリがAmplifyに接続済み

## 重要な技術ポイント

### 1. Bedrockモデル ID（クロスリージョン推論）

Bedrockモデルには`us.`プレフィックスが必要（クロスリージョン推論プロファイル）:

```typescript
// ❌ 間違い
'anthropic.claude-haiku-4-5-20251001-v1:0'
'amazon.nova-lite-v1:0'

// ✅ 正しい
'us.anthropic.claude-haiku-4-5-20251001-v1:0'
'us.amazon.nova-lite-v1:0'
```

### 2. Bedrockクライアントのリージョン設定

クロスリージョン推論には`us-east-1`リージョンが必要:

```typescript
// backend/src/services/bedrock.ts
const client = new BedrockRuntimeClient({
  region: 'us-east-1', // Required for cross-region inference (us. prefix models)
});
```

### 3. SAM esbuild設定（CommonJS形式）

ESM形式は`@google/genai`と互換性がないため、CommonJS形式を使用:

```yaml
# backend/template.yaml
Metadata:
  BuildMethod: esbuild
  BuildProperties:
    Minify: true
    Target: es2022
    Sourcemap: true
    EntryPoints:
      - src/handlers/chat.ts
    External:
      - '@aws-sdk/*'
```

**注意**: `Format: esm`と`OutExtension: .js=.mjs`は使用しない。

### 4. Lambdaハンドラーパス

esbuildはEntryPointsをフラット化するため、ハンドラーパスは短縮形を使用:

```yaml
# ❌ 間違い
Handler: handlers/chat.handler

# ✅ 正しい
Handler: chat.handler
```

### 5. API Gateway CORS設定

```yaml
# backend/template.yaml
Cors:
  AllowMethods: "'GET,POST,OPTIONS'"
  AllowHeaders: "'Content-Type,Authorization'"
  AllowOrigin: "'*'"
```

Lambda関数もCORSヘッダーを返す必要がある:

```typescript
const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};
```

## デプロイ手順

### 1. フロントエンド（Amplify）

GitHubのmainブランチにプッシュすると自動デプロイ。

### 2. バックエンド（CloudShell）

```bash
# 1. リポジトリをクローン/更新
cd ~
rm -rf AI-CONNECTIVE
git clone https://github.com/YOUR_USERNAME/AI-CONNECTIVE.git
cd AI-CONNECTIVE/backend

# 2. 依存関係インストール
npm install

# 3. SAMビルド
sam build

# 4. SAMデプロイ
sam deploy \
  --stack-name ai-connective-api \
  --resolve-s3 \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides GeminiApiKey=YOUR_GEMINI_API_KEY
```

### 3. 既存スタックへの更新

```bash
cd ~/AI-CONNECTIVE && \
git pull origin main && \
cd backend && \
sam build && \
sam deploy \
  --stack-name ai-connective-api \
  --resolve-s3 \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides GeminiApiKey=YOUR_GEMINI_API_KEY
```

## 対応モデル一覧

| Provider | モデル名 | モデルID |
|----------|----------|----------|
| Anthropic | Claude Opus 4.5 | `us.anthropic.claude-opus-4-5-20251101-v1:0` |
| Anthropic | Claude Sonnet 4.5 | `us.anthropic.claude-sonnet-4-5-20250929-v1:0` |
| Anthropic | Claude Haiku 4.5 | `us.anthropic.claude-haiku-4-5-20251001-v1:0` |
| Amazon | Nova Pro | `us.amazon.nova-pro-v1:0` |
| Amazon | Nova Lite | `us.amazon.nova-lite-v1:0` |
| Meta | Llama 4 Scout | `us.meta.llama4-scout-17b-instruct-v1:0` |
| Meta | Llama 3.3 70B | `us.meta.llama3-3-70b-instruct-v1:0` |
| Google | Gemini 3 Flash | `gemini-3-flash-preview` |
| Google | Gemini 3 Pro | `gemini-3-pro-preview` |

## トラブルシューティング

### "Dynamic require of child_process is not supported"

**原因**: ESM形式でビルドしている
**解決**: template.yamlから`Format: esm`と`OutExtension`を削除

### "The provided model identifier is invalid"

**原因**:
1. モデルIDが間違っている
2. クロスリージョン推論用の`us.`プレフィックスがない
3. BedrockクライアントがUSリージョンに接続していない

**解決**:
1. 正しいモデルIDを使用（上記一覧参照）
2. `us.`プレフィックスを追加
3. `region: 'us-east-1'`を設定

### "Invocation with on-demand throughput isn't supported"

**原因**: 推論プロファイルが必要なモデルを直接呼び出している
**解決**: `us.`プレフィックス付きモデルIDを使用

### CORS エラー

**原因**:
1. API GatewayのCORS設定が不完全
2. LambdaがCORSヘッダーを返していない

**解決**:
1. template.yamlでGET,POST,OPTIONSを許可
2. Lambda関数でCORSヘッダーを返す

### 502 Bad Gateway

**原因**: Lambda関数が起動時にクラッシュ
**解決**: CloudWatchログを確認 (`aws logs tail /aws/lambda/FUNCTION_NAME --since 5m`)

## 参考リンク

- [Amazon Bedrock Inference Profiles](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-support.html)
- [AWS SAM esbuild](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/building-custom-runtimes.html)
- [Gemini API Models](https://ai.google.dev/gemini-api/docs/models)
