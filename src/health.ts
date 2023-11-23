import { randomUUID } from 'node:crypto';
import { setInterval, setTimeout } from 'node:timers/promises';
import { z } from 'zod';
import * as c from 'ansi-colors';
import EventEmitter from 'node:events';

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

// P — The HTTP response code is 2xx (any 200–299 response code) and the response
// latency is less than 500 ms.
// DOWN — The endpoint is not UP.

type Check = {
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

type Job = {
  id: string;
  run: (
    signal: AbortSignal
  ) => Promise<Array<{ label: string; passed: boolean }>>;
};

const conditions: Check[] = [
  {
    label: '2xx status code',
    test: ({ response }) => response.ok,
  },
  {
    label: 'latency <500ms',
    test: ({ startedAt, endedAt }) => endedAt - startedAt < 500,
  },
];

export const createJob = (config: HealthCheckConfig): Job => {
  return {
    id: randomUUID(),
    run: async (signal) => {
      const t = Math.random() * 18000;
      console.log('job running', t);
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

      return conditions.map((c) => ({
        label: c.label,
        passed: c.test({ startedAt, endedAt, response }),
        ts: endedAt,
      }));
    },
  };
};

export const createRunner = (intervalMs: number, jobs: Job[]) => {
  const locks = new Map<string, boolean>();
  const bus = new EventEmitter();

  console.log(`${c.bold(c.gray('[runner]'))} scheduling ${jobs.length} job(s)`);

  const run = async (signal: AbortSignal) => {
    for (const job of jobs) {
      if (locks.has(job.id)) {
        continue;
      }

      locks.set(job.id, true);

      // Let jobs dangle in background
      const ac = new AbortController();

      const timeoutId = global.setTimeout(() => {
        ac.abort('job timed out');
      }, 10_000);

      function onRunnerStop() {
        console.log(
          `${c.bold(c.gray('[runner]'))} cancelling run of job '${job.id}'`
        );
        clearTimeout(timeoutId);
        ac.abort(signal.reason);
      }

      signal.addEventListener('abort', onRunnerStop);

      // console.log(`${c.bold(c.gray('[runner]'))} start run of job '${job.id}'`);
      bus.emit(`job:begin`, { id: job.id });
      job
        .run(ac.signal)
        .then(() => {
          bus.emit(`job:end`, { id: job.id });
          console.log(
            `${c.bold(c.gray('[runner]'))} completed run of job '${job.id}'`
          );
        })
        .catch((error) => {
          bus.emit(`job:end`, { id: job.id });
          console.log(
            `${c.bold(c.gray('[runner]'))} failed run of job '${job.id}'`,
            error
          );
        })
        .finally(() => {
          clearTimeout(timeoutId);
          signal.removeEventListener('abort', onRunnerStop);
          locks.delete(job.id);
        });
    }
  };

  return {
    locks,
    bus,
    run: async (signal: AbortSignal) => {
      // kick a run off right away -- `setInterval` waits for `intervalMs` before running
      await run(signal);

      for await (const _ of setInterval(intervalMs, undefined, {
        signal,
      })) {
        await run(signal);
      }
    },
  };
};
