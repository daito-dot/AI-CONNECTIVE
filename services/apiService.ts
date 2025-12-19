import {
  AIModel,
  Message,
  FileInfo,
  ChatRequest,
  ChatResponse,
  ExtendedChatRequest,
  FileUploadRequest,
  FileUploadResponse,
  UploadedFile,
  FileType,
  SavedConversation,
  SavedMessage,
  getModelInfo,
} from '../types';

// API endpoint from environment variable
const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT || '';

// Helper to get file type from mime type
function getFileTypeFromMime(mimeType: string): FileType | null {
  const typeMap: Record<string, FileType> = {
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'text/plain': 'txt',
    'text/csv': 'csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  };
  return typeMap[mimeType] || null;
}

export class ApiService {
  private endpoint: string;
  private userId: string;

  constructor(endpoint?: string, userId?: string) {
    this.endpoint = endpoint || API_ENDPOINT;
    this.userId = userId || 'anonymous';
  }

  setUserId(userId: string) {
    this.userId = userId;
  }

  // ============================================
  // Chat Methods
  // ============================================

  async generateChatResponse(
    model: AIModel,
    messages: Message[],
    systemFiles: FileInfo[],
    userFiles: FileInfo[],
    options?: {
      conversationId?: string;
      fileIds?: string[];
      saveHistory?: boolean;
    }
  ): Promise<ChatResponse> {
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

    const request: ExtendedChatRequest = {
      model,
      messages: apiMessages,
      systemPrompt,
      temperature: 0.7,
      userId: this.userId,
      conversationId: options?.conversationId,
      fileIds: options?.fileIds,
      saveHistory: options?.saveHistory ?? true,
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
      return data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }

  // ============================================
  // File Methods
  // ============================================

  async uploadFile(file: File): Promise<FileUploadResponse> {
    const fileType = getFileTypeFromMime(file.type);
    if (!fileType) {
      throw new Error(`Unsupported file type: ${file.type}`);
    }

    // Read file as base64
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix (e.g., "data:text/csv;base64,")
        const base64 = result.split(',')[1] || result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const request: FileUploadRequest = {
      fileName: file.name,
      fileType,
      mimeType: file.type,
      fileData: base64Data,
      userId: this.userId,
    };

    const response = await fetch(`${this.endpoint}/files/upload`, {
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

    return response.json();
  }

  async listFiles(): Promise<UploadedFile[]> {
    const response = await fetch(
      `${this.endpoint}/files?userId=${encodeURIComponent(this.userId)}`,
      {
        method: 'GET',
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch files');
    }

    const data = await response.json();
    return data.files || [];
  }

  async deleteFile(fileId: string): Promise<void> {
    const response = await fetch(`${this.endpoint}/files/${fileId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to delete file');
    }
  }

  async queryFile(fileId: string, query: string): Promise<{ answer: string; sourceData?: string }> {
    const response = await fetch(`${this.endpoint}/files/${fileId}/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to query file');
    }

    return response.json();
  }

  // ============================================
  // Conversation History Methods
  // ============================================

  async listConversations(limit?: number): Promise<SavedConversation[]> {
    const params = new URLSearchParams({
      userId: this.userId,
    });
    if (limit) {
      params.append('limit', limit.toString());
    }

    const response = await fetch(`${this.endpoint}/conversations?${params}`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch conversations');
    }

    const data = await response.json();
    return data.conversations || [];
  }

  async getConversation(conversationId: string): Promise<{
    conversation: SavedConversation;
    messages: SavedMessage[];
  }> {
    const response = await fetch(`${this.endpoint}/conversations/${conversationId}`, {
      method: 'GET',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to fetch conversation');
    }

    return response.json();
  }

  async deleteConversation(conversationId: string): Promise<void> {
    const response = await fetch(`${this.endpoint}/conversations/${conversationId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to delete conversation');
    }
  }

  // ============================================
  // Health & Models
  // ============================================

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
      return [];
    }
  }

  getModelInfo(modelId: AIModel) {
    return getModelInfo(modelId);
  }

  // ============================================
  // Authentication Methods
  // ============================================

  async signUp(email: string, password: string, name: string): Promise<{
    message: string;
    userId: string;
    userConfirmed: boolean;
  }> {
    const response = await fetch(`${this.endpoint}/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password, name }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Sign up failed');
    }

    return response.json();
  }

  async confirmSignUp(email: string, code: string): Promise<{
    message: string;
  }> {
    const response = await fetch(`${this.endpoint}/auth/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, code }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Verification failed');
    }

    return response.json();
  }

  async signIn(email: string, password: string): Promise<{
    accessToken: string;
    idToken: string;
    refreshToken: string;
    expiresIn: number;
    user: {
      userId: string;
      email: string;
      name: string;
      role: string;
      organizationId?: string;
      companyId?: string;
      departmentId?: string;
    } | null;
  }> {
    const response = await fetch(`${this.endpoint}/auth/signin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Sign in failed');
    }

    return response.json();
  }

  async getProfile(userId: string): Promise<{
    userId: string;
    email: string;
    name: string;
    role: string;
    organizationId?: string;
    companyId?: string;
    departmentId?: string;
    createdAt: string;
  }> {
    const response = await fetch(`${this.endpoint}/auth/profile?userId=${encodeURIComponent(userId)}`, {
      method: 'GET',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to get profile');
    }

    return response.json();
  }

  async updateProfile(userId: string, updates: { name?: string }): Promise<void> {
    const response = await fetch(`${this.endpoint}/auth/profile?userId=${encodeURIComponent(userId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to update profile');
    }
  }
}

export const apiService = new ApiService();
