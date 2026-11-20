// Critère du jeu beta « Carte blanche » (v0.9.0), dans le vrai jeu, à la souris :
//  1. la page s'ouvre sans erreur, des voitures roulent dans les deux sens sur la route de départ ;
//  2. un clic sur la route fixe le départ, le survol montre la nouvelle route (sans refus), un clic la construit
//     (la route de départ est coupée : 3 tronçons) ; un pointeur trop près montre un refus écrit ;
//  3. l'outil « Doubler » passe un tronçon à 2 × 2 voies, l'outil « Piste cyclable » lui ajoute ses pistes ;
//  4. des voitures roulent sur la route nouvelle, des vélos sur la piste ;
//  5. piste à double sens, feux (panneau, durées), piétons ;
//  6. îlot central, vue Mouvements (glisser-déposer d'une liaison), rond-point ;
//  7. l'outil « Démolir » retire un tronçon (ses carrefours se referment), refuse celui qui mène au bord.
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
const vue = await page.$('#vue').then(e => e.boundingBox()), vueBox = vue;
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
await page.keyboard.press('4');
await souris(-250, 0);
await souris(-50, 0);
const reseau = await page.evaluate(() => window.__jeu.reseau());
const ouest = Object.values(reseau.troncons).find(t => t.points.some(p => p[0] < -1000));
verifier(ouest?.voies === 2 && ouest?.pistes.g === 'simple' && ouest?.pistes.d === 'simple', 'à l\'ouest : 2 × 2 voies et pistes cyclables');

// Piste à double sens (touche 5) : au nord de la route, à la place des deux pistes
await page.keyboard.press('5');
await souris(-250, 7, false);
const surDouble = await page.textContent('#etiquette');
await souris(-250, 7);
const ouest2 = Object.values((await page.evaluate(() => window.__jeu.reseau())).troncons).find(t => t.points.some(p => p[0] < -1000));
verifier(ouest2?.pistes.g === 'double' && ouest2?.pistes.d === 'simple', `piste à double sens au nord (« ${surDouble} ») : ${JSON.stringify(ouest2?.pistes)}`);

// Feux (touche 6) sur le premier carrefour : le panneau s'ouvre, + allonge le vert de la première phase
await page.evaluate(() => window.__jeu.camera({ cible: [0, 0], distance: 120 }));
await page.waitForTimeout(200);
await page.keyboard.press('6');
await souris(0, 0, false);
const surFeux = await page.textContent('#etiquette');
await souris(0, 0);
e = await etat();
const panneau = await page.$eval('#panneau-feux', el => !el.hidden && el.querySelectorAll('.feux-ligne').length);
verifier(e.feux === 1 && panneau === 4, `feux posés (« ${surFeux} ») : ${e.feux} carrefour, panneau de ${panneau} phases`);
const avantVert = await page.$eval('.feux-ligne output', el => el.textContent);
await page.click('.feux-ligne .bouton:last-child');
const apresVert = await page.$eval('.feux-ligne output', el => el.textContent);
verifier(avantVert !== apresVert, `durée du premier vert : ${avantVert} → ${apresVert}`);
await page.screenshot({ path: `${sortie}/5-feux.png` });
await page.keyboard.press('Escape');
await page.keyboard.press('1');

await page.evaluate(() => window.__jeu.timeScale(4));
await page.waitForTimeout(12000);
await page.evaluate(() => window.__jeu.timeScale(1));
e = await etat();
const sur = await page.evaluate(() => Object.values(window.__jeu.reseau().troncons).filter(t => t.points.some(p => Math.abs(p[1]) > 1)).length);
verifier(e.vehicules.velo > 0, `${e.vehicules.velo} vélos, ${e.vehicules.voiture} voitures, ${e.abandons} abandons, sorties ${JSON.stringify(e.sortis)}`);
verifier(sur >= 3, `${sur} tronçons hors de la route de départ`);
verifier(e.pietons > 30, `${e.pietons} piétons sur les trottoirs`);
await page.evaluate(() => window.__jeu.camera({ distance: 55, cible: [0, 0], inclinaison: 0.95, azimut: 0.6 }));
await page.waitForTimeout(400);
await page.screenshot({ path: `${sortie}/6-carrefour.png` });
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
await page.evaluate(() => window.__jeu.camera({ cible: [0, 40], distance: 260, azimut: 0.35, inclinaison: 0.85 }));
await page.waitForTimeout(200);
await page.keyboard.press('3');
await souris(...milieu, false);
verifier(/./.test(await page.textContent('#etiquette')), `survol : « ${await page.textContent('#etiquette')} »`);
await page.screenshot({ path: `${sortie}/7-demolir.png` });
await souris(...milieu);
e = await etat();
verifier(e.troncons < avantDemolir, `démolie : ${avantDemolir} → ${e.troncons} tronçons`);
await page.evaluate(() => window.__jeu.camera({ cible: [-250, 0], distance: 200 }));
await page.waitForTimeout(200);
await souris(-250, 0, false);
const refusBord = await page.textContent('#etiquette');
await souris(-250, 0);
verifier((await etat()).troncons === e.troncons && /bord|edge/.test(refusBord), `le tronçon du bord reste (« ${refusBord} »)`);

