// Captures de l'éditeur de carrefour (v0.4) : un carrefour à quatre branches mesurées,
// ses chaussées découpées en voies, une piste, des passages piétons, une voie entrante
// choisie ; en 2D puis en 3D, aux cibles de bureau. Pour regarder, pas pour valider.
//   node outils/capture-carrefour.mjs --sortie /chemin/hors/captures [--noeud node-u…] [--langue en]
import { servir, lancerChromium, CIBLES, options } from './navigateur.mjs';

const o = options(process.argv.slice(2), { sortie: 'captures/carrefour', noeud: '', cibles: 'bureau,bureau_125', langue: 'fr' });
const serveur = await servir('.');
const nav = await lancerChromium();
for (const cible of o.cibles.split(',')) {
  const page = await (await nav.newContext(CIBLES[cible])).newPage();
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text()); });
  const J = (f, ...a) => page.evaluate(f, ...a);
  await page.goto(`${serveur.base}index.html?debug=1`);
  await page.waitForFunction(() => window.__jeu?.pret);
  await J(() => window.__jeu.pret());
  await J(() => window.__jeu.jouer());
  if (o.langue !== 'fr') await J(l => { const s = document.getElementById('langue'); s.value = l; s.dispatchEvent(new Event('change')); }, o.langue);
  // Un carrefour à quatre branches, toutes à emprise mesurée de confiance moyenne
  const id = o.noeud || await J(async () => {
    const r = await (await fetch('data/processed/network.json')).json();
    const seg = new Map(r.streetSegments.map(s => [s.id, s]));
    return r.intersections.find(n => n.connectedSegmentIds.length === 4 && n.connectedSegmentIds.every(s => seg.get(s)?.emprise?.confiance === 'moyenne' && seg.get(s).lengthMeters > 60))?.id;
  });
  const c = await J(async i => (await (await fetch('data/processed/intersections.geojson')).json()).features.find(f => f.properties.id === i).geometry.coordinates, id);
  const branches = (await J(i => window.__jeu.carrefour(i), id)).branches.map(b => b.troncon);
  for (const [k, b] of branches.entries()) {
    await J(t => window.__jeu.editer(t), b);
    const s = await J(t => window.__jeu.section(t), b);
    const i = s.bandes.findIndex(x => x.type === 'chaussee');
    if (i < 0) continue;
    const op = (...a) => J(x => window.__jeu.operation(...x), a);
    await op('changerType', i, 'voiture');
    if (!(await op('diviser', i))?.refus) await op('changerSens', i, 'retour');
    if (k === 0) {
      const s2 = await J(t => window.__jeu.section(t), b);
      await op('definirLargeur', i + 1, Math.max(3, s2.bandes[i + 1].largeur - 1.8));
      await op('ajouter', 'cyclable', i + 1);
    }
  }
  await J(() => window.__jeu.fermerEditeur());
  await J(([x, i]) => { window.__jeu.selectionner(i); return window.__jeu.allerA(x, 19.2); }, [c, id]);
  await page.click('#editer-carrefour');
  for (const b of branches) await J(([t]) => window.__jeu.operationCarrefour('definirTraversee', t, 'pieton', true), [b]);
  await J(([t]) => window.__jeu.operationCarrefour('definirTraversee', t, 'velo', true), [branches[0]]);
  await J(i => window.__jeu.operationCarrefour('definirRegulation', 'feux'), id);
  const etat = await J(i => window.__jeu.carrefour(i), id);
  const entree = etat.voies.find(v => v.entrante && v.mode === 'voiture');
  if (entree) await J(v => window.__jeu.choisirVoie(v), entree.id);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${o.sortie}/carrefour-2d-${cible}-${o.langue}.png` });
  const m = await J(() => {
    const e = document.getElementById('editeur'), c2 = document.getElementById('carte');
    const coupes = [...e.querySelectorAll('button, select, input')].filter(x => { const r = x.getBoundingClientRect(), p = e.getBoundingClientRect(); return r.right > p.right + 1 || r.bottom > p.bottom + 1; }).length;
    return { defile: document.documentElement.scrollWidth > innerWidth, editeur: Math.round(e.getBoundingClientRect().height), carte: Math.round(c2.getBoundingClientRect().height), coupes };
  });
  console.log(cible, id, `éditeur ${m.editeur} px, carte ${m.carte} px, défilement horizontal ${m.defile ? 'OUI' : 'non'}, commandes coupées ${m.coupes}, ${etat.raccords.length} raccords`);
  await J(() => window.__jeu.vue('3d'));
  await J(([x]) => window.__jeu.camera({ cibleLonLat: x, distance: 110, azimut: 0.5, inclinaison: 0.8 }), [c]);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${o.sortie}/carrefour-3d-${cible}-${o.langue}.png` });
  console.log(cible, erreurs.length ? `erreurs : ${erreurs.join(' | ')}` : 'aucune erreur');
}
await nav.close();
serveur.close();
