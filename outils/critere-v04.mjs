// Le critère de la v0.4 : « les voies créées dans les tronçons restent correctement
// connectées aux intersections » (pitch, sprint 4).
//
//   node outils/critere-v04.mjs                → 8 carrefours, graine 1
//   node outils/critere-v04.mjs --n 20 --graine 7
//
// Vérifie, dans le vrai jeu (?debug=1, Chromium 1280 × 800) :
//   1. N carrefours modifiables tirés au sort : un clic sur le nœud le choisit, le bouton de
//      l'inspecteur ouvre l'éditeur ; chaque raccord relie une voie entrante à une voie sortante
//      existante d'un mode compatible, et part / arrive au point d'attache de sa voie, sur la
//      carte comme en 3D (mêmes extrémités à 1 cm) ;
//   2. une branche par carrefour est redécoupée dans l'éditeur de section (chaussée → deux voies
//      automobiles, plus une piste) : de retour au carrefour, chaque nouvelle voie entrante qui
//      a une issue compatible est raccordée, aucun raccord ne vise une voie disparue ;
//   3. au clavier et à la souris : une voie entrante choisie, un raccord détaché puis rattaché ;
//      un demi-tour refusé à voix haute ; un passage piéton posé et dessiné ;
//   4. Ctrl+Z jusqu'au bout ramène un scénario vide, Ctrl+Y le retrouve ; le scénario survit à
//      un rechargement (Continuer) ; aucune erreur dans la console.
// Code de sortie 1 si un point échoue.
import { servir, lancerChromium, CIBLES, options } from './navigateur.mjs';

const o = options(process.argv.slice(2), { n: '8', graine: '1' });
const N = Number(o.n);
function tirage(graine) {
  let a = graine >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const alea = tirage(Number(o.graine));

const serveur = await servir('.');
const nav = await lancerChromium();
const contexte = await nav.newContext(CIBLES.bureau);
const page = await contexte.newPage();
const erreurs = [];
page.on('pageerror', e => erreurs.push(e.message));
page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text()); });
const J = (f, ...a) => page.evaluate(f, ...a);
const bilan = [];
const point = (ok, texte, details = []) => { bilan.push(ok); console.log(`${ok ? '✓' : '✗'} ${texte}`); for (const d of details.slice(0, 12)) console.log(`    ${d}`); };

await page.goto(`${serveur.base}index.html?debug=1&vue=2d&expert=1&mission=0`);
await page.waitForFunction(() => window.__jeu?.pret);
await J(() => window.__jeu.pret());
await J(() => window.__jeu.jouer());
await page.waitForFunction(() => window.__jeu.state().enCarte);

const COMPATIBLES = { voiture: ['voiture', 'general'], general: ['general', 'voiture'], bus: ['bus', 'voiture', 'general'], cyclable: ['cyclable', 'voiture', 'general'] };
const noeuds = await J(async () => Object.fromEntries((await (await fetch('data/processed/intersections.geojson')).json()).features.map(f => [f.properties.id, f.geometry.coordinates])));
const editables = new Set(await J(() => window.__jeu.editables()));
// Carrefours d'au moins trois branches dont une au moins a une emprise mesurée (redécoupable)
const candidats = [];
for (const id of await J(() => window.__jeu.carrefoursModifiables())) {
  const c = await J(i => window.__jeu.carrefour(i), id);
  if (c.branches.length >= 3 && c.branches.some(b => editables.has(b.troncon))) candidats.push(id);
  if (candidats.length > 200) break;
}
const choisis = [];
while (choisis.length < Math.min(N, candidats.length)) { const x = candidats[Math.floor(alea() * candidats.length)]; if (!choisis.includes(x)) choisis.push(x); }

