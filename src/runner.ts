import EventEmitter from 'node:events';
import { setInterval } from 'node:timers/promises';
import type { Check, HealthCheckConfig } from './health';

export type Job<ConfigType> = {
  id: string;
  config: ConfigType;
  run: (
    signal: AbortSignal
  ) => Promise<Array<{ label: string; passed: boolean }>>;
};

// xx: could put together a type helper for this?
export interface RunnerEventEmitter<ConfigType> extends EventEmitter {
  on(event: 'job:begin', handler: (event: { id: string }) => void);
  emit(event: 'job:begin', data: { id: string });
  on(
    event: 'job:end',
    handler: (
      event: { id: string; config: ConfigType } & (
        | {
            outcome: 'success';
            checks: Array<{
              label: string;
              passed: boolean;
              ts: number;
            }>;
          }
        | { outcome: 'error'; error: Error }
      )
    ) => void
  );
  emit(
    event: 'job:end',
    data: { id: string; config: ConfigType } & (
      | {
          outcome: 'ok';
          checks: Array<{
            label: string;
            passed: boolean;
            ts: number;
          }>;
        }
      | { outcome: 'error'; error: Error }
    )
  );
  //   on(
  //     event: 'job:error',
  //     handler: (event: { id: string; error: Error }) => void
  //   );
  //   emit(event: 'job:error', data: { id: string; error: Error });
  on(
    event: 'batch:begin',
    handler: (event: { jobs: Array<{ id: string }> }) => void
  );
  emit(event: 'batch:begin', data: { jobs: Array<{ id: string }> });
  on(
    event: 'batch:end',
    handler: (event: {
      jobs: Array<
        {
          id: string;
          config: ConfigType;
        } & (
          | {
              outcome: 'ok';
              checks: Array<{
                label: string;
                passed: boolean;
                ts: number;
              }>;
            }
          | { outcome: 'error'; error: Error }
        )
      >;
    }) => void
  );
  emit(
    event: 'batch:end',
    data: {
      jobs: Array<
        {
          id: string;
          config: ConfigType;
        } & (
          | {
              outcome: 'ok';
              checks: Array<{
                label: string;
                passed: boolean;
                ts: number;
              }>;
            }
          | { outcome: 'error'; error: Error }
        )
      >;
    }
  );
}

export const createRunner = <JobConfigType>(
  intervalMs: number,
  jobs: Job<JobConfigType>[]
) => {
  const failsafeJobLocks = new Map<string, boolean>();
  const bus: RunnerEventEmitter<JobConfigType> = new EventEmitter();

  const run = async (signal: AbortSignal) => {
    const batchPendingJobs = new Map<string, boolean>();
    const batchCompletedJobs = [];
    for (const job of jobs) {
      if (failsafeJobLocks.has(job.id)) {
        continue;
      }

      failsafeJobLocks.set(job.id, true);

      // Let jobs dangle in background
      const ac = new AbortController();

      const timeoutId = global.setTimeout(() => {
        ac.abort('job timed out');
      }, 10_000);

      function onRunnerStop() {
        // console.log(
        //   `${c.bold(c.gray('[runner]'))} cancelling run of job '${job.id}'`
        // );
        clearTimeout(timeoutId);
        ac.abort(signal.reason);
      }

      signal.addEventListener('abort', onRunnerStop);

      bus.emit(`job:begin`, { id: job.id });
      batchPendingJobs.set(job.id, true);
      job
        .run(ac.signal)
        .then((checks) => {
          bus.emit('job:end', {
            id: job.id,
            config: job.config,
            outcome: 'ok',
            checks,
          });
          batchCompletedJobs.push({
            id: job.id,
            config: job.config,
            outcome: 'ok',
            checks,
          });
        })
        .catch((error) => {
          bus.emit('job:end', {
            id: job.id,
            config: job.config,
            outcome: 'error',
            error,
          });
          batchCompletedJobs.push({
            id: job.id,
            config: job.config,
            outcome: 'error',
            error,
          });
        })
        .finally(() => {
          clearTimeout(timeoutId);
          signal.removeEventListener('abort', onRunnerStop);
          failsafeJobLocks.delete(job.id);
          batchPendingJobs.delete(job.id);

          if (batchPendingJobs.size < 1) {
            bus.emit('batch:end', { jobs: batchCompletedJobs });
          }
        });
    }
  };

  return {
    locks: failsafeJobLocks,
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
