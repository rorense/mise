import { claudeCompletion } from '@/lib/anthropic';

const mockCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error {
    status?: number;
  }
  class AuthenticationError extends APIError {}
  class RateLimitError extends APIError {}
  const Anthropic = jest.fn().mockImplementation(() => ({ beta: { messages: { create: mockCreate } } }));
  Object.assign(Anthropic, { APIError, AuthenticationError, RateLimitError });
  return { __esModule: true, default: Anthropic };
});

describe('claudeCompletion', () => {
  beforeEach(() => mockCreate.mockReset());

  it('sends a valid Claude request and returns the text', async () => {
    mockCreate.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [
        { type: 'thinking', thinking: '' },
        { type: 'text', text: ' {"title":"Curry"} ' },
      ],
    });

    const out = await claudeCompletion(
      'sk-test',
      [
        { role: 'system', content: 'Rules A' },
        { role: 'assistant', content: 'stale reply left by history trimming' },
        { role: 'user', content: 'Extract this' },
      ],
      { temperature: 0.2 }
    );

    expect(out).toBe('{"title":"Curry"}');
    const body = mockCreate.mock.calls[0][0];
    expect(body.model).toBe('claude-opus-5-5');
    expect(body.system).toBe('Rules A');
    expect(body.messages).toEqual([{ role: 'user', content: 'Extract this' }]);
    expect(body).not.toHaveProperty('temperature');
    expect(body.fallbacks).toBe('default');
    expect(body.betas).toEqual(['server-side-fallback-2026-07-01']);
  });

  it('turns a refusal into a readable error', async () => {
    mockCreate.mockResolvedValue({ stop_reason: 'refusal', content: [] });
    await expect(
      claudeCompletion('sk-test', [{ role: 'user', content: 'hi' }])
    ).rejects.toThrow('Claude declined this request.');
  });
});
