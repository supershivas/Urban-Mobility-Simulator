// Le critère de la v0.8 (« prise en main », Jérôme, v0.7.1 : « mission guidée + écran épuré ») :
// « un joueur qui ouvre le jeu sait quoi faire, chaque geste marche et son effet se voit ».
//
//   node outils/critere-v08.mjs [--captures /dossier/hors/captures]
//
// Vérifie, dans le vrai jeu (?debug=1, Chromium 1280 × 800, partie neuve, progression vide), à la vraie souris :
//   1. écran épuré : ni couches ni inspecteur ; la carte de la mission 1 est là, la vue a volé jusqu'à son lieu ;
//   2. étapes guidées : « Compris » → l'outil conseillé bouge ; le choisir → étape suivante ; survoler la chaussée
//      encadrée → la voie est surlignée et l'étiquette dit ce que fera le clic ; cliquer → la piste est posée ;
//      le temps passe tout seul à ×8 ; la mission est réussie (3 vélos sur la piste) ; « Mission suivante » ;
//   3. la mission 2 commence (son lieu, son indice) ; la progression survit à un rechargement ;
//   4. le mode expert (O) rend couches et inspecteur, puis les retire ; aucune erreur dans la console.
// Code de sortie 1 si un point échoue.
import { servir, lancerChromium, CIBLES, options } from './navigateur.mjs';
import { wgs84VersLambert, lambertVersWgs84 } from '../js/geo/coordonnees.js';

