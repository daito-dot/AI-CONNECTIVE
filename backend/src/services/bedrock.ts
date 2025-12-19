import {
  BedrockRuntimeClient,
  ConverseCommand,
  type Message,
  type ContentBlock,
  type ImageBlock,
  type SystemContentBlock,
} from '@aws-sdk/client-bedrock-runtime';
import type { ChatMessage, ChatRequest, ChatResponse, BedrockModel } from '../types/index.js';

const client = new BedrockRuntimeClient({
  region: 'us-east-1', // Required for cross-region inference (us. prefix models)
});

function convertToBedrockMessages(messages: ChatMessage[]): Message[] {
  return messages.map((msg) => {
    const content: ContentBlock[] = [];

    // Add text content
    if (msg.content) {
      content.push({ text: msg.content });
    }

    // Add image attachments if present
    if (msg.attachments) {
      for (const attachment of msg.attachments) {
        if (attachment.type.startsWith('image/')) {
          const imageBlock: ImageBlock = {
            format: attachment.type.split('/')[1] as 'png' | 'jpeg' | 'gif' | 'webp',
            source: {
              bytes: Buffer.from(attachment.data, 'base64'),
            },
          };
          content.push({ image: imageBlock });
        }
      }
    }

    return {
      role: msg.role as 'user' | 'assistant',
      content,
    };
  });
}

export async function invokeBedrock(request: ChatRequest): Promise<ChatResponse> {
  const modelId = request.model as BedrockModel;

  // Build system content if provided
  const system: SystemContentBlock[] | undefined = request.systemPrompt
    ? [{ text: request.systemPrompt }]
    : undefined;

  const command = new ConverseCommand({
    modelId,
    messages: convertToBedrockMessages(request.messages),
    system,
    inferenceConfig: {
      maxTokens: request.maxTokens || 4096,
      temperature: request.temperature || 0.7,
    },
  });

  const response = await client.send(command);

  // Extract text content from response
  let content = '';
  if (response.output?.message?.content) {
    for (const block of response.output.message.content) {
      if ('text' in block && block.text) {
        content += block.text;
      }
    }
  }

  return {
    content,
    model: request.model,
    provider: 'bedrock',
    usage: response.usage
      ? {
          inputTokens: response.usage.inputTokens || 0,
          outputTokens: response.usage.outputTokens || 0,
        }
      : undefined,
  };
}
