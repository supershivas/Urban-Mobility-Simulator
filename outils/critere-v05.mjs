// Le critère de la v0.5 (le pitch n'en donne pas pour le sprint 5 ; défini avec la décision
// « comptages + hypothèses, par tronçon, statique, littérature citée », Jérôme, v0.5.0) :
// « chaque indicateur affiché se recalcule depuis la section et la demande, et rien n'est
// affiché qui ne vienne d'un comptage, d'une hypothèse du joueur ou d'une référence citée ».
//
//   node outils/critere-v05.mjs                → 8 tronçons, graine 1
//   node outils/critere-v05.mjs --n 20 --graine 7
//
// Vérifie, dans le vrai jeu (?debug=1, Chromium 1280 × 800) :
//   1. les tronçons comptés ont une demande « comptage » qui vaut le comptage, l'inspecteur cite
//      le compteur, la carte les dessine ; tous les autres n'ont aucun indicateur ; l'inspecteur
//      d'un carrefour compte ses points de conflit par paire de modes ;
//   2. N tronçons éditables tirés au sort : chaussée découpée en une voie par sens, demande posée
//      au clavier dans le bandeau (F) : capacité = voies × 1 900 (× part de vert au feu), saturation
//      = demande / capacité, niveau de la carte cohérent ; une voie retirée fait monter la saturation
//      et baisser les personnes écoulées ; chaque recalcul prend moins de 50 ms ;
//   3. une saisie impossible (débit négatif) est refusée à voix haute et ne change rien ;
//   4. Ctrl+Z jusqu'au bout ramène un scénario vide, Ctrl+Y le retrouve ; le scénario (demande,
//      hypothèses) survit à un rechargement ; la barre d'état tient sur une ligne ; aucune erreur.
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
const page = await (await nav.newContext(CIBLES.bureau)).newPage();
const erreurs = [];
page.on('pageerror', e => erreurs.push(e.message));
page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text()); });
const J = (f, ...a) => page.evaluate(f, ...a);
const bilan = [];
const point = (ok, texte, details = []) => { bilan.push(ok); console.log(`${ok ? '✓' : '✗'} ${texte}`); for (const d of details.slice(0, 12)) console.log(`    ${d}`); };

await page.goto(`${serveur.base}index.html?debug=1&vue=2d`);
await page.waitForFunction(() => window.__jeu?.pret);
await J(() => window.__jeu.pret());
await page.click('#nouvelle');
await page.waitForFunction(() => window.__jeu.state().enCarte);
await page.waitForFunction(() => Object.keys(window.__jeu.flux2d()).length > 0);

// ─── 1. Comptages : traçables, et rien d'autre ─────────────────────────────
const comptages = await J(() => window.__jeu.comptages());
const pb1 = [];
for (const [id, c] of Object.entries(comptages)) {
  const e = await J(t => window.__jeu.sim(t), id);
  if (e.modes.cyclable.demande.origine !== 'comptage' || e.modes.cyclable.demande.total !== c.parHeure) pb1.push(`${id} : demande ${JSON.stringify(e.modes.cyclable.demande)}`);
  await J(t => window.__jeu.selectionner(t), id);
  const texte = await page.locator('#inspecteur-corps').innerText();
  if (!c.compteurs.every(k => texte.includes(k))) pb1.push(`${id} : l'inspecteur ne cite pas ${c.compteurs.join(', ')}`);
}
const dessines = await J(() => window.__jeu.flux2d());
if (Object.keys(dessines).sort().join() !== Object.keys(comptages).sort().join()) pb1.push(`carte : ${Object.keys(dessines).join(', ')}`);
const ids = await J(() => window.__jeu.ids());
const autres = ids.filter(i => !comptages[i]).sort(() => alea() - 0.5).slice(0, 30);
for (const id of autres) {
  const e = await J(t => window.__jeu.sim(t), id);
  if (e.renseigne || e.saturationMax !== null || e.personnes.demande !== null) pb1.push(`${id} : indicateur sans demande`);
}
point(!pb1.length, `${Object.keys(comptages).length} tronçons comptés, demande = comptage, compteur cité, dessinés ; 30 autres sans aucun indicateur`, pb1);

