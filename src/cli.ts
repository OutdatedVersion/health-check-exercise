import { readFile } from 'node:fs/promises';
import { parseDocument } from 'yaml';
import * as c from 'ansi-colors';
import { HealthCheckConfig, createHealthCheckJob, yoloSchema } from './health';
import { z } from 'zod';
import { createRunner } from './runner';

const main = async (args = process.argv.slice(2)) => {
  if (args.length < 1) {
    console.error(
      `${c.bold(c.red('error:'))} expected path to health check job list`
    );
    console.error(
      `${c.bold(c.yellow('example:'))} node cli.js /tmp/health-checks.yaml`
    );
    process.exit(0);
  }

  // default error provides plenty of info especially considering our audience is developers
  const manifest = await readFile(args[0], 'utf8');
  const stuff = parseDocument(manifest).toJSON();
  const config = z.array(yoloSchema).parse(stuff);

  const ac = new AbortController();

  const { run, locks, bus } = createRunner<HealthCheckConfig>(
    15_000,
    config.map(createHealthCheckJob)
  );

  process.on('SIGINT', () => {
    console.log(`${c.bold(c.yellow('warn'))} cancelling ${locks.size} jobs..`);
    ac.abort('user asked to stop monitoring');
  });

  bus.on('job:end', (data) => {
    console.log(data);
  });
  // bus.on('job:success', ({ id }) => {
  //   console.log(`${c.bold(c.gray('[runner]'))} job '${id}' succeeded`);
  // });
  // bus.on('job:error', ({ id, error }) => {
  //   console.log(`${c.bold(c.gray('[runner]'))} job '${id}' failed`, error);
  // });

  const tracking = new Map<string, { total: number; ok: number }>();
  bus.on('batch:end', ({ jobs }) => {
    for (const job of jobs) {
      if (job.outcome === 'error') {
        continue;
      }

      const { hostname } = new URL(job.config.url);
      const data = tracking.get(hostname) ?? {
        total: 0,
        ok: 0,
      };

      const ok = job.checks.every((c) => c.passed);
      if (ok) {
        data.ok += 1;
      }
      data.total += 1;

      tracking.set(hostname, data);
    }

    tracking.forEach((data, hostname) => {
      console.log(
        `${hostname} has ${Math.round(
          100 * (data.ok / data.total)
        )}% availability percentage`
      );
    });
  });

  try {
    await run(ac.signal);
  } catch (error) {
    if (error.code !== 'ABORT_ERR') {
      throw error;
    }
  }
};

main().catch((error) => {
  console.error(c.bold(c.red('error:')), error);
  process.exit(1);
});
