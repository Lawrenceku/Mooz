//process manager

const { spawn } = require('child_process');

const npmCli = process.env.npm_execpath;

if (!npmCli) {
  console.error('Unable to locate npm CLI path (npm_execpath is not set).');
  process.exit(1);
}

const workspaces = ['signaling', 'client'];
const children = [];
let shuttingDown = false;

function stopAll(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }

  setTimeout(() => process.exit(exitCode), 200);
}

for (const workspace of workspaces) {
  const child = spawn(
    process.execPath,
    [npmCli, 'run', 'dev', '--workspace', workspace],
    {
      stdio: 'inherit',
      env: process.env,
    }
  );

  children.push(child);

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;

    if (code !== 0) {
      console.error(
        `workspace ${workspace} exited with code ${code}${signal ? ` (signal: ${signal})` : ''}`
      );
      stopAll(code || 1);
      return;
    }

    stopAll(0);
  });
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
