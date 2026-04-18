#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
const stagingRoot = path.join(root, 'dist', '_staging');

fs.mkdirSync(stagingRoot, { recursive: true });

const entries = ['triage-haiku', 'investigate-sonnet', 'rca-opus'];
for (const name of entries) {
  const stageDir = path.join(stagingRoot, name);
  fs.mkdirSync(stageDir, { recursive: true });
  fs.copyFileSync(path.join(distDir, `${name}.js`), path.join(stageDir, 'index.mjs'));
  const zipPath = path.join(distDir, `${name}.zip`);
  if (fs.existsSync(zipPath)) fs.rmSync(zipPath);
  execFileSync('zip', ['-q', '-r', zipPath, '.'], { cwd: stageDir, stdio: 'inherit' });
  process.stdout.write(`packaged ${zipPath}\n`);
}

fs.rmSync(stagingRoot, { recursive: true, force: true });
