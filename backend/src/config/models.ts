import type { ModelInfo, AIModel } from '../types/index.js';

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

export function getModelInfo(modelId: AIModel): ModelInfo {
  return MODEL_CONFIGS[modelId];
}

export function getModelsByProvider(provider: 'bedrock' | 'gemini'): ModelInfo[] {
  return Object.values(MODEL_CONFIGS).filter((m) => m.provider === provider);
}

export function getAllModels(): ModelInfo[] {
  return Object.values(MODEL_CONFIGS);
}
