// Copie dans vendor/ les builds des dépendances servies au joueur (section 21 :
// jamais de CDN, version fixée, licence jointe). npm ne sert qu'à les récupérer.
//
//   npm install && npm run vendor
//
// vendor/ est commité : GitHub Pages sert le dépôt tel quel, sans npm install.

import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const NM = 'node_modules';
const VENDOR = 'vendor';

const version = nom => JSON.parse(readFileSync(join(NM, nom, 'package.json'), 'utf8')).version;
const licence = dossier => ['LICENSE.txt', 'LICENSE', 'LICENSE.md'].map(f => join(dossier, f)).find(existsSync);

function copier(nom, fichiers, dest) {
  const src = join(NM, nom);
  if (!existsSync(src)) throw new Error(`${nom} absent : lancer d'abord npm install`);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  for (const f of fichiers) cpSync(join(src, f), join(dest, f.split('/').pop()));
  const l = licence(src);
  if (l) cpSync(l, join(dest, 'LICENSE.txt'));
  writeFileSync(join(dest, 'VERSION'), `${nom} ${version(nom)}\n`);
  console.log(`vendor : ${nom} ${version(nom)} → ${dest}`);
}

// MapLibre GL JS (BSD-3-Clause) : build ES, le worker est chargé à côté (import.meta.url).
copier('maplibre-gl', [
  'dist/maplibre-gl.mjs',
  'dist/maplibre-gl-worker.mjs',
  'dist/maplibre-gl.css',
], join(VENDOR, 'maplibre-gl'));

// proj4js (MIT) : build UMD, enveloppé en module ES pour le navigateur ET Node
// (les tests importent le même fichier que le jeu).
const dossierProj = join(VENDOR, 'proj4');
copier('proj4', ['dist/proj4.js'], dossierProj);
const umd = readFileSync(join(dossierProj, 'proj4.js'), 'utf8');
writeFileSync(join(dossierProj, 'proj4.mjs'),
  `// Généré par outils/vendor.mjs à partir de proj4.js (UMD) : ne pas modifier.\n` +
  `const module = { exports: {} }; const exports = module.exports;\n${umd}\nexport default module.exports;\n`);
rmSync(join(dossierProj, 'proj4.js'));
