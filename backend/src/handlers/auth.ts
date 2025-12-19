import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  InitiateAuthCommand,
  AdminCreateUserCommand,
  AdminUpdateUserAttributesCommand,
  AdminGetUserCommand,
  ListUsersCommand,
  ConfirmSignUpCommand,
  AdminConfirmSignUpCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import type { APIGatewayEvent, APIGatewayResponse } from '../types/index.js';

const cognitoClient = new CognitoIdentityProviderClient({});
const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);

const USER_POOL_ID = process.env.USER_POOL_ID || '';
const CLIENT_ID = process.env.USER_POOL_CLIENT_ID || '';
const TABLE_NAME = process.env.MAIN_TABLE || '';

// User roles
type UserRole = 'system_admin' | 'org_admin' | 'company_admin' | 'user';

interface UserRecord {
  PK: string;
  SK: string;
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  organizationId?: string;
  companyId?: string;
  departmentId?: string;
  createdAt: string;
  updatedAt: string;
  GSI1PK?: string;
  GSI1SK?: string;
}

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

// Sign up new user
async function signUp(body: {
  email: string;
  password: string;
  name: string;
}): Promise<APIGatewayResponse> {
  const { email, password, name } = body;

  if (!email || !password || !name) {
    return createResponse(400, { error: 'email, password, and name are required' });
  }

  try {
    // Sign up in Cognito (custom attributes cannot be set during client signup)
    const signUpResult = await cognitoClient.send(new SignUpCommand({
      ClientId: CLIENT_ID,
      Username: email,
      Password: password,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'name', Value: name },
      ],
    }));

    const userId = signUpResult.UserSub || uuidv4();
    const now = new Date().toISOString();

    // Create user record in DynamoDB
    const userRecord: UserRecord = {
      PK: `USER#${userId}`,
      SK: 'META',
      userId,
      email,
      name,
      role: 'user',
      createdAt: now,
      updatedAt: now,
      GSI1PK: 'USERS',
      GSI1SK: `USER#${now}`,
    };

    await ddb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: userRecord,
    }));

    return createResponse(200, {
      message: 'User created successfully. Please check your email for verification.',
      userId,
      userConfirmed: signUpResult.UserConfirmed,
    });
  } catch (error) {
    console.error('Sign up error:', error);
    const message = error instanceof Error ? error.message : 'Sign up failed';
    return createResponse(400, { error: message });
  }
}

// Confirm sign up with verification code
async function confirmSignUp(body: {
  email: string;
  code: string;
}): Promise<APIGatewayResponse> {
  const { email, code } = body;

  if (!email || !code) {
    return createResponse(400, { error: 'email and code are required' });
  }

  try {
    await cognitoClient.send(new ConfirmSignUpCommand({
      ClientId: CLIENT_ID,
      Username: email,
      ConfirmationCode: code,
    }));

    return createResponse(200, {
      message: 'Email verified successfully. You can now sign in.',
    });
  } catch (error) {
    console.error('Confirm sign up error:', error);
    const message = error instanceof Error ? error.message : 'Verification failed';
    return createResponse(400, { error: message });
  }
}

// Sign in
async function signIn(body: {
  email: string;
  password: string;
}): Promise<APIGatewayResponse> {
  const { email, password } = body;

  if (!email || !password) {
    return createResponse(400, { error: 'email and password are required' });
  }

  try {
    const authResult = await cognitoClient.send(new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: CLIENT_ID,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    }));

    if (!authResult.AuthenticationResult) {
      return createResponse(401, { error: 'Authentication failed' });
    }

    // Get user info from DynamoDB using email
    const usersResult = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      FilterExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':pk': 'USERS',
        ':email': email,
      },
      Limit: 1,
    }));

    const user = usersResult.Items?.[0] as UserRecord | undefined;

    return createResponse(200, {
      accessToken: authResult.AuthenticationResult.AccessToken,
      idToken: authResult.AuthenticationResult.IdToken,
      refreshToken: authResult.AuthenticationResult.RefreshToken,
      expiresIn: authResult.AuthenticationResult.ExpiresIn,
      user: user ? {
        userId: user.userId,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId: user.organizationId,
        companyId: user.companyId,
        departmentId: user.departmentId,
      } : null,
    });
  } catch (error) {
    console.error('Sign in error:', error);
    const message = error instanceof Error ? error.message : 'Sign in failed';
    return createResponse(401, { error: message });
  }
}

