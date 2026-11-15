// v0.3 : mesure de l'emprise, section transversale, contraintes de largeur,
// annuler / rétablir, et mêmes bandes sur la carte et dans la scène 3D.
import { readFileSync } from 'node:fs';
import { intervallesDans, indexerSurfaces, couperEn, mesurerTroncon, nettoyerBandes, METHODE_COUPE } from '../js/geo/coupe.js';
import { boite } from '../js/geo/geometrie.js';
import { decalerLigne, contourBande } from '../js/geo/decalage.js';
import {
  sectionMesuree, libre, occupe, dm, deplacerLimite, definirLargeur, ajouter, retirer, deplacer, diviser,
  changerType, changerSens, verifier, decalages, memeSection, OPERATIONS,
} from '../js/section.js';
import { creerHistorique } from '../js/historique.js';
import { featuresSections } from '../js/carte/sections.js';
import { maillerSections } from '../js/scene/geometrie3d.js';
import { BANDES, BANDE_DEPUIS_SURFACE } from '../js/data/bandes.js';
import { PALETTE } from '../js/palette.js';
import { createStore, memoryBackend } from '../js/lib/save.js';

const lire = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
const reseau = lire('data/processed/network.json');
const meta = lire('data/processed/metadata.json');

// Une rue de synthèse, d'ouest en est le long de y = 0 : trottoir 2 m | chaussée 8 m | trottoir 3 m,
// l'axe à 4 m du bord gauche (nord), et un jardin privé (hors emprise) au-delà du trottoir sud.
const rect = (x0, y0, x1, y1) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]];
const surface = (type, rings) => ({ type, rings, boite: boite(rings.flat()) });
const rue = indexerSurfaces([
  surface('SW', rect(0, 4, 100, 6)),
  surface('S', rect(0, -4, 100, 4)),
  surface('SW', rect(0, -7, 100, -4)),
]);
const axe = [[0, 0], [100, 0]];

const segmentMesure = { id: 'seg-test', emprise: { largeur: 13, axeDepuisGauche: 6, bandes: [{ type: 'SW', largeur: 2 }, { type: 'S', largeur: 8 }, { type: 'SW', largeur: 3 }], coupes: 3, ecart: 0, confiance: 'moyenne' } };
const depart = () => sectionMesuree(segmentMesure);

group('emprise — mesure sur les surfaces');
test('un segment traverse un polygone : un intervalle, trous compris', () => {
  assert.deepEqual(intervallesDans([-5, 0], [15, 0], rect(0, -1, 10, 1)).map(i => i.map(v => Math.round(v * 100) / 100)), [[0.25, 0.75]]);
  const troue = [...rect(0, -5, 10, 5), ...rect(4, -5 + 0.0001, 6, 5 - 0.0001)];
  assert.equal(intervallesDans([-5, 0], [15, 0], troue).length, 2);
  assert.deepEqual(intervallesDans([2, 0], [15, 0], rect(0, -1, 10, 1)).map(i => i[0]), [0], 'commence dedans');
});
test('une coupe donne les bandes de gauche à droite, et la position de l\'axe', () => {
  const c = couperEn([50, 0], 0, rue);
  assert.deepEqual(c.map(b => b.type), ['SW', 'S', 'SW']);
  assert.deepEqual(c.map(b => Math.round(b.largeur * 10) / 10), [2, 8, 3]);
  assert.equal(Math.round(c[0].gauche * 10) / 10, 6);
});
test('la mesure d\'un tronçon : largeur = somme exacte des bandes, au décimètre', () => {
  const m = mesurerTroncon(axe, rue);
  assert.equal(m.largeur, 13);
  assert.deepEqual(m.bandes, [{ type: 'SW', largeur: 2 }, { type: 'S', largeur: 8 }, { type: 'SW', largeur: 3 }]);
  assert.equal(m.axeDepuisGauche, 6);
  assert.equal(m.confiance, 'moyenne');
  assert.ok(m.coupes >= 2);
});
test('sans surface sous l\'axe, ou sans bord dans la portée : aucune mesure (rien d\'inventé)', () => {
  assert.equal(mesurerTroncon([[0, 50], [100, 50]], rue), null);
  const place = indexerSurfaces([surface('S', rect(-200, -200, 300, 200))]);
  assert.equal(mesurerTroncon(axe, place), null);
});
test('un reste de dessin plus fin que le minimum rejoint sa voisine la plus large', () => {
  const b = nettoyerBandes([{ type: 'SW', largeur: 2 }, { type: 'S', largeur: 0.2 }, { type: 'M', largeur: 5 }], METHODE_COUPE.bandeMin);
  assert.deepEqual(b, [{ type: 'SW', largeur: 2 }, { type: 'M', largeur: 5.2 }]);
});
test('les données : chaque emprise mesurée vaut la somme de ses bandes, avec méthode et confiance', () => {
  const mesures = reseau.streetSegments.filter(s => s.emprise);
  assert.equal(mesures.length, meta.emprisePublique.bilan.mesures);
  assert.ok(mesures.length > 900, `${mesures.length} tronçons mesurés`);
  for (const s of mesures) {
    const e = s.emprise;
    assert.equal(e.bandes.reduce((t, b) => t + dm(b.largeur), 0), dm(e.largeur), s.id);
    assert.ok(['moyenne', 'faible'].includes(e.confiance), s.id);
    assert.ok(e.bandes.every(b => BANDE_DEPUIS_SURFACE[b.type]), `${s.id} : type de surface sans bande`);
    assert.ok(e.axeDepuisGauche >= 0 && e.axeDepuisGauche <= e.largeur + 0.1, s.id);
    assert.equal(s.editable, true);
  }
  assert.ok(reseau.streetSegments.filter(s => !s.emprise).every(s => s.emprise === null && s.editable === false), 'sans mesure : null, non éditable');
  assert.ok(meta.emprisePublique.methode.length > 100);
});

