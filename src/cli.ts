import { readFile } from 'node:fs/promises';
import { parseDocument } from 'yaml';
import * as c from 'ansi-colors';
import debug from 'debug';
import {
  HealthCheckConfig,
  createHealthCheckJob,
  healthCheckConfigSchema,
} from './health';
import { z } from 'zod';
import { setInterval } from 'node:timers/promises';
import { runJobs } from './job';

const debugLog = debug('health-check:runner');

const main = async (args = process.argv.slice(2)) => {
  if (args.length < 1) {
    console.error(
      `${c.bold(c.red('error:'))} expected path to health check job list`
    );
    console.error(
      `${c.bold(c.yellow('example:'))} node cli.js /tmp/health-checks.yaml`
    );
    process.exit(1);
  }

  // default error provides plenty of info especially considering our audience is developers
  const manifest = await readFile(args[0], 'utf8');
  const configAsYaml = parseDocument(manifest).toJSON();
  const config = z.array(healthCheckConfigSchema).parse(configAsYaml);
  debugLog('health check config', config);

  const ac = new AbortController();

  process.on('SIGINT', () => {
    console.log(`${c.bold(c.yellow('warn:'))} cancelling health check jobs...`);
    ac.abort('user requested monitoring stop');
  });

  const jobs = config.map(createHealthCheckJob);
  const history = new Map<string, { total: number; ok: number }>();

  const tick = async () => {
    debugLog(`running ${jobs.length} jobs`);
    const results = await runJobs<HealthCheckConfig>(ac.signal, jobs);

    for (const result of results) {
      if (!result.ok) {
        debugLog('job run failed', result);
        continue;
      }

      debugLog('job run succeeded', result);
      const { hostname } = new URL(result.config.url);
      const record = history.get(hostname) ?? { total: 0, ok: 0 };

      record.total += 1;
      const isUp = result.checks.every((c) => c.ok);
      if (isUp) {
        record.ok += 1;
      } else {
        console.log(
          `${c.bold(c.yellow('warn:'))} health check '${
            result.config.name
          }' failed\n${result.checks
            .map(
              (check) =>
                ' '.repeat(2) +
                (check.ok ? c.green(check.label) : c.red(check.label))
            )
            .join('\n')}`
        );
      }

      history.set(hostname, record);
    }

    const seen = new Map<string, boolean>();
    for (const conf of config) {
      const { hostname } = new URL(conf.url);
      const record = history.get(hostname);

      if (!seen.has(hostname)) {
        const pct = record ? Math.round(100 * (record.ok / record.total)) : 0;
        console.log(
          `${c.bold(
            c.blue('info:')
          )} ${hostname} has ${pct}% availability percentage`
        );
        seen.set(hostname, true);
      }
    }
  };

  await tick();
  for await (const _ of setInterval(15_000, undefined, { signal: ac.signal })) {
    await tick();
  }
};

main().catch((error) => {
  console.error(c.bold(c.red('fatal:')), error);
  process.exit(1);
});
