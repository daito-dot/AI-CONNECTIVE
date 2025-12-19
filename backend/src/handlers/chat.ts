import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import type {
  APIGatewayEvent,
  APIGatewayResponse,
  ChatRequest,
  ChatResponse,
  Conversation,
  ConversationMessage,
  FileRecord,
} from '../types/index.js';
import { getModelInfo, getAllModels, MODEL_CONFIGS } from '../config/models.js';
import { invokeBedrock } from '../services/bedrock.js';
import { invokeGemini } from '../services/gemini.js';

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);
const s3 = new S3Client({});

const TABLE_NAME = process.env.MAIN_TABLE || '';
const BUCKET_NAME = process.env.FILES_BUCKET || '';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

function createResponse(statusCode: number, body: object): APIGatewayResponse {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

// Calculate cost based on token usage
function calculateCost(modelId: string, inputTokens: number, outputTokens: number): number {
  const modelInfo = MODEL_CONFIGS[modelId as keyof typeof MODEL_CONFIGS];
  if (!modelInfo) return 0;

  const inputCost = (inputTokens / 1_000_000) * modelInfo.pricing.input;
  const outputCost = (outputTokens / 1_000_000) * modelInfo.pricing.output;
  return inputCost + outputCost;
}

// Get file content for RAG
async function getFileContent(fileId: string): Promise<string | null> {
  try {
    const result = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `FILE#${fileId}`,
        SK: 'META',
      },
    }));

    const file = result.Item as FileRecord | undefined;
    if (!file) return null;

    // Return extracted text if available
    if (file.extractedText) {
      return file.extractedText;
    }

    // Otherwise fetch from S3
    const s3Response = await s3.send(new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: file.s3Key,
    }));

    const bodyStream = s3Response.Body;
    if (bodyStream) {
      const chunks: Uint8Array[] = [];
      for await (const chunk of bodyStream as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks).toString('utf-8');
    }

    return null;
  } catch (error) {
    console.error('Error getting file content:', error);
    return null;
  }
}

// Save or update conversation
async function saveConversation(
  conversationId: string,
  userId: string,
  modelId: string,
  title: string,
  isNew: boolean
): Promise<void> {
  const now = new Date().toISOString();

  if (isNew) {
    const conversation: Conversation = {
      PK: `CONV#${conversationId}`,
      SK: 'META',
      conversationId,
      title,
      userId,
      modelId,
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCost: 0,
      GSI1PK: `USER#${userId}`,
      GSI1SK: `CONV#${now}`,
    };

    await ddb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: conversation,
    }));
  } else {
    await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `CONV#${conversationId}`,
        SK: 'META',
      },
      UpdateExpression: 'SET updatedAt = :now, GSI1SK = :gsi1sk',
      ExpressionAttributeValues: {
        ':now': now,
        ':gsi1sk': `CONV#${now}`,
      },
    }));
  }
}

// Save message to conversation
async function saveMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  modelId?: string,
  inputTokens?: number,
  outputTokens?: number
): Promise<void> {
  const messageId = uuidv4();
  const now = new Date().toISOString();
  const cost = modelId && inputTokens && outputTokens
    ? calculateCost(modelId, inputTokens, outputTokens)
    : 0;

  const message: ConversationMessage = {
    PK: `CONV#${conversationId}`,
    SK: `MSG#${now}#${messageId}`,
    messageId,
    role,
    content,
    modelId,
    inputTokens,
    outputTokens,
    cost,
    createdAt: now,
  };

  await ddb.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: message,
  }));

  // Update conversation totals
  if (inputTokens || outputTokens) {
    await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `CONV#${conversationId}`,
        SK: 'META',
      },
      UpdateExpression: 'SET messageCount = messageCount + :one, totalInputTokens = totalInputTokens + :input, totalOutputTokens = totalOutputTokens + :output, totalCost = totalCost + :cost, updatedAt = :now',
      ExpressionAttributeValues: {
        ':one': 1,
        ':input': inputTokens || 0,
        ':output': outputTokens || 0,
        ':cost': cost,
        ':now': now,
      },
    }));
  }
}

// Extended chat request with conversation support
interface ExtendedChatRequest extends ChatRequest {
  conversationId?: string;
  userId?: string;
  fileIds?: string[];
  saveHistory?: boolean;
}

export async function handler(event: APIGatewayEvent): Promise<APIGatewayResponse> {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, {});
  }

  try {
    if (!event.body) {
      return createResponse(400, { error: 'Request body is required' });
    }

    const request: ExtendedChatRequest = JSON.parse(event.body);

    // Validate request
    if (!request.model) {
      return createResponse(400, { error: 'Model is required' });
    }
    if (!request.messages || request.messages.length === 0) {
      return createResponse(400, { error: 'Messages are required' });
    }

    // Get model info to determine provider
    const modelInfo = getModelInfo(request.model);
    if (!modelInfo) {
      return createResponse(400, { error: `Unknown model: ${request.model}` });
    }

    // Handle file references for RAG
    let systemPromptWithFiles = request.systemPrompt || '';
    if (request.fileIds && request.fileIds.length > 0) {
      const fileContents: string[] = [];
      for (const fileId of request.fileIds) {
        const content = await getFileContent(fileId);
        if (content) {
          fileContents.push(`--- ファイル内容 ---\n${content}\n--- ファイル終了 ---`);
        }
      }
      if (fileContents.length > 0) {
        systemPromptWithFiles = `${systemPromptWithFiles}\n\n以下は参照ファイルの内容です。質問に回答する際にこのデータを参照してください:\n\n${fileContents.join('\n\n')}`;
      }
    }

    const modifiedRequest = {
      ...request,
      systemPrompt: systemPromptWithFiles || undefined,
    };

    // Route to appropriate provider
    let response: ChatResponse;
    if (modelInfo.provider === 'bedrock') {
      response = await invokeBedrock(modifiedRequest);
    } else if (modelInfo.provider === 'gemini') {
      response = await invokeGemini(modifiedRequest);
    } else {
      return createResponse(400, { error: `Unsupported provider: ${modelInfo.provider}` });
    }

    // Save to conversation history if requested
    if (request.saveHistory !== false && TABLE_NAME) {
      const conversationId = request.conversationId || uuidv4();
      const userId = request.userId || 'anonymous';
      const isNewConversation = !request.conversationId;

      try {
        // Save conversation metadata
        const lastUserMessage = request.messages[request.messages.length - 1];
        const title = lastUserMessage?.content.substring(0, 50) || 'New Conversation';

        await saveConversation(conversationId, userId, request.model, title, isNewConversation);

        // Save user message
        await saveMessage(conversationId, 'user', lastUserMessage?.content || '');

        // Save assistant response
        await saveMessage(
          conversationId,
          'assistant',
          response.content,
          request.model,
          response.usage?.inputTokens,
          response.usage?.outputTokens
        );

        // Add conversationId to response
        (response as ChatResponse & { conversationId?: string }).conversationId = conversationId;
      } catch (saveError) {
        console.error('Error saving conversation:', saveError);
        // Don't fail the request if save fails
      }
    }

    return createResponse(200, response);
  } catch (error) {
    console.error('Chat handler error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return createResponse(500, { error: errorMessage });
  }
}

// Models endpoint - returns available models
export async function modelsHandler(event: APIGatewayEvent): Promise<APIGatewayResponse> {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, {});
  }

  return createResponse(200, { models: getAllModels() });
}
