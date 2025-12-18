
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { AIModel, Message, FileInfo } from "../types";

export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  }

  async generateChatResponse(
    model: AIModel,
    messages: Message[],
    systemFiles: FileInfo[],
    userFiles: FileInfo[]
  ): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    
    // Combine context
    const allFiles = [...systemFiles, ...userFiles];
    const fileContext = allFiles.length > 0 
      ? `References context:\n${allFiles.map(f => `File: ${f.name}\nContent Preview: ${f.data.substring(0, 500)}...`).join('\n')}`
      : '';

    const systemInstruction = `You are a helpful AI assistant. 
    ${fileContext}
    Respond in the language of the user. Use a polite and professional tone.`;

    const contents = messages.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    // If there are files in the last user message, we might need special handling
    // but for this MVP, we include them in system instruction context or as text.

    try {
      const response: GenerateContentResponse = await ai.models.generateContent({
        model: model,
        contents: contents as any,
        config: {
          systemInstruction,
          temperature: 0.7,
        }
      });

      return response.text || "Sorry, I couldn't generate a response.";
    } catch (error) {
      console.error("Gemini API Error:", error);
      throw error;
    }
  }
}

export const geminiService = new GeminiService();
