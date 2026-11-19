// Le critère de la v0.7 (« construire sur la carte », Jérôme, v0.5.0) : « une voie, une direction,
// un feu se changent à la souris dans la vue, et le trafic suit ».
//
//   node outils/critere-v07.mjs                 → 6 tronçons, graine 1
//   node outils/critere-v07.mjs --n 10 --graine 4
//
// Vérifie, dans le vrai jeu (?debug=1&vue=2d, Chromium 1280 × 800), à la vraie souris :
//   1. outil « Piste » choisi dans la barre ; un clic à droite de l'axe de N tronçons éditables (2D) :
//      la bande sous le clic devient une piste, l'emprise est respectée ; Ctrl+Z défait ; Échap rend la main ;
//   2. un glisser le long d'une rue applique l'outil à chaque tronçon traversé (au moins deux) ;
//   3. en 3D : outil « Bus », un clic sur une voie au sol la change ; le glisser au bouton gauche ne bouge pas la vue ;
//   4. flèches au sol : un clic sur une flèche du carrefour choisi éteint sa direction (raccords retirés, aucun
//      chemin du trafic ne fait ce mouvement), un second clic la rallume ;
//   5. feux par le bandeau : régulation « Feux », modèle, un curseur réglé au clavier → la durée de la phase change ;
//      les flèches passent du vert au rouge au fil du cycle ; des blocs attendent au rouge ;
//   6. aucune erreur dans la console.
// Code de sortie 1 si un point échoue.
import { servir, lancerChromium, CIBLES, options } from './navigateur.mjs';
import { wgs84VersLambert, lambertVersWgs84 } from '../js/geo/coordonnees.js';

const o = options(process.argv.slice(2), { n: '6', graine: '1' });
const N = Number(o.n);
function tirage(graine) {
  let a = graine >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const alea = tirage(Number(o.graine));

const serveur = await servir('.');
const nav = await lancerChromium();
const page = await (await nav.newContext({ ...CIBLES.bureau, locale: 'fr-BE' })).newPage();
const erreurs = [];
page.on('pageerror', e => erreurs.push(e.message));
page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text()); });
const J = (f, ...a) => page.evaluate(f, ...a);
const bilan = [];
const point = (ok, texte, details = []) => { bilan.push(ok); console.log(`${ok ? '✓' : '✗'} ${texte}`); for (const d of details.slice(0, 12)) console.log(`    ${d}`); };
const attendre = ms => page.waitForTimeout(ms);

await page.goto(`${serveur.base}index.html?debug=1&vue=2d&expert=1&mission=0`);
await page.waitForFunction(() => window.__jeu?.pret);
await J(() => window.__jeu.pret());
await page.click('#nouvelle');
await page.waitForFunction(() => window.__jeu.trafic(), null, { timeout: 60000 });
await J(() => window.__jeu.pauseTrafic(true));
const rues = await J(async () => Object.fromEntries((await (await fetch('data/processed/streets.geojson')).json()).features.map(f => [f.properties.id, f.geometry.coordinates])));

// Un point à d mètres à droite (d < 0 : à gauche) de l'axe, au milieu d'un tronçon
const aCote = (id, d) => {
  const l = rues[id].map(wgs84VersLambert), k = Math.max(1, Math.floor(l.length / 2));
  const a = l[k - 1], b = l[k], u = [b[0] - a[0], b[1] - a[1]], n = Math.hypot(...u);
  const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  return lambertVersWgs84([m[0] + (u[1] / n) * d, m[1] - (u[0] / n) * d]);
};
const ecran2d = lonlat => J(x => window.__jeu.versEcran(x), lonlat);
const outilBarre = async o2 => page.click(`#barre-outils [data-outil="${o2}"]`);

