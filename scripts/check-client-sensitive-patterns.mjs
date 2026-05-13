import fs from 'node:fs';
import path from 'node:path';

const roots = ['src/pages', 'src/components', 'src/lib', 'src/api'];
const exts = new Set(['.js', '.jsx', '.ts', '.tsx']);
const patterns = [
  { name: 'email', re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
  { name: 'phone', re: /(?:\+?\d[\d\s()-]{8,}\d)/g },
  { name: 'address', re: /\b\d{1,5}\s+[\w\s]{1,40}\b(?:st|street|rd|road|ave|avenue|blvd|lane|ln|dr|drive|way)\b/gi },
];

const files = [];
const walk = (dir) => {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (exts.has(path.extname(entry.name))) files.push(full);
  }
};
roots.forEach(walk);

let failed = false;
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  for (const p of patterns) {
    const matches = [...text.matchAll(p.re)].map((x) => x[0]);
    const m = p.name === 'phone'
      ? matches.filter((v) => v.replace(/\D/g, '').length >= 10)
      : matches;
    if (m?.length) {
      failed = true;
      console.error(`${file}: found ${p.name}-like pattern (${m[0]})`);
    }
  }
}
if (failed) process.exit(1);
console.log(`Sensitive-pattern check passed (${files.length} files scanned).`);
