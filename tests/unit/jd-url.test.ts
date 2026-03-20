import { describe, expect, it } from 'vitest';
import { AppError } from '../../server/errors.ts';
import { fetchJobDescriptionText } from '../../server/jd-url.ts';

describe('job description URL fetch helper', () => {
  it('rejects malformed URLs', async () => {
    await expect(fetchJobDescriptionText('not-a-url', fetch)).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
      status: 400,
    } satisfies Partial<AppError>);
  });

  it('extracts readable text from HTML', async () => {
    const text = await fetchJobDescriptionText(
      'https://example.com/job',
      async () =>
        new Response('<html><body><main>Senior Frontend Engineer React TypeScript</main></body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
    );

    expect(text).toContain('Senior Frontend Engineer');
  });

  it('rejects empty extracted HTML', async () => {
    await expect(
      fetchJobDescriptionText(
        'https://example.com/job',
        async () => new Response('<html><body><script>ignored()</script></body></html>', { status: 200 }),
      ),
    ).rejects.toMatchObject({
      code: 'EMPTY_EXTRACTED_TEXT',
      status: 422,
    } satisfies Partial<AppError>);
  });
});
