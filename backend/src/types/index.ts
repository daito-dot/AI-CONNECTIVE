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
