import { anthropicCompletion } from '@/lib/anthropic';

type Body = {
  model: string;
  system?: string;
  temperature?: number;
  messages: { role: string; content: string }[];
};

function mockReply(
  content: unknown[],
  extra: Record<string, unknown> = {}
): jest.Mock {
  const fetchMock = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ content, ...extra }),
    text: async () => '',
  }));
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function sentBody(fetchMock: jest.Mock): Body {
  return JSON.parse(fetchMock.mock.calls[0][1].body);
}

describe('anthropicCompletion request shape', () => {
  it('hoists system turns out of the message list', async () => {
    const fetchMock = mockReply([{ type: 'text', text: 'ok' }]);

    await anthropicCompletion('key', [
      { role: 'system', content: 'Be terse.' },
      { role: 'system', content: 'Answer in English.' },
      { role: 'user', content: 'Hello' },
    ]);

    const body = sentBody(fetchMock);
    expect(body.system).toBe('Be terse.\n\nAnswer in English.');
    expect(body.messages).toEqual([{ role: 'user', content: 'Hello' }]);
  });

  it('never sends temperature, which current Claude models reject', async () => {
    const fetchMock = mockReply([{ type: 'text', text: 'ok' }]);

    await anthropicCompletion(
      'key',
      [{ role: 'user', content: 'Hello' }],
      { temperature: 0.2 }
    );

    expect(sentBody(fetchMock).temperature).toBeUndefined();
  });

  it('drops leading assistant turns so the conversation opens on a user', async () => {
    const fetchMock = mockReply([{ type: 'text', text: 'ok' }]);

    await anthropicCompletion('key', [
      { role: 'system', content: 'Be terse.' },
      { role: 'assistant', content: 'Trimmed mid-exchange.' },
      { role: 'user', content: 'And then?' },
    ]);

    expect(sentBody(fetchMock).messages).toEqual([
      { role: 'user', content: 'And then?' },
    ]);
  });
});

describe('anthropicCompletion replies', () => {
  it('returns text blocks and ignores thinking blocks', async () => {
    mockReply([
      { type: 'thinking', thinking: '' },
      { type: 'text', text: '  {"suggestions":[]}  ' },
    ]);

    await expect(
      anthropicCompletion('key', [{ role: 'user', content: 'Hi' }])
    ).resolves.toBe('{"suggestions":[]}');
  });

  it('explains a refusal instead of reporting an empty reply', async () => {
    mockReply([], { stop_reason: 'refusal' });

    await expect(
      anthropicCompletion('key', [{ role: 'user', content: 'Hi' }])
    ).rejects.toThrow(/declined/i);
  });

  it('surfaces the status and body of a failed request', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => 'invalid x-api-key',
      json: async () => ({}),
    })) as unknown as typeof fetch;

    await expect(
      anthropicCompletion('bad', [{ role: 'user', content: 'Hi' }])
    ).rejects.toThrow('Claude error 401: invalid x-api-key');
  });
});
