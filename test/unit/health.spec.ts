import { describe, it, expect, vitest, afterEach } from 'vitest';
import {
  createHealthCheckJob,
  latencyCheck,
  statusCodeCheck,
} from '../../src/health';

describe('checks', () => {
  it.each([true, false])('2xx status code: %s', (res) => {
    expect(
      statusCodeCheck.test({
        // @ts-expect-error
        response: { ok: res },
      }),
    ).toBe(res);
  });

  it.each([
    [1700943599717, 1700943599717, true],
    [1700943599717, 1700943601717, false],
  ])('latency: %s-%s=%s', (startedAt, endedAt, expected) => {
    expect(
      // @ts-expect-error
      latencyCheck.test({
        startedAt,
        endedAt,
      }),
    ).toBe(expected);
  });
});

describe('job', () => {
  afterEach(() => {
    vitest.resetAllMocks();
  });

  it('happy paths', async () => {
    const fetch = vitest.mocked<typeof global.fetch>(
      vitest.fn(() => ({ ok: true })) as any,
    );
    const ac = new AbortController();

    await createHealthCheckJob({
      name: 'testerino',
      url: 'https://example.com',
      method: 'GET',
    }).run(ac.signal, fetch as any);

    expect(fetch).toBeCalledWith(
      'https://example.com',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('sends a json body', async () => {
    const fetch = vitest.mocked<typeof global.fetch>(
      vitest.fn(() => ({ ok: true })) as any,
    );
    const ac = new AbortController();

    await createHealthCheckJob({
      name: 'testerino',
      url: 'https://example.com',
      method: 'GET',
      body: '{"test": true}',
    }).run(ac.signal, fetch as any);

    expect(fetch).toBeCalledWith(
      'https://example.com',
      expect.objectContaining({
        method: 'GET',
        body: '{"test": true}',
        headers: new Headers({
          'content-type': 'application/json',
        }),
      }),
    );
  });

  it('forwards headers', async () => {
    const fetch = vitest.mocked<typeof global.fetch>(
      vitest.fn(() => ({ ok: true })) as any,
    );
    const ac = new AbortController();

    await createHealthCheckJob({
      name: 'testerino',
      url: 'https://example.com',
      method: 'GET',
      body: '{"test": true}',
      headers: {
        hi: 'true',
        another: 'thing',
        'content-type': 'idk',
      },
    }).run(ac.signal, fetch as any);

    expect(fetch).toBeCalledWith(
      'https://example.com',
      expect.objectContaining({
        method: 'GET',
        body: '{"test": true}',
      }),
    );
    expect([...fetch.mock.calls[0][1]?.headers?.entries()]).toEqual([
      ['another', 'thing'],
      ['content-type', 'application/json'],
      ['hi', 'true'],
    ]);
  });
});
