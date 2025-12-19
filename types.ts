// AI Provider types
export type AIProvider = 'bedrock' | 'gemini';

// Bedrock Models
export type BedrockModel =
  // Anthropic Claude
  | 'anthropic.claude-opus-4-5-20251101-v1:0'
  | 'anthropic.claude-sonnet-4-5-20250918-v1:0'
  | 'anthropic.claude-haiku-4-5-20251022-v1:0'
  // Amazon Nova
  | 'amazon.nova-pro-v2:0'
  | 'amazon.nova-lite-v2:0'
  // Meta Llama
  | 'meta.llama4-scout-17b-instruct-v1:0'
  | 'meta.llama3-3-70b-instruct-v1:0'
  // Mistral
  | 'mistral.mistral-large-2-2411-v1:0'
  // DeepSeek
  | 'deepseek.deepseek-r1-v1:0';

// Gemini Models
export type GeminiModel =
  | 'gemini-2.5-flash'
  | 'gemini-2.5-pro';

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
  'anthropic.claude-opus-4-5-20251101-v1:0': {
    id: 'anthropic.claude-opus-4-5-20251101-v1:0',
    provider: 'bedrock',
    name: 'Claude Opus 4.5',
    description: '最高性能・複雑なタスク向け',
    category: 'reasoning',
    supportsImages: true,
    maxTokens: 4096,
    pricing: { input: 15, output: 75 },
  },
  'anthropic.claude-sonnet-4-5-20250918-v1:0': {
    id: 'anthropic.claude-sonnet-4-5-20250918-v1:0',
    provider: 'bedrock',
    name: 'Claude Sonnet 4.5',
    description: 'バランス型・高速',
    category: 'balanced',
    supportsImages: true,
    maxTokens: 4096,
    pricing: { input: 3, output: 15 },
  },
  'anthropic.claude-haiku-4-5-20251022-v1:0': {
    id: 'anthropic.claude-haiku-4-5-20251022-v1:0',
    provider: 'bedrock',
    name: 'Claude Haiku 4.5',
    description: '最速・低コスト',
    category: 'fast',
    supportsImages: true,
    maxTokens: 4096,
    pricing: { input: 0.8, output: 4 },
  },

  // Amazon Nova (Bedrock)
  'amazon.nova-pro-v2:0': {
    id: 'amazon.nova-pro-v2:0',
    provider: 'bedrock',
    name: 'Nova 2 Pro',
    description: 'AWS最高知能・マルチモーダル',
    category: 'reasoning',
    supportsImages: true,
    maxTokens: 5000,
    pricing: { input: 0.8, output: 3.2 },
  },
  'amazon.nova-lite-v2:0': {
    id: 'amazon.nova-lite-v2:0',
    provider: 'bedrock',
    name: 'Nova 2 Lite',
    description: '高速・コスパ最強',
    category: 'fast',
    supportsImages: true,
    maxTokens: 5000,
    pricing: { input: 0.06, output: 0.24 },
  },

  // Meta Llama (Bedrock)
  'meta.llama4-scout-17b-instruct-v1:0': {
    id: 'meta.llama4-scout-17b-instruct-v1:0',
    provider: 'bedrock',
    name: 'Llama 4 Scout',
    description: 'MoE・軽量高性能',
    category: 'balanced',
    supportsImages: false,
    maxTokens: 4096,
    pricing: { input: 0.17, output: 0.17 },
  },
  'meta.llama3-3-70b-instruct-v1:0': {
    id: 'meta.llama3-3-70b-instruct-v1:0',
    provider: 'bedrock',
    name: 'Llama 3.3 70B',
    description: 'オープンソース大規模',
    category: 'reasoning',
    supportsImages: false,
    maxTokens: 4096,
    pricing: { input: 0.72, output: 0.72 },
  },

  // Mistral (Bedrock)
  'mistral.mistral-large-2-2411-v1:0': {
    id: 'mistral.mistral-large-2-2411-v1:0',
    provider: 'bedrock',
    name: 'Mistral Large 2',
    description: '欧州製・高性能',
    category: 'balanced',
    supportsImages: false,
    maxTokens: 4096,
    pricing: { input: 2, output: 6 },
  },

  // DeepSeek (Bedrock)
  'deepseek.deepseek-r1-v1:0': {
    id: 'deepseek.deepseek-r1-v1:0',
    provider: 'bedrock',
    name: 'DeepSeek R1',
    description: '推論特化・コード強い',
    category: 'code',
    supportsImages: false,
    maxTokens: 4096,
    pricing: { input: 0.55, output: 2.19 },
  },

  // Google Gemini (Direct API)
  'gemini-2.5-flash': {
    id: 'gemini-2.5-flash',
    provider: 'gemini',
    name: 'Gemini 2.5 Flash',
    description: '高速マルチモーダル',
    category: 'fast',
    supportsImages: true,
    maxTokens: 8192,
    pricing: { input: 0.15, output: 0.6 },
  },
  'gemini-2.5-pro': {
    id: 'gemini-2.5-pro',
    provider: 'gemini',
    name: 'Gemini 2.5 Pro',
    description: 'Google最高性能',
    category: 'reasoning',
    supportsImages: true,
    maxTokens: 8192,
    pricing: { input: 1.25, output: 5 },
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
export const DEFAULT_MODEL: AIModel = 'anthropic.claude-sonnet-4-5-20250918-v1:0';

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
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}
