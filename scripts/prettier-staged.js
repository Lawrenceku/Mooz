const { spawnSync } = require('child_process');

const prettierPath = require.resolve('prettier/bin/prettier.cjs');
const files = process.argv.slice(2);

if (files.length === 0) {
  process.exit(0);
}

const result = spawnSync(
  process.execPath,
  [prettierPath, '--write', ...files],
  {
    stdio: 'inherit',
  }
);

process.exit(result.status ?? 1);