const o = options(process.argv.slice(2), { captures: '' });
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
const capture = async nom => { if (o.captures) await page.screenshot({ path: `${o.captures}/${nom}.png` }); };
const visible = sel => J(s => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none'; }, sel);

await page.goto(`${serveur.base}index.html?debug=1&vue=2d`);
await page.waitForFunction(() => window.__jeu?.pret);
await J(() => window.__jeu.pret());
await page.click('#nouvelle');
await page.waitForFunction(() => window.__jeu.trafic() && window.__jeu.mission().enCours, null, { timeout: 60000 });
await attendre(1500);
await capture('m1-ouverture');

// ─── 1. Écran épuré, mission 1 ──────────────────────────────────────────────
const m0 = await J(() => window.__jeu.mission());
const pb1 = [];
if (await visible('#outils')) pb1.push('le panneau des couches est visible');
if (await visible('#inspecteur')) pb1.push('l\'inspecteur est visible');
if (!(await visible('#mission'))) pb1.push('pas de carte de mission');
if (m0.enCours !== 'piste-loi' || m0.etapeId !== 'regarder') pb1.push(`mission ${m0.enCours}, étape ${m0.etapeId}`);
const centre = await J(() => window.__jeu.state().centre);
const rue = await J(async () => (await (await fetch('data/processed/streets.geojson')).json()).features.find(f => f.properties.id === 'seg-u73149').geometry.coordinates);
const milieu = rue[Math.floor(rue.length / 2)];
const ecart = Math.hypot(...[0, 1].map(i => (wgs84VersLambert(centre)[i] - wgs84VersLambert(milieu)[i])));
if (ecart > 80) pb1.push(`la vue est à ${Math.round(ecart)} m du lieu`);
point(!pb1.length, `écran épuré (ni couches ni inspecteur), mission « ${m0.enCours} » à l'étape « ${m0.etapeId} », vue à ${Math.round(ecart)} m du lieu`, pb1);

// ─── 2. Étapes guidées, à la souris ────────────────────────────────────────
const pb2 = [];
await page.getByRole('button', { name: 'Compris' }).click();
await attendre(200);
if ((await J(() => window.__jeu.mission().etapeId)) !== 'outil') pb2.push('« Compris » ne passe pas à l\'étape outil');
if (!(await J(() => document.querySelector('#barre-outils [data-outil="cyclable"]').classList.contains('guide')))) pb2.push('l\'outil Piste n\'est pas désigné');
await page.click('#barre-outils [data-outil="cyclable"]');
await attendre(300);
if ((await J(() => window.__jeu.mission().etapeId)) !== 'poser') pb2.push('choisir Piste ne passe pas à l\'étape poser');
// Le côté droit de la chaussée : 2 m à droite de l'axe, au milieu du tronçon
const l = rue.map(wgs84VersLambert), k = Math.max(1, Math.floor(l.length / 2));
const u = [l[k][0] - l[k - 1][0], l[k][1] - l[k - 1][1]], n = Math.hypot(...u), m = [(l[k][0] + l[k - 1][0]) / 2, (l[k][1] + l[k - 1][1]) / 2];
const cible = lambertVersWgs84([m[0] + (u[1] / n) * 2, m[1] - (u[0] / n) * 2]);
await J(([x]) => window.__jeu.allerA(x, 19), [cible]);
const p = await J(x => window.__jeu.versEcran(x), cible);
await page.mouse.move(p.x - 30, p.y - 30);
await page.mouse.move(p.x, p.y, { steps: 5 });
await attendre(200);
const etiquette = await J(() => { const e = document.getElementById('survol'); return e.hidden ? null : e.textContent; });
if (!etiquette || !/[Pp]iste/.test(etiquette)) pb2.push(`étiquette de survol : ${etiquette}`);
await capture('m1-survol');
await page.mouse.click(p.x, p.y);
await attendre(400);
const etape = await J(() => window.__jeu.mission().etapeId);
const vitesse = (await J(() => window.__jeu.trafic())).vitesse;
if (etape !== 'attendre') pb2.push(`après le clic : étape ${etape}`);
if (vitesse !== 8) pb2.push(`vitesse ×${vitesse}`);
// Le temps passe : la mission est jugée sur le trafic (avancé ici pour ne pas attendre)
let reussie = false;
for (let i = 0; i < 40 && !reussie; i++) { await J(() => window.__jeu.avancerTrafic(400)); await attendre(120); reussie = (await J(() => window.__jeu.mission())).suivi?.reussie; }
await capture('m1-reussie');
if (!reussie) pb2.push(`mission non réussie : ${JSON.stringify((await J(() => window.__jeu.mission())).suivi)}`);
point(!pb2.length, `Compris → outil désigné → Piste → survol (« ${etiquette} ») → clic → ×${vitesse} → mission réussie`, pb2);

// ─── 3. Mission suivante, progression gardée ───────────────────────────────
const pb3 = [];
await page.getByRole('button', { name: 'Mission suivante' }).click();
await attendre(1200);
const m2 = await J(() => window.__jeu.mission());
if (m2.enCours !== 'cortenbergh' || !m2.reussies.includes('piste-loi')) pb3.push(JSON.stringify(m2));
const texte = await page.locator('#mission').innerText();
if (!/Sens/.test(texte)) pb3.push('l\'indice de la mission 2 n\'est pas affiché');
await capture('m2-debut');
await page.reload();
await page.waitForFunction(() => window.__jeu?.pret);
await J(() => window.__jeu.pret());
await page.click('#continuer');
await page.waitForFunction(() => window.__jeu.state().enCarte);
await attendre(500);
const relu = await J(() => window.__jeu.mission());
if (relu.enCours !== 'cortenbergh' || !relu.reussies.includes('piste-loi')) pb3.push(`après rechargement : ${JSON.stringify(relu)}`);
point(!pb3.length, `mission suivante « ${m2.enCours} » (indice affiché) ; progression relue après rechargement`, pb3);

// ─── 4. Mode expert ────────────────────────────────────────────────────────
await page.locator('#carte canvas').focus();
await page.keyboard.press('o');
await attendre(300);
const expertOui = (await visible('#outils')) && (await visible('#inspecteur'));
await capture('expert');
await page.keyboard.press('o');
await attendre(300);
const expertNon = !(await visible('#outils')) && !(await visible('#inspecteur'));
point(expertOui && expertNon, `mode expert (O) : couches et inspecteur ${expertOui ? 'affichés' : 'absents'}, puis ${expertNon ? 'retirés' : 'encore là'}`);

await nav.close();
serveur.close();
point(!erreurs.length, `aucune erreur dans la console${erreurs.length ? ` : ${erreurs.slice(0, 5).join(' | ')}` : ''}`);
process.exit(bilan.every(Boolean) ? 0 : 1);
