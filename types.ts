
export enum AIModel {
  FLASH = 'gemini-3-flash-preview',
  PRO = 'gemini-3-pro-preview',
  IMAGE = 'gemini-2.5-flash-image',
  AUDIO = 'gemini-2.5-flash-native-audio-preview-09-2025'
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  model?: AIModel;
  attachments?: FileInfo[];
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
