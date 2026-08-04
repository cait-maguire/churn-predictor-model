import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const jsResult = await esbuild.build({
  entryPoints: [path.join(rootDir, 'src/app.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome100', 'firefox100', 'safari15'],
  write: false,
  legalComments: 'none',
});

const js = jsResult.outputFiles[0].text;
const css = readFileSync(path.join(rootDir, 'src/styles.css'), 'utf8');
let html = readFileSync(path.join(rootDir, 'src/template.html'), 'utf8');

html = html
  .replace('/*__STYLES__*/', () => css)
  .replace('/*__SCRIPT__*/', () => js);

mkdirSync(path.join(rootDir, 'dist'), { recursive: true });
const outPath = path.join(rootDir, 'dist/churn-dashboard.html');
writeFileSync(outPath, html);

const sizeKb = Math.round(Buffer.byteLength(html) / 1024);
console.log(`Built ${outPath} (${sizeKb} KB)`);
