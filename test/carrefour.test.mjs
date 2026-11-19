// v0.4 : branches et voies d'un carrefour, raccords proposés, choix du joueur,
// traversées, régulation, géométrie partagée 2D / 3D, et le critère du pitch :
// les voies créées dans les tronçons restent correctement connectées aux intersections.
import { readFileSync } from 'node:fs';
import {
  branchesDe, voiesDe, proposer, raccordsDe, verifierCarrefour, basculerRaccord, validerPropositions,
  definirTraversee, definirRegulation, traverseesDe, cle, normaliser, toutesLesVoies,
  directionsDe, basculerDirection, phasesDe, definirModeleFeux, definirVert, modelesPossibles,
} from '../js/carrefour.js';
import { geometrieCarrefour, pointSurLigne, extraire, recul } from '../js/geo/raccords.js';
import { sectionMesuree, changerType, ajouter, retirer, diviser, changerSens } from '../js/section.js';
import { DESSIN_CARREFOUR as D } from '../js/data/carrefours.js';
import { wgs84VersLambert } from '../js/geo/coordonnees.js';

const lire = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
const reseau = lire('data/processed/network.json');
const rues = lire('data/processed/streets.geojson');

// Un carrefour en croix de synthèse : quatre tronçons de 100 m autour du nœud N en (0, 0).
// Est et nord partent du nœud (sortants), ouest et sud y arrivent.
const section = (id, bandes, emprise = 12, axe = 6) => ({ troncon: id, emprise, axe, bandes, prochain: bandes.length + 1 });
const deuxSens = id => section(id, [
  { id: 'b1', type: 'trottoir', largeur: 2, sens: null },
  { id: 'b2', type: 'voiture', largeur: 4, sens: 'retour' }, // circulation à droite : à gauche de l'axe, le sens « retour »
  { id: 'b3', type: 'voiture', largeur: 4, sens: 'aller' },
  { id: 'b4', type: 'trottoir', largeur: 2, sens: null },
]);
const lignes = { est: [[0, 0], [100, 0]], nord: [[0, 0], [0, 100]], ouest: [[-100, 0], [0, 0]], sud: [[0, -100], [0, 0]] };
const segs = new Map(Object.keys(lignes).map(id => [id, {
  id, fromNode: ['est', 'nord'].includes(id) ? 'N' : `x-${id}`, toNode: ['est', 'nord'].includes(id) ? `x-${id}` : 'N', niveau: 0, sourceAttributes: { oneway: null },
}]));
const noeud = { id: 'N', connectedSegmentIds: ['est', 'nord', 'ouest', 'sud'] };
const croix = (sections = {}) => branchesDe(noeud, {
  segments: segs, sectionDe: id => (id in sections ? sections[id] : deuxSens(id)), ligneDe: id => lignes[id],
});

