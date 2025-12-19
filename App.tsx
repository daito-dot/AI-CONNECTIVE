
import React, { useState, useEffect, useRef } from 'react';
import {
  AIModel,
  Message,
  FileInfo,
  ChatHistory,
  User,
  UsageInfo,
  UploadedFile,
  SavedConversation,
  MODEL_CONFIGS,
  DEFAULT_MODEL,
  getModelInfo,
  UserRole,
  AdminUser,
} from './types';
import { COLORS, ICONS } from './constants';
import { apiService } from './services/apiService';

// --- Auth Types ---
interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  accessToken: string | null;
}

// --- Storage Keys ---
const STORAGE_KEYS = {
  AUTH: 'ai-connective-auth',
};

// Load auth state from localStorage
const loadAuthState = (): AuthState => {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.AUTH);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load auth state:', e);
  }
  return { isAuthenticated: false, user: null, accessToken: null };
};

// Save auth state to localStorage
const saveAuthState = (state: AuthState) => {
  localStorage.setItem(STORAGE_KEYS.AUTH, JSON.stringify(state));
};

// Group models by provider for UI
const GROUPED_MODELS = {
  'Anthropic Claude': Object.values(MODEL_CONFIGS).filter(m => m.id.includes('anthropic.claude')),
  'Amazon Nova': Object.values(MODEL_CONFIGS).filter(m => m.id.includes('amazon.nova')),
  'Meta Llama': Object.values(MODEL_CONFIGS).filter(m => m.id.includes('meta.llama')),
  'Google Gemini': Object.values(MODEL_CONFIGS).filter(m => m.id.startsWith('gemini')),
};

