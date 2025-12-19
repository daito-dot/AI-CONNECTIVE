# AI Connective アーキテクチャ設計書

## 概要

マルチテナント対応AIチャットプラットフォーム。RAGファイル対応、チャット履歴永続化、4層ロール階層による認証を実装。

## システムアーキテクチャ

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Frontend (Amplify)                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   Chat UI   │  │ File Upload │  │  Auth UI    │  │  Admin Dashboard    │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           API Gateway + Cognito                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │   /chat (POST)   │  │  /files (CRUD)   │  │  /admin (CRUD)   │          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Lambda Functions (SAM)                            │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────────────────┐ │
│  │    Chat    │  │    RAG     │  │    Auth    │  │   Usage Statistics     │ │
│  │  Handler   │  │  Handler   │  │  Handler   │  │      Handler           │ │
│  └────────────┘  └────────────┘  └────────────┘  └────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
            ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
            │   DynamoDB   │  │      S3      │  │   Bedrock/   │
            │  (履歴/認証)  │  │  (ファイル)   │  │   Gemini     │
            └──────────────┘  └──────────────┘  └──────────────┘
```

## Phase 1: RAGファイルサポート

### 対応フォーマット

| 種類 | フォーマット | 処理方法 |
|------|-------------|----------|
| ドキュメント | PDF, DOCX, TXT | S3 + テキスト抽出 |
| データ | CSV, XLSX | S3 + Pandas/コード実行 |
| データベース | PostgreSQL, MySQL | 直接接続 (SQL) |

### S3バケット構造

```
ai-connective-files-{environment}/
├── {organization_id}/
│   └── {company_id}/
│       └── {user_id}/
│           ├── documents/
│           │   ├── {file_id}.pdf
│           │   └── {file_id}.docx
│           └── data/
│               ├── {file_id}.csv
│               └── {file_id}.xlsx
```

### DynamoDB テーブル: Files

```typescript
interface FileRecord {
  PK: string;           // FILE#{file_id}
  SK: string;           // META
  fileId: string;
  fileName: string;
  fileType: string;     // pdf | docx | csv | xlsx | txt
  s3Key: string;
  organizationId: string;
  companyId: string;
  userId: string;
  uploadedAt: string;
  fileSize: number;
  status: 'processing' | 'ready' | 'error';
  extractedText?: string;  // For small files
  textS3Key?: string;      // For large extracted text
}
```

### データベース接続設定

```typescript
interface DatabaseConnection {
  PK: string;           // DBCONN#{connection_id}
  SK: string;           // META
  connectionId: string;
  name: string;
  type: 'postgresql' | 'mysql';
  host: string;
  port: number;
  database: string;
  username: string;
  passwordSecretArn: string;  // Secrets Manager
  organizationId: string;
  companyId: string;
  createdBy: string;
  createdAt: string;
}
```

### RAG処理フロー

```
1. ファイルアップロード
   ├── S3へ保存
   ├── DynamoDBにメタデータ登録
   └── 非同期でテキスト抽出（大きなファイル）

2. チャット時
   ├── ユーザーがファイル参照を指定
   ├── ファイルタイプに応じた処理:
   │   ├── PDF/DOCX: 抽出テキストをコンテキストに追加
   │   ├── CSV: Pandasコード生成→実行→結果返却
   │   └── DB: SQL生成→実行→結果をコンテキストに
   └── AIモデルで回答生成
```

## Phase 2: チャット履歴永続化

### DynamoDB テーブル: Conversations

```typescript
interface Conversation {
  PK: string;           // CONV#{conversation_id}
  SK: string;           // META
  conversationId: string;
  title: string;
  organizationId: string;
  companyId: string;
  departmentId?: string;
  userId: string;
  modelId: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
}

interface Message {
  PK: string;           // CONV#{conversation_id}
  SK: string;           // MSG#{timestamp}#{message_id}
  messageId: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: FileAttachment[];
  modelId?: string;
  inputTokens?: number;
  outputTokens?: number;
  cost?: number;
  createdAt: string;
}
```

### GSI (Global Secondary Index)

```
GSI1: organizationId-createdAt-index
  - 組織管理者が全会話を閲覧

