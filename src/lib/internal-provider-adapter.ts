import type { EngineChatMessage, EngineModelChoice } from './engine-runtime-types.js';
import type { InternalProviderConfig } from './engine-config.js';

export type InternalChatProviderId = 'openai' | 'anthropic' | 'gemini';

export type InternalProviderModelDefinition = {
  value: string;
  label: string;
  providerId: InternalChatProviderId;
  modelId: string;
};

export type InternalProviderStatus = {
  providerId: InternalChatProviderId;
  label: string;
  configured: boolean;
  modelCount: number;
  baseUrl?: string;
  reason?: string;
};

export type InternalProviderCatalog = {
  models: InternalProviderModelDefinition[];
  statuses: InternalProviderStatus[];
};

export type InternalProviderChatResult = {
  providerId: InternalChatProviderId;
  model: string;
  text: string;
};

type OpenAIMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

const OPENAI_DEFAULT_MODELS = ['gpt-4.1-mini', 'gpt-4.1'];
const ANTHROPIC_DEFAULT_MODELS = ['claude-3-7-sonnet-latest'];
const GEMINI_DEFAULT_MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro'];
const env =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
  ?? {};

function resolveConfigValue(savedValue: string | undefined, envValue: string | undefined): string {
  return savedValue?.trim() || envValue?.trim() || '';
}

function parseModelList(value: string | undefined, fallback: string[]): string[] {
  if (!value || !value.trim()) {
    return fallback;
  }
  const parsed = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : fallback;
}

function normalizeBaseUrl(value: string | undefined, fallback: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    return fallback;
  }
  return normalized.replace(/\/+$/, '');
}

function buildModelDefinitions(
  providerId: InternalChatProviderId,
  providerLabel: string,
  configured: boolean,
  modelIds: string[],
): InternalProviderModelDefinition[] {
  if (!configured) {
    return [];
  }
  return modelIds.map((modelId) => ({
    value: `${providerId}/${modelId}`,
    label: `${providerLabel} · ${modelId}`,
    providerId,
    modelId,
  }));
}

function readOpenAIConfig(savedConfig?: InternalProviderConfig) {
  const apiKey = resolveConfigValue(savedConfig?.openaiApiKey, env.CLOFFICE_INTERNAL_OPENAI_API_KEY || env.OPENAI_API_KEY);
  const baseUrl = normalizeBaseUrl(
    resolveConfigValue(savedConfig?.openaiBaseUrl, env.CLOFFICE_INTERNAL_OPENAI_BASE_URL || env.OPENAI_BASE_URL),
    'https://api.openai.com/v1',
  );
  const modelIds = parseModelList(env.CLOFFICE_INTERNAL_OPENAI_MODELS, OPENAI_DEFAULT_MODELS);
  return {
    providerId: 'openai' as const,
    label: 'OpenAI-compatible',
    configured: apiKey.length > 0,
    apiKey,
    baseUrl,
    modelIds,
  };
}

function readAnthropicConfig(savedConfig?: InternalProviderConfig) {
  const apiKey = resolveConfigValue(savedConfig?.anthropicApiKey, env.CLOFFICE_INTERNAL_ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY);
  const modelIds = parseModelList(env.CLOFFICE_INTERNAL_ANTHROPIC_MODELS, ANTHROPIC_DEFAULT_MODELS);
  return {
    providerId: 'anthropic' as const,
    label: 'Anthropic',
    configured: apiKey.length > 0,
    apiKey,
    baseUrl: 'https://api.anthropic.com/v1',
    modelIds,
  };
}

function readGeminiConfig(savedConfig?: InternalProviderConfig) {
  const apiKey =
    resolveConfigValue(savedConfig?.geminiApiKey, env.CLOFFICE_INTERNAL_GEMINI_API_KEY || env.GEMINI_API_KEY || env.GOOGLE_API_KEY);
  const modelIds = parseModelList(env.CLOFFICE_INTERNAL_GEMINI_MODELS, GEMINI_DEFAULT_MODELS);
  return {
    providerId: 'gemini' as const,
    label: 'Gemini',
    configured: apiKey.length > 0,
    apiKey,
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    modelIds,
  };
}

