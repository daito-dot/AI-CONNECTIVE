import {
  AIModel,
  Message,
  FileInfo,
  ChatRequest,
  ChatResponse,
  getModelInfo,
} from '../types';

// API endpoint from environment variable
const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT || '';

export class ApiService {
  private endpoint: string;

  constructor(endpoint?: string) {
    this.endpoint = endpoint || API_ENDPOINT;
  }

  async generateChatResponse(
    model: AIModel,
    messages: Message[],
    systemFiles: FileInfo[],
    userFiles: FileInfo[]
  ): Promise<string> {
    // Build system prompt with file context
    const allFiles = [...systemFiles, ...userFiles];
    const fileContext =
      allFiles.length > 0
        ? `参照コンテキスト:\n${allFiles
            .map(
              (f) =>
                `ファイル: ${f.name}\n内容プレビュー: ${f.data.substring(0, 500)}...`
            )
            .join('\n')}`
        : '';

    const systemPrompt = `あなたは親切なAIアシスタントです。
${fileContext}
ユーザーの言語で応答してください。丁寧でプロフェッショナルな口調を使ってください。`;

    // Convert messages to API format
    const apiMessages = messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
      attachments: msg.attachments?.map((att) => ({
        name: att.name,
        type: att.type,
        data: att.data,
      })),
    }));

    const request: ChatRequest = {
      model,
      messages: apiMessages,
      systemPrompt,
      temperature: 0.7,
    };

    try {
      const response = await fetch(`${this.endpoint}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error: ${response.status}`);
      }

      const data: ChatResponse = await response.json();
      return data.content;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }

  // Check if API is available
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.endpoint}/models`, {
        method: 'GET',
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  // Get available models from API
  async getModels(): Promise<AIModel[]> {
    try {
      const response = await fetch(`${this.endpoint}/models`, {
        method: 'GET',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch models');
      }
      const data = await response.json();
      return data.models.map((m: { id: AIModel }) => m.id);
    } catch (error) {
      console.error('Failed to fetch models:', error);
      // Return default models if API is unavailable
      return [];
    }
  }

  // Get model display info
  getModelInfo(modelId: AIModel) {
    return getModelInfo(modelId);
  }
}

export const apiService = new ApiService();
