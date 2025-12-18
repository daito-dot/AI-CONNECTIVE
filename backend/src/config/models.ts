import type { ModelInfo, AIModel } from '../types/index.js';

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

export function getModelInfo(modelId: AIModel): ModelInfo {
  return MODEL_CONFIGS[modelId];
}

export function getModelsByProvider(provider: 'bedrock' | 'gemini'): ModelInfo[] {
  return Object.values(MODEL_CONFIGS).filter((m) => m.provider === provider);
}

export function getAllModels(): ModelInfo[] {
  return Object.values(MODEL_CONFIGS);
}
