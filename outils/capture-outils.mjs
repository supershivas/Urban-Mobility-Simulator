// Captures de la v0.7 : un carrefour choisi avec ses flèches au sol, passé aux feux (bandeau),
// une piste posée à l'outil sur une branche ; en 2D puis en 3D. Pour regarder, pas pour valider.
//   node outils/capture-outils.mjs --sortie /chemin/hors/captures [--noeud node-u…] [--langue en]
import { servir, lancerChromium, CIBLES, options } from './navigateur.mjs';

const o = options(process.argv.slice(2), { sortie: 'captures/outils', noeud: '', cibles: 'bureau,bureau_125', langue: 'fr' });
const serveur = await servir('.');
const nav = await lancerChromium();
for (const cible of o.cibles.split(',')) {
  const page = await (await nav.newContext({ ...CIBLES[cible], locale: o.langue === 'en' ? 'en-GB' : 'fr-BE' })).newPage();
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text()); });
  const J = (f, ...a) => page.evaluate(f, ...a);
  await page.goto(`${serveur.base}index.html?debug=1&vue=2d`);
  await page.waitForFunction(() => window.__jeu?.pret);
  await J(() => window.__jeu.pret());
  await page.click('#nouvelle');
  await page.waitForFunction(() => window.__jeu.trafic(), null, { timeout: 60000 });
  await J(() => window.__jeu.avancerTrafic(2400));
  // Un carrefour à quatre branches mesurées, longues d'au moins 60 m (comme capture-carrefour)
  o.noeud ||= await J(async () => {
    const r = await (await fetch('data/processed/network.json')).json();
    const seg = new Map(r.streetSegments.map(s => [s.id, s]));
    return r.intersections.find(n => n.connectedSegmentIds.length === 4 && n.connectedSegmentIds.every(s => seg.get(s)?.emprise?.confiance === 'moyenne' && seg.get(s).lengthMeters > 60))?.id;
  });
  const c = await J(async i => (await (await fetch('data/processed/intersections.geojson')).json()).features.find(f => f.properties.id === i).geometry.coordinates, o.noeud);
  await J(([x, i]) => { window.__jeu.selectionner(i); return window.__jeu.allerA(x, 19); }, [c, o.noeud]);
  // Une piste posée à l'outil sur la première branche, à droite de l'axe, à 30 m du carrefour
  const branches = (await J(i => window.__jeu.carrefour(i), o.noeud)).branches;
  // Le milieu de la première branche, un peu à droite de son axe
  const cible0 = await J(async t => {
    const g = (await (await fetch('data/processed/streets.geojson')).json()).features.find(f => f.properties.id === t).geometry.coordinates;
    return g[Math.floor(g.length / 2)];
  }, branches[0].troncon);
  await J(() => window.__jeu.outil('cyclable'));
  if (cible0) console.log(cible, 'outil :', JSON.stringify(await J(x => window.__jeu.poserOutil(x), cible0)));
  await J(() => window.__jeu.outil(null));
  await J(i => window.__jeu.editerCarrefour(i), o.noeud);
  await J(() => window.__jeu.operationCarrefour('definirRegulation', 'feux'));
  await J(() => window.__jeu.operationCarrefour('definirVert', 0, 40));
  await J(() => window.__jeu.reconstruireTrafic());
  await J(() => window.__jeu.avancerTrafic(400));
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${o.sortie}/outils-2d-${cible}-${o.langue}.png` });
  const fl = await J(() => window.__jeu.fleches());
  console.log(cible, `${branches.length} branches, ${fl.length} flèches (${fl.filter(f => f.actif).length} allumées), feux ${JSON.stringify(await J(i => window.__jeu.etatFeux(i), o.noeud))}`);
  await J(() => window.__jeu.fermerCarrefour());
  await J(() => window.__jeu.vue('3d'));
  await page.waitForFunction(() => window.__jeu.state().scenePreteMs, null, { timeout: 60000 });
  await J(([x]) => window.__jeu.camera({ cibleLonLat: x, distance: 90, azimut: 0.5, inclinaison: 0.75 }), [c]);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${o.sortie}/outils-3d-${cible}-${o.langue}.png` });
  console.log(cible, erreurs.length ? `erreurs : ${erreurs.join(' | ')}` : 'aucune erreur');
}
await nav.close();
serveur.close();
