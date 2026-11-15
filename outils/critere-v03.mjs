// Le critère de la v0.3 : « une modification en 2D se retrouve en 3D sans
// chevauchement ni dépassement non autorisé » (pitch, sprint 3).
//
//   node outils/critere-v03.mjs                → 8 tronçons éditables, graine 1
//   node outils/critere-v03.mjs --n 20 --graine 7
//
// Vérifie, dans le vrai jeu (?debug=1, Chromium 1280 × 800) :
//   1. N tronçons éditables tirés au sort : l'éditeur s'ouvre par le bouton de l'inspecteur ;
//      une limite glissée à la souris, une bande ajoutée par les commandes de l'éditeur, puis
//      des opérations tirées au sort (largeur, ajout, retrait, division, déplacement, type, sens) ;
//   2. après chaque tronçon : somme des bandes ≤ emprise, bandes contiguës (aucun chevauchement),
//      et les mêmes bandes, aux mêmes bords, sur la carte (source MapLibre) et dans la scène 3D ;
//   3. un dépassement est refusé à voix haute (message de l'éditeur) et ne change rien ;
//   4. Ctrl+Z jusqu'au bout ramène l'état mesuré ; Ctrl+Y retrouve le scénario ;
//   5. le scénario survit à un rechargement (Continuer) ; aucune erreur dans la console.
// Code de sortie 1 si un point échoue.
import { servir, lancerChromium, CIBLES, options } from './navigateur.mjs';

const o = options(process.argv.slice(2), { n: '8', graine: '1' });
const N = Number(o.n);
function tirage(graine) {
  let a = graine >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const alea = tirage(Number(o.graine));
const tirer = (liste, n) => { const out = []; while (out.length < Math.min(n, liste.length)) { const x = liste[Math.floor(alea() * liste.length)]; if (!out.includes(x)) out.push(x); } return out; };

const serveur = await servir('.');
const nav = await lancerChromium();
const contexte = await nav.newContext(CIBLES.bureau);
const page = await contexte.newPage();
const erreurs = [];
page.on('pageerror', e => erreurs.push(e.message));
page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text()); });
const J = (f, ...a) => page.evaluate(f, ...a);
const bilan = [];
const point = (ok, texte, details = []) => { bilan.push(ok); console.log(`${ok ? '✓' : '✗'} ${texte}`); for (const d of details) console.log(`    ${d}`); };

await page.goto(`${serveur.base}index.html?debug=1`);
await page.waitForFunction(() => window.__jeu?.pret);
await J(() => window.__jeu.pret());
await J(() => window.__jeu.jouer());

const editables = await J(() => window.__jeu.editables());
const rues = await J(async () => Object.fromEntries((await (await fetch('data/processed/streets.geojson')).json()).features.map(f => [f.properties.id, f.geometry.coordinates])));
const milieu = l => { const k = Math.floor((l.length - 1) / 2); return [(l[k][0] + l[k + 1][0]) / 2, (l[k][1] + l[k + 1][1]) / 2]; };
const dm = m => Math.round(m * 10);
const TYPES = ['trottoir', 'cyclable', 'bus', 'voiture', 'stationnement', 'plante', 'terre-plein', 'separation'];

// Contrôle d'une section : somme ≤ emprise, bandes contiguës depuis l'axe
function controler(s) {
  const pb = [];
  const somme = s.bandes.reduce((t, b) => t + dm(b.largeur), 0);
  if (somme > dm(s.emprise)) pb.push(`dépasse l'emprise de ${(somme - dm(s.emprise)) / 10} m`);
  if (s.bandes.some(b => dm(b.largeur) < 3)) pb.push('bande sous 0,3 m');
  return pb;
}
// Mêmes bandes, mêmes bords, sur la carte et dans la scène, pour un tronçon
function comparer(id, s, d2, d3) {
  const pb = [];
  const cles = s.bandes.map(b => `${id}:${b.id}`);
  let bord = null;
  for (const k of cles) {
    const a = d2[k], b = d3?.[k];
    if (!a) { pb.push(`${k} absent de la carte`); continue; }
    if (!b) { pb.push(`${k} absent de la 3D`); continue; }
    if (a.gauche !== b.gauche || a.droite !== b.droite || a.type !== b.type) pb.push(`${k} : carte ${a.gauche}/${a.droite} ≠ 3D ${b.gauche}/${b.droite}`);
    if (bord !== null && dm(a.gauche) !== dm(bord)) pb.push(`${k} : chevauchement ou trou (${bord} → ${a.gauche})`);
    bord = a.droite;
  }
  const enTrop = Object.keys(d2).filter(k => k.startsWith(`${id}:`) && !cles.includes(k));
  if (enTrop.length) pb.push(`bandes en trop sur la carte : ${enTrop.join(', ')}`);
  return pb;
}