export function buildInternalProviderCatalog(savedConfig?: InternalProviderConfig): InternalProviderCatalog {
  const openai = readOpenAIConfig(savedConfig);
  const anthropic = readAnthropicConfig(savedConfig);
  const gemini = readGeminiConfig(savedConfig);

  return {
    models: [
      ...buildModelDefinitions(openai.providerId, openai.label, openai.configured, openai.modelIds),
      ...buildModelDefinitions(anthropic.providerId, anthropic.label, anthropic.configured, anthropic.modelIds),
      ...buildModelDefinitions(gemini.providerId, gemini.label, gemini.configured, gemini.modelIds),
    ],
    statuses: [
      {
        providerId: openai.providerId,
        label: openai.label,
        configured: openai.configured,
        modelCount: openai.configured ? openai.modelIds.length : 0,
        baseUrl: openai.baseUrl,
        ...(openai.configured ? {} : { reason: 'Set OPENAI_API_KEY or CLOFFICE_INTERNAL_OPENAI_API_KEY.' }),
      },
      {
        providerId: anthropic.providerId,
        label: anthropic.label,
        configured: anthropic.configured,
        modelCount: anthropic.configured ? anthropic.modelIds.length : 0,
        ...(anthropic.configured ? {} : { reason: 'Set ANTHROPIC_API_KEY or CLOFFICE_INTERNAL_ANTHROPIC_API_KEY.' }),
      },
      {
        providerId: gemini.providerId,
        label: gemini.label,
        configured: gemini.configured,
        modelCount: gemini.configured ? gemini.modelIds.length : 0,
        ...(gemini.configured ? {} : { reason: 'Set GEMINI_API_KEY, GOOGLE_API_KEY, or CLOFFICE_INTERNAL_GEMINI_API_KEY.' }),
      },
    ],
  };
}

export function buildInternalProviderModelChoices(savedConfig?: InternalProviderConfig): EngineModelChoice[] {
  return buildInternalProviderCatalog(savedConfig).models.map((model) => ({
    value: model.value,
    label: model.label,
  }));
}

export function isProviderBackedInternalModel(modelValue: string | null | undefined): boolean {
  return typeof modelValue === 'string' && /^(openai|anthropic|gemini)\//.test(modelValue);
}

function splitProviderModel(modelValue: string): { providerId: InternalChatProviderId; modelId: string } {
  const [providerPrefix, ...rest] = modelValue.split('/');
  const modelId = rest.join('/').trim();
  if (!modelId) {
    throw new Error(`Invalid provider-backed internal model: ${modelValue}`);
  }
  if (providerPrefix === 'openai' || providerPrefix === 'anthropic' || providerPrefix === 'gemini') {
    return {
      providerId: providerPrefix,
      modelId,
    };
  }
  throw new Error(`Unsupported internal provider model: ${modelValue}`);
}

function toOpenAIMessages(messages: EngineChatMessage[]): OpenAIMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.text,
  }));
}

function extractOpenAIText(payload: unknown): string {
  const text =
    (payload as {
      choices?: Array<{
        message?: {
          content?: string | Array<{ type?: string; text?: string }>;
        };
      }>;
    })?.choices?.[0]?.message?.content;

  if (typeof text === 'string') {
    return text.trim();
  }
  if (Array.isArray(text)) {
    return text
      .flatMap((item) => (item && typeof item.text === 'string' ? [item.text] : []))
      .join('\n')
      .trim();
  }
  return '';
}

function extractAnthropicText(payload: unknown): string {
  const content = (payload as {
    content?: Array<{ type?: string; text?: string }>;
  })?.content;

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .flatMap((item) => (item?.type === 'text' && typeof item.text === 'string' ? [item.text] : []))
    .join('\n')
    .trim();
}

function extractGeminiText(payload: unknown): string {
  const parts = (payload as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  })?.candidates?.[0]?.content?.parts;

  if (!Array.isArray(parts)) {
    return '';
  }

  return parts
    .flatMap((part) => (typeof part?.text === 'string' ? [part.text] : []))
    .join('\n')
    .trim();
}

