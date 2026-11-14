// Le critère de la v0.2 : « la scène 3D représente le même territoire et les mêmes
// objets que la carte 2D ; la sélection est cohérente dans les deux vues » (pitch, sprint 2).
//
//   node outils/critere-v02.mjs                → 12 tronçons et 12 bâtiments, graine 1
//   node outils/critere-v02.mjs --n 30 --graine 7 --limite 5000 --capture captures/v02
//
// Scénario déclaré pour la mesure : Chromium, fenêtre 1280 × 800, serveur local,
// nouvelle partie, bascule en 3D ; temps entre la demande et la première image de
// la scène complète (tous les bâtiments, surfaces et tronçons du corridor), lecture
// des GeoJSON et de three.js comprise. Le conteneur n'a pas de carte graphique :
// le chiffre se compare d'une version à l'autre, pas en absolu.
//
// Vérifie, dans le vrai jeu (?debug=1) :
//   1. la scène 3D est prête en moins de --limite ms, et compte les mêmes objets que les données ;
//   2. N tronçons tirés au sort : choisi en 2D → mis en évidence en 3D ; cliqué en 3D
//      (vue de dessus) → sélectionné, même inspecteur, mis en évidence en 2D au retour ;
//   3. N bâtiments tirés au sort (dont des hauteurs non renseignées) : cliqué en 3D →
//      sélectionné, l'inspecteur affiche sa hauteur ou « Non renseigné », même surbrillance en 2D ;
//   4. la caméra se lit et se pilote par le mode debug ; aucune erreur dans la console ;
//   5. la barre d'état tient sur une seule ligne à 1280 px de large, en français et en anglais.
// Code de sortie 1 si un point échoue.
import { servir, lancerChromium, CIBLES, options } from './navigateur.mjs';

const o = options(process.argv.slice(2), { n: '12', graine: '1', limite: '5000' });
const N = Number(o.n), LIMITE_MS = Number(o.limite);

function tirage(graine) {
  let a = graine >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const alea = tirage(Number(o.graine));
const tirer = (liste, n) => { const out = []; while (out.length < Math.min(n, liste.length)) { const x = liste[Math.floor(alea() * liste.length)]; if (!out.includes(x)) out.push(x); } return out; };

const serveur = await servir('.');
const nav = await lancerChromium();
const page = await (await nav.newContext(CIBLES.bureau)).newPage();
const erreurs = [];
page.on('pageerror', e => erreurs.push(e.message));
page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text()); });

await page.goto(`${serveur.base}index.html?debug=1`);
await page.waitForFunction(() => window.__jeu?.pret);
await page.evaluate(() => window.__jeu.pret());
await page.evaluate(() => window.__jeu.jouer());
const etat = () => page.evaluate(() => window.__jeu.state());
const bilan = [];
const point = (ok, texte, details = []) => { bilan.push(ok); console.log(`${ok ? '✓' : '✗'} ${texte}`); for (const d of details) console.log(`    ${d}`); };

// ─── 1. Temps jusqu'à la scène prête, mêmes comptes que les données ────────
const meta = await page.evaluate(async () => (await fetch('data/processed/metadata.json')).json());
const ms = await page.evaluate(() => window.__jeu.vue('3d'));
const comptes = await page.evaluate(() => window.__jeu.sceneComptes());
point(ms !== null && ms < LIMITE_MS, `scène 3D prête en ${ms} ms (limite ${LIMITE_MS} ms) — ${comptes?.triangles} triangles`);
point(comptes?.batiments === meta.comptes.buildings && comptes?.troncons === meta.comptes.streetSegments,
  `mêmes objets que la carte : ${comptes?.batiments}/${meta.comptes.buildings} bâtiments, ${comptes?.troncons}/${meta.comptes.streetSegments} tronçons, ${comptes?.surfaces} surfaces dessinées`);

