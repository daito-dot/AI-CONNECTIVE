
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
} from './types';
import { COLORS, ICONS } from './constants';
import { apiService } from './services/apiService';

// --- Mock Data ---
const DEFAULT_USER: User = {
  id: 'u1',
  name: 'Sample User',
  role: 'admin',
  avatar: 'https://picsum.photos/seed/user1/100/100'
};

// Group models by provider for UI
const GROUPED_MODELS = {
  'Anthropic Claude': Object.values(MODEL_CONFIGS).filter(m => m.id.includes('anthropic.claude')),
  'Amazon Nova': Object.values(MODEL_CONFIGS).filter(m => m.id.includes('amazon.nova')),
  'Meta Llama': Object.values(MODEL_CONFIGS).filter(m => m.id.includes('meta.llama')),
  'Google Gemini': Object.values(MODEL_CONFIGS).filter(m => m.id.startsWith('gemini')),
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
  const [currentUser, setCurrentUser] = useState<User>(DEFAULT_USER);
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
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Set user ID in apiService
  useEffect(() => {
    apiService.setUserId(currentUser.id);
  }, [currentUser.id]);

  // Check API status and load data on mount
  useEffect(() => {
    const initializeApp = async () => {
      const isOnline = await apiService.checkHealth();
      setApiStatus(isOnline ? 'online' : 'offline');

      if (isOnline) {
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
            // Don't auto-select, let user choose or create new
          }
        } catch (error) {
          console.error('Failed to load conversations:', error);
        }
      }

      // Create initial chat if none exist
      if (histories.length === 0) {
        createNewChat();
      }
    };

    initializeApp();
  }, []);

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
          <SidebarItem active={showFilesPanel} onClick={() => { setShowFilesPanel(!showFilesPanel); setShowSettings(false); }}>
            <ICONS.Paperclip />
            <span>ファイル管理</span>
            {uploadedFiles.length > 0 && (
              <span className="ml-auto text-xs bg-[#A18E66] text-white px-2 py-0.5 rounded-full">
                {uploadedFiles.length}
              </span>
            )}
          </SidebarItem>
          <SidebarItem active={showSettings} onClick={() => { setShowSettings(!showSettings); setShowFilesPanel(false); }}>
            <ICONS.Settings />
            <span>設定 & 管理</span>
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
            <div className="text-right">
              <p className="text-sm font-bold">{currentUser.name}</p>
              <p className="text-xs opacity-50 capitalize">{currentUser.role}</p>
            </div>
            <img src={currentUser.avatar} alt="User" className="w-10 h-10 rounded-full border-2 border-[#A18E66]" />
          </div>
        </header>

        {/* Chat Content */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
          {activeChat?.messages.length === 0 ? (
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
                placeholder="メッセージを入力..."
                className="flex-1 bg-transparent border-none focus:ring-0 px-2 py-3 resize-none custom-scrollbar max-h-48 text-[#1E3D6B] placeholder-[#1E3D6B]/30"
              />
              <button
                onClick={handleSendMessage}
                disabled={isLoading || !input.trim()}
                className={`p-3 rounded-xl transition-all duration-300 ${
                  input.trim()
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
                  <div className="flex items-center gap-6 p-6 bg-[#1E3D6B] text-white rounded-2xl">
                    <img src={currentUser.avatar} className="w-20 h-20 rounded-full border-4 border-[#A18E66]" />
                    <div>
                      <h4 className="text-xl font-bold">{currentUser.name}</h4>
                      <p className="opacity-70 text-sm">権限レベル: <span className="text-[#A18E66] font-bold uppercase">{currentUser.role}</span></p>
                      <button className="mt-4 text-xs font-bold py-2 px-4 bg-white/10 hover:bg-white/20 rounded-lg transition-colors">
                        プロファイルを編集
                      </button>
                    </div>
                  </div>
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
      </main>
    </div>
  );
};

export default App;
