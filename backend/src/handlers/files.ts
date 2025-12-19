import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, DeleteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
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
  FileVisibility,
  FileCategory,
  UserRole,
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

// Check what visibility levels a user can set based on their role
function getAllowedVisibilities(role: UserRole): FileVisibility[] {
  const visibilityByRole: Record<UserRole, FileVisibility[]> = {
    system_admin: ['private', 'department', 'company', 'organization', 'system'],
    org_admin: ['private', 'department', 'company', 'organization'],
    company_admin: ['private', 'department', 'company'],
    user: ['private'],
  };
  return visibilityByRole[role] || ['private'];
}

// Check if user can access a file based on visibility
function canAccessFile(
  file: FileRecord,
  userId: string,
  userRole: UserRole,
  userOrgId?: string,
  userCompanyId?: string,
  userDeptId?: string
): boolean {
  // Owner can always access
  if (file.userId === userId) return true;

  // System admins can access everything
  if (userRole === 'system_admin') return true;

  switch (file.visibility) {
    case 'private':
      return false;
    case 'department':
      return file.departmentId === userDeptId && file.companyId === userCompanyId;
    case 'company':
      return file.companyId === userCompanyId;
    case 'organization':
      return file.organizationId === userOrgId;
    case 'system':
      return true;
    default:
      return false;
  }
}

// Upload file
async function uploadFile(request: FileUploadRequest): Promise<FileUploadResponse> {
  const fileId = uuidv4();
  const now = new Date().toISOString();
  const userId = request.userId || 'anonymous';
  const userRole = request.userRole || 'user';
  const visibility = request.visibility || 'private';
  const category = request.category || 'chat_attachment';

  // Validate visibility based on role
  const allowedVisibilities = getAllowedVisibilities(userRole);
  if (!allowedVisibilities.includes(visibility)) {
    throw new Error(`Role ${userRole} cannot set visibility to ${visibility}`);
  }

  const s3Key = `${request.organizationId || 'default'}/${request.companyId || 'default'}/${userId}/${fileId}/${request.fileName}`;

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
    createdByRole: userRole,
    organizationId: request.organizationId,
    companyId: request.companyId,
    departmentId: request.departmentId,
    uploadedAt: now,
    fileSize: fileBuffer.length,
    status: 'ready',
    visibility,
    category,
    description: request.description,
    // GSI for user's files
    GSI1PK: `USER#${userId}`,
    GSI1SK: `FILE#${now}`,
  };

  // Add GSI2 for visibility-based queries
  if (visibility === 'system') {
    fileRecord.GSI2PK = 'VISIBILITY#system';
    fileRecord.GSI2SK = `FILE#${now}`;
  } else if (visibility === 'organization' && request.organizationId) {
    fileRecord.GSI2PK = `ORG#${request.organizationId}`;
    fileRecord.GSI2SK = `FILE#${now}`;
  } else if (visibility === 'company' && request.companyId) {
    fileRecord.GSI2PK = `COMPANY#${request.companyId}`;
    fileRecord.GSI2SK = `FILE#${now}`;
  }

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

// List files accessible to user
async function listFiles(
  userId: string,
  userRole: UserRole,
  organizationId?: string,
  companyId?: string,
  departmentId?: string,
  category?: FileCategory
): Promise<FileRecord[]> {
  const allFiles: FileRecord[] = [];

  // 1. Get user's own files
  const userFilesResult = await ddb.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':sk': 'FILE#',
    },
    ScanIndexForward: false,
  }));
  allFiles.push(...(userFilesResult.Items || []) as FileRecord[]);

  // 2. Get system-wide files
  const systemFilesResult = await ddb.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'GSI2',
    KeyConditionExpression: 'GSI2PK = :pk AND begins_with(GSI2SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': 'VISIBILITY#system',
      ':sk': 'FILE#',
    },
    ScanIndexForward: false,
  }));
  allFiles.push(...(systemFilesResult.Items || []) as FileRecord[]);

  // 3. Get organization files (if user belongs to an organization)
  if (organizationId) {
    const orgFilesResult = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI2',
      KeyConditionExpression: 'GSI2PK = :pk AND begins_with(GSI2SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `ORG#${organizationId}`,
        ':sk': 'FILE#',
      },
      ScanIndexForward: false,
    }));
    allFiles.push(...(orgFilesResult.Items || []) as FileRecord[]);
  }

  // 4. Get company files (if user belongs to a company)
  if (companyId) {
    const companyFilesResult = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI2',
      KeyConditionExpression: 'GSI2PK = :pk AND begins_with(GSI2SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `COMPANY#${companyId}`,
        ':sk': 'FILE#',
      },
      ScanIndexForward: false,
    }));
    allFiles.push(...(companyFilesResult.Items || []) as FileRecord[]);
  }

  // Deduplicate by fileId
  const uniqueFiles = Array.from(
    new Map(allFiles.map(f => [f.fileId, f])).values()
  );

  // Filter by access permission and category
  return uniqueFiles.filter(file => {
    const hasAccess = canAccessFile(file, userId, userRole, organizationId, companyId, departmentId);
    const matchesCategory = !category || file.category === category;
    return hasAccess && matchesCategory;
  });
}