// ─── 4 (début). La caméra se lit et se pilote ──────────────────────────────
const cam = await page.evaluate(() => window.__jeu.camera({ distance: 300, azimut: 0.5, inclinaison: 1 }));
const lue = (await etat()).camera;
point(lue && Math.abs(lue.distance - 300) < 1e-6 && Math.abs(lue.azimut - 0.5) < 1e-6 && Math.abs(lue.inclinaison - 1) < 1e-6 && lue.position[1] > 0 && cam.cible.length === 2,
  `caméra lue par le mode debug : distance ${lue?.distance} m, azimut ${lue?.azimut}, inclinaison ${lue?.inclinaison}, à ${lue?.position?.[1].toFixed(0)} m du sol`);

// ─── Données pour les tirages ──────────────────────────────────────────────
const rues = await page.evaluate(async () => (await (await fetch('data/processed/streets.geojson')).json()).features.map(f => ({ id: f.properties.id, niveau: f.properties.niveau, c: f.geometry.coordinates })));
const batiments = await page.evaluate(() => window.__jeu.batiments());
const milieu = l => { const a = l[Math.floor((l.length - 1) / 2)], b = l[Math.floor((l.length - 1) / 2) + 1]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
const DESSUS = { azimut: 0, inclinaison: 0 };
async function cliquer3d(lonLat, hauteur, distance) {
  await page.evaluate(([c, d, vue]) => window.__jeu.camera({ cibleLonLat: c, distance: d, ...vue }), [lonLat, distance, DESSUS]);
  const p = await page.evaluate(([c, h]) => window.__jeu.versEcran3d(c, h), [lonLat, hauteur]);
  await page.mouse.click(p.x, p.y);
  return etat();
}

// ─── 2. Tronçons : 2D → 3D, puis clic en 3D → 2D ───────────────────────────
const echecsT = [];
let okT = 0, caches = 0;
for (const id of tirer(rues.filter(r => r.niveau === 0).map(r => r.id), N)) {
  const r = rues.find(x => x.id === id), m = milieu(r.c);
  // a. choisi dans la vue 2D, retrouvé dans la vue 3D
  await page.evaluate(() => window.__jeu.vue('2d'));
  await page.evaluate(i => window.__jeu.selectionner(i), id);
  await page.evaluate(() => window.__jeu.vue('3d'));
  const a = await etat();
  const okA = a.selection === id && a.surbrillance3d === id && a.inspecteur === id;
  // b. désélectionné, puis cliqué dans la vue 3D (vue de dessus), retrouvé dans la vue 2D
  await page.evaluate(() => window.__jeu.selectionner(null));
  const b = await cliquer3d(m, 0, 150);
  if (b.selection?.startsWith('bld-')) { caches++; if (okA) okT++; else echecsT.push(`${id} : 2D→3D ${a.surbrillance3d}`); continue; } // un bâtiment en volume recouvre le milieu de l'axe
  await page.evaluate(() => window.__jeu.vue('2d'));
  const c = await etat();
  await page.evaluate(() => window.__jeu.vue('3d'));
  if (okA && b.selection === id && b.surbrillance3d === id && b.inspecteur === id && c.selection === id && c.surbrillance2d === id && c.mode === '2d') okT++;
  else echecsT.push(`${id} : 2D→3D ${a.surbrillance3d} ; clic 3D → ${b.selection} (3D ${b.surbrillance3d}, inspecteur ${b.inspecteur}) ; retour 2D ${c.surbrillance2d}`);
}
point(!echecsT.length, `${okT}/${okT + echecsT.length} tronçons (graine ${o.graine}) : même sélection, même inspecteur, même surbrillance en 2D et en 3D${caches ? ` — dont ${caches} sous un bâtiment (clic 3D non compté)` : ''}`, echecsT);

// ─── 3. Bâtiments : clic en 3D, hauteur dans l'inspecteur, retour en 2D ────
const echecsB = [];
let okB = 0, sansHauteur = 0;
const choisis = [...tirer(batiments.filter(b => b.hauteur !== null).map(b => b.id), Math.ceil(N / 2)), ...tirer(batiments.filter(b => b.hauteur === null).map(b => b.id), Math.floor(N / 2))];
for (const id of choisis) {
  const attendu = batiments.find(b => b.id === id);
  const p = await page.evaluate(i => window.__jeu.pointSurBatiment(i), id);
  await page.evaluate(() => window.__jeu.selectionner(null));
  const a = await cliquer3d(p.lonLat, p.hauteur ?? 0, 60 + (p.hauteur ?? 0) * 2);
  const texte = await page.evaluate(() => document.getElementById('inspecteur-corps').innerText);
  const hauteurAffichee = attendu.hauteur === null
    ? /Non renseigné \(aucun solide|Not provided \(no UrbIS 3D solid/.test(texte)
    : texte.includes(`${attendu.hauteur.toFixed(1).replace('.', ',')} m`) || texte.includes(`${attendu.hauteur.toFixed(1)} m`);
  await page.evaluate(() => window.__jeu.vue('2d'));
  const c = await etat();
  await page.evaluate(() => window.__jeu.vue('3d'));
  if (attendu.hauteur === null && a.selection && !a.selection.startsWith('bld-')) { sansHauteur++; okB++; continue; } // à plat, un axe passe dessus : le tronçon garde la priorité
  if (p.hauteur === attendu.hauteur && a.selection === id && a.surbrillance3d === id && a.inspecteur === id && hauteurAffichee && c.surbrillance2d === id) okB++;
  else echecsB.push(`${id} (hauteur ${attendu.hauteur}) : clic 3D → ${a.selection}, 3D ${a.surbrillance3d}, hauteur affichée ${hauteurAffichee}, retour 2D ${c.surbrillance2d}`);
}
point(!echecsB.length, `${okB}/${choisis.length} bâtiments, dont ${Math.floor(N / 2)} sans hauteur : clic 3D → bon bâtiment, hauteur de la source ou « Non renseigné », même surbrillance en 2D${sansHauteur ? ` (${sansHauteur} à plat sous un axe : tronçon prioritaire)` : ''}`, echecsB);

// ─── 5. La barre d'état tient sur une seule ligne à 1280 px, dans les deux langues ─
const lignes = {};
for (const langue of ['fr', 'en']) {
  lignes[langue] = await page.evaluate(l => {
    const s = document.getElementById('langue'); s.value = l; s.dispatchEvent(new Event('change'));
    const barre = document.getElementById('statut');
    const milieux = [...barre.children].map(e => { const r = e.getBoundingClientRect(); return Math.round(r.top + r.height / 2); });
    return { lignes: new Set(milieux).size, deborde: barre.scrollWidth > barre.clientWidth, hauteur: barre.getBoundingClientRect().height };
  }, langue);
}
point(Object.values(lignes).every(l => l.lignes === 1 && !l.deborde),
  `barre d'état sur une ligne à ${CIBLES.bureau.viewport.width} px : français ${lignes.fr.lignes} ligne(s), anglais ${lignes.en.lignes} ligne(s), ${lignes.fr.hauteur} px de haut`);

// ─── Captures facultatives : la même sélection dans les deux vues ──────────
if (o.capture) {
  const { mkdir } = await import('node:fs/promises');
  await mkdir(o.capture, { recursive: true });
  const grand = batiments.filter(b => b.hauteur !== null).sort((a, b) => b.hauteur - a.hauteur)[0];
  const p = await page.evaluate(i => window.__jeu.pointSurBatiment(i), grand.id);
  await page.evaluate(i => window.__jeu.selectionner(i), grand.id);
  await page.evaluate(c => window.__jeu.camera({ cibleLonLat: c, distance: 450, azimut: 0.7, inclinaison: 1.1 }), p.lonLat);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${o.capture}/selection-3d.png` });
  await page.evaluate(() => window.__jeu.vue('2d'));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${o.capture}/selection-2d.png` });
}
await nav.close();
serveur.close();
point(!erreurs.length, `aucune erreur dans la console${erreurs.length ? ` : ${erreurs.slice(0, 5).join(' | ')}` : ''}`);
process.exit(bilan.every(Boolean) ? 0 : 1);
