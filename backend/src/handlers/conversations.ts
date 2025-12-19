import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, GetCommand, DeleteCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import type {
  APIGatewayEvent,
  APIGatewayResponse,
  Conversation,
  ConversationMessage,
} from '../types/index.js';

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);

const TABLE_NAME = process.env.MAIN_TABLE || '';

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

// List conversations for a user
async function listConversations(userId: string, limit: number = 50): Promise<Conversation[]> {
  const result = await ddb.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':sk': 'CONV#',
    },
    ScanIndexForward: false, // Most recent first
    Limit: limit,
  }));

  return (result.Items || []) as Conversation[];
}

// Get conversation with messages
async function getConversation(conversationId: string): Promise<{
  conversation: Conversation | null;
  messages: ConversationMessage[];
}> {
  // Get all items for this conversation (metadata + messages)
  const result = await ddb.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: {
      ':pk': `CONV#${conversationId}`,
    },
    ScanIndexForward: true, // Oldest messages first
  }));

  const items = result.Items || [];

  // Separate metadata from messages
  const metaItem = items.find(item => item.SK === 'META');
  const messageItems = items.filter(item => item.SK.startsWith('MSG#'));

  return {
    conversation: metaItem as Conversation | null,
    messages: messageItems as ConversationMessage[],
  };
}

// Delete conversation and all its messages
async function deleteConversation(conversationId: string): Promise<void> {
  // First, get all items for this conversation
  const result = await ddb.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: {
      ':pk': `CONV#${conversationId}`,
    },
    ProjectionExpression: 'PK, SK',
  }));

  const items = result.Items || [];

  if (items.length === 0) {
    throw new Error('Conversation not found');
  }

  // Delete in batches of 25 (DynamoDB limit)
  const batchSize = 25;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const deleteRequests = batch.map(item => ({
      DeleteRequest: {
        Key: {
          PK: item.PK,
          SK: item.SK,
        },
      },
    }));

    await ddb.send(new BatchWriteCommand({
      RequestItems: {
        [TABLE_NAME]: deleteRequests,
      },
    }));
  }
}

// Main handler
export async function handler(event: APIGatewayEvent): Promise<APIGatewayResponse> {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, {});
  }

  const path = event.path;
  const method = event.httpMethod;

  try {
    // GET /conversations
    if (method === 'GET' && path === '/conversations') {
      const userId = event.queryStringParameters?.userId || 'anonymous';
      const limit = parseInt(event.queryStringParameters?.limit || '50', 10);
      const conversations = await listConversations(userId, limit);
      return createResponse(200, { conversations });
    }

    // GET /conversations/{conversationId}
    if (method === 'GET' && path.startsWith('/conversations/')) {
      const conversationId = path.split('/')[2];
      if (!conversationId) {
        return createResponse(400, { error: 'Conversation ID is required' });
      }

      const result = await getConversation(conversationId);
      if (!result.conversation) {
        return createResponse(404, { error: 'Conversation not found' });
      }

      return createResponse(200, result);
    }

    // DELETE /conversations/{conversationId}
    if (method === 'DELETE' && path.startsWith('/conversations/')) {
      const conversationId = path.split('/')[2];
      if (!conversationId) {
        return createResponse(400, { error: 'Conversation ID is required' });
      }

      await deleteConversation(conversationId);
      return createResponse(200, { message: 'Conversation deleted' });
    }

    return createResponse(404, { error: 'Not found' });
  } catch (error) {
    console.error('Conversations handler error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return createResponse(500, { error: errorMessage });
  }
}