async function parseJsonOrText(response: Response): Promise<unknown> {
  const raw = await response.text();
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function formatProviderError(providerLabel: string, status: number, payload: unknown): string {
  if (typeof payload === 'string' && payload.trim()) {
    return `${providerLabel} request failed (${status}): ${payload.trim()}`;
  }
  const message =
    (payload as { error?: { message?: string } })?.error?.message
    || (payload as { message?: string })?.message;
  if (typeof message === 'string' && message.trim()) {
    return `${providerLabel} request failed (${status}): ${message.trim()}`;
  }
  return `${providerLabel} request failed (${status}).`;
}

async function requestOpenAIChat(modelId: string, messages: EngineChatMessage[], savedConfig?: InternalProviderConfig): Promise<string> {
  const config = readOpenAIConfig(savedConfig);
  if (!config.configured) {
    throw new Error('OpenAI-compatible chat is not configured. Set OPENAI_API_KEY or CLOFFICE_INTERNAL_OPENAI_API_KEY.');
  }

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: toOpenAIMessages(messages),
    }),
  });

  const payload = await parseJsonOrText(response);
  if (!response.ok) {
    throw new Error(formatProviderError(config.label, response.status, payload));
  }

  const text = extractOpenAIText(payload);
  if (!text) {
    throw new Error('OpenAI-compatible response did not contain assistant text.');
  }
  return text;
}

async function requestAnthropicChat(modelId: string, messages: EngineChatMessage[], savedConfig?: InternalProviderConfig): Promise<string> {
  const config = readAnthropicConfig(savedConfig);
  if (!config.configured) {
    throw new Error('Anthropic chat is not configured. Set ANTHROPIC_API_KEY or CLOFFICE_INTERNAL_ANTHROPIC_API_KEY.');
  }

  const system = messages.filter((message) => message.role === 'system').map((message) => message.text).join('\n\n').trim();
  const conversation = messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      role: message.role,
      content: message.text,
    }));

  const response = await fetch(`${config.baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 1024,
      ...(system ? { system } : {}),
      messages: conversation,
    }),
  });

  const payload = await parseJsonOrText(response);
  if (!response.ok) {
    throw new Error(formatProviderError(config.label, response.status, payload));
  }

  const text = extractAnthropicText(payload);
  if (!text) {
    throw new Error('Anthropic response did not contain assistant text.');
  }
  return text;
}

async function requestGeminiChat(modelId: string, messages: EngineChatMessage[], savedConfig?: InternalProviderConfig): Promise<string> {
  const config = readGeminiConfig(savedConfig);
  if (!config.configured) {
    throw new Error('Gemini chat is not configured. Set GEMINI_API_KEY, GOOGLE_API_KEY, or CLOFFICE_INTERNAL_GEMINI_API_KEY.');
  }

  const system = messages.filter((message) => message.role === 'system').map((message) => message.text).join('\n\n').trim();
  const conversation = messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.text }],
    }));

  const response = await fetch(
    `${config.baseUrl}/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(config.apiKey)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: conversation,
      }),
    },
  );

  const payload = await parseJsonOrText(response);
  if (!response.ok) {
    throw new Error(formatProviderError(config.label, response.status, payload));
  }

  const text = extractGeminiText(payload);
  if (!text) {
    throw new Error('Gemini response did not contain assistant text.');
  }
  return text;
}

export async function sendInternalProviderChat(
  modelValue: string,
  messages: EngineChatMessage[],
  savedConfig?: InternalProviderConfig,
): Promise<InternalProviderChatResult> {
  const { providerId, modelId } = splitProviderModel(modelValue);
  const text =
    providerId === 'openai'
      ? await requestOpenAIChat(modelId, messages, savedConfig)
      : providerId === 'anthropic'
        ? await requestAnthropicChat(modelId, messages, savedConfig)
        : await requestGeminiChat(modelId, messages, savedConfig);

  return {
    providerId,
    model: modelValue,
    text,
  };
}
