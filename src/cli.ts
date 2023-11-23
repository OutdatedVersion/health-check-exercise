const main = async (args = process.argv.slice(1)) => {};

main().catch((error) => {
  console.error('Uncaught error', error);
  process.exit(1);
});
