import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { z } from 'zod';
import type { Job } from './runner';

export const httpMethodSchema = z.enum([
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
  'CONNECT',
  'TRACE',
]);

export const yoloSchema = z.object({
  name: z.string(),
  url: z.string().url(),
  method: httpMethodSchema.optional(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().optional(),
});
export type HealthCheckConfig = z.infer<typeof yoloSchema>;

export type Check = {
  label: string;
  /**
   * Predicate {@code true} when condition, described by label, passes
   */
  test: (state: {
    startedAt: number;
    endedAt: number;
    response: Response;
  }) => boolean;
};

const checks: Check[] = [
  {
    label: '2xx status code',
    test: ({ response }) => response.ok,
  },
  {
    label: 'latency <500ms',
    test: ({ startedAt, endedAt }) => endedAt - startedAt < 500,
  },
  // add more...
  // maybe response body checks? `$.status = 'ok'` sorta thing
];

// job interface is bleeding into this file but we're just gonna live with that for sake of simplicity
export const createHealthCheckJob = (
  config: HealthCheckConfig
): Job<HealthCheckConfig> => {
  return {
    id: randomUUID(),
    config,
    run: async (signal) => {
      const t = Math.random() * 18000;
      // console.log('job running', t);
      await setTimeout(t, undefined, { signal });
      const headers = new Headers(config.headers);
      if (config.body) {
        // TODO: ... should config.headers['content-type'] override?
        headers.set('content-type', 'application/json');
      }

      const startedAt = Date.now();
      let response;
      try {
        response = await fetch(config.url, {
          method: config.method,
          headers,
          body: config.body,
          signal,
        });
      } catch (error) {
        if (error.code !== 'ABORT_ERR') {
          throw error;
        }
      }
      const endedAt = Date.now();

      return checks.map((c) => ({
        label: c.label,
        passed: c.test({ startedAt, endedAt, response }),
        ts: endedAt,
      }));
    },
  };
};