// ─── 1–3. Éditions sur N tronçons ──────────────────────────────────────────
const echecs = [];
let ops = 0, refusOk = 0, refusTotal = 0;
const choisis = tirer(editables, N);
for (const id of choisis) {
  const pb = [];
  await J(([c]) => window.__jeu.allerA(c, 18), [milieu(rues[id])]);
  await J(i => window.__jeu.selectionner(i), id);
  await page.click('#editer-section');
  if ((await J(() => window.__jeu.editeurOuvert())) !== id) { echecs.push(`${id} : l'éditeur ne s'est pas ouvert`); continue; }
  // a. une limite glissée à la souris (vers la droite, puis un peu à gauche)
  const h = await page.locator('.editeur-limite').first().boundingBox();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + 40, h.y + h.height / 2, { steps: 5 });
  await page.mouse.move(h.x + 25, h.y + h.height / 2, { steps: 3 });
  await page.mouse.up();
  const apres = await J(i => window.__jeu.section(i), id);
  if (!(await J(i => !!window.__jeu.scenario().sections[i], id))) pb.push('le glisser n\'a rien modifié');
  // b. de la place par la largeur (champ), puis une piste ajoutée par le bouton « Ajouter »
  const large = apres.bandes.reduce((m, b, k) => (b.largeur > apres.bandes[m].largeur ? k : m), 0);
  await page.locator(`.editeur-bande[data-bande="${apres.bandes[large].id}"]`).click();
  await page.fill('.editeur-largeur', String(Math.max(0.3, Math.round((apres.bandes[large].largeur - 1.8) * 10) / 10)));
  await page.press('.editeur-largeur', 'Enter');
  await page.locator('.editeur-outils .editeur-groupe').last().locator('select').selectOption('cyclable');
  await page.locator('.editeur-outils .editeur-groupe').last().locator('button').click();
  const avecPiste = await J(i => window.__jeu.section(i), id);
  if (!avecPiste.bandes.some(b => b.type === 'cyclable')) pb.push('la piste n\'a pas été ajoutée par l\'éditeur');
  // c. un dépassement : refusé à voix haute, rien ne change
  refusTotal++;
  const avant = JSON.stringify(await J(i => window.__jeu.section(i), id));
  const r = await J(([e]) => window.__jeu.operation('definirLargeur', 0, e + 1), [avecPiste.emprise]);
  const msg = await J(() => document.querySelector('.editeur-message')?.textContent ?? '');
  if (r?.refus === 'emprise-de' && JSON.stringify(await J(i => window.__jeu.section(i), id)) === avant) refusOk++;
  else pb.push(`dépassement non refusé (${JSON.stringify(r)})`);
  if (r?.refus && !/emprise|right-of-way/i.test(msg)) pb.push(`refus muet (message : « ${msg} »)`);
  // d. des opérations tirées au sort
  for (let k = 0; k < 12; k++) {
    const s = await J(i => window.__jeu.section(i), id);
    const i = Math.floor(alea() * s.bandes.length);
    const choix = [
      ['deplacerLimite', i, Math.round((alea() - 0.5) * 40) / 10], ['definirLargeur', i, Math.round(alea() * 60) / 10],
      ['ajouter', TYPES[Math.floor(alea() * TYPES.length)], i], ['retirer', i], ['deplacer', i, alea() < 0.5 ? -1 : 1],
      ['diviser', i], ['changerType', i, TYPES[Math.floor(alea() * TYPES.length)]], ['changerSens', i, ['aller', 'retour', 'double'][Math.floor(alea() * 3)]],
    ][Math.floor(alea() * 8)];
    await J(c => window.__jeu.operation(...c), choix);
    ops++;
  }
  // 2. contrôles : règles, puis mêmes bandes dans les deux vues
  const s = await J(i => window.__jeu.section(i), id);
  pb.push(...controler(s));
  await J(([c]) => window.__jeu.allerA(c, 18), [milieu(rues[id])]);
  const d2 = await J(() => window.__jeu.sections2d());
  await J(() => window.__jeu.vue('3d'));
  const d3 = await J(() => window.__jeu.sections3d());
  await J(() => window.__jeu.vue('2d'));
  pb.push(...comparer(id, s, d2, d3));
  if (pb.length) echecs.push(`${id} : ${pb.join(' ; ')}`);
}
point(!echecs.length, `${choisis.length - echecs.length}/${choisis.length} tronçons édités (glisser, champ, ajout, ${ops} opérations tirées) : emprise respectée, mêmes bandes sans chevauchement en 2D et en 3D`, echecs);
point(refusOk === refusTotal, `dépassement refusé à voix haute et sans effet : ${refusOk}/${refusTotal}`);

// ─── 4. Annuler jusqu'au bout, puis tout rétablir ──────────────────────────
const scenario = await J(() => window.__jeu.scenario());
await page.locator('#carte canvas').focus();
let n = 0;
while (Object.keys((await J(() => window.__jeu.scenario())).sections).length && n < 2000) { await page.keyboard.press('Control+z'); n++; }
const vide = Object.keys((await J(() => window.__jeu.scenario())).sections).length === 0;
for (let k = 0; k < n; k++) await page.keyboard.press('Control+y');
const retrouve = JSON.stringify(await J(() => window.__jeu.scenario())) === JSON.stringify(scenario);
point(vide && retrouve, `Ctrl+Z × ${n} ramène l'état mesuré (${vide ? 'oui' : 'non'}) ; Ctrl+Y × ${n} retrouve le scénario (${retrouve ? 'oui' : 'non'})`);

// ─── 5. Rechargement : le scénario est la même partie ──────────────────────
await J(() => window.__jeu.fermerEditeur());
await page.reload();
await page.waitForFunction(() => window.__jeu?.pret);
await J(() => window.__jeu.pret());
await page.click('#continuer');
await page.waitForFunction(() => window.__jeu.state().enCarte);
const relu = await J(() => window.__jeu.scenario());
point(JSON.stringify(relu) === JSON.stringify(scenario), `scénario relu après rechargement : ${Object.keys(relu.sections).length}/${Object.keys(scenario.sections).length} sections identiques`);

await nav.close();
serveur.close();
point(!erreurs.length, `aucune erreur dans la console${erreurs.length ? ` : ${erreurs.slice(0, 5).join(' | ')}` : ''}`);
process.exit(bilan.every(Boolean) ? 0 : 1);
