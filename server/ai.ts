import { GoogleGenAI } from '@google/genai';
import type { AIClient } from './app.ts';

type GenerateContentArgs = {
  model?: string;
  contents?: string;
  config?: {
    temperature?: number;
    responseMimeType?: string;
  };
};

type OpenRouterMessageContent =
  | string
  | Array<{
      type?: string;
      text?: string;
    }>;

function extractTextContent(content: OpenRouterMessageContent | undefined): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((item) => (item?.type === 'text' || !item?.type ? item?.text ?? '' : ''))
    .join('');
}

function getGeminiApiKey(): string {
  const key = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('GOOGLE_API_KEY or GEMINI_API_KEY environment variable is required');
  }
  return key;
}

function getOpenRouterApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) {
    throw new Error('OPENROUTER_API_KEY environment variable is required');
  }
  return key;
}

function getQwenOpenRouterModel(): string {
  const model = process.env.OPENROUTER_QWEN_MODEL?.trim();
  if (!model) {
    throw new Error('OPENROUTER_QWEN_MODEL environment variable is required');
  }
  return model;
}

export type AIProviderName = 'gemini' | 'qwen';

export interface ProviderBackedAIClient extends AIClient {
  providerName: AIProviderName;
}

let geminiClient: ProviderBackedAIClient | null = null;
let openRouterClient: ProviderBackedAIClient | null = null;

export function createGeminiAIClient(): ProviderBackedAIClient {
  if (!geminiClient) {
    const api = new GoogleGenAI({ apiKey: getGeminiApiKey() });
    geminiClient = {
      providerName: 'gemini',
      models: {
        generateContent: async (args: unknown) => api.models.generateContent(args),
      },
    };
  }
  return geminiClient;
}

export function createOpenRouterQwenClient(): ProviderBackedAIClient {
  if (!openRouterClient) {
    const apiKey = getOpenRouterApiKey();
    const baseUrl = process.env.OPENROUTER_BASE_URL?.trim() || 'https://openrouter.ai/api/v1';
    const model = getQwenOpenRouterModel();
    const referer = process.env.OPENROUTER_HTTP_REFERER?.trim();
    const appTitle = process.env.OPENROUTER_APP_TITLE?.trim();

    openRouterClient = {
      providerName: 'qwen',
      models: {
        generateContent: async (args: unknown) => {
          const input = (args ?? {}) as GenerateContentArgs;
          const prompt = typeof input.contents === 'string' ? input.contents : '';
          const temperature = typeof input.config?.temperature === 'number' ? input.config.temperature : 0;

          const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              ...(referer ? { 'HTTP-Referer': referer } : {}),
              ...(appTitle ? { 'X-Title': appTitle } : {}),
            },
            body: JSON.stringify({
              model: input.model || model,
              temperature,
              response_format: input.config?.responseMimeType === 'application/json' ? { type: 'json_object' } : undefined,
              messages: [
                {
                  role: 'user',
                  content: prompt,
                },
              ],
            }),
          });

          const payload = await response.json().catch(() => null) as
            | {
                error?: { message?: string };
                choices?: Array<{ message?: { content?: OpenRouterMessageContent } }>;
              }
            | null;

          if (!response.ok) {
            const error = new Error(payload?.error?.message || `OpenRouter request failed with status ${response.status}`);
            (error as Error & { status?: number }).status = response.status;
            throw error;
          }

          return {
            text: extractTextContent(payload?.choices?.[0]?.message?.content),
          };
        },
      },
    };
  }
  return openRouterClient;
}