// ─── 1 bis. Exposition aux conflits : dans l'inspecteur d'un carrefour, jamais une prédiction ─
const modifiables = (await J(() => window.__jeu.carrefoursModifiables())).sort(() => alea() - 0.5).slice(0, 6);
const pb1b = [];
let points = 0;
for (const id of modifiables) {
  const c = await J(i => window.__jeu.conflits(i), id);
  points += c.total;
  if (c.total !== Object.values(c.paires).reduce((a, b) => a + b, 0)) pb1b.push(`${id} : total ${c.total}`);
  await J(i => window.__jeu.selectionner(i), id);
  const texte = await page.locator('#inspecteur-corps').innerText();
  if (!texte.includes(String(c.total)) || !/(conflit|conflict)/i.test(texte) || /(accident|crash) (pr[ée]vu|predicted)/i.test(texte)) pb1b.push(`${id} : inspecteur sans l'exposition`);
}
point(!pb1b.length, `${modifiables.length} carrefours : ${points} points de conflit, comptés par paire de modes dans l'inspecteur (exposition)`, pb1b);

// ─── 2. Section + demande → indicateurs, en direct ─────────────────────────
// Une seule chaussée (une chaussée séparée par un terre-plein garde une moitié « voies inconnues » : à raison)
const editables = (await J(() => window.__jeu.editables().filter(i => window.__jeu.section(i).bandes.filter(b => b.type === 'chaussee').length === 1 && window.__jeu.section(i).bandes.find(b => b.type === 'chaussee').largeur >= 0.6))).filter(i => !comptages[i]);
const choisis = [];
while (choisis.length < N && editables.length) choisis.push(editables.splice(Math.floor(alea() * editables.length), 1)[0]);
const pb2 = [];
let pire = 0;
for (const id of choisis) {
  await J(t => window.__jeu.editer(t), id);
  const s = await J(t => window.__jeu.section(t), id);
  const i = s.bandes.findIndex(b => b.type === 'chaussee');
  if (i < 0 || s.bandes[i].largeur < 0.6) { pb2.push(`${id} : pas de chaussée à découper`); continue; }
  const op = (...a) => J(x => window.__jeu.operation(...x), a);
  await op('changerType', i, 'voiture');
  await op('diviser', i);
  await op('changerSens', i, 'retour');
  await J(() => window.__jeu.fermerEditeur());
  await J(t => window.__jeu.selectionner(t), id);
  await page.locator('#carte canvas').focus();
  await page.keyboard.press('f');
  if (await J(() => window.__jeu.fluxOuvert()) !== id) { pb2.push(`${id} : F n'ouvre pas le bandeau`); continue; }
  const demande = 1500;
  const champ = page.locator('#editeur tr[data-mode="voiture"] input').first();
  await champ.fill(String(demande));
  await champ.evaluate(e => e.dispatchEvent(new Event('change')));
  const e1 = await J(t => window.__jeu.sim(t), id);
  // Le recalcul complet (scénario, carte, inspecteur, bandeau), mesuré dans la page
  pire = Math.max(pire, await J(() => { const t = performance.now(); window.__jeu.operationFlux('definirDemande', 'voiture', 'retour', 300); return Math.round(performance.now() - t); }));
  const feu = e1.modes.voiture.capacite.feux.includes('aller');
  const cap = e1.modes.voiture.capacite.aller;
  const attendu = feu ? null : 1900;
  if (e1.modes.voiture.demande.aller !== demande) pb2.push(`${id} : demande lue ${e1.modes.voiture.demande.aller}`);
  if (attendu !== null && cap !== attendu) pb2.push(`${id} : capacité ${cap} ≠ ${attendu}`);
  if (Math.abs(e1.modes.voiture.saturation.aller - demande / cap) > 1e-9) pb2.push(`${id} : saturation ${e1.modes.voiture.saturation.aller}`);
  const niveau = (await J(() => window.__jeu.flux2d()))[id];
  const x = demande / cap;
  if (niveau !== (x >= 1 ? 'sature' : x >= 0.8 ? 'proche' : 'fluide')) pb2.push(`${id} : carte ${niveau} pour x = ${x.toFixed(2)}`);
  // Une voie de moins dans le sens de l'axe : capacité nulle, saturation infinie, personnes écoulées en baisse
  await J(() => window.__jeu.operationFlux('definirHypothese', 'occupationVoiture', 1.2));
  const avant = await J(t => window.__jeu.sim(t), id);
  await J(t => window.__jeu.editer(t), id);
  const s2 = await J(t => window.__jeu.section(t), id);
  await op('changerType', s2.bandes.findIndex(b => b.type === 'voiture' && b.sens === 'aller'), 'trottoir');
  await J(() => window.__jeu.fermerEditeur());
  const apres = await J(t => window.__jeu.sim(t), id);
  if (apres.modes.voiture.capacite.aller !== 0 || apres.modes.voiture.saturation.aller !== 'Infinity') pb2.push(`${id} : sans voie, capacité ${apres.modes.voiture.capacite.aller}`);
  if (!(apres.modes.voiture.personnes.transportees < avant.modes.voiture.personnes.transportees)) pb2.push(`${id} : personnes ${avant.modes.voiture.personnes.transportees} → ${apres.modes.voiture.personnes.transportees}`);
  if ((await J(() => window.__jeu.flux2d()))[id] !== 'sature') pb2.push(`${id} : la carte ne passe pas en « saturé »`);
}
point(!pb2.length && pire < 50, `${choisis.length} tronçons : capacité, saturation et carte suivent la section et la demande posée au clavier ; recalcul le plus lent ${pire} ms`, pb2);

