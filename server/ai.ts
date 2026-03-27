import { GoogleGenAI } from '@google/genai';
import type { GenerateContentParameters } from '@google/genai';
import type { AIClient } from './app.ts';

type GenerateContentArgs = {
  model?: string;
  contents?:
    | string
    | Array<{
        role?: string;
        parts?: Array<{
          text?: string;
        }>;
      }>;
  config?: {
    temperature?: number;
    responseMimeType?: string;
    maxOutputTokens?: number;
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

function extractPromptText(contents: GenerateContentArgs['contents']): string {
  if (typeof contents === 'string') return contents;
  if (!Array.isArray(contents)) return '';
  return contents
    .flatMap((item) => item?.parts ?? [])
    .map((part) => part?.text ?? '')
    .join('\n');
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

function getPerplexityOpenRouterModel(): string {
  return process.env.OPENROUTER_PERPLEXITY_SEARCH_MODEL?.trim() || 'perplexity/sonar';
}

export type AIProviderName = 'gemini' | 'qwen' | 'perplexity';

export interface ProviderBackedAIClient extends AIClient {
  providerName: AIProviderName;
}

let geminiClient: ProviderBackedAIClient | null = null;
let openRouterQwenClient: ProviderBackedAIClient | null = null;
let openRouterPerplexityClient: ProviderBackedAIClient | null = null;

export function createGeminiAIClient(): ProviderBackedAIClient {
  if (!geminiClient) {
    const api = new GoogleGenAI({ apiKey: getGeminiApiKey() });
    geminiClient = {
      providerName: 'gemini',
      models: {
        generateContent: async (args: unknown) =>
          api.models.generateContent(args as GenerateContentParameters),
      },
    };
  }
  return geminiClient;
}

function createOpenRouterClient(params: {
  providerName: Extract<AIProviderName, 'qwen' | 'perplexity'>;
  model: string;
}): ProviderBackedAIClient {
  const apiKey = getOpenRouterApiKey();
  const baseUrl = process.env.OPENROUTER_BASE_URL?.trim() || 'https://openrouter.ai/api/v1';
  const referer = process.env.OPENROUTER_HTTP_REFERER?.trim();
  const appTitle = process.env.OPENROUTER_APP_TITLE?.trim();

  return {
    providerName: params.providerName,
    models: {
      generateContent: async (args: unknown) => {
        const input = (args ?? {}) as GenerateContentArgs;
        const prompt = extractPromptText(input.contents);
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
            model: input.model || params.model,
            temperature,
            max_tokens: input.config?.maxOutputTokens,
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

export function createOpenRouterQwenClient(): ProviderBackedAIClient {
  if (!openRouterQwenClient) {
    openRouterQwenClient = createOpenRouterClient({
      providerName: 'qwen',
      model: getQwenOpenRouterModel(),
    });
  }
  return openRouterQwenClient;
}

export function createOpenRouterPerplexityClient(): ProviderBackedAIClient {
  if (!openRouterPerplexityClient) {
    openRouterPerplexityClient = createOpenRouterClient({
      providerName: 'perplexity',
      model: getPerplexityOpenRouterModel(),
    });
  }
  return openRouterPerplexityClient;
}