// ─── 1. Outil « Piste » au clic, en 2D ──────────────────────────────────────
const editables = await J(() => window.__jeu.editables().filter(i => window.__jeu.section(i).bandes.some(b => b.type === 'chaussee' && b.largeur >= 6)));
const choisis = [];
while (choisis.length < N && editables.length) {
  const id = editables.splice(Math.floor(alea() * editables.length), 1)[0];
  const l = rues[id].map(wgs84VersLambert);
  if (Math.hypot(l.at(-1)[0] - l[0][0], l.at(-1)[1] - l[0][1]) > 50) choisis.push(id);
}
await outilBarre('cyclable');
const pb1 = [];
for (const id of choisis) {
  const cible = aCote(id, 2);
  await J(([x]) => window.__jeu.allerA(x, 19.3), [cible]);
  const vise = await J(x => window.__jeu.voieSous(x), cible);
  if (vise?.troncon !== id) { pb1.push(`${id} : le point vise ${vise?.troncon}`); continue; }
  const p = await ecran2d(cible);
  await page.mouse.click(p.x, p.y);
  await attendre(150);
  const s = await J(t => window.__jeu.section(t), id);
  let g = s.axe, bande = null;
  for (const b of s.bandes) { if (vise.decalage <= g + 1e-6 && vise.decalage >= g - b.largeur - 1e-6) { bande = b; break; } g -= b.largeur; }
  const somme = s.bandes.reduce((a, b) => a + b.largeur, 0);
  if (bande?.type !== 'cyclable') pb1.push(`${id} : la bande sous le clic est ${bande?.type}`);
  if (somme > s.emprise + 1e-6) pb1.push(`${id} : emprise dépassée`);
}
const nModifies = Object.keys((await J(() => window.__jeu.scenario())).sections).length;
await page.keyboard.press('Control+z');
const apresZ = Object.keys((await J(() => window.__jeu.scenario())).sections).length;
await page.keyboard.press('Control+y');
await page.keyboard.press('Escape');
const plusDOutil = (await J(() => window.__jeu.outil())) === null || !(await J(() => document.querySelector('#barre-outils [data-outil="cyclable"]').getAttribute('aria-pressed') === 'true'));
if (apresZ !== nModifies - 1) pb1.push(`Ctrl+Z : ${nModifies} → ${apresZ} sections modifiées`);
if (!plusDOutil) pb1.push('Échap ne rend pas la main');
point(!pb1.length, `${choisis.length} tronçons : clic à 2 m à droite de l'axe → piste sous le clic, emprise respectée ; Ctrl+Z défait ; Échap rend la main`, pb1);

// ─── 2. Glisser le long d'une rue ───────────────────────────────────────────
const rue = await J(() => {
  // Deux tronçons éditables qui se suivent (même nœud), sur la même rue
  const ed = new Set(window.__jeu.editables().filter(i => window.__jeu.section(i).bandes.some(b => b.type === 'chaussee')));
  for (const id of window.__jeu.carrefoursModifiables()) {
    const b = window.__jeu.carrefour(id).branches.map(x => x.troncon).filter(t => ed.has(t));
    if (b.length >= 2) return { noeud: id, troncons: b.slice(0, 2) };
  }
  return null;
});
const avant2 = new Set(Object.keys((await J(() => window.__jeu.scenario())).sections));
await outilBarre('bus');
const a2 = aCote(rue.troncons[0], 1.5), b2 = aCote(rue.troncons[1], 1.5);
await J(([x]) => window.__jeu.allerA(x, 17.5), [lambertVersWgs84(wgs84VersLambert(a2).map((v, i) => (v + wgs84VersLambert(b2)[i]) / 2))]);
const pa = await ecran2d(a2), pb = await ecran2d(b2);
const centre0 = await J(() => window.__jeu.state().centre);
await page.mouse.move(pa.x, pa.y);
await page.mouse.down();
for (let k = 1; k <= 20; k++) await page.mouse.move(pa.x + ((pb.x - pa.x) * k) / 20, pa.y + ((pb.y - pa.y) * k) / 20);
await page.mouse.up();
await attendre(150);
const peints = Object.keys((await J(() => window.__jeu.scenario())).sections).filter(t => !avant2.has(t) || rue.troncons.includes(t));
const touches = rue.troncons.filter(t => peints.includes(t));
const bouge = JSON.stringify(await J(() => window.__jeu.state().centre)) !== JSON.stringify(centre0);
point(touches.length === 2 && !bouge, `glisser de ${rue.troncons[0]} à ${rue.troncons[1]} (outil « Bus ») : ${touches.length}/2 tronçons changés, la carte ${bouge ? 'a bougé' : 'est restée en place'}`);
await page.keyboard.press('Escape');

// ─── 3. En 3D ───────────────────────────────────────────────────────────────
await J(() => window.__jeu.vue('3d'));
await page.waitForFunction(() => window.__jeu.state().scenePreteMs, null, { timeout: 60000 });
const id3 = choisis.find(t => !rue.troncons.includes(t)) ?? choisis[0];
const c3 = aCote(id3, -2);
await J(([x]) => window.__jeu.camera({ cibleLonLat: x, distance: 60, azimut: 0.3, inclinaison: 0.6 }), [c3]);
await outilBarre('bus');
const vise3 = await J(x => window.__jeu.voieSous(x), c3);
const p3 = await J(x => window.__jeu.versEcran3d(x), c3);
const cam0 = await J(() => window.__jeu.state().camera.cible);
await page.mouse.move(p3.x, p3.y);
await page.mouse.down();
await page.mouse.move(p3.x + 2, p3.y + 1);
await page.mouse.up();
await attendre(200);
const s3 = await J(t => window.__jeu.section(t), id3);
let g3 = s3.axe, b3 = null;
for (const b of s3.bandes) { if (vise3.decalage <= g3 + 1e-6 && vise3.decalage >= g3 - b.largeur - 1e-6) { b3 = b; break; } g3 -= b.largeur; }
const cam1 = await J(() => window.__jeu.state().camera.cible);
point(b3?.type === 'bus' && JSON.stringify(cam0) === JSON.stringify(cam1), `3D : clic au sol à 2 m à gauche de l'axe de ${id3} → ${b3?.type} ; la vue ${JSON.stringify(cam0) === JSON.stringify(cam1) ? 'reste en place' : 'a bougé'}`);
await page.keyboard.press('Escape');
await J(() => window.__jeu.vue('2d'));

