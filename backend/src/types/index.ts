// AI Provider types
export type AIProvider = 'bedrock' | 'gemini';

// ============================================
// File Types
// ============================================
export type FileType = 'pdf' | 'docx' | 'txt' | 'csv' | 'xlsx';
export type FileStatus = 'uploading' | 'processing' | 'ready' | 'error';

// File visibility levels (who can access)
export type FileVisibility =
  | 'private'       // Only the owner
  | 'department'    // Department members
  | 'company'       // Company members
  | 'organization'  // Organization members
  | 'system';       // All users (system-wide)

// File category for organization
export type FileCategory = 'chat_attachment' | 'rag_source' | 'knowledge_base';

export interface FileRecord {
  PK: string;           // FILE#{file_id}
  SK: string;           // META
  fileId: string;
  fileName: string;
  fileType: FileType;
  mimeType: string;
  s3Key: string;
  userId: string;
  createdByRole: UserRole;
  organizationId?: string;
  companyId?: string;
  departmentId?: string;
  uploadedAt: string;
  fileSize: number;
  status: FileStatus;
  // Access control
  visibility: FileVisibility;
  category: FileCategory;
  description?: string;
  // Content
  extractedText?: string;
  textS3Key?: string;
  errorMessage?: string;
  // GSI keys
  GSI1PK?: string;      // USER#{user_id} or VISIBILITY#{visibility}
  GSI1SK?: string;      // FILE#{uploaded_at}
  GSI2PK?: string;      // ORG#{org_id} or COMPANY#{company_id}
  GSI2SK?: string;      // FILE#{uploaded_at}
}

export interface FileUploadRequest {
  fileName: string;
  fileType: FileType;
  mimeType: string;
  fileData: string;     // base64 encoded
  userId?: string;
  // Access control
  visibility?: FileVisibility;
  category?: FileCategory;
  description?: string;
  // User context (for role-based visibility)
  organizationId?: string;
  companyId?: string;
  departmentId?: string;
  userRole?: UserRole;
}

export interface FileUploadResponse {
  fileId: string;
  fileName: string;
  status: FileStatus;
  uploadedAt: string;
}

export interface FileQueryRequest {
  query: string;
  model?: string;
}

export interface FileQueryResponse {
  answer: string;
  sourceData?: string;
}

// ============================================
// Conversation Types
// ============================================
export interface Conversation {
  PK: string;           // CONV#{conversation_id}
  SK: string;           // META
  conversationId: string;
  title: string;
  userId: string;
  organizationId?: string;
  companyId?: string;
  departmentId?: string;
  modelId: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  // GSI keys
  GSI1PK?: string;      // USER#{user_id}
  GSI1SK?: string;      // CONV#{updated_at}
}

export interface ConversationMessage {
  PK: string;           // CONV#{conversation_id}
  SK: string;           // MSG#{timestamp}#{message_id}
  messageId: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: FileAttachment[];
  fileReferences?: string[];  // fileIds
  modelId?: string;
  inputTokens?: number;
  outputTokens?: number;
  cost?: number;
  createdAt: string;
}

// ============================================
// User & Organization Types (for future auth)
// ============================================
export type UserRole = 'system_admin' | 'org_admin' | 'company_admin' | 'user';

export interface User {
  PK: string;           // USER#{user_id}
  SK: string;           // META
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  organizationId?: string;
  companyId?: string;
  departmentId?: string;
  createdAt: string;
  lastLoginAt: string;
}

// ============================================
// Usage Types
// ============================================
export interface DailyUsage {
  PK: string;           // USAGE#{date}
  SK: string;           // {organization_id}#{company_id}#{user_id}
  date: string;
  organizationId?: string;
  companyId?: string;
  userId: string;
  modelUsage: Record<string, {
    requestCount: number;
    inputTokens: number;
    outputTokens: number;
    cost: number;
  }>;
  fileUploads: number;
  fileStorageBytes: number;
}

// Bedrock Models (using us. prefix for cross-region inference)
export type BedrockModel =
  // Anthropic Claude
  | 'us.anthropic.claude-opus-4-5-20251101-v1:0'
  | 'us.anthropic.claude-sonnet-4-5-20250929-v1:0'
  | 'us.anthropic.claude-haiku-4-5-20251001-v1:0'
  // Amazon Nova
  | 'us.amazon.nova-pro-v1:0'
  | 'us.amazon.nova-lite-v1:0'
  // Meta Llama
  | 'us.meta.llama4-scout-17b-instruct-v1:0'
  | 'us.meta.llama3-3-70b-instruct-v1:0';

// Gemini Models
export type GeminiModel =
  | 'gemini-3-flash-preview'
  | 'gemini-3-pro-preview';

export type AIModel = BedrockModel | GeminiModel;

// Pricing per 1M tokens (USD)
export interface ModelPricing {
  input: number;   // $ per 1M input tokens
  output: number;  // $ per 1M output tokens
}

// Model metadata for UI
export interface ModelInfo {
  id: AIModel;
  provider: AIProvider;
  name: string;
  description: string;
  category: 'reasoning' | 'balanced' | 'fast' | 'code' | 'multimodal';
  supportsImages: boolean;
  maxTokens: number;
  pricing: ModelPricing;
}

// Chat request/response types
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  attachments?: FileAttachment[];
}

export interface FileAttachment {
  name: string;
  type: string;
  data: string; // base64
}

export interface ChatRequest {
  model: AIModel;
  messages: ChatMessage[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface ChatResponse {
  content: string;
  model: AIModel;
  provider: AIProvider;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

// Lambda event types
export interface APIGatewayEvent {
  body: string | null;
  headers: Record<string, string | undefined>;
  httpMethod: string;
  path: string;
  queryStringParameters: Record<string, string | undefined> | null;
}

export interface APIGatewayResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}
