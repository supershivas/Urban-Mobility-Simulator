// Captures du trafic en temps réel (v0.6) : la partie s'ouvre en 3D, le trafic tourne
// quelques minutes simulées (×8), puis une vue rapprochée en 3D, la même en 2D, et de loin.
// Pour regarder, pas pour valider.
//   node outils/capture-trafic.mjs --sortie /chemin/hors/captures [--lieu 4.4072,50.8410] [--langue en]
import { servir, lancerChromium, CIBLES, options } from './navigateur.mjs';

const o = options(process.argv.slice(2), { sortie: 'captures/trafic', lieu: '4.4072,50.8410', cibles: 'bureau,bureau_125', langue: 'fr', secondes: '6' });
const lieu = o.lieu.split(',').map(Number);
const serveur = await servir('.');
const nav = await lancerChromium();
for (const cible of o.cibles.split(',')) {
  const page = await (await nav.newContext(CIBLES[cible])).newPage();
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text()); });
  const J = (f, ...a) => page.evaluate(f, ...a);
  await page.goto(`${serveur.base}index.html?debug=1&expert=1&mission=0`);
  await page.waitForFunction(() => window.__jeu?.pret);
  await J(() => window.__jeu.pret());
  if (o.langue !== 'fr') await J(l => { const s = document.getElementById('langue'); s.value = l; s.dispatchEvent(new Event('change')); }, o.langue);
  await page.click('#nouvelle');
  await page.waitForFunction(() => window.__jeu.state().scenePreteMs && window.__jeu.trafic(), null, { timeout: 60000 });
  // Trois minutes simulées d'un coup, puis le temps réel (×8) quelques secondes
  await J(() => window.__jeu.avancerTrafic(3600));
  for (let k = 0; k < 3; k++) await page.keyboard.press('x');
  await page.waitForTimeout(Number(o.secondes) * 1000);
  await J(([x]) => window.__jeu.camera({ cibleLonLat: x, distance: 260, azimut: 0.6, inclinaison: 0.9 }), [lieu]);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${o.sortie}/trafic-3d-${cible}-${o.langue}.png` });
  const t3 = await J(() => ({ ...window.__jeu.trafic(), blocs: window.__jeu.blocs3d(), fps: window.__jeu.state().fps }));
  await J(() => window.__jeu.vue('2d'));
  await J(([x]) => window.__jeu.allerA(x, 17.3), [lieu]);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${o.sortie}/trafic-2d-${cible}-${o.langue}.png` });
  await J(([x]) => window.__jeu.allerA(x, 14.6), [lieu]);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${o.sortie}/trafic-loin-${cible}-${o.langue}.png` });
  const t2 = await J(() => window.__jeu.trafic());
  console.log(cible, `3D : ${JSON.stringify(t3)}`);
  console.log(cible, `2D : temps ${Math.round(t2.temps)} s, ${t2.enCirculation} en route, ${t2.sansIssue} sans issue`);
  console.log(cible, erreurs.length ? `erreurs : ${erreurs.join(' | ')}` : 'aucune erreur');
}
await nav.close();
serveur.close();
