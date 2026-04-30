import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const proc = spawnSync('npm', ['install'], {
  cwd: root,
  shell: true,
  encoding: 'utf8',
  env: process.env,
});
const out = [
  '=== stdout ===',
  proc.stdout ?? '',
  '=== stderr ===',
  proc.stderr ?? '',
  `=== exit ${proc.status} ===`,
].join('\n');
writeFileSync(join(root, 'npm-install-output.txt'), out, 'utf8');
