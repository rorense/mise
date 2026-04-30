import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const assets = path.join(root, 'assets');

/** 1x1 PNG — Expo accepts it for dev; replace with real art for store. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

fs.mkdirSync(assets, { recursive: true });
for (const name of ['icon.png', 'splash-icon.png', 'adaptive-icon.png']) {
  const p = path.join(assets, name);
  fs.writeFileSync(p, PNG_1X1);
  console.log('wrote', p);
}
