// Captures de l'éditeur de section (v0.3) : un tronçon choisi, la section modifiée,
// en 2D puis en 3D, aux cibles de bureau. Pour regarder, pas pour valider.
//   node outils/capture-editeur.mjs --sortie /chemin/hors/captures [--troncon seg-u…] [--langue en]
import { servir, lancerChromium, CIBLES, options } from './navigateur.mjs';

const o = options(process.argv.slice(2), { sortie: 'captures/editeur', troncon: '', cibles: 'bureau,bureau_125', langue: 'fr' });
const serveur = await servir('.');
const nav = await lancerChromium();
for (const cible of o.cibles.split(',')) {
  const page = await (await nav.newContext(CIBLES[cible])).newPage();
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text()); });
  await page.goto(`${serveur.base}index.html?debug=1&vue=2d`);
  await page.waitForFunction(() => window.__jeu?.pret);
  await page.evaluate(() => window.__jeu.pret());
  await page.evaluate(() => window.__jeu.jouer());
  if (o.langue !== 'fr') await page.evaluate(l => { const s = document.getElementById('langue'); s.value = l; s.dispatchEvent(new Event('change')); }, o.langue);
  // Un tronçon à trois bandes ou plus, assez long, sinon celui demandé
  const id = o.troncon || await page.evaluate(async () => {
    const r = await (await fetch('data/processed/network.json')).json();
    return r.streetSegments.find(s => s.emprise?.confiance === 'moyenne' && s.emprise.bandes.length === 3 && s.emprise.largeur > 14 && s.lengthMeters > 80)?.id;
  });
  const c = await page.evaluate(async i => { const g = await (await fetch('data/processed/streets.geojson')).json(); const l = g.features.find(f => f.properties.id === i).geometry.coordinates; return l[Math.floor(l.length / 2)]; }, id);
  await page.evaluate(([x, i]) => { window.__jeu.selectionner(i); return window.__jeu.allerA(x, 18.6); }, [c, id]);
  await page.click('#editer-section');
  // Chaussée : réduite, une piste dans chaque sens, une voie bus, une voie auto
  const s = await page.evaluate(i => window.__jeu.section(i), id);
  const ch = s.bandes.findIndex(b => b.type === 'chaussee');
  if (ch >= 0) {
    const J = (...a) => page.evaluate(a => window.__jeu.operation(...a), a);
    await J('changerType', ch, 'voiture');
    await J('definirLargeur', ch, 3.2);
    await J('ajouter', 'cyclable', ch - 1);
    await J('ajouter', 'bus', ch + 1);
    await J('changerSens', ch + 2, 'retour');
    const s2 = await page.evaluate(i => window.__jeu.section(i), id);
    await J('ajouter', 'cyclable', s2.bandes.length - 2);
    const s3 = await page.evaluate(i => window.__jeu.section(i), id);
    await J('changerSens', s3.bandes.length - 2, 'retour');
    await page.evaluate(b => window.__jeu.choisirBande(b), s3.bandes[2].id);
  }
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${o.sortie}/editeur-2d-${cible}-${o.langue}.png` });
  // Débordements : la page ne défile pas en largeur, l'éditeur tient sans couper ses commandes
  const m = await page.evaluate(() => {
    const e = document.getElementById('editeur'), c = document.getElementById('carte');
    const coupes = [...e.querySelectorAll('button, select, input')].filter(x => { const r = x.getBoundingClientRect(), p = e.getBoundingClientRect(); return r.right > p.right + 1 || r.bottom > p.bottom + 1; }).length;
    return { defile: document.documentElement.scrollWidth > innerWidth, editeur: Math.round(e.getBoundingClientRect().height), carte: Math.round(c.getBoundingClientRect().height), coupes };
  });
  console.log(cible, `éditeur ${m.editeur} px, carte ${m.carte} px, défilement horizontal ${m.defile ? 'OUI' : 'non'}, commandes coupées ${m.coupes}`);
  await page.evaluate(() => window.__jeu.vue('3d'));
  await page.evaluate(([x]) => window.__jeu.camera({ cibleLonLat: x, distance: 90, azimut: 0.6, inclinaison: 0.9 }), [c]);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${o.sortie}/editeur-3d-${cible}-${o.langue}.png` });
  console.log(cible, id, erreurs.length ? `erreurs : ${erreurs.join(' | ')}` : 'aucune erreur');
}
await nav.close();
serveur.close();