// ─── 4. Flèches au sol ─────────────────────────────────────────────────────
const noeud = rue.noeud;
const cn = await J(async i => (await (await fetch('data/processed/intersections.geojson')).json()).features.find(f => f.properties.id === i).geometry.coordinates, noeud);
await J(([x, i]) => { window.__jeu.selectionner(i); return window.__jeu.allerA(x, 19.5); }, [cn, noeud]);
await attendre(300);
const f0 = (await J(() => window.__jeu.fleches())).find(f => f.actif);
const pb4 = [];
if (!f0) pb4.push('aucune flèche allumée');
else {
  const pf = await ecran2d(f0.pointe);
  await page.mouse.click(pf.x, pf.y);
  await attendre(200);
  await J(() => window.__jeu.reconstruireTrafic());
  const eteinte = (await J(() => window.__jeu.fleches())).find(f => f.voie === f0.voie && f.troncon === f0.troncon);
  const mvt = `${f0.voie.split(':')[0]}>${f0.troncon}`;
  const chemins = await J(() => window.__jeu.cheminsTrafic());
  const encore = Object.keys(chemins).filter(k => k.startsWith(`${noeud}/${f0.voie}>${f0.troncon}:`)).length;
  if (eteinte?.actif !== false) pb4.push('la flèche ne s\'éteint pas');
  if (encore) pb4.push(`${encore} chemin(s) du trafic font encore ${mvt}`);
  await page.mouse.click(pf.x, pf.y);
  await attendre(200);
  const rallumee = (await J(() => window.__jeu.fleches())).find(f => f.voie === f0.voie && f.troncon === f0.troncon);
  if (!rallumee?.actif) pb4.push('le second clic ne la rallume pas');
}
point(!pb4.length, `flèche ${f0?.direction} de ${f0?.voie} vers ${f0?.troncon} : éteinte au clic (raccords et trafic), rallumée au second clic`, pb4);

// ─── 5. Feux par le bandeau ─────────────────────────────────────────────────
await page.locator('#carte canvas').focus();
await page.keyboard.press('m');
await attendre(200);
await page.selectOption('.carrefour-regulation select', 'feux');
await attendre(200);
const modeles = await J(() => [...document.querySelectorAll('.feux select option')].map(x => x.value));
if (modeles.length > 1) { await page.selectOption('.feux select', modeles.at(-1)); await attendre(150); }
const curseur = page.locator('.feux-phase input[type="range"]').first();
const v0 = Number(await curseur.inputValue());
await curseur.focus();
for (let k = 0; k < 5; k++) await page.keyboard.press('ArrowRight');
await curseur.evaluate(e => e.dispatchEvent(new Event('change')));
await attendre(150);
const feux = (await J(i => window.__jeu.carrefour(i), noeud)).carrefour?.feux;
await page.keyboard.press('Escape');
await J(() => window.__jeu.reconstruireTrafic());
let vertVu = false, rougeVu = false, attente = 0;
for (let k = 0; k < 40; k++) {
  await J(() => window.__jeu.avancerTrafic(60));
  const fl = await J(() => window.__jeu.fleches());
  if (fl.some(f => f.actif && f.couleur === '#5E9E95')) vertVu = true;
  if (fl.some(f => f.actif && f.couleur === '#D9442B')) rougeVu = true;
  attente = Math.max(attente, await J(i => {
    const c = window.__jeu.carrefour(i), voies = new Set(c.voies.filter(v => v.entrante).map(v => v.id));
    return window.__jeu.vehicules().filter(v => voies.has(v.chemin.split('|')[0]) && v.v < 0.5).length;
  }, noeud));
}
const ok5 = feux && feux.verts[0] === v0 + 5 && vertVu && rougeVu;
point(ok5, `feux posés au bandeau (modèle ${feux?.modele}, phase 1 : ${v0} → ${feux?.verts?.[0]} s) ; flèches vertes ${vertVu ? 'puis' : 'jamais'} rouges${rougeVu ? '' : ' (jamais)'} ; jusqu'à ${attente} blocs à l'arrêt aux approches`);

await nav.close();
serveur.close();
point(!erreurs.length, `aucune erreur dans la console${erreurs.length ? ` : ${erreurs.slice(0, 5).join(' | ')}` : ''}`);
process.exit(bilan.every(Boolean) ? 0 : 1);