// Mètres entre deux [lon, lat] (assez juste à cette échelle)
const ecart = (a, b) => Math.hypot((a[0] - b[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 110540);

// Contrôle complet d'un carrefour : raccords valides, mêmes extrémités que les ancres, en 2D puis en 3D
async function controler(id) {
  const pb = [];
  const c = await J(i => window.__jeu.carrefour(i), id);
  const voies = new Map(c.voies.map(v => [v.id, v]));
  for (const r of c.raccords) {
    const a = voies.get(r.de), b = voies.get(r.vers);
    if (!a || !b) pb.push(`${r.de}>${r.vers} vise une voie absente`);
    else if (!a.entrante || !b.sortante || a.troncon === b.troncon || !COMPATIBLES[a.mode].includes(b.mode)) pb.push(`${r.de}>${r.vers} incohérent`);
  }
  if (c.verif.invalides.length) pb.push(`invalides : ${c.verif.invalides.join(', ')}`);
  const ancres = await J(i => window.__jeu.ancres(i), id);
  const d2 = await J(() => window.__jeu.raccords2d());
  const cles = c.raccords.map(r => `${r.de}>${r.vers}`).sort();
  if (JSON.stringify(Object.keys(d2.raccords).sort()) !== JSON.stringify(cles)) pb.push(`carte : ${Object.keys(d2.raccords).length} raccords pour ${cles.length}`);
  const nonDessines = cles.filter(k => !d2.dessines.includes(k));
  if (nonDessines.length) pb.push(`${nonDessines.length} raccord(s) absents des tuiles de la carte`);
  await J(() => window.__jeu.vue('3d'));
  const d3 = await J(() => window.__jeu.raccords3d());
  await J(() => window.__jeu.vue('2d'));
  for (const k of cles) {
    const [de, vers] = k.split('>');
    const a = d2.raccords[k], b = d3?.[k];
    if (!a || !b) { pb.push(`${k} absent ${!a ? 'de la carte' : 'de la 3D'}`); continue; }
    if (ecart(a.debut, ancres[de]) > 0.01 || ecart(a.fin, ancres[vers]) > 0.01) pb.push(`${k} : la carte ne part pas de l'ancre de sa voie`);
    if (ecart(a.debut, b.debut) > 0.01 || ecart(a.fin, b.fin) > 0.01) pb.push(`${k} : carte ≠ 3D (${ecart(a.debut, b.debut).toFixed(3)} m)`);
  }
  return { pb, c };
}

// Une voie entrante a-t-elle une issue possible (une voie sortante compatible sur une autre branche) ?
const aUneIssue = (c, v) => c.voies.some(s => s.sortante && s.troncon !== v.troncon && COMPATIBLES[v.mode].includes(s.mode));

// ─── 1–2. Carrefours tirés au sort, puis une branche redécoupée ────────────
const echecs = [];
let raccordsVus = 0, nouvellesVoies = 0;
for (const id of choisis) {
  const pb = [];
  await J(([c]) => window.__jeu.allerA(c, 19), [noeuds[id]]);
  const p = await J(([c]) => window.__jeu.versEcran(c), [noeuds[id]]);
  await page.waitForTimeout(600); // deux clics rapprochés feraient un double-clic (zoom)
  await page.mouse.click(p.x, p.y);
  if ((await J(() => window.__jeu.state().selection)) !== id) { echecs.push(`${id} : le clic sur le nœud ne l'a pas choisi (${await J(() => window.__jeu.state().selection)})`); continue; }
  await page.click('#editer-carrefour');
  if ((await J(() => window.__jeu.editeurCarrefourOuvert())) !== id) { echecs.push(`${id} : l'éditeur de carrefour ne s'est pas ouvert`); continue; }
  const r1 = await controler(id);
  pb.push(...r1.pb);
  raccordsVus += r1.c.raccords.length;
  // Une branche redécoupée dans l'éditeur de section : chaussée → deux voies automobiles (aller, retour) + une piste
  const branche = r1.c.branches.map(b => b.troncon).find(t => editables.has(t));
  await J(t => window.__jeu.editer(t), branche);
  let s = await J(t => window.__jeu.section(t), branche);
  const i = s.bandes.findIndex(b => b.type === 'chaussee');
  if (i >= 0) {
    await J(k => window.__jeu.operation('changerType', k, 'voiture'), i);
    const d = await J(k => window.__jeu.operation('diviser', k), i);
    if (!d?.refus) await J(k => window.__jeu.operation('changerSens', k + 1, 'retour'), i);
  }
  s = await J(t => window.__jeu.section(t), branche);
  const large = s.bandes.reduce((m, b, k) => (b.largeur > s.bandes[m].largeur ? k : m), 0);
  await J(([k, l]) => window.__jeu.operation('definirLargeur', k, l), [large, Math.max(0.3, Math.round((s.bandes[large].largeur - 1.8) * 10) / 10)]);
  await J(k => window.__jeu.operation('ajouter', 'cyclable', k), large);
  await J(() => window.__jeu.fermerEditeur());
  await J(i2 => window.__jeu.editerCarrefour(i2), id);
  const r2 = await controler(id);
  pb.push(...r2.pb);
  const bandes = (await J(t => window.__jeu.section(t), branche)).bandes.filter(b => ['voiture', 'bus', 'cyclable', 'chaussee'].includes(b.type)).map(b => `${branche}:${b.id}`);
  const voiesBranche = r2.c.voies.filter(v => v.troncon === branche).map(v => v.id);
  if (JSON.stringify(bandes.sort()) !== JSON.stringify(voiesBranche.sort())) pb.push(`voies de ${branche} : ${voiesBranche.join(', ')} ≠ bandes ${bandes.join(', ')}`);
  for (const v of r2.c.voies.filter(x => x.troncon === branche)) {
    nouvellesVoies++;
    if (v.entrante && aUneIssue(r2.c, v) && !r2.c.raccords.some(r => r.de === v.id)) pb.push(`${v.id} (${v.mode}) entre sans être raccordée`);
  }
  if (pb.length) echecs.push(`${id} : ${pb.join(' ; ')}`);
}
point(!echecs.length && choisis.length > 0, `${choisis.length - echecs.length}/${choisis.length} carrefours : ${raccordsVus} raccords valides aux ancres de leurs voies, mêmes extrémités en 2D et 3D ; ${nouvellesVoies} voies redécoupées restées raccordées`, echecs);

// ─── 3. Interaction : choisir une voie, détacher / rattacher, refus, traversée ─
const id = choisis[0];
await J(i => window.__jeu.editerCarrefour(i), id);
const pb3 = [];
let c = await J(i => window.__jeu.carrefour(i), id);
const entree = c.voies.find(v => v.entrante && c.raccords.some(r => r.de === v.id));
await page.locator(`.carrefour-voie.entree[data-voie="${entree.id}"]`).focus();
await page.keyboard.press('Enter');
if ((await J(() => window.__jeu.state().voieChoisie)) !== entree.id) pb3.push('Entrée n\'a pas choisi la voie entrante');
const cible = c.raccords.find(r => r.de === entree.id).vers;
await page.locator(`.carrefour-voie.sortie[data-voie="${cible}"]`).click();
c = await J(i => window.__jeu.carrefour(i), id);
if (c.raccords.some(r => r.de === entree.id && r.vers === cible)) pb3.push('le clic n\'a pas détaché le raccord');
await page.locator(`.carrefour-voie.sortie[data-voie="${cible}"]`).click();
c = await J(i => window.__jeu.carrefour(i), id);
if (!c.raccords.some(r => r.de === entree.id && r.vers === cible)) pb3.push('le second clic n\'a pas rattaché le raccord');
const memeBranche = c.voies.find(v => v.sortante && v.troncon === entree.troncon);
if (memeBranche) {
  const avant = JSON.stringify(await J(() => window.__jeu.scenario()));
  await page.locator(`.carrefour-voie.sortie[data-voie="${memeBranche.id}"]`).click();
  const msg = await J(() => document.querySelector('.carrefour-message')?.textContent ?? '');
  if (!/demi-tour|U-turn/i.test(msg)) pb3.push(`demi-tour : message « ${msg} »`);
  if (JSON.stringify(await J(() => window.__jeu.scenario())) !== avant) pb3.push('le demi-tour refusé a changé le scénario');
}
// Un passage piéton sur une branche qui a un trottoir (sa section mesurée en a un)
let pose = false;
for (const b of c.branches) {
  const s = await J(t => window.__jeu.section(t), b.troncon);
  if (!s?.bandes.some(x => x.type === 'trottoir')) continue;
  await page.locator(`.carrefour-branche[data-branche="${b.troncon}"] .carrefour-traversees select`).first().selectOption('oui');
  await J(([cc]) => window.__jeu.allerA(cc, 19), [noeuds[id]]);
  pose = (await J(() => window.__jeu.raccords2d())).traversees.some(x => x.includes(`${b.troncon}:pieton`));
  break;
}
if (!pose) pb3.push('aucun passage piéton dessiné');
// Une section modifiée ensuite ne fait pas perdre les choix du carrefour (scénario commun)
const choixAvant = JSON.stringify((await J(() => window.__jeu.scenario())).carrefours);
const brancheEditable = c.branches.map(b => b.troncon).find(t => editables.has(t));
await J(t => window.__jeu.editer(t), brancheEditable);
await J(() => window.__jeu.operation('diviser', 0));
if (JSON.stringify((await J(() => window.__jeu.scenario())).carrefours) !== choixAvant) pb3.push('modifier une section a changé les choix du carrefour');
await J(() => window.__jeu.fermerEditeur());
point(!pb3.length, 'voie choisie au clavier, raccord détaché puis rattaché à la souris, demi-tour refusé à voix haute, passage piéton dessiné, choix gardés quand une section change', pb3);

// ─── 4. Annuler jusqu'au bout, rétablir, relire ────────────────────────────
const scenario = await J(() => window.__jeu.scenario());
await page.locator('#carte canvas').focus();
const vide = s => !Object.keys(s.sections).length && !Object.keys(s.carrefours ?? {}).length;
let n = 0;
while (!vide(await J(() => window.__jeu.scenario())) && n < 2000) { await page.keyboard.press('Control+z'); n++; }
const toutAnnule = vide(await J(() => window.__jeu.scenario()));
for (let k = 0; k < n; k++) await page.keyboard.press('Control+y');
const retrouve = JSON.stringify(await J(() => window.__jeu.scenario())) === JSON.stringify(scenario);
point(toutAnnule && retrouve, `Ctrl+Z × ${n} ramène un scénario vide (${toutAnnule ? 'oui' : 'non'}) ; Ctrl+Y × ${n} le retrouve (${retrouve ? 'oui' : 'non'})`);

await J(() => window.__jeu.fermerCarrefour());
await page.reload();
await page.waitForFunction(() => window.__jeu?.pret);
await J(() => window.__jeu.pret());
await page.click('#continuer');
await page.waitForFunction(() => window.__jeu.state().enCarte);
const relu = await J(() => window.__jeu.scenario());
point(JSON.stringify(relu) === JSON.stringify(scenario), `scénario relu après rechargement : ${Object.keys(relu.carrefours ?? {}).length} carrefour(s), ${Object.keys(relu.sections).length} section(s) identiques`);

await nav.close();
serveur.close();
point(!erreurs.length, `aucune erreur dans la console${erreurs.length ? ` : ${erreurs.slice(0, 5).join(' | ')}` : ''}`);
process.exit(bilan.every(Boolean) ? 0 : 1);