group('carrefour — branches et voies');
test('quatre branches, triées par angle, cap pris en s\'éloignant du nœud', () => {
  const b = croix();
  assert.deepEqual(b.map(x => x.troncon), ['sud', 'est', 'nord', 'ouest']);
  assert.deepEqual(b.map(x => Math.round((x.angle * 180) / Math.PI)), [-90, 0, 90, 180]);
  assert.deepEqual(b.find(x => x.troncon === 'ouest').ligne[0], [0, 0]); // la ligne part toujours du nœud
});
test('une boucle et un tronçon sans géométrie ne sont pas des branches', () => {
  const s = new Map([...segs, ['boucle', { id: 'boucle', fromNode: 'N', toNode: 'N', sourceAttributes: {} }]]);
  const b = branchesDe({ id: 'N', connectedSegmentIds: ['est', 'boucle', 'fantome'] }, { segments: s, sectionDe: () => null, ligneDe: id => lignes[id] ?? null });
  assert.deepEqual(b.map(x => x.troncon), ['est']);
});
test('sens des voies : « aller » sort d\'une branche sortante et entre par une branche entrante', () => {
  const b = croix();
  const est = voiesDe(b.find(x => x.troncon === 'est')), ouest = voiesDe(b.find(x => x.troncon === 'ouest'));
  assert.deepEqual(est.map(v => [v.bande, v.entrante, v.sortante]), [['b2', true, false], ['b3', false, true]]);
  assert.deepEqual(ouest.map(v => [v.bande, v.entrante, v.sortante]), [['b2', false, true], ['b3', true, false]]);
  // Circulation à droite : en arrivant de l'ouest (vers l'est), la voie entrante est au sud (à droite)
  const e = ouest.find(v => v.entrante);
  assert.ok(e.cote > 0, 'la voie entrante est à gauche en s\'éloignant du nœud, donc à droite en arrivant');
});
test('chaussée non découpée et tronçon sans section : une voie générale, sens de la source', () => {
  const s = new Map(segs); s.set('est', { ...segs.get('est'), sourceAttributes: { oneway: 'unique-direct' } });
  const b = branchesDe(noeud, { segments: s, sectionDe: id => (id === 'est' ? null : section(id, [{ id: 'b1', type: 'chaussee', largeur: 8, sens: null }], 8, 4)), ligneDe: id => lignes[id] });
  const est = voiesDe(b.find(x => x.troncon === 'est'));
  assert.deepEqual(est.map(v => [v.id, v.mode, v.entrante, v.sortante, v.connue]), [['est:inconnu', 'general', false, true, false]]);
  const nord = voiesDe(b.find(x => x.troncon === 'nord'));
  assert.deepEqual(nord.map(v => [v.mode, v.entrante, v.sortante]), [['general', true, true]]);
});
test('bandes sans circulation (trottoir, stationnement…) : pas de voie', () => {
  assert.ok(croix().flatMap(voiesDe).every(v => ['voiture', 'bus', 'cyclable', 'general'].includes(v.mode)));
});

group('carrefour — raccords proposés');
test('croix à une voie par sens : chaque voie entrante va vers les trois autres branches', () => {
  const b = croix(), p = proposer(b);
  assert.equal(p.length, 12);
  const v = verifierCarrefour(b, p.map(x => ({ ...x, origine: 'propose' })));
  assert.deepEqual([v.impasses, v.inaccessibles, v.invalides], [[], [], []]);
});
test('pas de demi-tour, jamais une voiture vers une voie bus ou une piste', () => {
  const avecBus = section('est', [
    { id: 'b1', type: 'cyclable', largeur: 2, sens: 'aller' },
    { id: 'b2', type: 'bus', largeur: 3, sens: 'aller' },
    { id: 'b3', type: 'voiture', largeur: 3, sens: 'aller' },
    { id: 'b4', type: 'voiture', largeur: 3, sens: 'retour' },
  ], 12, 6);
  const b = croix({ est: avecBus });
  const voies = toutesLesVoies(b);
  for (const r of proposer(b)) {
    const a = voies.get(r.de), s = voies.get(r.vers);
    assert.notEqual(a.troncon, s.troncon);
    if (a.mode === 'voiture') assert.ok(['voiture', 'general'].includes(s.mode), cle(r.de, r.vers));
  }
  // La piste et la voie bus de l'est sont atteintes par leurs semblables… qui n'existent pas ici :
  // seules les voies générales ou voitures y mèneraient, ce qui est interdit → elles restent inaccessibles.
  const v = verifierCarrefour(b, raccordsDe(b, null).raccords);
  assert.deepEqual(v.inaccessibles.sort(), ['est:b1', 'est:b2']);
});
test('deux voies entrantes : la gauche tourne à gauche, la droite à droite, toutes vont tout droit', () => {
  const ouest = section('ouest', [
    { id: 'b1', type: 'voiture', largeur: 3, sens: 'retour' },
    { id: 'b2', type: 'voiture', largeur: 3, sens: 'aller' },
    { id: 'b3', type: 'voiture', largeur: 3, sens: 'aller' },
  ], 9, 4.5);
  const b = croix({ ouest });
  const p = proposer(b).filter(r => r.de.startsWith('ouest:'));
  // En arrivant de l'ouest, la gauche est au nord : b2 est la voie de gauche, b3 celle de droite
  const vers = de => p.filter(r => r.de === de).map(r => r.vers.split(':')[0]).sort();
  assert.deepEqual(vers('ouest:b2'), ['est', 'nord']);
  assert.deepEqual(vers('ouest:b3'), ['est', 'sud']);
});
test('angles : normaliser rend un angle dans ]-π, π]', () => {
  assert.equal(normaliser(3 * Math.PI), Math.PI);
  assert.ok(Math.abs(normaliser(-3 * Math.PI / 2) - Math.PI / 2) < 1e-12);
});

