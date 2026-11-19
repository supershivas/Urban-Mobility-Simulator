// Le critère de la v0.6 (« le trafic bouge », Jérôme, v0.5.0) : « le trafic circule sur les voies
// et raccords réels et réagit tout de suite aux modifications du joueur ».
//
//   node outils/critere-v06.mjs
//
// Vérifie, dans le vrai jeu (?debug=1, Chromium 1280 × 800) :
//   1. la partie s'ouvre en 3D, le trafic tourne, la scène dessine autant de blocs qu'il y en a en route ;
//   2. les chemins du trafic sont continus (le bout de chacun touche le début du suivant, à 1 cm) ;
//   3. en direct : le tronçon le plus chargé perd toutes ses voies automobiles → plus une voiture n'y
//      roule (y compris après 2 minutes simulées) ; Ctrl+Z → elles y reviennent ;
//   4. un carrefour chargé passe aux feux : des blocs s'y arrêtent au rouge ;
//   5. Espace met en pause (le temps simulé ne bouge plus), Espace reprend, X double la vitesse ;
//      le menu ouvert met aussi en pause ;
//   6. même graine, même trafic (deux parties neuves, même bilan après 3 minutes) ; 1 minute simulée
//      (1 200 pas) se calcule en moins d'une seconde dans le conteneur ; aucune erreur dans la console.
// Code de sortie 1 si un point échoue.
import { servir, lancerChromium, CIBLES } from './navigateur.mjs';

const serveur = await servir('.');
const nav = await lancerChromium();
const page = await (await nav.newContext(CIBLES.bureau)).newPage();
const erreurs = [];
page.on('pageerror', e => erreurs.push(e.message));
page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text()); });
const J = (f, ...a) => page.evaluate(f, ...a);
const bilan = [];
const point = (ok, texte, details = []) => { bilan.push(ok); console.log(`${ok ? '✓' : '✗'} ${texte}`); for (const d of details.slice(0, 12)) console.log(`    ${d}`); };
const attendre = ms => page.waitForTimeout(ms);

async function nouvelle() {
  await page.goto(`${serveur.base}index.html?debug=1`);
  await page.waitForFunction(() => window.__jeu?.pret);
  await J(() => window.__jeu.pret());
  await page.evaluate(() => localStorage.clear());
  await page.click('#nouvelle');
  await page.waitForFunction(() => window.__jeu.state().scenePreteMs && window.__jeu.trafic(), null, { timeout: 60000 });
}

// ─── 1. Ouverture en 3D, trafic dessiné ─────────────────────────────────────
await nouvelle();
await J(() => window.__jeu.pauseTrafic(true));
await J(() => window.__jeu.avancerTrafic(2400));
await attendre(300);
const t1 = await J(() => window.__jeu.trafic());
const blocs = await J(() => window.__jeu.blocs3d());
const dessines = Object.values(blocs).reduce((a, b) => a + b.n, 0);
point((await J(() => window.__jeu.state().mode)) === '3d' && t1.enCirculation > 50 && dessines === t1.enCirculation,
  `la partie s'ouvre en 3D ; ${t1.enCirculation} blocs en route après 2 minutes, ${dessines} dessinés (${JSON.stringify(Object.fromEntries(Object.entries(blocs).map(([m, b]) => [m, b.n])))})`);

// ─── 2. Continuité des chemins ──────────────────────────────────────────────
const chemins = await J(() => window.__jeu.cheminsTrafic());
const trous = [];
for (const [k, c] of Object.entries(chemins)) for (const s of c.suivants) { const d = Math.hypot(c.fin[0] - chemins[s].debut[0], c.fin[1] - chemins[s].debut[1]); if (d > 0.01) trous.push(`${k} → ${s} : ${d.toFixed(3)} m`); }
point(!trous.length, `${Object.keys(chemins).length} chemins continus (voies et raccords)`, trous);

// ─── 3. Une modification se voit tout de suite ─────────────────────────────
await J(() => window.__jeu.vue('2d'));
const charge = await J(() => {
  const n = new Map();
  for (const v of window.__jeu.vehicules()) if (v.mode === 'voiture' && v.chemin.includes('|')) { const t = v.chemin.split(':')[0]; n.set(t, (n.get(t) ?? 0) + 1); }
  const editables = new Set(window.__jeu.editables());
  return [...n].filter(([t]) => editables.has(t)).sort((a, b) => b[1] - a[1])[0];
});
const pb3 = [];
if (!charge) pb3.push('aucun tronçon éditable chargé');
else {
  const [id, avant] = charge;
  await J(t => window.__jeu.editer(t), id);
  const s = await J(t => window.__jeu.section(t), id);
  for (const [i, b] of s.bandes.entries()) if (['chaussee', 'voiture'].includes(b.type)) await J(([k]) => window.__jeu.operation('changerType', k, 'trottoir'), [i]);
  await J(() => window.__jeu.fermerEditeur());
  await J(() => window.__jeu.reconstruireTrafic());
  const voitures = () => J(t => window.__jeu.vehicules().filter(v => v.mode === 'voiture' && v.chemin.startsWith(`${t}:`)).length, id);
  const tout = await voitures();
  await J(() => window.__jeu.avancerTrafic(2400));
  const apres = await voitures();
  if (tout || apres) pb3.push(`${id} : ${tout} voitures juste après, ${apres} deux minutes plus tard`);
  await page.locator('#carte canvas').focus();
  let n = 0;
  while (Object.keys((await J(() => window.__jeu.scenario())).sections).length && n < 50) { await page.keyboard.press('Control+z'); n++; }
  await J(() => window.__jeu.reconstruireTrafic());
  await J(() => window.__jeu.avancerTrafic(2400));
  const revenues = await voitures();
  if (!revenues) pb3.push(`${id} : aucune voiture revenue après Ctrl+Z × ${n}`);
  point(!pb3.length, `${id} (${avant} voitures) : sans voie automobile, ${tout} voiture tout de suite et ${apres} après 2 min ; Ctrl+Z, ${revenues} reviennent`, pb3);
}
if (pb3.length && !charge) point(false, 'modification en direct', pb3);

