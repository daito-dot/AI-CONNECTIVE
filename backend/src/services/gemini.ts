import { GoogleGenAI, type Content, type Part } from '@google/genai';
import type { ChatMessage, ChatRequest, ChatResponse, GeminiModel } from '../types/index.js';

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

function convertToGeminiContents(messages: ChatMessage[]): Content[] {
  return messages.map((msg) => {
    const parts: Part[] = [];

    // Add text content
    if (msg.content) {
      parts.push({ text: msg.content });
    }

    // Add image attachments if present
    if (msg.attachments) {
      for (const attachment of msg.attachments) {
        if (attachment.type.startsWith('image/')) {
          parts.push({
            inlineData: {
              mimeType: attachment.type,
              data: attachment.data,
            },
          });
        }
      }
    }

    return {
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts,
    };
  });
}

export async function invokeGemini(request: ChatRequest): Promise<ChatResponse> {
  const modelId = request.model as GeminiModel;

  const response = await genai.models.generateContent({
    model: modelId,
    contents: convertToGeminiContents(request.messages),
    config: {
      maxOutputTokens: request.maxTokens || 8192,
      temperature: request.temperature || 0.7,
      systemInstruction: request.systemPrompt,
    },
  });

  const content = response.text || '';

  return {
    content,
    model: request.model,
    provider: 'gemini',
    usage: response.usageMetadata
      ? {
          inputTokens: response.usageMetadata.promptTokenCount || 0,
          outputTokens: response.usageMetadata.candidatesTokenCount || 0,
        }
      : undefined,
  };
}