// 7. Îlot central (8), rond-point (9), mouvements (0) : à la souris
await page.evaluate(() => window.__jeu.camera({ cible: [-250, 0], distance: 120, azimut: 0.35, inclinaison: 0.6 }));
await page.waitForTimeout(200);
await page.keyboard.press('8');
await souris(-300, 0);
let res = await page.evaluate(() => window.__jeu.reseau());
const ilot = Object.values(res.troncons).find(t => t.points.some(p => p[0] < -1000))?.ilot;
verifier(ilot === 'refuges', `îlot central : ${ilot}`);
const second = await page.evaluate(() => { const r = window.__jeu.reseau(); return Object.entries(r.noeuds).filter(([id]) => Object.values(r.troncons).filter(t => t.a === id || t.b === id).length >= 3).map(([, n]) => [n.x, n.y]); });
const [gx, gy] = second.find(p => Math.abs(p[0]) > 50) ?? second[0];
await page.evaluate(([x, y]) => window.__jeu.camera({ cible: [x, y], distance: 90 }), [gx, gy]);
await page.waitForTimeout(200);
await page.keyboard.press('0');
await souris(gx, gy);
const vueM = await page.evaluate(() => window.__jeu.vueMouvements());
verifier(vueM && vueM.liens > 0, `vue Mouvements : ${vueM?.liens} liaisons, ${vueM?.entrees.length} entrées`);
// Tirer une liaison de la première entrée vers une sortie qu'elle n'a pas encore
const avantLiens = vueM.liens;
const [ex, ey] = vueM.entrees[0].p;
const cible = vueM.sorties.find(s => Math.hypot(s.p[0] - ex, s.p[1] - ey) > 4);
const [px, py] = await ecran(ex, ey), [qx, qy] = await ecran(...cible.p);
await page.mouse.move(vueBox.x + px, vueBox.y + py);
await page.mouse.down();
await page.mouse.move(vueBox.x + (px + qx) / 2, vueBox.y + (py + qy) / 2, { steps: 5 });
await page.mouse.move(vueBox.x + qx, vueBox.y + qy, { steps: 5 });
await page.mouse.up();
const apres = await page.evaluate(() => window.__jeu.vueMouvements());
verifier(apres.liens !== avantLiens, `glisser-déposer : ${avantLiens} → ${apres.liens} liaisons`);
await page.screenshot({ path: `${sortie}/8-mouvements.png` });
await page.keyboard.press('Escape');
await page.keyboard.press('9');
await souris(gx, gy);
await souris(gx, gy);
res = await page.evaluate(() => window.__jeu.reseau());
const gir = Object.values(res.noeuds).find(n => n.giratoire)?.giratoire;
verifier(gir === 'urbain', `rond-point : ${gir}`);
await page.evaluate(() => window.__jeu.timeScale(4));
await page.waitForTimeout(5000);
await page.evaluate(() => window.__jeu.timeScale(1));
await page.screenshot({ path: `${sortie}/9-giratoire.png` });

verifier(!erreurs.length, erreurs.length ? `erreurs : ${erreurs.join(' | ')}` : 'aucune erreur dans la console');
await navigateur.close();
await close();
console.log(echecs ? `${echecs} échec(s)` : 'critère beta tenu');
process.exit(echecs ? 1 : 0);