// Get user profile
async function getProfile(userId: string): Promise<APIGatewayResponse> {
  try {
    const result = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: 'META',
      },
    }));

    if (!result.Item) {
      return createResponse(404, { error: 'User not found' });
    }

    const user = result.Item as UserRecord;
    return createResponse(200, {
      userId: user.userId,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
      companyId: user.companyId,
      departmentId: user.departmentId,
      createdAt: user.createdAt,
    });
  } catch (error) {
    console.error('Get profile error:', error);
    return createResponse(500, { error: 'Failed to get profile' });
  }
}

// Update user profile
async function updateProfile(userId: string, body: {
  name?: string;
}): Promise<APIGatewayResponse> {
  const { name } = body;
  const now = new Date().toISOString();

  try {
    const updateExpressions: string[] = ['updatedAt = :now'];
    const expressionValues: Record<string, string> = { ':now': now };

    if (name) {
      updateExpressions.push('name = :name');
      expressionValues[':name'] = name;
    }

    await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: 'META',
      },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeValues: expressionValues,
    }));

    return createResponse(200, { message: 'Profile updated' });
  } catch (error) {
    console.error('Update profile error:', error);
    return createResponse(500, { error: 'Failed to update profile' });
  }
}

// Admin: List users (with role-based filtering)
async function listUsers(requestingUser: UserRecord, query: {
  organizationId?: string;
  companyId?: string;
}): Promise<APIGatewayResponse> {
  try {
    let filterExpression = '';
    const expressionValues: Record<string, string> = { ':pk': 'USERS' };

    // Role-based access control
    if (requestingUser.role === 'system_admin') {
      // Can see all users
      if (query.organizationId) {
        filterExpression = 'organizationId = :orgId';
        expressionValues[':orgId'] = query.organizationId;
      }
    } else if (requestingUser.role === 'org_admin') {
      // Can only see users in their organization
      filterExpression = 'organizationId = :orgId';
      expressionValues[':orgId'] = requestingUser.organizationId || '';
    } else if (requestingUser.role === 'company_admin') {
      // Can only see users in their company
      filterExpression = 'companyId = :companyId';
      expressionValues[':companyId'] = requestingUser.companyId || '';
    } else {
      return createResponse(403, { error: 'Permission denied' });
    }

    const result = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      FilterExpression: filterExpression || undefined,
      ExpressionAttributeValues: expressionValues,
      ScanIndexForward: false,
    }));

    const users = (result.Items || []).map((item) => {
      const user = item as UserRecord;
      return {
        userId: user.userId,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId: user.organizationId,
        companyId: user.companyId,
        departmentId: user.departmentId,
        createdAt: user.createdAt,
      };
    });

    return createResponse(200, { users });
  } catch (error) {
    console.error('List users error:', error);
    return createResponse(500, { error: 'Failed to list users' });
  }
}