group('carrefour — choix du joueur');
test('retirer une proposition, puis la remettre : le carrefour revient à vide (null)', () => {
  const b = croix(), [p] = proposer(b);
  const r1 = basculerRaccord(null, b, p.de, p.vers);
  assert.equal(r1.raccorde, false);
  assert.deepEqual(r1.carrefour.retires, [cle(p.de, p.vers)]);
  assert.ok(!raccordsDe(b, r1.carrefour).raccords.some(r => r.de === p.de && r.vers === p.vers));
  const r2 = basculerRaccord(r1.carrefour, b, p.de, p.vers);
  assert.equal(r2.carrefour, null);
});
test('refus écrits : demi-tour, sens, mode, voie inconnue', () => {
  const b = croix({ est: section('est', [{ id: 'b1', type: 'cyclable', largeur: 2, sens: 'aller' }, { id: 'b2', type: 'voiture', largeur: 3, sens: 'retour' }], 5, 2.5) });
  assert.equal(basculerRaccord(null, b, 'est:b2', 'est:b1').refus, 'demi-tour');
  assert.equal(basculerRaccord(null, b, 'est:b1', 'nord:b2').refus, 'pas-entrante');
  assert.equal(basculerRaccord(null, b, 'ouest:b3', 'nord:b2').refus, 'pas-sortante');
  const m = basculerRaccord(null, b, 'ouest:b3', 'est:b1');
  assert.deepEqual([m.refus, m.valeurs], ['mode', { de: 'voiture', vers: 'cyclable' }]);
  assert.equal(basculerRaccord(null, b, 'ouest:b9', 'est:b1').refus, 'voie');
});
test('valider les propositions : elles deviennent des choix du joueur', () => {
  const b = croix();
  const v = validerPropositions(null, b);
  assert.equal(v.carrefour.ajoutes.length, 12);
  assert.ok(raccordsDe(b, v.carrefour).raccords.every(r => r.origine === 'joueur'));
  assert.equal(validerPropositions(v.carrefour, b).refus, 'rien-a-valider');
});
test('traversées : un passage piéton exige un trottoir, une traversée cyclable une piste', () => {
  const b = croix({ est: section('est', [{ id: 'b1', type: 'voiture', largeur: 3, sens: 'double' }], 3, 1.5), nord: null });
  assert.equal(definirTraversee(null, b, 'est', 'pieton', true).refus, 'sans-trottoir');
  assert.equal(definirTraversee(null, b, 'sud', 'velo', true).refus, 'sans-piste');
  assert.equal(definirTraversee(null, b, 'nord', 'pieton', true).refus, 'section-inconnue');
  assert.equal(definirTraversee(null, b, 'ailleurs', 'pieton', true).refus, 'branche');
  const ok = definirTraversee(null, b, 'sud', 'pieton', true).carrefour;
  assert.deepEqual(ok.traversees, { sud: { pieton: true } });
  assert.deepEqual(traverseesDe(b, ok), [{ troncon: 'sud', type: 'pieton' }]);
  assert.equal(definirTraversee(ok, b, 'sud', 'pieton', null).carrefour, null, 'revenu à « non renseigné » : rien à garder');
});
test('régulation : une valeur de la liste ou null', () => {
  assert.equal(definirRegulation(null, [], 'feux').carrefour.regulation, 'feux');
  assert.equal(definirRegulation(null, [], 'rond').refus, 'regulation');
  assert.equal(definirRegulation({ regulation: 'feux' }, [], null).carrefour, null);
});