// ─── 4. Feux : des blocs s'arrêtent au rouge ───────────────────────────────
const noeud = await J(() => {
  // Le carrefour modifiable qui a le plus de blocs sur ses voies entrantes
  const parNoeud = new Map();
  for (const id of window.__jeu.carrefoursModifiables()) {
    const c = window.__jeu.carrefour(id);
    const voies = new Set(c.voies.filter(v => v.entrante).map(v => v.id));
    parNoeud.set(id, window.__jeu.vehicules().filter(v => voies.has(v.chemin.split('|')[0])).length);
  }
  return [...parNoeud].sort((a, b) => b[1] - a[1])[0][0];
});
await J(i => window.__jeu.editerCarrefour(i), noeud);
await J(() => window.__jeu.operationCarrefour('definirRegulation', 'feux'));
await J(() => window.__jeu.fermerCarrefour());
await J(() => window.__jeu.reconstruireTrafic());
let arretes = 0;
for (let k = 0; k < 12; k++) {
  await J(() => window.__jeu.avancerTrafic(100));
  arretes = Math.max(arretes, await J(i => {
    const c = window.__jeu.carrefour(i), voies = new Set(c.voies.filter(v => v.entrante).map(v => v.id));
    return window.__jeu.vehicules().filter(v => voies.has(v.chemin.split('|')[0]) && v.v < 0.5).length;
  }, noeud));
}
point(arretes > 0, `${noeud} passé aux feux : jusqu'à ${arretes} blocs arrêtés à ses approches`);

// ─── 5. Pause, vitesse, menu ───────────────────────────────────────────────
await J(() => window.__jeu.pauseTrafic(false));
await page.locator('#carte canvas').focus();
const temps = () => J(() => window.__jeu.trafic().temps);
await attendre(500);
await page.keyboard.press(' ');
const a5 = await temps(); await attendre(800); const b5 = await temps();
await page.keyboard.press(' ');
const c5 = await temps(); await attendre(1000); const d5 = await temps();
await page.keyboard.press('x');
const e5 = await temps(); await attendre(1000); const f5 = await temps();
await J(() => window.__jeu.selectionner(null));
await page.keyboard.press('Escape');
const menu = await J(() => document.getElementById('dialogue-pause').open);
const g5 = await temps(); await attendre(800); const h5 = await temps();
await page.keyboard.press('Escape');
const ok5 = b5 === a5 && d5 > c5 && (f5 - e5) > (d5 - c5) * 1.3 && menu && h5 === g5;
point(ok5, `Espace : pause (${(b5 - a5).toFixed(2)} s simulées en 0,8 s), reprise (${(d5 - c5).toFixed(2)} s en 1 s) ; X : ${(f5 - e5).toFixed(2)} s en 1 s ; menu ouvert : ${(h5 - g5).toFixed(2)} s`);

// ─── 6. Déterminisme, temps de calcul ──────────────────────────────────────
const unePartie = async () => {
  await nouvelle();
  await J(() => window.__jeu.relancerTrafic());
  return J(() => { const t = performance.now(); window.__jeu.avancerTrafic(3600); return { ms: Math.round(performance.now() - t), bilan: window.__jeu.trafic() }; });
};
const p1 = await unePartie(), p2 = await unePartie();
const meme = ['entres', 'sortis', 'sansIssue', 'enCirculation'].every(k => p1.bilan[k] === p2.bilan[k]);
const parMinute = Math.round(Math.max(p1.ms, p2.ms) / 3);
point(meme && parMinute < 1000, `même graine, même bilan (${p1.bilan.entres} entrés, ${p1.bilan.enCirculation} en route : ${meme ? 'oui' : 'non'}) ; 1 minute simulée en ${parMinute} ms`);

await nav.close();
serveur.close();
point(!erreurs.length, `aucune erreur dans la console${erreurs.length ? ` : ${erreurs.slice(0, 5).join(' | ')}` : ''}`);
process.exit(bilan.every(Boolean) ? 0 : 1);
