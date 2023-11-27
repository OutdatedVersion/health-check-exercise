# Health checks

System for running simple HTTP health checks.

This knocks out a fairly specific set of criteria though leaves the door open
for extensibility and refactoring. New checks can be added in [`src/health.ts`](https://github.com/OutdatedVersion/health-check-exercise/blob/91670732d9160afff2a1e228b3053437c1664b04/src/health.ts#L44-L55).

There is an approach with a fully evented runner system [available in the commit history](https://github.com/OutdatedVersion/health-check-exercise/commit/727182c6b935dfc49011d4327f82cc41f9836f2a) which
totally decouples job run time from the runner. Though it was abandoned in favor of simpler.

## How to 💻

1. Verify Node.js >= 18 is installed: `node --version`
   - If something >= 18.x.x is printed, continue
   - If not, install Node.js
     - I recommend using [`fnm`](https://github.com/Schniz/fnm) but do [whatever works for you](https://nodejs.org/en/learn/getting-started/how-to-install-nodejs)
2. Clone project
3. Run `npm clean-install`
4. Run `npm start`
   - You can also run it directly with `npm run build && node dist/cli.js`
   - Set `DEBUG=health-check:runner` environment variable for more context, if you'd like
5. Run the tests: `npm test`
