// Critère du jeu beta « Carte blanche » (v0.9.0), dans le vrai jeu, à la souris :
//  1. la page s'ouvre sans erreur, des voitures roulent dans les deux sens sur la route de départ ;
//  2. un clic sur la route fixe le départ, le survol montre la nouvelle route (sans refus), un clic la construit
//     (la route de départ est coupée : 3 tronçons) ; un pointeur trop près montre un refus écrit ;
//  3. l'outil « Doubler » passe un tronçon à 2 × 2 voies, l'outil « Piste cyclable » lui ajoute ses pistes ;
//  4. des voitures roulent sur la route nouvelle, des vélos sur la piste ;
//  5. l'outil « Démolir » retire un tronçon (ses carrefours se referment), refuse celui qui mène au bord.
// Captures dans captures/beta/ (ou --sortie <dossier>).
//   node outils/critere-beta.mjs [--sortie dossier]
import { mkdirSync } from 'node:fs';
import { servir, lancerChromium, options } from './navigateur.mjs';

const o = options(process.argv.slice(2));
const sortie = o.sortie || 'captures/beta';
mkdirSync(sortie, { recursive: true });
const { base, close } = await servir();
const navigateur = await lancerChromium();
const page = await navigateur.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const erreurs = [];
page.on('pageerror', e => erreurs.push(String(e)));
page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text()); });
let echecs = 0;
const verifier = (ok, texte) => { console.log(`${ok ? '✓' : '✗'} ${texte}`); if (!ok) echecs++; };

const t0 = Date.now();
await page.goto(`${base}beta.html?debug=1&seed=1`);
await page.waitForFunction(() => window.__jeu && document.getElementById('chargement').hidden, null, { timeout: 15000 });
verifier(true, `prête en ${Date.now() - t0} ms`);
const etat = () => page.evaluate(() => window.__jeu.state());
const ecran = (x, y) => page.evaluate(([x, y]) => window.__jeu.ecran(x, y), [x, y]);
const vue = await page.$('#vue').then(e => e.boundingBox());
async function souris(x, y, cliquer = true) {
  const [px, py] = await ecran(x, y);
  await page.mouse.move(vue.x + px, vue.y + py, { steps: 4 });
  if (cliquer) await page.mouse.click(vue.x + px, vue.y + py);
}

await page.evaluate(() => window.__jeu.camera({ cible: [0, 40], distance: 260, azimut: 0.35, inclinaison: 0.85 })); // cadrage du critère, indépendant du réglage
await page.waitForTimeout(200);
let e = await etat();
verifier(e.vehicules.voiture > 5, `${e.vehicules.voiture} voitures sur la route de départ`);
await page.screenshot({ path: `${sortie}/1-depart.png` });

await souris(0, 0);
e = await etat();
verifier(!!e.depart, 'un clic sur la route fixe le départ');
await souris(30, 12, false);
e = await etat();
verifier(!!e.projet?.refus, `trop près : refus « ${e.projet?.refus} », étiquette « ${await page.textContent('#etiquette')} »`);
await souris(70, 160, false);
e = await etat();
verifier(e.projet && !e.projet.refus, `aperçu de la route : ${Math.round(e.projet?.longueur)} m, sans refus`);
await page.screenshot({ path: `${sortie}/2-apercu.png` });
await souris(70, 160);
e = await etat();
verifier(e.troncons === 3 && !e.depart, `route construite : ${e.troncons} tronçons`);

// Une seconde route, raccordée à la première : un carrefour de plus
const milieu = await page.evaluate(() => { const r = window.__jeu.reseau(), t = Object.values(r.troncons).at(-1); return t.points[Math.floor(t.points.length / 2)]; });
await souris(-130, 0);
await souris(...milieu, false);
e = await etat();
verifier(e.projet && !e.projet.refus && !e.projet.libre, `raccord sur la route nouvelle (${e.projet?.refus ?? 'sans refus'})`);
await souris(...milieu);
e = await etat();
verifier(e.troncons === 6, `${e.troncons} tronçons`);

await page.evaluate(() => window.__jeu.camera({ cible: [-150, 0], distance: 220 }));
await page.waitForTimeout(200);
await page.keyboard.press('2');
await souris(-250, 0);
await page.keyboard.press('3');
await souris(-250, 0);
await souris(-50, 0);
const reseau = await page.evaluate(() => window.__jeu.reseau());
const ouest = Object.values(reseau.troncons).find(t => t.points.some(p => p[0] < -1000));
verifier(ouest?.voies === 2 && ouest?.velo, 'à l\'ouest : 2 × 2 voies et pistes cyclables');
await page.keyboard.press('1');

await page.evaluate(() => window.__jeu.timeScale(4));
await page.waitForTimeout(12000);
await page.evaluate(() => window.__jeu.timeScale(1));
e = await etat();
const sur = await page.evaluate(() => Object.values(window.__jeu.reseau().troncons).filter(t => t.points.some(p => Math.abs(p[1]) > 1)).length);
verifier(e.vehicules.velo > 0, `${e.vehicules.velo} vélos, ${e.vehicules.voiture} voitures, ${e.abandons} abandons, sorties ${JSON.stringify(e.sortis)}`);
verifier(sur >= 3, `${sur} tronçons hors de la route de départ`);
await page.evaluate(() => window.__jeu.camera({ distance: 140, cible: [-60, 40] }));
await page.waitForTimeout(400);
await page.screenshot({ path: `${sortie}/3-construit.png` });
await page.evaluate(() => window.__jeu.camera({ distance: 45, cible: [-200, 0], inclinaison: 1.05 }));
await page.waitForTimeout(400);
await page.screenshot({ path: `${sortie}/4-piste.png` });

// 5. Démolir (touche 4) : la seconde route part, ses deux carrefours se referment
await page.evaluate(() => window.__jeu.camera({ cible: [0, 40], distance: 260, azimut: 0.35, inclinaison: 0.85 }));
await page.waitForTimeout(200);
const avantDemolir = (await etat()).troncons;
await page.keyboard.press('4');
await souris(...milieu, false);
verifier(/./.test(await page.textContent('#etiquette')), `survol : « ${await page.textContent('#etiquette')} »`);
await page.screenshot({ path: `${sortie}/5-demolir.png` });
await souris(...milieu);
e = await etat();
verifier(e.troncons < avantDemolir, `démolie : ${avantDemolir} → ${e.troncons} tronçons`);
await page.evaluate(() => window.__jeu.camera({ cible: [-250, 0], distance: 200 }));
await page.waitForTimeout(200);
await souris(-250, 0, false);
const refusBord = await page.textContent('#etiquette');
await souris(-250, 0);
verifier((await etat()).troncons === e.troncons && /bord|edge/.test(refusBord), `le tronçon du bord reste (« ${refusBord} »)`);

verifier(!erreurs.length, erreurs.length ? `erreurs : ${erreurs.join(' | ')}` : 'aucune erreur dans la console');
await navigateur.close();
await close();
console.log(echecs ? `${echecs} échec(s)` : 'critère beta tenu');
process.exit(echecs ? 1 : 0);
