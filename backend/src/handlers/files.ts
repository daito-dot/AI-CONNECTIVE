import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import type {
  APIGatewayEvent,
  APIGatewayResponse,
  FileRecord,
  FileUploadRequest,
  FileUploadResponse,
  FileQueryRequest,
  FileQueryResponse,
  FileType,
} from '../types/index.js';

const s3 = new S3Client({});
const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);

const BUCKET_NAME = process.env.FILES_BUCKET || '';
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

function getMimeType(fileType: FileType): string {
  const mimeTypes: Record<FileType, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    txt: 'text/plain',
    csv: 'text/csv',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  return mimeTypes[fileType] || 'application/octet-stream';
}

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

// Upload file
async function uploadFile(request: FileUploadRequest): Promise<FileUploadResponse> {
  const fileId = uuidv4();
  const now = new Date().toISOString();
  const userId = request.userId || 'anonymous';
  const s3Key = `${userId}/${fileId}/${request.fileName}`;

  // Decode base64 and upload to S3
  const fileBuffer = Buffer.from(request.fileData, 'base64');

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: s3Key,
    Body: fileBuffer,
    ContentType: request.mimeType,
  }));

  // Create file record in DynamoDB
  const fileRecord: FileRecord = {
    PK: `FILE#${fileId}`,
    SK: 'META',
    fileId,
    fileName: request.fileName,
    fileType: request.fileType,
    mimeType: request.mimeType,
    s3Key,
    userId,
    uploadedAt: now,
    fileSize: fileBuffer.length,
    status: 'ready', // For now, mark as ready immediately
    GSI1PK: `USER#${userId}`,
    GSI1SK: `FILE#${now}`,
  };

  // For text-based files, extract and store the text
  if (request.fileType === 'txt' || request.fileType === 'csv') {
    fileRecord.extractedText = fileBuffer.toString('utf-8');
  }

  await ddb.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: fileRecord,
  }));

  return {
    fileId,
    fileName: request.fileName,
    status: fileRecord.status,
    uploadedAt: now,
  };
}

// List files for user
async function listFiles(userId: string): Promise<FileRecord[]> {
  const result = await ddb.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':sk': 'FILE#',
    },
    ScanIndexForward: false, // Most recent first
  }));

  return (result.Items || []) as FileRecord[];
}

// Get single file
async function getFile(fileId: string): Promise<FileRecord | null> {
  const result = await ddb.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: {
      PK: `FILE#${fileId}`,
      SK: 'META',
    },
  }));

  return (result.Item as FileRecord) || null;
}

// Delete file
async function deleteFile(fileId: string): Promise<void> {
  // Get file record first
  const file = await getFile(fileId);
  if (!file) {
    throw new Error('File not found');
  }

  // Delete from S3
  await s3.send(new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: file.s3Key,
  }));

  // Delete from DynamoDB
  await ddb.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: {
      PK: `FILE#${fileId}`,
      SK: 'META',
    },
  }));
}

// Query file content (for RAG)
async function queryFile(fileId: string, request: FileQueryRequest): Promise<FileQueryResponse> {
  const file = await getFile(fileId);
  if (!file) {
    throw new Error('File not found');
  }

  let fileContent = '';

  // Get content from extractedText or S3
  if (file.extractedText) {
    fileContent = file.extractedText;
  } else {
    // Fetch from S3
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
      fileContent = Buffer.concat(chunks).toString('utf-8');
    }
  }

  // For CSV files, provide summary info
  if (file.fileType === 'csv') {
    const lines = fileContent.split('\n').filter(line => line.trim());
    const headers = lines[0]?.split(',').map(h => h.trim()) || [];
    const rowCount = lines.length - 1;

    return {
      answer: `CSVファイル「${file.fileName}」の情報:\n- 列: ${headers.join(', ')}\n- 行数: ${rowCount}行\n\n質問に回答するにはチャット機能を使用してください。`,
      sourceData: JSON.stringify({
        headers,
        rowCount,
        preview: lines.slice(0, 6).join('\n'),
      }),
    };
  }

  // For text files, return content summary
  return {
    answer: `ファイル「${file.fileName}」の内容を取得しました。チャットで質問してください。`,
    sourceData: fileContent.substring(0, 1000),
  };
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
    // POST /files/upload
    if (method === 'POST' && path === '/files/upload') {
      if (!event.body) {
        return createResponse(400, { error: 'Request body is required' });
      }

      const request: FileUploadRequest = JSON.parse(event.body);

      if (!request.fileName || !request.fileType || !request.fileData) {
        return createResponse(400, { error: 'fileName, fileType, and fileData are required' });
      }

      const response = await uploadFile(request);
      return createResponse(200, response);
    }

    // GET /files
    if (method === 'GET' && path === '/files') {
      const userId = event.queryStringParameters?.userId || 'anonymous';
      const files = await listFiles(userId);
      return createResponse(200, { files });
    }

    // GET /files/{fileId}
    if (method === 'GET' && path.startsWith('/files/') && !path.includes('/query')) {
      const fileId = path.split('/')[2];
      const file = await getFile(fileId);
      if (!file) {
        return createResponse(404, { error: 'File not found' });
      }
      return createResponse(200, { file });
    }

    // DELETE /files/{fileId}
    if (method === 'DELETE' && path.startsWith('/files/')) {
      const fileId = path.split('/')[2];
      await deleteFile(fileId);
      return createResponse(200, { message: 'File deleted' });
    }

    // POST /files/{fileId}/query
    if (method === 'POST' && path.includes('/query')) {
      const fileId = path.split('/')[2];
      if (!event.body) {
        return createResponse(400, { error: 'Request body is required' });
      }

      const request: FileQueryRequest = JSON.parse(event.body);
      const response = await queryFile(fileId, request);
      return createResponse(200, response);
    }

    return createResponse(404, { error: 'Not found' });
  } catch (error) {
    console.error('Files handler error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return createResponse(500, { error: errorMessage });
  }
}
