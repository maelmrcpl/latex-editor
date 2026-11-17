import { spawn } from 'node:child_process';

const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';

const procs = [
  spawn(npmCmd, ['run', 'dev:server'], { stdio: 'inherit', shell: isWin }),
  spawn(npmCmd, ['run', 'dev:web'], { stdio: 'inherit', shell: isWin }),
];

const shutdown = () => {
  for (const p of procs) {
    if (!p.killed) p.kill();
  }
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