// --- Login Modal Component ---
const LoginModal: React.FC<{
  onLogin: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string, name: string) => Promise<void>;
  onConfirm: (email: string, code: string) => Promise<void>;
  error: string | null;
  successMessage: string | null;
  isLoading: boolean;
}> = ({ onLogin, onSignUp, onConfirm, error, successMessage, isLoading }) => {
  const [mode, setMode] = useState<'login' | 'signup' | 'confirm'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'confirm') {
      await onConfirm(email, code);
    } else if (mode === 'signup') {
      await onSignUp(email, password, name);
      setMode('confirm'); // Switch to confirmation mode after signup
    } else {
      await onLogin(email, password);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#1E3D6B]/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="paper-card w-full max-w-md bg-white shadow-2xl p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#1E3D6B] flex items-center justify-center text-[#A18E66]">
            <ICONS.Admin />
          </div>
          <h1 className="text-2xl font-bold text-[#1E3D6B]">AI Connective</h1>
          <p className="text-sm text-[#1E3D6B]/60 mt-1">
            {mode === 'confirm' ? 'メール確認' : mode === 'signup' ? '新規アカウント作成' : 'ログイン'}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-600 text-sm rounded-lg">
            {successMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'confirm' ? (
            <>
              <div>
                <label className="block text-sm font-medium text-[#1E3D6B]/70 mb-1">メールアドレス</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-[#1E3D6B]/20 rounded-lg focus:ring-2 focus:ring-[#A18E66] focus:border-transparent outline-none"
                  placeholder="email@example.com"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1E3D6B]/70 mb-1">確認コード</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full px-4 py-3 border border-[#1E3D6B]/20 rounded-lg focus:ring-2 focus:ring-[#A18E66] focus:border-transparent outline-none text-center text-2xl tracking-widest"
                  placeholder="123456"
                  required
                  maxLength={6}
                />
                <p className="text-xs text-[#1E3D6B]/50 mt-1">メールに送信された6桁のコードを入力してください</p>
              </div>
            </>
          ) : (
            <>
              {mode === 'signup' && (
                <div>
                  <label className="block text-sm font-medium text-[#1E3D6B]/70 mb-1">名前</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-3 border border-[#1E3D6B]/20 rounded-lg focus:ring-2 focus:ring-[#A18E66] focus:border-transparent outline-none"
                    placeholder="山田 太郎"
                    required
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-[#1E3D6B]/70 mb-1">メールアドレス</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-[#1E3D6B]/20 rounded-lg focus:ring-2 focus:ring-[#A18E66] focus:border-transparent outline-none"
                  placeholder="email@example.com"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1E3D6B]/70 mb-1">パスワード</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-[#1E3D6B]/20 rounded-lg focus:ring-2 focus:ring-[#A18E66] focus:border-transparent outline-none"
                  placeholder="••••••••"
                  required
                  minLength={8}
                />
                {mode === 'signup' && (
                  <p className="text-xs text-[#1E3D6B]/50 mt-1">8文字以上、大文字・小文字・数字を含む</p>
                )}
              </div>
            </>
          )}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-[#1E3D6B] text-white font-bold rounded-lg hover:bg-[#1E3D6B]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                処理中...
              </>
            ) : (
              mode === 'confirm' ? '確認' : mode === 'signup' ? 'アカウント作成' : 'ログイン'
            )}
          </button>
        </form>

        <div className="mt-6 text-center space-y-2">
          {mode === 'confirm' ? (
            <button
              onClick={() => setMode('login')}
              className="text-sm text-[#A18E66] hover:underline"
            >
              ログイン画面に戻る
            </button>
          ) : (
            <>
              <button
                onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}
                className="text-sm text-[#A18E66] hover:underline"
              >
                {mode === 'signup' ? 'すでにアカウントをお持ちですか？ログイン' : 'アカウントを作成'}
              </button>
              <div>
                <button
                  onClick={() => setMode('confirm')}
                  className="text-xs text-[#1E3D6B]/50 hover:underline"
                >
                  確認コードを入力する
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// --- Components ---

const SidebarItem: React.FC<{
  active: boolean;
  onClick: () => void;
  onDelete?: () => void;
  children: React.ReactNode;
}> = ({ active, onClick, onDelete, children }) => (
  <div className="relative group">
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 rounded-lg mb-1 transition-all duration-200 flex items-center gap-3 ${
        active
          ? 'bg-[#1E3D6B] text-white shadow-md'
          : 'text-[#1E3D6B] hover:bg-[#A18E66]/10'
      }`}
    >
      {children}
    </button>
    {onDelete && (
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 rounded text-red-500 transition-all"
        title="削除"
      >
        ×
      </button>
    )}
  </div>
);

const App: React.FC = () => {
  // Auth state
  const [authState, setAuthState] = useState<AuthState>(loadAuthState);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [activeModel, setActiveModel] = useState<AIModel>(DEFAULT_MODEL);
  const [histories, setHistories] = useState<ChatHistory[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [backendConversationId, setBackendConversationId] = useState<string | null>(null);

  // File management - both local preview and backend uploaded
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showFilesPanel, setShowFilesPanel] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  // Admin state
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [showCreateUserForm, setShowCreateUserForm] = useState(false);
  const [newUserData, setNewUserData] = useState({
    email: '',
    name: '',
    role: 'user' as UserRole,
    organizationId: '',
    companyId: '',
    departmentId: '',
  });
  const [createUserResult, setCreateUserResult] = useState<{ userId: string; temporaryPassword: string } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Current user from auth state
  const currentUser: User | null = authState.user;

  // Set user ID in apiService
  useEffect(() => {
    if (currentUser?.id) {
      apiService.setUserId(currentUser.id);
    }
  }, [currentUser?.id]);

  // Auth handlers
  const handleLogin = async (email: string, password: string) => {
    setAuthLoading(true);
    setAuthError(null);
    setAuthSuccess(null);
    try {
      const result = await apiService.signIn(email, password);
      const user: User = {
        id: result.user?.userId || email,
        name: result.user?.name || email.split('@')[0],
        email: result.user?.email || email,
        role: (result.user?.role as UserRole) || 'user',
        avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(result.user?.name || email)}`,
        organizationId: result.user?.organizationId,
        companyId: result.user?.companyId,
        departmentId: result.user?.departmentId,
      };
      const newAuthState: AuthState = {
        isAuthenticated: true,
        user,
        accessToken: result.accessToken,
      };
      setAuthState(newAuthState);
      saveAuthState(newAuthState);
      setShowLoginModal(false);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'ログインに失敗しました');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignUp = async (email: string, password: string, name: string) => {
    setAuthLoading(true);
    setAuthError(null);
    setAuthSuccess(null);
    try {
      await apiService.signUp(email, password, name);
      setAuthSuccess('確認コードをメールに送信しました。コードを入力してください。');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'アカウント作成に失敗しました');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleConfirm = async (email: string, code: string) => {
    setAuthLoading(true);
    setAuthError(null);
    setAuthSuccess(null);
    try {
      await apiService.confirmSignUp(email, code);
      setAuthSuccess('メールアドレスが確認されました。ログインしてください。');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : '確認に失敗しました');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    const newAuthState: AuthState = {
      isAuthenticated: false,
      user: null,
      accessToken: null,
    };
    setAuthState(newAuthState);
    saveAuthState(newAuthState);
    setHistories([]);
    setUploadedFiles([]);
    setActiveChatId(null);
  };

  // Check API status and load data on mount
  useEffect(() => {
    const initializeApp = async () => {
      const isOnline = await apiService.checkHealth();
      setApiStatus(isOnline ? 'online' : 'offline');

      // Only load user data if authenticated
      if (isOnline && authState.isAuthenticated && currentUser) {
        // Load uploaded files from backend
        try {
          const files = await apiService.listFiles();
          setUploadedFiles(files);
        } catch (error) {
          console.error('Failed to load files:', error);
        }

        // Load conversation history from backend
        try {
          const conversations = await apiService.listConversations(20);
          if (conversations.length > 0) {
            const chatHistories: ChatHistory[] = conversations.map(conv => ({
              id: conv.conversationId,
              title: conv.title,
              messages: [],
              updatedAt: new Date(conv.updatedAt).getTime(),
            }));
            setHistories(chatHistories);
          }
        } catch (error) {
          console.error('Failed to load conversations:', error);
        }
      }

      // Create initial chat if authenticated and none exist
      if (authState.isAuthenticated && histories.length === 0) {
        createNewChat();
      }
    };

    initializeApp();
  }, [authState.isAuthenticated]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [histories, activeChatId]);

  const activeChat = histories.find(h => h.id === activeChatId);
  const currentModelInfo = getModelInfo(activeModel);

  // Load conversation messages when selecting a saved conversation
  const loadConversationMessages = async (conversationId: string) => {
    try {
      const { conversation, messages } = await apiService.getConversation(conversationId);
      if (conversation && messages) {
        const loadedMessages: Message[] = messages.map(msg => ({
          id: msg.messageId,
          role: msg.role,
          content: msg.content,
          timestamp: new Date(msg.createdAt).getTime(),
          model: msg.modelId,
          usage: msg.inputTokens ? {
            inputTokens: msg.inputTokens,
            outputTokens: msg.outputTokens || 0,
            cost: msg.cost,
          } : undefined,
        }));

        setHistories(prev => prev.map(h =>
          h.id === conversationId
            ? { ...h, messages: loadedMessages }
            : h
        ));
        setBackendConversationId(conversationId);
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  };

  const handleSelectChat = async (chatId: string) => {
    setActiveChatId(chatId);
    const chat = histories.find(h => h.id === chatId);

    // If messages are empty and this might be a backend conversation, load it
    if (chat && chat.messages.length === 0 && apiStatus === 'online') {
      await loadConversationMessages(chatId);
    } else {
      setBackendConversationId(chatId);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !activeChatId || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: Date.now(),
      model: activeModel
    };

    const updatedMessages = [...(activeChat?.messages || []), userMsg];

    setHistories(prev => prev.map(h =>
      h.id === activeChatId
        ? { ...h, messages: updatedMessages, updatedAt: Date.now(), title: input.substring(0, 15) }
        : h
    ));
    setInput('');
    setIsLoading(true);

    try {
      const response = await apiService.generateChatResponse(
        activeModel,
        updatedMessages,
        [], // systemFiles - now using backend files
        [], // userFiles - now using backend files
        {
          conversationId: backendConversationId || undefined,
          fileIds: selectedFileIds.length > 0 ? selectedFileIds : undefined,
          saveHistory: true,
        }
      );

      // Update backend conversation ID if new
      if (response.conversationId && !backendConversationId) {
        setBackendConversationId(response.conversationId);
        // Update local chat ID to match backend
        setHistories(prev => prev.map(h =>
          h.id === activeChatId
            ? { ...h, id: response.conversationId! }
            : h
        ));
        setActiveChatId(response.conversationId);
      }

      // Calculate cost based on usage and model pricing
      const modelInfo = getModelInfo(activeModel);
      let usage: UsageInfo | undefined;
      if (response.usage) {
        const inputCost = (response.usage.inputTokens / 1_000_000) * modelInfo.pricing.input;
        const outputCost = (response.usage.outputTokens / 1_000_000) * modelInfo.pricing.output;
        usage = {
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
          cost: inputCost + outputCost,
        };
      }

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.content,
        timestamp: Date.now(),
        model: activeModel,
        usage,
      };

      setHistories(prev => prev.map(h =>
        h.id === (response.conversationId || activeChatId)
          ? { ...h, messages: [...updatedMessages, aiMsg], updatedAt: Date.now() }
          : h
      ));
    } catch (error) {
      console.error(error);
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `エラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
        model: activeModel
      };
      setHistories(prev => prev.map(h =>
        h.id === activeChatId
          ? { ...h, messages: [...updatedMessages, errorMsg], updatedAt: Date.now() }
          : h
      ));
    } finally {
      setIsLoading(false);
    }
  };

  const createNewChat = () => {
    const newId = Date.now().toString();
    const newChat: ChatHistory = {
      id: newId,
      title: '新規チャット',
      messages: [],
      updatedAt: Date.now()
    };
    setHistories(prev => [newChat, ...prev]);
    setActiveChatId(newId);
    setBackendConversationId(null);
    setSelectedFileIds([]);
  };

  const deleteChat = async (chatId: string) => {
    // Try to delete from backend
    if (apiStatus === 'online') {
      try {
        await apiService.deleteConversation(chatId);
      } catch (error) {
        console.error('Failed to delete conversation from backend:', error);
      }
    }

    // Remove from local state
    setHistories(prev => prev.filter(h => h.id !== chatId));
    if (activeChatId === chatId) {
      const remaining = histories.filter(h => h.id !== chatId);
      if (remaining.length > 0) {
        setActiveChatId(remaining[0].id);
      } else {
        createNewChat();
      }
    }
  };

  // File upload to backend (S3)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check supported types
    const supportedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];

    if (!supportedTypes.includes(file.type)) {
      alert(`未対応のファイル形式です。対応形式: PDF, DOCX, TXT, CSV, XLSX`);
      return;
    }

    setIsUploading(true);
    try {
      const result = await apiService.uploadFile(file);
      const newFile: UploadedFile = {
        fileId: result.fileId,
        fileName: result.fileName,
        fileType: result.fileName.split('.').pop() as any,
        status: result.status,
        uploadedAt: result.uploadedAt,
        fileSize: file.size,
      };
      setUploadedFiles(prev => [newFile, ...prev]);
      // Auto-select the newly uploaded file
      setSelectedFileIds(prev => [...prev, result.fileId]);
    } catch (error) {
      console.error('File upload failed:', error);
      alert(`ファイルのアップロードに失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    try {
      await apiService.deleteFile(fileId);
      setUploadedFiles(prev => prev.filter(f => f.fileId !== fileId));
      setSelectedFileIds(prev => prev.filter(id => id !== fileId));
    } catch (error) {
      console.error('Failed to delete file:', error);
      alert('ファイルの削除に失敗しました');
    }
  };

  const toggleFileSelection = (fileId: string) => {
    setSelectedFileIds(prev =>
      prev.includes(fileId)
        ? prev.filter(id => id !== fileId)
        : [...prev, fileId]
    );
  };

  // Admin handlers
  const isAdmin = currentUser && ['system_admin', 'org_admin', 'company_admin'].includes(currentUser.role);

  const loadAdminUsers = async () => {
    if (!authState.accessToken || !currentUser) return;

    setAdminLoading(true);
    try {
      const users = await apiService.listUsers(currentUser.id);
      setAdminUsers(users);
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setAdminLoading(false);
    }
  };

  const handleCreateUser = async () => {
    if (!authState.accessToken || !currentUser) return;

    setAdminLoading(true);
    setCreateUserResult(null);
    try {
      const result = await apiService.createUser(currentUser.id, {
        email: newUserData.email,
        name: newUserData.name,
        role: newUserData.role,
        organizationId: newUserData.organizationId || undefined,
        companyId: newUserData.companyId || undefined,
        departmentId: newUserData.departmentId || undefined,
      });
      setCreateUserResult(result);
      setNewUserData({
        email: '',
        name: '',
        role: 'user',
        organizationId: '',
        companyId: '',
        departmentId: '',
      });
      // Refresh user list
      await loadAdminUsers();
    } catch (error) {
      console.error('Failed to create user:', error);
      alert(error instanceof Error ? error.message : 'ユーザーの作成に失敗しました');
    } finally {
      setAdminLoading(false);
    }
  };

  const getRoleLabel = (role: UserRole) => {
    const labels: Record<UserRole, string> = {
      system_admin: 'システム管理者',
      org_admin: '組織管理者',
      company_admin: '会社管理者',
      user: '一般ユーザー',
    };
    return labels[role];
  };

  const getAllowedRoles = (): UserRole[] => {
    if (!currentUser) return [];
    switch (currentUser.role) {
      case 'system_admin':
        return ['system_admin', 'org_admin', 'company_admin', 'user'];
      case 'org_admin':
        return ['company_admin', 'user'];
      case 'company_admin':
        return ['user'];
      default:
        return [];
    }
  };

  return (
    <div className="flex h-screen paper-texture text-[#1E3D6B]">
      {/* Sidebar */}
      <aside className="w-80 flex-shrink-0 border-r border-[#1E3D6B]/10 flex flex-col p-4">
        <div className="flex items-center gap-3 mb-8 px-2">
          <div className="w-10 h-10 rounded-full bg-[#1E3D6B] flex items-center justify-center text-[#A18E66]">
            <ICONS.Admin />
          </div>
          <h1 className="text-xl font-bold tracking-tight">AI Connective</h1>
        </div>

        <button
          onClick={createNewChat}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 mb-6 border-2 border-dashed border-[#A18E66] text-[#A18E66] rounded-xl hover:bg-[#A18E66]/5 transition-colors font-semibold"
        >
          <ICONS.Plus /> 新規チャット
        </button>

        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
          <p className="text-xs font-bold text-[#A18E66] uppercase tracking-wider mb-2 px-2">Recent Chats</p>
          {histories.map(h => (
            <SidebarItem
              key={h.id}
              active={activeChatId === h.id}
              onClick={() => handleSelectChat(h.id)}
              onDelete={() => deleteChat(h.id)}
            >
              <ICONS.History />
              <span className="truncate flex-1">{h.title}</span>
            </SidebarItem>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-[#1E3D6B]/10 space-y-1">
          <SidebarItem active={showFilesPanel} onClick={() => { setShowFilesPanel(!showFilesPanel); setShowSettings(false); setShowAdminPanel(false); }}>
            <ICONS.Paperclip />
            <span>ファイル管理</span>
            {uploadedFiles.length > 0 && (
              <span className="ml-auto text-xs bg-[#A18E66] text-white px-2 py-0.5 rounded-full">
                {uploadedFiles.length}
              </span>
            )}
          </SidebarItem>
          {isAdmin && (
            <SidebarItem active={showAdminPanel} onClick={() => { setShowAdminPanel(!showAdminPanel); setShowSettings(false); setShowFilesPanel(false); loadAdminUsers(); }}>
              <ICONS.Admin />
              <span>ユーザー管理</span>
            </SidebarItem>
          )}
          <SidebarItem active={showSettings} onClick={() => { setShowSettings(!showSettings); setShowFilesPanel(false); setShowAdminPanel(false); }}>
            <ICONS.Settings />
            <span>設定</span>
          </SidebarItem>
        </div>
      </aside>

      {/* Main Area */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-8 bg-white/50 backdrop-blur-sm border-b border-[#1E3D6B]/10 z-10">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium opacity-60">モデル:</span>
              <select
                value={activeModel}
                onChange={(e) => setActiveModel(e.target.value as AIModel)}
                className="bg-white border border-[#1E3D6B]/20 rounded-lg px-3 py-1.5 text-sm font-semibold focus:ring-2 focus:ring-[#A18E66] outline-none min-w-[200px]"
              >
                {Object.entries(GROUPED_MODELS).map(([group, models]) => (
                  models.length > 0 && (
                    <optgroup key={group} label={group}>
                      {models.map(model => (
                        <option key={model.id} value={model.id}>
                          {model.name} - ${model.pricing.input}/${model.pricing.output}/1M
                        </option>
                      ))}
                    </optgroup>
                  )
                ))}
              </select>
            </div>
            {/* API Status Indicator */}
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                apiStatus === 'online' ? 'bg-green-500' :
                apiStatus === 'offline' ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'
              }`} />
              <span className="text-xs opacity-50">
                {apiStatus === 'online' ? 'API Online' :
                 apiStatus === 'offline' ? 'API Offline' : 'Checking...'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {authState.isAuthenticated && currentUser ? (
              <>
                <div className="text-right">
                  <p className="text-sm font-bold">{currentUser.name}</p>
                  <p className="text-xs opacity-50 capitalize">{currentUser.role}</p>
                </div>
                <img src={currentUser.avatar} alt="User" className="w-10 h-10 rounded-full border-2 border-[#A18E66]" />
                <button
                  onClick={handleLogout}
                  className="ml-2 px-3 py-1.5 text-xs font-medium text-[#1E3D6B]/70 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  ログアウト
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowLoginModal(true)}
                className="px-4 py-2 bg-[#1E3D6B] text-white font-medium rounded-lg hover:bg-[#1E3D6B]/90 transition-colors"
              >
                ログイン
              </button>
            )}
          </div>
        </header>

        {/* Chat Content */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
          {!authState.isAuthenticated ? (
            <div className="h-full flex flex-col items-center justify-center">
              <div className="w-24 h-24 mb-6 rounded-3xl bg-[#1E3D6B]/10 flex items-center justify-center text-[#1E3D6B]">
                <ICONS.Admin />
              </div>
              <h2 className="text-2xl font-bold text-[#1E3D6B]">AI Connectiveへようこそ</h2>
              <p className="mt-2 text-sm text-[#1E3D6B]/60">ログインしてチャットを開始してください</p>
              <button
                onClick={() => setShowLoginModal(true)}
                className="mt-6 px-6 py-3 bg-[#1E3D6B] text-white font-bold rounded-xl hover:bg-[#1E3D6B]/90 transition-colors shadow-lg"
              >
                ログイン / アカウント作成
              </button>
            </div>
          ) : activeChat?.messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-40">
              <div className="w-24 h-24 mb-6 rounded-3xl bg-[#A18E66]/20 flex items-center justify-center text-[#1E3D6B]">
                <ICONS.History />
              </div>
              <h2 className="text-2xl font-light italic">どのようにお手伝いしましょうか？</h2>
              <p className="mt-2 text-sm">複数のAIモデル（Claude, Nova, Llama, Gemini等）に対応しています。</p>
              {selectedFileIds.length > 0 && (
                <p className="mt-2 text-sm text-[#A18E66]">
                  {selectedFileIds.length}個のファイルが参照として選択されています
                </p>
              )}
            </div>
          ) : (
            activeChat?.messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[80%] flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className={`w-8 h-8 flex-shrink-0 rounded-lg flex items-center justify-center ${
                    msg.role === 'user' ? 'bg-[#A18E66]' : 'bg-[#1E3D6B]'
                  } text-white shadow-sm`}>
                    {msg.role === 'user' ? 'U' : 'AI'}
                  </div>
                  <div className={`paper-card p-4 paper-shadow ${
                    msg.role === 'user'
                      ? 'bg-[#1E3D6B] text-white rounded-tr-none'
                      : 'bg-white text-[#1E3D6B] rounded-tl-none border-l-4 border-[#A18E66]'
                  }`}>
                    <div className="whitespace-pre-wrap leading-relaxed">
                      {msg.content}
                    </div>
                    <div className="mt-2 text-[10px] opacity-40 flex justify-between items-center gap-4">
                      <span>{msg.model && getModelInfo(msg.model)?.name}</span>
                      {msg.usage && (
                        <span className="flex items-center gap-2">
                          <span>{msg.usage.inputTokens.toLocaleString()}+{msg.usage.outputTokens.toLocaleString()} tokens</span>
                          <span className="text-[#A18E66] font-semibold">${msg.usage.cost?.toFixed(4)}</span>
                        </span>
                      )}
                      <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex justify-start">
              <div className="paper-card p-4 bg-white/80 animate-pulse flex items-center gap-3">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-[#A18E66] rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-[#A18E66] rounded-full animate-bounce [animation-delay:0.2s]"></div>
                  <div className="w-2 h-2 bg-[#A18E66] rounded-full animate-bounce [animation-delay:0.4s]"></div>
                </div>
                <span className="text-xs text-[#A18E66] font-medium italic">
                  {currentModelInfo?.name}が思考中...
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="p-8 pt-2">
          <div className="max-w-4xl mx-auto">
            {/* Selected Files Preview */}
            {selectedFileIds.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {selectedFileIds.map(fileId => {
                  const file = uploadedFiles.find(f => f.fileId === fileId);
                  return file ? (
                    <div key={fileId} className="flex items-center gap-2 bg-[#A18E66]/10 px-3 py-1.5 rounded-full border border-[#A18E66]/20 text-xs">
                      <span className="truncate max-w-[120px] font-medium">{file.fileName}</span>
                      <button
                        onClick={() => toggleFileSelection(fileId)}
                        className="hover:text-red-500 transition-colors"
                      >
                        ×
                      </button>
                    </div>
                  ) : null;
                })}
              </div>
            )}

            <div className="paper-card paper-shadow p-2 flex items-end gap-2 bg-white ring-1 ring-[#1E3D6B]/5">
              <label className={`p-3 text-[#A18E66] hover:bg-[#A18E66]/10 rounded-xl cursor-pointer transition-colors ${isUploading ? 'opacity-50 cursor-wait' : ''}`}>
                {isUploading ? (
                  <div className="w-5 h-5 border-2 border-[#A18E66] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <ICONS.Paperclip />
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                  accept=".pdf,.docx,.txt,.csv,.xlsx"
                  disabled={isUploading}
                />
              </label>
              <textarea
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder={authState.isAuthenticated ? "メッセージを入力..." : "ログインしてください"}
                disabled={!authState.isAuthenticated}
                className="flex-1 bg-transparent border-none focus:ring-0 px-2 py-3 resize-none custom-scrollbar max-h-48 text-[#1E3D6B] placeholder-[#1E3D6B]/30 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button
                onClick={handleSendMessage}
                disabled={isLoading || !input.trim() || !authState.isAuthenticated}
                className={`p-3 rounded-xl transition-all duration-300 ${
                  input.trim() && authState.isAuthenticated
                    ? 'bg-[#1E3D6B] text-white shadow-lg shadow-[#1E3D6B]/20 hover:-translate-y-0.5'
                    : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                }`}
              >
                <ICONS.Send />
              </button>
            </div>
            <p className="mt-2 text-center text-[10px] opacity-40 uppercase tracking-widest font-bold">
              Powered by AWS Bedrock & Google Gemini | Multi-Model AI Platform
            </p>
          </div>
        </div>

        {/* Files Panel (Overlay) */}
        {showFilesPanel && (
          <div className="absolute inset-0 z-50 bg-[#1E3D6B]/20 backdrop-blur-sm flex items-center justify-center p-8">
            <div className="paper-card w-full max-w-2xl bg-white shadow-2xl p-8 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-8 pb-4 border-b border-[#1E3D6B]/10">
                <h2 className="text-2xl font-bold flex items-center gap-3 text-[#1E3D6B]">
                  <ICONS.Paperclip /> ファイル管理 (RAG)
                </h2>
                <button
                  onClick={() => setShowFilesPanel(false)}
                  className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100"
                >
                  ×
                </button>
              </div>

              <div className="space-y-6">
                {/* Upload Section */}
                <section>
                  <h3 className="text-sm font-bold text-[#A18E66] uppercase tracking-wider mb-4">
                    ファイルアップロード
                  </h3>
                  <label className={`block w-full py-8 border-2 border-dashed border-[#A18E66]/30 text-[#A18E66] text-sm font-bold rounded-xl hover:bg-[#A18E66]/5 transition-colors cursor-pointer text-center ${isUploading ? 'opacity-50' : ''}`}>
                    {isUploading ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-[#A18E66] border-t-transparent rounded-full animate-spin" />
                        アップロード中...
                      </span>
                    ) : (
                      <>+ ファイルを選択 (PDF, DOCX, TXT, CSV, XLSX)</>
                    )}
                    <input
                      type="file"
                      className="hidden"
                      onChange={handleFileUpload}
                      accept=".pdf,.docx,.txt,.csv,.xlsx"
                      disabled={isUploading}
                    />
                  </label>
                </section>

                {/* Uploaded Files List */}
                <section>
                  <h3 className="text-sm font-bold text-[#A18E66] uppercase tracking-wider mb-4">
                    アップロード済みファイル ({uploadedFiles.length})
                  </h3>
                  {uploadedFiles.length === 0 ? (
                    <p className="text-sm opacity-50 text-center py-8">
                      まだファイルがアップロードされていません
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {uploadedFiles.map(file => (
                        <div
                          key={file.fileId}
                          className={`flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer ${
                            selectedFileIds.includes(file.fileId)
                              ? 'bg-[#A18E66]/10 border-[#A18E66]'
                              : 'bg-[#F5F7FA] border-[#1E3D6B]/5 hover:border-[#A18E66]/50'
                          }`}
                          onClick={() => toggleFileSelection(file.fileId)}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded flex items-center justify-center text-xs font-bold ${
                              selectedFileIds.includes(file.fileId)
                                ? 'bg-[#A18E66] text-white'
                                : 'bg-[#1E3D6B]/10 text-[#1E3D6B]'
                            }`}>
                              {file.fileType?.toUpperCase() || 'FILE'}
                            </div>
                            <div>
                              <p className="text-sm font-bold">{file.fileName}</p>
                              <p className="text-[10px] opacity-50">
                                {new Date(file.uploadedAt).toLocaleString()}
                                {file.fileSize && ` • ${(file.fileSize / 1024).toFixed(1)} KB`}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {selectedFileIds.includes(file.fileId) && (
                              <span className="text-xs text-[#A18E66] font-bold">選択中</span>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteFile(file.fileId); }}
                              className="p-2 hover:bg-red-100 rounded text-red-500 transition-colors"
                              title="削除"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* Selected Files Info */}
                {selectedFileIds.length > 0 && (
                  <section className="p-4 bg-[#A18E66]/10 rounded-xl">
                    <p className="text-sm">
                      <span className="font-bold text-[#A18E66]">{selectedFileIds.length}個のファイル</span>
                      がチャットの参照として選択されています。
                      これらのファイルの内容がAIの回答に反映されます。
                    </p>
                  </section>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Admin Panel (Overlay) */}
        {showAdminPanel && isAdmin && (
          <div className="absolute inset-0 z-50 bg-[#1E3D6B]/20 backdrop-blur-sm flex items-center justify-center p-8">
            <div className="paper-card w-full max-w-4xl bg-white shadow-2xl p-8 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-8 pb-4 border-b border-[#1E3D6B]/10">
                <h2 className="text-2xl font-bold flex items-center gap-3 text-[#1E3D6B]">
                  <ICONS.Admin /> ユーザー管理
                </h2>
                <button
                  onClick={() => setShowAdminPanel(false)}
                  className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100"
                >
                  ×
                </button>
              </div>

              <div className="space-y-8">
                {/* Current User Info */}
                <section className="p-4 bg-[#1E3D6B]/5 rounded-xl">
                  <p className="text-sm">
                    ログイン中: <span className="font-bold">{currentUser?.name}</span>
                    <span className="ml-2 px-2 py-1 bg-[#A18E66] text-white text-xs rounded-full">
                      {getRoleLabel(currentUser?.role || 'user')}
                    </span>
                  </p>
                </section>

                {/* Create User Form */}
                <section>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-bold text-[#A18E66] uppercase tracking-wider">
                      新規ユーザー作成
                    </h3>
                    <button
                      onClick={() => setShowCreateUserForm(!showCreateUserForm)}
                      className="text-sm text-[#A18E66] hover:underline"
                    >
                      {showCreateUserForm ? '閉じる' : '+ 新規作成'}
                    </button>
                  </div>

                  {showCreateUserForm && (
                    <div className="p-4 bg-[#F5F7FA] rounded-xl space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-[#1E3D6B]/70 mb-1">メールアドレス</label>
                          <input
                            type="email"
                            value={newUserData.email}
                            onChange={(e) => setNewUserData({ ...newUserData, email: e.target.value })}
                            className="w-full px-3 py-2 border border-[#1E3D6B]/20 rounded-lg text-sm"
                            placeholder="user@example.com"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-[#1E3D6B]/70 mb-1">名前</label>
                          <input
                            type="text"
                            value={newUserData.name}
                            onChange={(e) => setNewUserData({ ...newUserData, name: e.target.value })}
                            className="w-full px-3 py-2 border border-[#1E3D6B]/20 rounded-lg text-sm"
                            placeholder="山田 太郎"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-[#1E3D6B]/70 mb-1">権限レベル</label>
                          <select
                            value={newUserData.role}
                            onChange={(e) => setNewUserData({ ...newUserData, role: e.target.value as UserRole })}
                            className="w-full px-3 py-2 border border-[#1E3D6B]/20 rounded-lg text-sm"
                          >
                            {getAllowedRoles().map(role => (
                              <option key={role} value={role}>{getRoleLabel(role)}</option>
                            ))}
                          </select>
                        </div>
                        {currentUser?.role === 'system_admin' && (
                          <div>
                            <label className="block text-xs font-bold text-[#1E3D6B]/70 mb-1">組織ID</label>
                            <input
                              type="text"
                              value={newUserData.organizationId}
                              onChange={(e) => setNewUserData({ ...newUserData, organizationId: e.target.value })}
                              className="w-full px-3 py-2 border border-[#1E3D6B]/20 rounded-lg text-sm"
                              placeholder="org-001"
                            />
                          </div>
                        )}
                        {['system_admin', 'org_admin'].includes(currentUser?.role || '') && (
                          <div>
                            <label className="block text-xs font-bold text-[#1E3D6B]/70 mb-1">会社ID</label>
                            <input
                              type="text"
                              value={newUserData.companyId}
                              onChange={(e) => setNewUserData({ ...newUserData, companyId: e.target.value })}
                              className="w-full px-3 py-2 border border-[#1E3D6B]/20 rounded-lg text-sm"
                              placeholder="comp-001"
                            />
                          </div>
                        )}
                        <div>
                          <label className="block text-xs font-bold text-[#1E3D6B]/70 mb-1">部門ID</label>
                          <input
                            type="text"
                            value={newUserData.departmentId}
                            onChange={(e) => setNewUserData({ ...newUserData, departmentId: e.target.value })}
                            className="w-full px-3 py-2 border border-[#1E3D6B]/20 rounded-lg text-sm"
                            placeholder="dept-001"
                          />
                        </div>
                      </div>
                      <button
                        onClick={handleCreateUser}
                        disabled={adminLoading || !newUserData.email || !newUserData.name}
                        className="w-full py-2 bg-[#1E3D6B] text-white font-bold rounded-lg hover:bg-[#1E3D6B]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {adminLoading ? '作成中...' : 'ユーザーを作成'}
                      </button>

                      {createUserResult && (
                        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                          <p className="text-green-700 font-bold mb-2">ユーザーが作成されました！</p>
                          <p className="text-sm text-green-600">
                            仮パスワード: <code className="bg-green-100 px-2 py-1 rounded font-mono">{createUserResult.temporaryPassword}</code>
                          </p>
                          <p className="text-xs text-green-500 mt-1">初回ログイン時にパスワードの変更が必要です。</p>
                        </div>
                      )}
                    </div>
                  )}
                </section>

                {/* User List */}
                <section>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-bold text-[#A18E66] uppercase tracking-wider">
                      ユーザー一覧 ({adminUsers.length})
                    </h3>
                    <button
                      onClick={loadAdminUsers}
                      disabled={adminLoading}
                      className="text-sm text-[#1E3D6B]/70 hover:text-[#1E3D6B]"
                    >
                      {adminLoading ? '読み込み中...' : '更新'}
                    </button>
                  </div>

                  {adminLoading && adminUsers.length === 0 ? (
                    <div className="text-center py-8 opacity-50">読み込み中...</div>
                  ) : adminUsers.length === 0 ? (
                    <div className="text-center py-8 opacity-50">ユーザーがいません</div>
                  ) : (
                    <div className="space-y-2">
                      {adminUsers.map(user => (
                        <div
                          key={user.userId}
                          className="flex items-center justify-between p-4 bg-[#F5F7FA] rounded-xl"
                        >
                          <div className="flex items-center gap-4">
                            <img
                              src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.name)}`}
                              alt={user.name}
                              className="w-10 h-10 rounded-full"
                            />
                            <div>
                              <p className="font-bold text-sm">{user.name}</p>
                              <p className="text-xs opacity-60">{user.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              user.role === 'system_admin' ? 'bg-red-100 text-red-600' :
                              user.role === 'org_admin' ? 'bg-purple-100 text-purple-600' :
                              user.role === 'company_admin' ? 'bg-blue-100 text-blue-600' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {getRoleLabel(user.role)}
                            </span>
                            {user.organizationId && (
                              <span className="text-xs opacity-50">組織: {user.organizationId}</span>
                            )}
                            {user.companyId && (
                              <span className="text-xs opacity-50">会社: {user.companyId}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* Role Hierarchy Info */}
                <section className="p-4 bg-[#1E3D6B]/5 rounded-xl">
                  <h4 className="text-xs font-bold text-[#A18E66] uppercase tracking-wider mb-3">権限階層について</h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 bg-red-100 text-red-600 rounded">システム管理者</span>
                      <span className="opacity-60">→ 全ユーザーを管理</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 bg-purple-100 text-purple-600 rounded">組織管理者</span>
                      <span className="opacity-60">→ 組織内のユーザーを管理</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 bg-blue-100 text-blue-600 rounded">会社管理者</span>
                      <span className="opacity-60">→ 会社内のユーザーを管理</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded">一般ユーザー</span>
                      <span className="opacity-60">→ チャットのみ利用可能</span>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </div>
        )}

        {/* Settings Modal (Overlay) */}
        {showSettings && (
          <div className="absolute inset-0 z-50 bg-[#1E3D6B]/20 backdrop-blur-sm flex items-center justify-center p-8">
            <div className="paper-card w-full max-w-2xl bg-white shadow-2xl p-8 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-8 pb-4 border-b border-[#1E3D6B]/10">
                <h2 className="text-2xl font-bold flex items-center gap-3 text-[#1E3D6B]">
                  <ICONS.Settings /> 管理者 & 設定
                </h2>
                <button
                  onClick={() => setShowSettings(false)}
                  className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100"
                >
                  ×
                </button>
              </div>

              <div className="space-y-8">
                {/* Available Models */}
                <section>
                  <h3 className="text-sm font-bold text-[#A18E66] uppercase tracking-wider mb-4">
                    利用可能なモデル
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(GROUPED_MODELS).map(([group, models]) => (
                      models.length > 0 && (
                        <div key={group} className="col-span-2">
                          <p className="text-xs font-bold text-[#1E3D6B]/50 mb-2">{group}</p>
                          <div className="grid grid-cols-2 gap-2 mb-4">
                            {models.map(model => (
                              <div
                                key={model.id}
                                onClick={() => setActiveModel(model.id)}
                                className={`p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md ${
                                  activeModel === model.id
                                    ? 'border-[#A18E66] bg-[#A18E66]/10'
                                    : 'border-[#1E3D6B]/10 hover:border-[#A18E66]/50'
                                }`}
                              >
                                <div className="flex justify-between items-start">
                                  <p className="text-sm font-bold">{model.name}</p>
                                  <span className="text-[9px] font-mono text-[#A18E66] font-semibold">
                                    ${model.pricing.input}/${model.pricing.output}
                                  </span>
                                </div>
                                <p className="text-[10px] opacity-50">{model.description}</p>
                                <div className="mt-1 flex gap-1 flex-wrap">
                                  {model.supportsImages && (
                                    <span className="text-[8px] px-1 py-0.5 bg-blue-100 text-blue-600 rounded">画像</span>
                                  )}
                                  <span className={`text-[8px] px-1 py-0.5 rounded ${
                                    model.category === 'reasoning' ? 'bg-purple-100 text-purple-600' :
                                    model.category === 'fast' ? 'bg-green-100 text-green-600' :
                                    model.category === 'code' ? 'bg-orange-100 text-orange-600' :
                                    'bg-gray-100 text-gray-600'
                                  }`}>
                                    {model.category}
                                  </span>
                                  <span className="text-[8px] px-1 py-0.5 bg-gray-100 text-gray-500 rounded">
                                    /1M tokens
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                </section>

                {/* User Info */}
                <section>
                  <h3 className="text-sm font-bold text-[#A18E66] uppercase tracking-wider mb-4">
                    ユーザープロファイル
                  </h3>
                  {currentUser ? (
                    <div className="flex items-center gap-6 p-6 bg-[#1E3D6B] text-white rounded-2xl">
                      <img src={currentUser.avatar} className="w-20 h-20 rounded-full border-4 border-[#A18E66]" />
                      <div>
                        <h4 className="text-xl font-bold">{currentUser.name}</h4>
                        <p className="opacity-70 text-sm">権限レベル: <span className="text-[#A18E66] font-bold uppercase">{currentUser.role}</span></p>
                        <button
                          onClick={handleLogout}
                          className="mt-4 text-xs font-bold py-2 px-4 bg-red-500/20 hover:bg-red-500/40 rounded-lg transition-colors"
                        >
                          ログアウト
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 bg-gray-100 rounded-2xl text-center">
                      <p className="text-sm opacity-70 mb-4">ログインしていません</p>
                      <button
                        onClick={() => { setShowSettings(false); setShowLoginModal(true); }}
                        className="px-4 py-2 bg-[#1E3D6B] text-white font-medium rounded-lg hover:bg-[#1E3D6B]/90 transition-colors"
                      >
                        ログイン
                      </button>
                    </div>
                  )}
                </section>

                <section>
                  <h3 className="text-sm font-bold text-[#A18E66] uppercase tracking-wider mb-4">
                    システムステータス
                  </h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-4 bg-[#F5F7FA] rounded-xl">
                      <p className="text-[10px] opacity-50 font-bold uppercase">Chat History</p>
                      <p className="text-2xl font-bold text-[#1E3D6B]">{histories.length} Sessions</p>
                    </div>
                    <div className="p-4 bg-[#F5F7FA] rounded-xl">
                      <p className="text-[10px] opacity-50 font-bold uppercase">Files Uploaded</p>
                      <p className="text-2xl font-bold text-[#1E3D6B]">{uploadedFiles.length}</p>
                    </div>
                    <div className="p-4 bg-[#F5F7FA] rounded-xl">
                      <p className="text-[10px] opacity-50 font-bold uppercase">API Status</p>
                      <p className={`text-2xl font-bold ${
                        apiStatus === 'online' ? 'text-green-600' :
                        apiStatus === 'offline' ? 'text-red-600' : 'text-yellow-600'
                      }`}>
                        {apiStatus === 'online' ? 'Online' :
                         apiStatus === 'offline' ? 'Offline' : 'Checking'}
                      </p>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </div>
        )}

        {/* Login Modal */}
        {showLoginModal && (
          <LoginModal
            onLogin={handleLogin}
            onSignUp={handleSignUp}
            onConfirm={handleConfirm}
            error={authError}
            successMessage={authSuccess}
            isLoading={authLoading}
          />
        )}
      </main>
    </div>
  );
};

export default App;