group('carrefour — les voies créées dans les tronçons restent connectées (critère v0.4)');
test('une voie ajoutée dans un tronçon reçoit ses raccords ; une voie retirée emporte les siens', () => {
  let s = deuxSens('est');
  const b0 = croix({ est: s });
  // Le joueur ajoute un raccord à la main (après l'avoir retiré puis remis : il devient le sien)
  const c = validerPropositions(null, b0).carrefour;
  // Le tronçon est gagne une piste cyclable sortante (b5) et perd sa voie entrante b2
  s = ajouter({ ...s, emprise: 14 }, 'cyclable', 2).section;
  s = retirer(s, s.bandes.findIndex(x => x.id === 'b2')).section;
  const b1 = croix({ est: s });
  const { raccords, perdus } = raccordsDe(b1, c);
  const v = verifierCarrefour(b1, raccords);
  assert.deepEqual(v.invalides, []);
  assert.deepEqual(perdus.sort(), ['est:b2>nord:b3', 'est:b2>ouest:b2', 'est:b2>sud:b2'].sort());
  assert.deepEqual(v.impasses, []);
  // La nouvelle piste : atteinte par les voitures ? non (mode) ; elle reste signalée « inaccessible »
  assert.ok(v.inaccessibles.every(id => id === 'est:b5'));
});
test('réseau réel : sur chaque nœud, chaque raccord relie une voie entrante à une voie sortante existante, d\'un mode compatible', () => {
  const lignesL = new Map(rues.features.map(f => [f.properties.id, f.geometry.coordinates.map(wgs84VersLambert)]));
  const segments = new Map(reseau.streetSegments.map(x => [x.id, x]));
  let n = 0, raccordsTotal = 0;
  for (const nd of reseau.intersections) {
    // Chaussées découpées en deux voies (aller, retour), comme le ferait le joueur
    const sectionDe = id => {
      const m = sectionMesuree(segments.get(id));
      if (!m) return null;
      const i = m.bandes.findIndex(x => x.type === 'chaussee');
      if (i < 0) return m;
      let r = changerType(m, i, 'voiture').section;
      const d = diviser(r, i);
      if (d.refus) return r;
      return changerSens(d.section, i + 1, 'retour').section;
    };
    const b = branchesDe(nd, { segments, sectionDe, ligneDe: id => lignesL.get(id) });
    if (b.length < 2) continue;
    n++;
    const { raccords } = raccordsDe(b, null);
    raccordsTotal += raccords.length;
    assert.deepEqual(verifierCarrefour(b, raccords).invalides, [], nd.id);
    // La géométrie : chaque raccord part de l'ancre de sa voie et arrive à celle de l'autre, dans la largeur de la voie
    const g = geometrieCarrefour(b, raccords, [], D);
    for (const r of g.raccords) {
      const a = g.ancres.get(r.de), z = g.ancres.get(r.vers);
      assert.deepEqual(r.ligne[0], a.point);
      assert.ok(Math.hypot(r.ligne.at(-1)[0] - z.point[0], r.ligne.at(-1)[1] - z.point[1]) < 1e-9);
    }
  }
  assert.ok(n > 800, `${n} carrefours d'au moins deux branches`);
  assert.ok(raccordsTotal > n * 2);
});

group('carrefour — géométrie');
test('point sur une ligne, portion de ligne', () => {
  assert.deepEqual(pointSurLigne([[0, 0], [10, 0], [10, 10]], 15).p, [10, 5]);
  assert.deepEqual(extraire([[0, 0], [10, 0], [10, 10]], 5, 15), [[5, 0], [10, 0], [10, 5]]);
});
test('recul : demi-emprise la plus large + marge, au moins le minimum', () => {
  assert.equal(recul(croix(), D), 6 + D.reculMargeM);
  assert.equal(recul(croix({ est: null, nord: null, ouest: null, sud: null }), D), D.reculMinM);
});
test('ancres : au recul, dans la largeur de la voie ; zone fermée ; traversée de la largeur de l\'emprise', () => {
  const b = croix();
  const t = definirTraversee(null, b, 'est', 'pieton', true).carrefour;
  const g = geometrieCarrefour(b, raccordsDe(b, t).raccords, traverseesDe(b, t), D);
  const a = g.ancres.get('est:b3'); // voie sortante de l'est : à droite, au sud de l'axe
  assert.deepEqual(a.point.map(Math.round), [7, -2]);
  assert.deepEqual(g.zone[0], g.zone.at(-1));
  assert.equal(g.zone.length, 9);
  const [tr] = g.traversees;
  const xs = tr.anneau.map(p => p[0]), ys = tr.anneau.map(p => p[1]);
  assert.deepEqual([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)].map(v => Math.round(v * 1000) / 1000), [7, 7 + D.largeurPietonM, -6, 6]);
});
test('carte : zone, traversées et raccords du carrefour choisi ; seulement les traversées ailleurs', async () => {
  const { featuresCarrefours } = await import('../js/carte/carrefours.js');
  const b = croix();
  const c = definirTraversee(null, b, 'est', 'pieton', true).carrefour;
  const { raccords } = raccordsDe(b, c);
  const g = geometrieCarrefour(b, raccords, traverseesDe(b, c), D);
  const id = p => p;
  const plein = featuresCarrefours([{ noeud: 'N', geometrie: g, complet: true }], raccords[0].de, id).features;
  assert.equal(plein.filter(f => f.properties.genre === 'zone').length, 1);
  assert.equal(plein.filter(f => f.properties.genre === 'traversee').length, 1);
  const lignes = plein.filter(f => f.properties.genre === 'raccord');
  assert.equal(lignes.length, raccords.length);
  assert.ok(lignes.filter(f => f.properties.choisi).every(f => f.properties.de === raccords[0].de));
  const reduit = featuresCarrefours([{ noeud: 'N', geometrie: g, complet: false }], null, id).features;
  assert.deepEqual(reduit.map(f => f.properties.genre), ['traversee']);
});

