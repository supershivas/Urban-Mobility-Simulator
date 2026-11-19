// Le critère de validation de la v0.1 (Jérôme, v0.1.0) : « données traçables et justes ».
//
//   node outils/critere-v01.mjs              → 20 tronçons, graine 1
//   node outils/critere-v01.mjs --n 50 --graine 7 --capture captures/selection.png
//
// Vérifie, dans le vrai jeu (Chromium, ?debug=1) :
//   1. la carte est prête (MapLibre « idle ») en moins de 3 s en local ;
//   2. N tronçons tirés au sort : un clic sur chacun le sélectionne, et
//      l'inspecteur affiche CE tronçon.
// Les invariants de données (0 identifiant en double, 100 % des from/toNode
// existants) sont dans test/donnees.test.mjs.
// Code de sortie 1 si un point échoue.
import { servir, lancerChromium, CIBLES, options } from './navigateur.mjs';

const o = options(process.argv.slice(2), { n: '20', graine: '1', limite: '3000' });
const N = Number(o.n), LIMITE_MS = Number(o.limite);

// Tirage reproductible (mulberry32) : un outil, pas une règle du jeu.
function tirage(graine) {
  let a = graine >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const serveur = await servir('.');
const nav = await lancerChromium();
const ctx = await nav.newContext(CIBLES.bureau);
const page = await ctx.newPage();
const erreurs = [];
page.on('pageerror', e => erreurs.push(e.message));
page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text()); });

await page.goto(`${serveur.base}index.html?debug=1&vue=2d&expert=1&mission=0`);
await page.waitForFunction(() => window.__jeu?.pret);
const msPret = await page.evaluate(() => window.__jeu.pret());
await page.evaluate(() => window.__jeu.jouer());

const ids = await page.evaluate(() => window.__jeu.ids());
const geo = await page.evaluate(async () => (await (await fetch('data/processed/streets.geojson')).json()).features
  .map(f => ({ id: f.properties.id, niveau: f.properties.niveau, c: f.geometry.coordinates })));
const parId = new Map(geo.map(g => [g.id, g]));
const alea = tirage(Number(o.graine));
const choisis = [];
while (choisis.length < Math.min(N, ids.length)) {
  const id = ids[Math.floor(alea() * ids.length)];
  if (!choisis.includes(id)) choisis.push(id);
}

let ok = 0;
const echecs = [];
for (const id of choisis) {
  const l = parId.get(id).c;
  const a = l[Math.floor((l.length - 1) / 2)], b = l[Math.floor((l.length - 1) / 2) + 1];
  const milieu = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  await page.evaluate(c => window.__jeu.allerA(c, 19), milieu);
  // Tous les clics tombent près du centre : sans pause, deux clics passent pour un double-clic.
  await page.waitForTimeout(600);
  const p = await page.evaluate(c => window.__jeu.versEcran(c), milieu);
  await page.mouse.click(p.x, p.y);
  const s = await page.evaluate(() => window.__jeu.state());
  if (s.selection === id && s.inspecteur === id) ok++;
  else echecs.push(`${id} (niveau ${parId.get(id).niveau}) : sélection ${s.selection}, inspecteur ${s.inspecteur}`);
}
if (o.capture) await page.screenshot({ path: o.capture });
await nav.close();
serveur.close();

const okPret = msPret < LIMITE_MS;
console.log(`${okPret ? '✓' : '✗'} carte prête en ${msPret} ms (limite ${LIMITE_MS} ms)`);
console.log(`${ok === choisis.length ? '✓' : '✗'} ${ok}/${choisis.length} tronçons tirés au sort (graine ${o.graine}) : clic → bonne sélection → bon inspecteur`);
for (const e of echecs) console.log(`    ${e}`);
if (erreurs.length) console.log(`✗ erreurs console : ${erreurs.slice(0, 5).join(' | ')}`);
process.exit(okPret && ok === choisis.length && !erreurs.length ? 0 : 1);
