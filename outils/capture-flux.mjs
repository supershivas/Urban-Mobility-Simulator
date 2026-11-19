// Captures du bandeau des flux (v0.5) : la rue de la Loi (comptage vélo), sa chaussée
// découpée en voies et une piste, une demande automobile posée, l'occupation des voitures ;
// en 2D (bandeau ouvert, puis la couche Flux de loin) et en 3D. Pour regarder, pas pour valider.
//   node outils/capture-flux.mjs --sortie /chemin/hors/captures [--troncon seg-u…] [--langue en]
import { servir, lancerChromium, CIBLES, options } from './navigateur.mjs';

const o = options(process.argv.slice(2), { sortie: 'captures/flux', troncon: 'seg-u73115', cibles: 'bureau,bureau_125', langue: 'fr' });
const serveur = await servir('.');
const nav = await lancerChromium();
for (const cible of o.cibles.split(',')) {
  const page = await (await nav.newContext(CIBLES[cible])).newPage();
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text()); });
  const J = (f, ...a) => page.evaluate(f, ...a);
  await page.goto(`${serveur.base}index.html?debug=1&vue=2d&expert=1&mission=0`);
  await page.waitForFunction(() => window.__jeu?.pret);
  await J(() => window.__jeu.pret());
  await J(() => window.__jeu.jouer());
  if (o.langue !== 'fr') await J(l => { const s = document.getElementById('langue'); s.value = l; s.dispatchEvent(new Event('change')); }, o.langue);
  const id = o.troncon;
  // La chaussée : deux voies automobiles dans le sens de l'axe et une piste
  await J(t => window.__jeu.editer(t), id);
  const op = (...a) => J(x => window.__jeu.operation(...x), a);
  const s = await J(t => window.__jeu.section(t), id);
  const i = s.bandes.findIndex(x => x.type === 'chaussee');
  if (i >= 0) {
    await op('changerType', i, 'voiture');
    await op('diviser', i);
    const s2 = await J(t => window.__jeu.section(t), id);
    await op('definirLargeur', i + 1, Math.max(3, s2.bandes[i + 1].largeur - 2));
    await op('ajouter', 'cyclable', i + 1);
  }
  await J(() => window.__jeu.fermerEditeur());
  const ligne = await J(async t => (await (await fetch('data/processed/streets.geojson')).json()).features.find(f => f.properties.id === t).geometry.coordinates, id);
  const milieu = ligne[Math.floor(ligne.length / 2)];
  await J(([x, t]) => { window.__jeu.selectionner(t); return window.__jeu.allerA(x, 17.5); }, [milieu, id]);
  await page.click('#editer-flux');
  const f = (...a) => J(x => window.__jeu.operationFlux(...x), a);
  await f('definirDemande', 'voiture', 'aller', 3400);
  await f('definirDemande', 'pieton', 'total', 900);
  await f('definirHypothese', 'occupationVoiture', 1.3);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${o.sortie}/flux-2d-${cible}-${o.langue}.png` });
  const m = await J(() => {
    const e = document.getElementById('editeur');
    const coupes = [...e.querySelectorAll('button, select, input')].filter(x => { const r = x.getBoundingClientRect(), p = e.getBoundingClientRect(); return r.right > p.right + 1 || r.bottom > p.bottom + 1; }).length;
    return { defile: document.documentElement.scrollWidth > innerWidth, editeur: Math.round(e.getBoundingClientRect().height), coupes };
  });
  const sim = await J(t => window.__jeu.sim(t), id);
  console.log(cible, id, `bandeau ${m.editeur} px, défilement ${m.defile ? 'OUI' : 'non'}, coupées ${m.coupes}`,
    `· voitures x=${sim.modes.voiture.saturationMax?.toFixed?.(2)} vélos x=${sim.modes.cyclable.saturationMax?.toFixed?.(2)} personnes ${sim.personnes.transportees}/${sim.personnes.demande}`);
  await J(() => window.__jeu.fermerFlux());
  await J(([x]) => window.__jeu.allerA(x, 15), [milieu]);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${o.sortie}/flux-carte-${cible}-${o.langue}.png` });
  await J(() => window.__jeu.vue('3d'));
  await J(([x]) => window.__jeu.camera({ cibleLonLat: x, distance: 160, azimut: 0.4, inclinaison: 0.8 }), [milieu]);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${o.sortie}/flux-3d-${cible}-${o.langue}.png` });
  console.log(cible, erreurs.length ? `erreurs : ${erreurs.join(' | ')}` : 'aucune erreur');
}
await nav.close();
serveur.close();