group('carrefour — directions et feux (v0.7)');
test('une voie qui entre a une direction par autre branche, de gauche à droite', () => {
  const b = croix();
  const { raccords } = raccordsDe(b, null);
  const v = [...toutesLesVoies(b).values()].find(x => x.entrante && x.troncon === 'ouest');
  const d = directionsDe(b, raccords, v.id);
  assert.deepEqual(d.map(x => [x.troncon, x.direction]), [['nord', 'gauche'], ['est', 'droit'], ['sud', 'droite']]);
  assert.ok(d.every(x => x.actif));
});
test('éteindre une direction retire tous ses raccords ; la rallumer en remet un ; refus sur une voie qui sort', () => {
  const b = croix();
  const v = [...toutesLesVoies(b).values()].find(x => x.entrante && x.troncon === 'ouest');
  const r1 = basculerDirection(null, b, v.id, 'nord');
  assert.equal(r1.actif, false);
  assert.equal(directionsDe(b, raccordsDe(b, r1.carrefour).raccords, v.id).find(x => x.troncon === 'nord').actif, false);
  const r2 = basculerDirection(r1.carrefour, b, v.id, 'nord');
  assert.equal(r2.actif, true);
  assert.equal(directionsDe(b, raccordsDe(b, r2.carrefour).raccords, v.id).find(x => x.troncon === 'nord').raccords.length, 1);
  const sortante = [...toutesLesVoies(b).values()].find(x => x.sortante && !x.entrante);
  assert.equal(basculerDirection(null, b, sortante.id, 'nord').refus, 'voie');
});
test('feux : modèles proposés selon le nombre de branches, durées réglables et bornées', () => {
  const b = croix();
  assert.deepEqual(modelesPossibles(b), ['axes', 'tag-protege', 'par-branche']);
  assert.deepEqual(modelesPossibles(b.slice(0, 3)), ['par-branche']);
  const m = definirModeleFeux(null, b, 'tag-protege');
  assert.equal(m.carrefour.regulation, 'feux');
  const p = phasesDe(b, m.carrefour);
  assert.equal(p.phases.length, 4);
  // Tourne-à-gauche protégé : la phase 0 n'a aucun tourne-à-gauche, la phase 1 seulement eux
  assert.ok(p.phases[1].mouvements.size > 0 && p.phases[0].mouvements.size > 0);
  const v = definirVert(m.carrefour, b, 1, 12);
  assert.equal(phasesDe(b, v.carrefour).phases[1].vert, 12);
  assert.equal(definirVert(m.carrefour, b, 1, 2).refus, 'vert');
  assert.equal(definirVert(null, b, 0, 20).refus, 'pas-de-feux');
  assert.equal(definirModeleFeux(null, b.slice(0, 3), 'axes').refus, 'modele-feux');
  // Une autre régulation efface le réglage des feux
  assert.equal(definirRegulation(v.carrefour, b, 'giratoire').carrefour.feux, undefined);
});