GSI2: companyId-createdAt-index
  - 企業管理者が企業内会話を閲覧

GSI3: userId-createdAt-index
  - ユーザーが自分の会話を閲覧
```

## Phase 3: マルチテナント認証

### 4層ロール階層

```
┌─────────────────────────────────────────────────────────────────┐
│                    System Admin (システム管理者)                  │
│  - 全組織・全機能へのアクセス                                     │
│  - 組織の作成・削除・設定変更                                     │
│  - 全ログ・統計の閲覧                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│               Organization Admin (組織管理者)                     │
│  - 担当組織内の全企業・全機能へのアクセス                          │
│  - 企業の作成・削除・設定変更                                     │
│  - 組織内全ログ・統計の閲覧                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Company Admin (企業管理者)                       │
│  - 担当企業内の全部署・全ユーザーへのアクセス                       │
│  - 部署の作成・削除・設定変更                                     │
│  - ユーザーの招待・削除・ロール変更                                │
│  - 企業内全ログ・統計の閲覧                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     User (一般ユーザー)                          │
│  - 自分のチャット・ファイルへのアクセス                            │
│  - 共有されたファイルへのアクセス                                  │
│  - 自分の使用統計の閲覧                                          │
└─────────────────────────────────────────────────────────────────┘
```

### DynamoDB テーブル: Organizations

```typescript
interface Organization {
  PK: string;           // ORG#{organization_id}
  SK: string;           // META
  organizationId: string;
  name: string;
  plan: 'free' | 'starter' | 'business' | 'enterprise';
  maxCompanies: number;
  maxUsersPerCompany: number;
  monthlyTokenLimit: number;
  createdAt: string;
  updatedAt: string;
}

interface Company {
  PK: string;           // ORG#{organization_id}
  SK: string;           // COMPANY#{company_id}
  companyId: string;
  name: string;
  maxDepartments: number;
  maxUsers: number;
  createdAt: string;
}

interface Department {
  PK: string;           // COMPANY#{company_id}
  SK: string;           // DEPT#{department_id}
  departmentId: string;
  name: string;
  createdAt: string;
}
```

### DynamoDB テーブル: Users

```typescript
interface User {
  PK: string;           // USER#{user_id}
  SK: string;           // META
  userId: string;       // Cognito sub
  email: string;
  name: string;
  role: 'system_admin' | 'org_admin' | 'company_admin' | 'user';
  organizationId?: string;  // Required except for system_admin
  companyId?: string;       // Required for company_admin and user
  departmentId?: string;    // Optional
  createdAt: string;
  lastLoginAt: string;
}
```

### Cognito User Pool 設定

```yaml
UserPool:
  Type: AWS::Cognito::UserPool
  Properties:
    UserPoolName: ai-connective-users
    AutoVerifiedAttributes:
      - email
    Schema:
      - Name: role
        AttributeDataType: String
        Mutable: true
      - Name: organization_id
        AttributeDataType: String
        Mutable: true
      - Name: company_id
        AttributeDataType: String
        Mutable: true
```

## Phase 4: 使用統計

### DynamoDB テーブル: Usage

```typescript
interface DailyUsage {
  PK: string;           // USAGE#{organization_id}
  SK: string;           // {date}#{company_id}#{user_id}
  date: string;         // YYYY-MM-DD
  organizationId: string;
  companyId: string;
  userId: string;
  modelUsage: {
    [modelId: string]: {
      requestCount: number;
      inputTokens: number;
      outputTokens: number;
      cost: number;
    };
  };
  fileUploads: number;
  fileStorageBytes: number;
}
```

### 集計クエリ例

```typescript
// ユーザー別月間使用量
const userMonthlyUsage = await ddb.query({
  TableName: 'Usage',
  KeyConditionExpression: 'PK = :pk AND SK BETWEEN :start AND :end',
  ExpressionAttributeValues: {
    ':pk': `USAGE#${organizationId}`,
    ':start': '2024-01-01#company#user',
    ':end': '2024-01-31#company#user',
  },
});