group('section — contraintes de largeur');
test('la section de départ reprend les bandes mesurées ; la chaussée reste « voies non renseignées »', () => {
  const s = depart();
  assert.deepEqual(s.bandes.map(b => [b.type, b.largeur, b.sens]), [['trottoir', 2, null], ['chaussee', 8, null], ['trottoir', 3, null]]);
  assert.equal(libre(s), 0);
  assert.equal(sectionMesuree({ id: 'x', emprise: null }), null);
});
test('déplacer une limite : la somme ne change pas ; borné au minimum, jamais au-delà de l\'emprise', () => {
  const r = deplacerLimite(depart(), 0, 0.5);
  assert.deepEqual(r.section.bandes.map(b => b.largeur), [2.5, 7.5, 3]);
  assert.equal(occupe(r.section), dm(13));
  const borne = deplacerLimite(depart(), 0, 100);
  assert.equal(borne.borne, true);
  assert.equal(borne.section.bandes[1].largeur, 0.3);
  assert.equal(deplacerLimite(depart(), 2, 0.1).refus, 'emprise', 'la dernière limite ne mange que l\'espace libre');
});
test('fixer une largeur : refusé à voix haute si l\'emprise serait dépassée', () => {
  const r = definirLargeur(depart(), 1, 9);
  assert.equal(r.refus, 'emprise-de');
  assert.equal(r.valeurs.n, 1);
  assert.equal(definirLargeur(depart(), 1, 0.1).refus, 'min');
  const ok = definirLargeur(depart(), 1, 6);
  assert.equal(libre(ok.section), 2);
});
test('ajouter prend l\'espace libre ; sans espace, refus', () => {
  assert.equal(ajouter(depart(), 'cyclable').refus, 'plein');
  const s = definirLargeur(depart(), 1, 6).section;
  const r = ajouter(s, 'cyclable', 0);
  assert.equal(r.indice, 1);
  assert.deepEqual(r.section.bandes.map(b => b.type), ['trottoir', 'cyclable', 'chaussee', 'trottoir']);
  assert.equal(r.section.bandes[1].largeur, 1.8);
  assert.equal(r.section.bandes[1].sens, 'aller');
  const petit = ajouter(definirLargeur(depart(), 1, 7.5).section, 'bus');
  assert.equal(petit.section.bandes.at(-1).largeur, 0.5, 'la largeur par défaut est réduite à l\'espace libre');
  assert.equal(ajouter(s, 'chaussee').refus, 'type', 'la chaussée inconnue ne s\'ajoute pas');
});
test('retirer, déplacer, diviser, changer type et sens', () => {
  const s = depart();
  assert.equal(libre(retirer(s, 0).section), 2);
  assert.equal(retirer({ ...s, bandes: [s.bandes[0]] }, 0).refus, 'derniere');
  assert.deepEqual(deplacer(s, 0, 1).section.bandes.map(b => b.type), ['chaussee', 'trottoir', 'trottoir']);
  assert.equal(deplacer(s, 0, -1).refus, 'bord');
  const d = diviser(s, 1).section;
  assert.deepEqual(d.bandes.map(b => b.largeur), [2, 4, 4, 3]);
  assert.equal(new Set(d.bandes.map(b => b.id)).size, 4, 'identifiants uniques');
  assert.deepEqual(diviser({ ...s, bandes: [{ ...s.bandes[0], largeur: 0.5 }] }, 0).refus, 'trop-etroite');
  const v = changerType(s, 1, 'voiture').section;
  assert.equal(v.bandes[1].sens, 'aller');
  assert.equal(changerSens(v, 1, 'double').section.bandes[1].sens, 'double');
  assert.equal(changerSens(s, 0, 'aller').refus, 'sans-sens');
  assert.equal(changerType(v, 1, 'trottoir').section.bandes[1].sens, null);
});
test('aucune suite d\'opérations ne viole les règles (1 000 tirages déterministes)', () => {
  let graine = 7;
  const alea = () => ((graine = (graine * 1103515245 + 12345) % 2147483648) / 2147483648);
  let s = depart();
  const types = Object.keys(BANDES).filter(k => BANDES[k].ajoutable);
  for (let n = 0; n < 1000; n++) {
    const i = Math.floor(alea() * s.bandes.length);
    const ops = [
      () => deplacerLimite(s, i, (alea() - 0.5) * 6), () => definirLargeur(s, i, alea() * 10), () => ajouter(s, types[Math.floor(alea() * types.length)], i),
      () => retirer(s, i), () => deplacer(s, i, alea() < 0.5 ? -1 : 1), () => diviser(s, i), () => changerType(s, i, types[Math.floor(alea() * types.length)]),
    ];
    const r = ops[Math.floor(alea() * ops.length)]();
    if (r.section) s = r.section;
    assert.deepEqual(verifier(s), [], `après ${n} opérations`);
    assert.ok(occupe(s) <= dm(s.emprise));
  }
});
test('les opérations ne modifient jamais leur argument', () => {
  const s = depart(), copie = JSON.stringify(s);
  for (const [nom, args] of [['deplacerLimite', [0, 1]], ['definirLargeur', [1, 5]], ['retirer', [0]], ['deplacer', [0, 1]], ['diviser', [1]], ['changerType', [1, 'bus']]]) OPERATIONS[nom](s, ...args);
  assert.equal(JSON.stringify(s), copie);
});
test('décalages : contigus, décroissants, de +axe à +axe − emprise occupée', () => {
  const d = decalages(depart());
  assert.deepEqual(d.map(b => [b.gauche, b.droite]), [[6, 4], [4, -4], [-4, -7]]);
  assert.ok(memeSection(depart(), depart()));
  assert.ok(!memeSection(depart(), deplacerLimite(depart(), 0, 0.1).section));
});