// ─── 3. Refus à voix haute ─────────────────────────────────────────────────
const id3 = choisis[0];
await J(t => window.__jeu.editerFlux(t), id3);
const avant3 = JSON.stringify(await J(() => window.__jeu.scenario()));
const champ3 = page.locator('#editeur tr[data-mode="voiture"] input').nth(1);
await champ3.fill('-5');
await champ3.evaluate(e => e.dispatchEvent(new Event('change')));
const message = await page.locator('#editeur .editeur-message').innerText();
const inchange = JSON.stringify(await J(() => window.__jeu.scenario())) === avant3;
point(inchange && /refus/i.test(message), `débit négatif refusé (« ${message} »), scénario inchangé : ${inchange ? 'oui' : 'non'}`);

// ─── 4. Annuler, rétablir, relire ; barre d'état ───────────────────────────
const scenario = await J(() => window.__jeu.scenario());
await J(() => window.__jeu.fermerFlux());
await page.locator('#carte canvas').focus();
const vide = s => !Object.keys(s.sections).length && !Object.keys(s.demande).length && s.hypotheses.occupationVoiture === null;
let n = 0;
while (!vide(await J(() => window.__jeu.scenario())) && n < 2000) { await page.keyboard.press('Control+z'); n++; }
const toutAnnule = vide(await J(() => window.__jeu.scenario()));
for (let k = 0; k < n; k++) await page.keyboard.press('Control+y');
const retrouve = JSON.stringify(await J(() => window.__jeu.scenario())) === JSON.stringify(scenario);
point(toutAnnule && retrouve, `Ctrl+Z × ${n} ramène un scénario vide (${toutAnnule ? 'oui' : 'non'}) ; Ctrl+Y × ${n} le retrouve (${retrouve ? 'oui' : 'non'})`);
await page.reload();
await page.waitForFunction(() => window.__jeu?.pret);
await J(() => window.__jeu.pret());
await page.click('#continuer');
await page.waitForFunction(() => window.__jeu.state().enCarte);
const relu = await J(() => window.__jeu.scenario());
point(JSON.stringify(relu) === JSON.stringify(scenario), `scénario relu après rechargement : ${Object.keys(relu.demande).length} demande(s), occupation ${relu.hypotheses.occupationVoiture}`);
const lignes = await J(() => { const s = document.getElementById('statut'); const centres = new Set([...s.children].filter(c => c.offsetParent).map(c => { const r = c.getBoundingClientRect(); return Math.round((r.top + r.height / 2) / 8); })); return centres.size; });
point(lignes === 1, `barre d'état sur ${lignes} ligne(s) à 1280 px`);

await nav.close();
serveur.close();
point(!erreurs.length, `aucune erreur dans la console${erreurs.length ? ` : ${erreurs.slice(0, 5).join(' | ')}` : ''}`);
process.exit(bilan.every(Boolean) ? 0 : 1);