// 企業別使用量（GSI使用）
const companyUsage = await ddb.query({
  TableName: 'Usage',
  IndexName: 'companyId-date-index',
  KeyConditionExpression: 'companyId = :cid AND date BETWEEN :start AND :end',
});
```

## 適性検査ユースケース

### データモデル

```typescript
interface AptitudeTestResult {
  PK: string;           // TEST#{organization_id}#{company_id}
  SK: string;           // RESULT#{employee_id}#{test_date}
  employeeId: string;
  employeeName: string;
  testDate: string;
  testType: string;     // e.g., 'personality', 'aptitude', 'skill'
  scores: {
    [category: string]: number;
  };
  // Example scores:
  // personality: { extraversion: 75, agreeableness: 80, ... }
  // aptitude: { verbal: 85, numerical: 72, logical: 90, ... }
}
```

### RAG処理フロー（適性検査）

```
1. 管理者がCSVで適性検査結果をアップロード
   CSV例:
   employee_id,name,verbal,numerical,logical,personality_type
   001,田中太郎,85,72,90,INTJ
   002,佐藤花子,78,88,82,ENFP

2. ユーザーがチャットで質問
   「営業職に適性のある社員を5名リストアップして」

3. システムの処理:
   a. SQLクエリ生成:
      SELECT * FROM aptitude_results
      WHERE verbal > 75 AND personality_type LIKE 'E%'
      ORDER BY verbal + numerical DESC LIMIT 5

   b. クエリ実行 → 結果取得

   c. AIモデルで自然言語回答生成:
      「営業職に適性のある社員トップ5は以下の通りです:
       1. 佐藤花子 - 言語力78、外向的性格(ENFP)
       2. ...」
```

## API エンドポイント一覧

### 認証 (Cognito)
- `POST /auth/signup` - ユーザー登録
- `POST /auth/signin` - ログイン
- `POST /auth/signout` - ログアウト
- `POST /auth/refresh` - トークンリフレッシュ

### チャット
- `POST /chat` - チャットリクエスト
- `GET /chat/history` - 会話履歴一覧
- `GET /chat/history/{conversationId}` - 会話詳細
- `DELETE /chat/history/{conversationId}` - 会話削除

### ファイル
- `POST /files/upload` - ファイルアップロード
- `GET /files` - ファイル一覧
- `GET /files/{fileId}` - ファイル詳細
- `DELETE /files/{fileId}` - ファイル削除
- `POST /files/{fileId}/query` - ファイルへのクエリ

### データベース接続
- `POST /db/connections` - 接続追加
- `GET /db/connections` - 接続一覧
- `POST /db/connections/{connectionId}/query` - SQLクエリ実行
- `DELETE /db/connections/{connectionId}` - 接続削除

### 管理
- `GET /admin/organizations` - 組織一覧
- `POST /admin/organizations` - 組織作成
- `GET /admin/companies` - 企業一覧
- `POST /admin/companies` - 企業作成
- `GET /admin/users` - ユーザー一覧
- `POST /admin/users/invite` - ユーザー招待
- `GET /admin/usage` - 使用統計

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| Frontend | React + TypeScript + Vite + Tailwind CSS |
| Hosting | AWS Amplify |
| API | API Gateway + Lambda (SAM) |
| Auth | Amazon Cognito |
| Database | DynamoDB |
| Storage | S3 |
| AI Models | Bedrock (Claude, Nova, Llama) + Gemini API |
| Secret | AWS Secrets Manager |
| Monitoring | CloudWatch |

## 実装優先順位

1. **Phase 1: RAGファイルサポート**
   - S3バケット作成
   - ファイルアップロードAPI
   - PDF/テキスト抽出
   - CSV処理（Pandas）
   - チャットへの統合

2. **Phase 2: チャット履歴**
   - DynamoDBテーブル作成
   - 履歴保存API
   - 履歴取得API
   - UI実装

3. **Phase 3: 認証**
   - Cognito設定
   - マルチテナントロール
   - 権限チェック実装
   - 管理画面

4. **Phase 4: 使用統計**
   - 使用量トラッキング
   - 集計API
   - ダッシュボード