// Get single file (with access check)
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

// Update file visibility
async function updateFileVisibility(
  fileId: string,
  userId: string,
  userRole: UserRole,
  newVisibility: FileVisibility
): Promise<void> {
  const file = await getFile(fileId);
  if (!file) {
    throw new Error('File not found');
  }

  // Only owner or admin can update
  if (file.userId !== userId && userRole !== 'system_admin') {
    throw new Error('Permission denied');
  }

  // Validate new visibility
  const allowedVisibilities = getAllowedVisibilities(userRole);
  if (!allowedVisibilities.includes(newVisibility)) {
    throw new Error(`Role ${userRole} cannot set visibility to ${newVisibility}`);
  }

  const now = new Date().toISOString();

  await ddb.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: {
      PK: `FILE#${fileId}`,
      SK: 'META',
    },
    UpdateExpression: 'SET visibility = :visibility, GSI2PK = :gsi2pk, GSI2SK = :gsi2sk',
    ExpressionAttributeValues: {
      ':visibility': newVisibility,
      ':gsi2pk': newVisibility === 'system' ? 'VISIBILITY#system' :
                 newVisibility === 'organization' ? `ORG#${file.organizationId}` :
                 newVisibility === 'company' ? `COMPANY#${file.companyId}` : null,
      ':gsi2sk': `FILE#${now}`,
    },
  }));
}

// Delete file
async function deleteFile(fileId: string, userId: string, userRole: UserRole): Promise<void> {
  const file = await getFile(fileId);
  if (!file) {
    throw new Error('File not found');
  }

  // Only owner or admin can delete
  if (file.userId !== userId && userRole !== 'system_admin') {
    throw new Error('Permission denied');
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

  if (file.extractedText) {
    fileContent = file.extractedText;
  } else {
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

  return {
    answer: `ファイル「${file.fileName}」の内容を取得しました。チャットで質問してください。`,
    sourceData: fileContent.substring(0, 1000),
  };
}

// Main handler
export async function handler(event: APIGatewayEvent): Promise<APIGatewayResponse> {
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
      const params = event.queryStringParameters || {};
      const userId = params.userId || 'anonymous';
      const userRole = (params.userRole as UserRole) || 'user';
      const category = params.category as FileCategory | undefined;

      const files = await listFiles(
        userId,
        userRole,
        params.organizationId,
        params.companyId,
        params.departmentId,
        category
      );

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

    // PUT /files/{fileId} - Update visibility
    if (method === 'PUT' && path.startsWith('/files/') && !path.includes('/query')) {
      const fileId = path.split('/')[2];
      if (!event.body) {
        return createResponse(400, { error: 'Request body is required' });
      }

      const body = JSON.parse(event.body);
      await updateFileVisibility(
        fileId,
        body.userId || 'anonymous',
        body.userRole || 'user',
        body.visibility
      );

      return createResponse(200, { message: 'File updated' });
    }

    // DELETE /files/{fileId}
    if (method === 'DELETE' && path.startsWith('/files/')) {
      const fileId = path.split('/')[2];
      const params = event.queryStringParameters || {};

      await deleteFile(
        fileId,
        params.userId || 'anonymous',
        (params.userRole as UserRole) || 'user'
      );

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
