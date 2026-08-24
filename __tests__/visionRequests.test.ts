import { anthropicCompletion } from '@/lib/anthropic';
import { geminiCompletion } from '@/lib/gemini';
import type { LlmContentPart } from '@/lib/llm';
import { chatCompletion } from '@/lib/openai';

const PIXEL = 'iVBORw0KGgo=';

/** One labelled image followed by the question, the way a scan is built. */
const SCAN_TURN: LlmContentPart[] = [
  { type: 'text', text: 'Image 1:' },
  { type: 'image', mediaType: 'image/jpeg', base64: PIXEL },
  { type: 'text', text: 'Extract the recipe.' },
];

function mockJson(payload: unknown): jest.Mock {
  const fetchMock = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => payload,
    text: async () => '',
  }));
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function sentBody(fetchMock: jest.Mock): Record<string, any> {
  return JSON.parse(fetchMock.mock.calls[0][1].body);
}

const claudeReply = () => mockJson({ content: [{ type: 'text', text: 'ok' }] });
const openAiReply = () => mockJson({ choices: [{ message: { content: 'ok' } }] });
const geminiReply = () =>
  mockJson({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] });

afterEach(() => {
  jest.restoreAllMocks();
});

describe('string content keeps the original wire format', () => {
  it('Claude still sends a bare string', async () => {
    const fetchMock = claudeReply();
    await anthropicCompletion('key', [{ role: 'user', content: 'Hello' }]);
    expect(sentBody(fetchMock).messages).toEqual([
      { role: 'user', content: 'Hello' },
    ]);
  });

  it('OpenAI still sends a bare string', async () => {
    const fetchMock = openAiReply();
    await chatCompletion('key', [
      { role: 'system', content: 'Be terse.' },
      { role: 'user', content: 'Hello' },
    ]);
    expect(sentBody(fetchMock).messages).toEqual([
      { role: 'system', content: 'Be terse.' },
      { role: 'user', content: 'Hello' },
    ]);
  });

  it('Gemini still sends a single text part', async () => {
    const fetchMock = geminiReply();
    await geminiCompletion('key', [{ role: 'user', content: 'Hello' }]);
    expect(sentBody(fetchMock).contents).toEqual([
      { role: 'user', parts: [{ text: 'Hello' }] },
    ]);
  });
});

describe('image content becomes provider-native blocks', () => {
  it('Claude sends base64 image blocks in the caller order', async () => {
    const fetchMock = claudeReply();
    await anthropicCompletion('key', [{ role: 'user', content: SCAN_TURN }]);

    expect(sentBody(fetchMock).messages[0].content).toEqual([
      { type: 'text', text: 'Image 1:' },
      {
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: PIXEL },
      },
      { type: 'text', text: 'Extract the recipe.' },
    ]);
  });

  it('OpenAI sends a data URL', async () => {
    const fetchMock = openAiReply();
    await chatCompletion('key', [{ role: 'user', content: SCAN_TURN }]);

    expect(sentBody(fetchMock).messages[0].content[1]).toEqual({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${PIXEL}` },
    });
  });

  it('Gemini sends inlineData', async () => {
    const fetchMock = geminiReply();
    await geminiCompletion('key', [{ role: 'user', content: SCAN_TURN }]);

    expect(sentBody(fetchMock).contents[0].parts[1]).toEqual({
      inlineData: { mimeType: 'image/jpeg', data: PIXEL },
    });
  });

  it('keeps every label attached to the image it names', async () => {
    const fetchMock = claudeReply();
    await anthropicCompletion('key', [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Image 1:' },
          { type: 'image', mediaType: 'image/jpeg', base64: 'one' },
          { type: 'text', text: 'Image 2:' },
          { type: 'image', mediaType: 'image/jpeg', base64: 'two' },
        ],
      },
    ]);

    const blocks = sentBody(fetchMock).messages[0].content;
    expect(blocks.map((b: any) => b.type)).toEqual([
      'text',
      'image',
      'text',
      'image',
    ]);
    expect(blocks[1].source.data).toBe('one');
    expect(blocks[3].source.data).toBe('two');
  });
});

describe('system turns stay text-only', () => {
  it('Claude refuses an image in a system message rather than dropping it', async () => {
    claudeReply();
    await expect(
      anthropicCompletion('key', [
        {
          role: 'system',
          content: [{ type: 'image', mediaType: 'image/jpeg', base64: PIXEL }],
        },
        { role: 'user', content: 'Hello' },
      ])
    ).rejects.toThrow('Claude cannot take an image in a system message');
  });

  it('Gemini flattens a system turn to text', async () => {
    const fetchMock = geminiReply();
    await geminiCompletion('key', [
      { role: 'system', content: [{ type: 'text', text: 'Be terse.' }] },
      { role: 'user', content: 'Hello' },
    ]);
    expect(sentBody(fetchMock).systemInstruction).toEqual({
      parts: [{ text: 'Be terse.' }],
    });
  });
});

describe('timeout', () => {
  it('passes a caller timeout through to fetchWithTimeout', async () => {
    jest.useFakeTimers();
    const fetchMock = jest.fn(
      () =>
        new Promise((_resolve, reject) => {
          // Never settles on its own; only the abort deadline ends it.
          setTimeout(() => reject(Object.assign(new Error('abort'), { name: 'AbortError' })), 90_000);
        })
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const pending = anthropicCompletion(
      'key',
      [{ role: 'user', content: 'Hello' }],
      { timeoutMs: 90_000 }
    ).catch((e: Error) => e.message);

    jest.advanceTimersByTime(90_000);
    await expect(pending).resolves.toContain('Timed out after 90s');
    jest.useRealTimers();
  });
});
