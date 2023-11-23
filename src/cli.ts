import { readFile } from 'node:fs/promises';
import { parseDocument } from 'yaml';
import * as c from 'ansi-colors';
import { createJob, createRunner, yoloSchema } from './health';
import { z } from 'zod';

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
  // const manifest = await readFile(args[0], 'utf8');
  // const stuff = parseDocument(manifest).toJSON();
  // console.log(stuff);
  // const abc = z.array(yoloSchema).parse(stuff);
  // console.log(abc);

  const ac = new AbortController();

  const { run, locks } = createRunner(15_000, [
    createJob({
      name: 'testerino',
      url: 'https://bwatkins.dev',
    }),
    createJob({
      name: 'testerino 2',
      url: 'https://bwatkins.dev',
      method: 'HEAD',
    }),
  ]);

  process.on('SIGINT', () => {
    console.log(`${c.bold(c.yellow('warn'))} cancelling ${locks.size} jobs..`);
    ac.abort('user asked to stop monitoring');
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
