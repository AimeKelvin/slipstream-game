import { spawn } from 'node:child_process';

const children = [
  spawn(process.execPath, ['--import', 'tsx', '--watch', 'server/index.ts'], { stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' }),
];
let closing = false;
function close(code = 0) {
  if (closing) return; closing = true;
  children.forEach(child => child.kill('SIGTERM'));
  process.exitCode = code;
}
children.forEach(child => { child.on('exit', code => close(code ?? 0)); child.on('error', () => close(1)); });
process.on('SIGINT', () => close()); process.on('SIGTERM', () => close());
