import type { CheckResult } from './health';

export type Job<ConfigType> = {
  id: string;
  config: ConfigType;
  run: (
    signal: AbortSignal,
    fetch?: typeof global.fetch
  ) => Promise<CheckResult[]>;
};

export type JobResult<ConfigType> = {
  config: ConfigType;
} & (
  | {
      ok: true;
      checks: CheckResult[];
    }
  | {
      ok: false;
      error: Error;
    }
);

export const runJobs = async <JobConfig>(
  signal: AbortSignal,
  jobs: Job<JobConfig>[]
): Promise<JobResult<JobConfig>[]> => {
  return Promise.all(
    jobs.map(async (job) => {
      const jobAbort = new AbortController();

      // we don't wants batches to overlap with each other so
      // cancel the run right before the next batch runs (with a safety allowance).
      const timeoutId = setTimeout(() => {
        jobAbort.abort('job timed out');
      }, 13_000);

      function onRunnerStop() {
        jobAbort.abort(signal.reason);
      }

      signal.addEventListener('abort', onRunnerStop);

      try {
        return {
          ok: true,
          config: job.config,
          checks: await job.run(jobAbort.signal),
        };
      } catch (error) {
        return {
          ok: false,
          config: job.config,
          error,
        };
      } finally {
        clearTimeout(timeoutId);
        signal.removeEventListener('abort', onRunnerStop);
      }
    })
  );
};
