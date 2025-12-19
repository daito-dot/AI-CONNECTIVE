import type { APIGatewayEvent, APIGatewayResponse, ChatRequest } from '../types/index.js';
import { getModelInfo, getAllModels } from '../config/models.js';
import { invokeBedrock } from '../services/bedrock.js';
import { invokeGemini } from '../services/gemini.js';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

function createResponse(statusCode: number, body: object): APIGatewayResponse {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
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

    const request: ChatRequest = JSON.parse(event.body);

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

    // Route to appropriate provider
    let response;
    if (modelInfo.provider === 'bedrock') {
      response = await invokeBedrock(request);
    } else if (modelInfo.provider === 'gemini') {
      response = await invokeGemini(request);
    } else {
      return createResponse(400, { error: `Unsupported provider: ${modelInfo.provider}` });
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
