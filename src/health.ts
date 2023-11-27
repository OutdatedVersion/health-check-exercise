import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Job } from './job';

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

export const healthCheckConfigSchema = z.object({
  name: z.string(),
  url: z.string().url(),
  method: httpMethodSchema.default('GET'),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().optional(),
});
export type HealthCheckConfig = z.infer<typeof healthCheckConfigSchema>;

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

export type CheckResult = {
  label: string;
  ok: boolean;
  ts: number;
};

export const statusCodeCheck: Check = {
  label: '2xx status code',
  test: ({ response }) => response.ok,
};

export const latencyCheck: Check = {
  label: 'latency <500ms',
  test: ({ startedAt, endedAt }) => endedAt - startedAt < 500,
};

export const createHealthCheckJob = (
  config: HealthCheckConfig,
): Job<HealthCheckConfig> => {
  return {
    id: randomUUID(),
    config,
    run: async (signal, fetch = global.fetch) => {
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

      return [statusCodeCheck, latencyCheck].map((c) => ({
        label: c.label,
        ok: c.test({ startedAt, endedAt, response }),
        ts: endedAt,
      }));
    },
  };
};
