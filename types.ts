// AI Provider types
export type AIProvider = 'bedrock' | 'gemini';

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

// Model configurations
export const MODEL_CONFIGS: Record<AIModel, ModelInfo> = {
  // Anthropic Claude (Bedrock)
  'us.anthropic.claude-opus-4-5-20251101-v1:0': {
    id: 'us.anthropic.claude-opus-4-5-20251101-v1:0',
    provider: 'bedrock',
    name: 'Claude Opus 4.5',
    description: '最高性能・複雑なタスク向け',
    category: 'reasoning',
    supportsImages: true,
    maxTokens: 4096,
    pricing: { input: 15, output: 75 },
  },
  'us.anthropic.claude-sonnet-4-5-20250929-v1:0': {
    id: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
    provider: 'bedrock',
    name: 'Claude Sonnet 4.5',
    description: 'バランス型・高速',
    category: 'balanced',
    supportsImages: true,
    maxTokens: 4096,
    pricing: { input: 3, output: 15 },
  },
  'us.anthropic.claude-haiku-4-5-20251001-v1:0': {
    id: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
    provider: 'bedrock',
    name: 'Claude Haiku 4.5',
    description: '最速・低コスト',
    category: 'fast',
    supportsImages: true,
    maxTokens: 4096,
    pricing: { input: 0.8, output: 4 },
  },

  // Amazon Nova (Bedrock)
  'us.amazon.nova-pro-v1:0': {
    id: 'us.amazon.nova-pro-v1:0',
    provider: 'bedrock',
    name: 'Nova Pro',
    description: 'AWS高性能・マルチモーダル',
    category: 'reasoning',
    supportsImages: true,
    maxTokens: 5000,
    pricing: { input: 0.8, output: 3.2 },
  },
  'us.amazon.nova-lite-v1:0': {
    id: 'us.amazon.nova-lite-v1:0',
    provider: 'bedrock',
    name: 'Nova Lite',
    description: '高速・コスパ最強',
    category: 'fast',
    supportsImages: true,
    maxTokens: 5000,
    pricing: { input: 0.06, output: 0.24 },
  },

  // Meta Llama (Bedrock)
  'us.meta.llama4-scout-17b-instruct-v1:0': {
    id: 'us.meta.llama4-scout-17b-instruct-v1:0',
    provider: 'bedrock',
    name: 'Llama 4 Scout',
    description: 'MoE・軽量高性能',
    category: 'balanced',
    supportsImages: false,
    maxTokens: 4096,
    pricing: { input: 0.17, output: 0.17 },
  },
  'us.meta.llama3-3-70b-instruct-v1:0': {
    id: 'us.meta.llama3-3-70b-instruct-v1:0',
    provider: 'bedrock',
    name: 'Llama 3.3 70B',
    description: 'オープンソース大規模',
    category: 'reasoning',
    supportsImages: false,
    maxTokens: 4096,
    pricing: { input: 0.72, output: 0.72 },
  },

  // Google Gemini (Direct API)
  'gemini-3-flash-preview': {
    id: 'gemini-3-flash-preview',
    provider: 'gemini',
    name: 'Gemini 3 Flash',
    description: '最新・高速マルチモーダル',
    category: 'fast',
    supportsImages: true,
    maxTokens: 8192,
    pricing: { input: 0.5, output: 3 },
  },
  'gemini-3-pro-preview': {
    id: 'gemini-3-pro-preview',
    provider: 'gemini',
    name: 'Gemini 3 Pro',
    description: 'Google最高性能',
    category: 'reasoning',
    supportsImages: true,
    maxTokens: 8192,
    pricing: { input: 2.5, output: 10 },
  },
};

// Helper functions
export function getModelInfo(modelId: AIModel): ModelInfo {
  return MODEL_CONFIGS[modelId];
}

export function getModelsByProvider(provider: AIProvider): ModelInfo[] {
  return Object.values(MODEL_CONFIGS).filter((m) => m.provider === provider);
}

export function getAllModels(): ModelInfo[] {
  return Object.values(MODEL_CONFIGS);
}

export function getModelsByCategory(category: ModelInfo['category']): ModelInfo[] {
  return Object.values(MODEL_CONFIGS).filter((m) => m.category === category);
}

// Default model
export const DEFAULT_MODEL: AIModel = 'us.anthropic.claude-sonnet-4-5-20250929-v1:0';

// Usage information for tracking costs
export interface UsageInfo {
  inputTokens: number;
  outputTokens: number;
  cost?: number; // Calculated cost in USD
}

// Chat types
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  model?: AIModel;
  attachments?: FileInfo[];
  usage?: UsageInfo;
}

export interface FileInfo {
  name: string;
  size: number;
  type: string;
  data: string; // base64
  isSystem?: boolean;
}

export interface ChatHistory {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
}

export interface User {
  id: string;
  name: string;
  role: 'admin' | 'user';
  avatar: string;
}

// API types
export interface ChatRequest {
  model: AIModel;
  messages: {
    role: 'user' | 'assistant';
    content: string;
    attachments?: {
      name: string;
      type: string;
      data: string;
    }[];
  }[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ChatResponse {
  content: string;
  model: AIModel;
  provider: AIProvider;
  conversationId?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

// Extended chat request with conversation support
export interface ExtendedChatRequest extends ChatRequest {
  conversationId?: string;
  userId?: string;
  fileIds?: string[];
  saveHistory?: boolean;
}

// File upload types
export type FileType = 'pdf' | 'docx' | 'txt' | 'csv' | 'xlsx';
export type FileStatus = 'uploading' | 'processing' | 'ready' | 'error';

export interface UploadedFile {
  fileId: string;
  fileName: string;
  fileType: FileType;
  status: FileStatus;
  uploadedAt: string;
  fileSize?: number;
}

export interface FileUploadRequest {
  fileName: string;
  fileType: FileType;
  mimeType: string;
  fileData: string;  // base64 encoded
  userId?: string;
}

export interface FileUploadResponse {
  fileId: string;
  fileName: string;
  status: FileStatus;
  uploadedAt: string;
}

// Conversation types for backend persistence
export interface SavedConversation {
  conversationId: string;
  title: string;
  userId: string;
  modelId: AIModel;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
}

export interface SavedMessage {
  messageId: string;
  role: 'user' | 'assistant';
  content: string;
  modelId?: AIModel;
  inputTokens?: number;
  outputTokens?: number;
  cost?: number;
  createdAt: string;
}
