#!/usr/bin/env node
// Vérifie l'intégrité des assets BusyTeX (WASM + paquets TeX Live) téléchargés par `npm run setup:wasm`.
// Les assets viennent d'une release GitHub : on compare leurs empreintes SHA-256 à celles
// enregistrées dans deploy/busytex-assets.sha256 (versionné avec le code).
//
//   node scripts/verify-busytex.mjs          -> vérifie (code de sortie 1 si différence)
//   node scripts/verify-busytex.mjs --write  -> régénère le manifeste (après une mise à jour volontaire
//                                               de texlyre-busytex, sur des assets jugés sûrs)
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = path.join(repoRoot, 'apps/web/public/core/busytex');
const manifestPath = path.join(repoRoot, 'deploy/busytex-assets.sha256');

function listFiles(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      return entry.isDirectory() ? listFiles(path.join(dir, entry.name), rel) : [rel];
    })
    .sort();
}

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}

if (!existsSync(assetsDir)) {
  console.error(`Assets BusyTeX introuvables (${assetsDir}). Lance d'abord : npm run setup:wasm`);
  process.exit(1);
}

const actual = new Map();
for (const rel of listFiles(assetsDir)) {
  actual.set(rel, await sha256(path.join(assetsDir, rel)));
}

if (process.argv.includes('--write')) {
  const lines = [...actual].map(([rel, hash]) => `${hash}  ${rel}`);
  writeFileSync(manifestPath, `${lines.join('\n')}\n`);
  console.log(`Manifeste écrit : ${path.relative(repoRoot, manifestPath)} (${lines.length} fichiers)`);
  process.exit(0);
}

if (!existsSync(manifestPath)) {
  console.error(`Manifeste absent (${manifestPath}).`);
  process.exit(1);
}

const expected = new Map(
  readFileSync(manifestPath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [hash, ...rest] = line.split(/\s+/);
      return [rest.join(' '), hash];
    })
);

const problems = [];
for (const [rel, hash] of expected) {
  if (!actual.has(rel)) problems.push(`manquant : ${rel}`);
  else if (actual.get(rel) !== hash) problems.push(`empreinte différente : ${rel}`);
}
for (const rel of actual.keys()) {
  if (!expected.has(rel)) problems.push(`fichier inattendu : ${rel}`);
}

if (problems.length > 0) {
  console.error('Intégrité des assets BusyTeX NON vérifiée :');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`Assets BusyTeX vérifiés (${expected.size} fichiers, SHA-256).`);