// Admin: Create user
async function createUser(requestingUser: UserRecord, body: {
  email: string;
  name: string;
  role: UserRole;
  organizationId?: string;
  companyId?: string;
  departmentId?: string;
  temporaryPassword?: string;
}): Promise<APIGatewayResponse> {
  const { email, name, role, organizationId, companyId, departmentId, temporaryPassword } = body;

  // Permission check
  const allowedRoles: Record<UserRole, UserRole[]> = {
    system_admin: ['system_admin', 'org_admin', 'company_admin', 'user'],
    org_admin: ['company_admin', 'user'],
    company_admin: ['user'],
    user: [],
  };

  if (!allowedRoles[requestingUser.role].includes(role)) {
    return createResponse(403, { error: 'Cannot create user with this role' });
  }

  // Org admin can only create users in their organization
  if (requestingUser.role === 'org_admin' && organizationId !== requestingUser.organizationId) {
    return createResponse(403, { error: 'Cannot create user in different organization' });
  }

  // Company admin can only create users in their company
  if (requestingUser.role === 'company_admin' && companyId !== requestingUser.companyId) {
    return createResponse(403, { error: 'Cannot create user in different company' });
  }

  try {
    // Create user in Cognito
    const password = temporaryPassword || `Temp${uuidv4().substring(0, 8)}!`;

    const cognitoResult = await cognitoClient.send(new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      TemporaryPassword: password,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'email_verified', Value: 'true' },
        { Name: 'name', Value: name },
        { Name: 'custom:role', Value: role },
        { Name: 'custom:orgId', Value: organizationId || '' },
        { Name: 'custom:compId', Value: companyId || '' },
        { Name: 'custom:deptId', Value: departmentId || '' },
      ],
      MessageAction: 'SUPPRESS', // Don't send welcome email
    }));

    const userId = cognitoResult.User?.Username || uuidv4();
    const now = new Date().toISOString();

    // Create user record in DynamoDB
    const userRecord: UserRecord = {
      PK: `USER#${userId}`,
      SK: 'META',
      userId,
      email,
      name,
      role,
      organizationId,
      companyId,
      departmentId,
      createdAt: now,
      updatedAt: now,
      GSI1PK: 'USERS',
      GSI1SK: `USER#${now}`,
    };

    await ddb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: userRecord,
    }));

    return createResponse(200, {
      message: 'User created successfully',
      userId,
      temporaryPassword: password,
    });
  } catch (error) {
    console.error('Create user error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create user';
    return createResponse(400, { error: message });
  }
}

// Extract user from Authorization header (simplified - in production use proper JWT validation)
async function getUserFromToken(authHeader: string | undefined): Promise<UserRecord | null> {
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  // For now, we'll use the userId passed in header for simplicity
  // In production, validate JWT and extract claims
  const userId = authHeader.replace('Bearer ', '');

  try {
    const result = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: 'META',
      },
    }));

    return (result.Item as UserRecord) || null;
  } catch {
    return null;
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
    // Public routes (no auth required)
    if (method === 'POST' && path === '/auth/signup') {
      const body = JSON.parse(event.body || '{}');
      return signUp(body);
    }

    if (method === 'POST' && path === '/auth/signin') {
      const body = JSON.parse(event.body || '{}');
      return signIn(body);
    }

    if (method === 'POST' && path === '/auth/confirm') {
      const body = JSON.parse(event.body || '{}');
      return confirmSignUp(body);
    }

    // Protected routes (auth required)
    const authHeader = event.headers?.Authorization || event.headers?.authorization;

    // For profile routes, use userId from query or path
    if (path === '/auth/profile') {
      const userId = event.queryStringParameters?.userId;
      if (!userId) {
        return createResponse(400, { error: 'userId is required' });
      }

      if (method === 'GET') {
        return getProfile(userId);
      }

      if (method === 'PUT') {
        const body = JSON.parse(event.body || '{}');
        return updateProfile(userId, body);
      }
    }

    // Admin routes
    if (path.startsWith('/admin/')) {
      const user = await getUserFromToken(authHeader);
      if (!user) {
        return createResponse(401, { error: 'Authentication required' });
      }

      if (path === '/admin/users') {
        if (method === 'GET') {
          const query = event.queryStringParameters || {};
          return listUsers(user, query);
        }

        if (method === 'POST') {
          const body = JSON.parse(event.body || '{}');
          return createUser(user, body);
        }
      }
    }

    return createResponse(404, { error: 'Not found' });
  } catch (error) {
    console.error('Auth handler error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return createResponse(500, { error: message });
  }
}
