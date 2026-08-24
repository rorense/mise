import { anthropicCompletion } from '@/lib/anthropic';
import { geminiCompletion } from '@/lib/gemini';
import { chatCompletion } from '@/lib/openai';
import type { AiProvider } from '@/lib/secrets';

/** Media types every provider below accepts for inline image data. */
export type LlmImageMediaType = 'image/jpeg' | 'image/png';

/**
 * A single piece of a multimodal turn. Providers each name these differently on
 * the wire; this is the shape callers work in, and each client translates.
 */
export type LlmContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mediaType: LlmImageMediaType; base64: string };

/**
 * `content` stays a plain string for the text-only callers. Passing an array
 * opts into a multimodal turn — every client keeps its original request body
 * for the string form, so widening this changed no existing wire format.
 */
export type LlmMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | LlmContentPart[];
};

/**
 * How much reasoning to spend on a call. Only Claude acts on this today; the
 * other clients accept and ignore it, the same way Claude accepts and ignores
 * `temperature`.
 */
export type LlmEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export type LlmOptions = {
  model?: string;
  temperature?: number;
  /** Defaults to LLM_TIMEOUT_MS in each client; raise it for image payloads. */
  timeoutMs?: number;
  effort?: LlmEffort;
};

/** Flattens a message's content down to text, dropping any image parts. */
export function contentToText(content: string | LlmContentPart[]): string {
  if (typeof content === 'string') return content;
  return content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
}

export function contentHasImage(content: string | LlmContentPart[]): boolean {
  return typeof content !== 'string' && content.some((part) => part.type === 'image');
}

export async function llmCompletion(
  provider: AiProvider,
  apiKey: string,
  messages: LlmMessage[],
  options?: LlmOptions
): Promise<string> {
  switch (provider) {
    case 'gemini':
      return geminiCompletion(apiKey, messages, options);
    case 'anthropic':
      return anthropicCompletion(apiKey, messages, options);
    case 'openai':
      return chatCompletion(apiKey, messages, options);
  }
}
