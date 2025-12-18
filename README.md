# AI Connective - Multi-Model AI Chat Platform

AWS Bedrock + Google Gemini を活用したマルチモデルAIチャットアプリケーション。

## 対応モデル

### AWS Bedrock経由
- **Anthropic Claude**: Opus 4.5, Sonnet 4.5, Haiku 4.5
- **Amazon Nova**: Nova 2 Pro, Nova 2 Lite
- **Meta Llama**: Llama 4 Scout, Llama 3.3 70B
- **Mistral**: Mistral Large 2
- **DeepSeek**: DeepSeek R1

### Google Gemini (直接API)
- Gemini 2.5 Flash
- Gemini 2.5 Pro

## アーキテクチャ

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

## ローカル開発

### 前提条件
- Node.js 20+
- AWS CLI (設定済み)
- SAM CLI

### セットアップ

```bash
# フロントエンド
npm install
cp .env.example .env.local
# .env.local を編集してAPI_ENDPOINTを設定
npm run dev

# バックエンド
cd backend
npm install
npm run build
```

### ローカルでLambdaをテスト

```bash
cd backend
sam local start-api --parameter-overrides GeminiApiKey=your-key
```

## AWSデプロイ

### 方法1: AWS Amplify (推奨)

1. **Amplify Console** でアプリを作成
2. GitHubリポジトリを接続
3. 環境変数を設定:
   - `GEMINI_API_KEY`: Google Gemini APIキー
4. デプロイは自動実行

### 方法2: 手動デプロイ

```bash
# バックエンド (SAM)
cd backend
npm run build
sam build
sam deploy --guided \
  --parameter-overrides GeminiApiKey=your-key Environment=prod

# フロントエンド
npm run build
# dist/ を S3 + CloudFront または Amplify Hosting にデプロイ
```

## 環境変数

### フロントエンド (.env.local)
```
VITE_API_ENDPOINT=https://your-api.execute-api.region.amazonaws.com/prod
```

### バックエンド (Lambda環境変数)
```
GEMINI_API_KEY=your-gemini-api-key
AWS_REGION=us-east-1
```

## Bedrockモデルアクセス設定

AWSコンソールで以下のモデルへのアクセスを有効化:

1. **Amazon Bedrock Console** → **Model access**
2. 以下のモデルを有効化:
   - Anthropic Claude (すべて)
   - Amazon Nova
   - Meta Llama
   - Mistral
   - DeepSeek

## 技術スタック

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS
- **Backend**: AWS Lambda (Node.js 20), SAM
- **AI**: AWS Bedrock, Google Gemini API
- **Hosting**: AWS Amplify

## ライセンス

MIT