group('section — annuler / rétablir');
test('annuler puis rétablir retrouve exactement les états', () => {
  const h = creerHistorique({ sections: {} });
  const a = { sections: { x: depart() } };
  const b = { sections: { x: deplacerLimite(depart(), 0, 1).section } };
  h.faire(a); h.faire(b);
  assert.equal(h.annuler(), a);
  assert.equal(h.annuler().sections.x, undefined);
  assert.equal(h.annuler(), null);
  assert.equal(h.retablir(), a);
  h.faire({ sections: {} });
  assert.equal(h.peutRetablir, false, 'une nouvelle action oublie le futur');
  assert.equal(h.annuler(), a);
});

group('section — même dessin en 2D et en 3D');
test('les bords décalés sont parallèles à l\'axe et partagés entre bandes voisines', () => {
  const l = [[0, 0], [10, 0], [20, 10]];
  const g = decalerLigne(l, 2);
  assert.deepEqual(g[0], [0, 2]);
  assert.equal(g.length, 3);
  const c = contourBande(l, 2, -1);
  assert.equal(c.length, 7);
  assert.deepEqual(c[0], c.at(-1));
});
test('la carte et la scène dessinent les mêmes bandes, mêmes identifiants, mêmes bords', () => {
  const s = ajouter(definirLargeur(depart(), 1, 6).section, 'cyclable').section;
  s.troncon = 'seg-test';
  const fc = featuresSections([{ ligne: axe, section: s }], p => p, p => p);
  const polys = fc.features.filter(f => f.geometry.type === 'Polygon');
  const m = maillerSections([{ ligne: axe, section: s }], () => [1, 1, 1]);
  assert.deepEqual(polys.map(f => f.properties.id), m.ids);
  for (const f of polys) assert.deepEqual([f.properties.gauche, f.properties.droite], [m.bandes.get(f.properties.id).gauche, m.bandes.get(f.properties.id).droite]);
  // pas de chevauchement : chaque bande commence où finit la précédente
  for (let i = 1; i < polys.length; i++) assert.equal(polys[i].properties.gauche, polys[i - 1].properties.droite);
  // la ligne de sens d'une bande « retour » va contre l'axe
  const r = changerSens(s, 3, 'retour').section;
  const sens = featuresSections([{ ligne: axe, section: r }], p => p, p => p).features.find(f => f.properties.sens);
  assert.ok(sens.geometry.coordinates[0][0] > sens.geometry.coordinates.at(-1)[0]);
});
test('chaque type de bande a sa couleur dans la palette, ses textes, et un motif ou un sigle', () => {
  const textes = readFileSync(new URL('../js/data/textes.js', import.meta.url), 'utf8');
  for (const [type, b] of Object.entries(BANDES)) {
    assert.ok(PALETTE[b.couleur], type);
    assert.ok(textes.includes(`'bande.${type}.sigle'`), type);
  }
});

group('section — sauvegarde');
test('un scénario relu est le même, et se dessine pareil', () => {
  const store = createStore({ game: 'test', entries: { partie: { version: 1 } }, backend: memoryBackend() });
  const s = diviser(depart(), 1).section;
  const partie = { selection: 'seg-test', couches: { sections: true }, scenario: { sections: { 'seg-test': s } } };
  store.save('partie', partie);
  const relue = store.load('partie');
  assert.deepEqual(relue, partie);
  assert.deepEqual(decalages(relue.scenario.sections['seg-test']), decalages(s));
});
