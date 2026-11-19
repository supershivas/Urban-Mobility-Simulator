// v0.6 : le trafic en temps réel — réseau de chemins dirigés (voies + raccords), entrées au bord,
// poursuite IDM, feux, déterminisme à graine fixe, reconstruction quand le scénario change.
import { readFileSync } from 'node:fs';
import { construireReseau, creerTrafic, voiesDuTroncon, vert } from '../js/trafic.js';
import { sectionMesuree } from '../js/section.js';
import { DESSIN_CARREFOUR as D } from '../js/data/carrefours.js';
import { REFERENCES } from '../js/data/simulation.js';
import { wgs84VersLambert } from '../js/geo/coordonnees.js';

const lire = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));

// Une croix de synthèse : quatre rues de 200 m autour du nœud N, chacune coupée par le bord (nœud x-…)
const bande = (id, type, largeur, sens = null) => ({ id, type, largeur, sens });
const deuxSens = id => ({ troncon: id, emprise: 12, axe: 6, prochain: 5, bandes: [
  bande('b1', 'trottoir', 2), bande('b2', 'voiture', 4, 'retour'), bande('b3', 'voiture', 4, 'aller'), bande('b4', 'trottoir', 2),
] });
const lignes = { est: [[0, 0], [200, 0]], nord: [[0, 0], [0, 200]], ouest: [[-200, 0], [0, 0]], sud: [[0, -200], [0, 0]] };
const sortants = ['est', 'nord'];
const segments = new Map(Object.keys(lignes).map(id => [id, {
  id, fromNode: sortants.includes(id) ? 'N' : `x-${id}`, toNode: sortants.includes(id) ? `x-${id}` : 'N', niveau: 0,
  hierarchieCode: 'MAR', lengthMeters: 200, sourceAttributes: { oneway: null, speedLimit: 50 },
}]));
const noeuds = new Map([['N', { id: 'N', connectedSegmentIds: Object.keys(lignes) }], ...Object.keys(lignes).map(id => [`x-${id}`, { id: `x-${id}`, connectedSegmentIds: [id] }])]);
const croix = ({ regulation = null, sections = {} } = {}) => construireReseau({
  segments, noeuds, sectionDe: id => (id in sections ? sections[id] : deuxSens(id)), ligneDe: id => lignes[id],
  carrefourDe: () => null, regulationDe: () => regulation, vitesseVeloKmh: 18, D,
});
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

group('trafic — réseau');
test('chaque voie à double sens donne deux chemins ; une chaussée inconnue suit le sens de la source', () => {
  const v = voiesDuTroncon({ id: 't', sourceAttributes: { oneway: 'unique-inverse' } }, null);
  assert.deepEqual(v.map(x => [x.mode, x.sens]), [['general', 'retour']]);
  const r = croix();
  assert.equal([...r.chemins.values()].filter(c => c.type === 'voie').length, 8);
  assert.equal(r.entrees.length, 4); // une par rue, dans le sens qui entre
});
test('les raccords partent du bout exact de la voie qui arrive et finissent au début de celle qui part', () => {
  const r = croix();
  const raccords = [...r.chemins.values()].filter(c => c.type === 'raccord');
  assert.ok(raccords.length >= 8);
  for (const c of r.chemins.values()) {
    for (const s of c.suivants) assert.ok(dist(c.points.at(-1), s.points[0]) < 0.01, `${c.cle} → ${s.cle}`);
  }
});
test('on roule à droite : la voie « aller » de l\'est est au sud de l\'axe', () => {
  const r = croix();
  const c = r.chemins.get('est:b3|a');
  assert.ok(c.points[Math.floor(c.points.length / 2)][1] < 0);
  assert.equal(c.sortie, true);
});

group('trafic — mouvement');
test('déterministe : même graine, même état après 2 minutes', () => {
  const a = creerTrafic(croix(), { graine: 7 }), b = creerTrafic(croix(), { graine: 7 });
  for (let i = 0; i < 2400; i++) { a.pas(); b.pas(); }
  assert.ok(a.nombre > 0);
  assert.deepEqual([...a.positions().voiture], [...b.positions().voiture]);
});
test('personne ne dépasse la vitesse de sa voie, personne ne recule, aucun bloc n\'en chevauche un autre sur sa voie', () => {
  const t = creerTrafic(croix(), { graine: 3, demandeDe: () => ({ voiture: { aller: 1500, retour: 1500 } }) });
  let vu = 0;
  for (let i = 0; i < 6000; i++) {
    t.pas();
    if (i % 50) continue;
    for (const c of t.reseau.chemins.values()) {
      for (let k = 0; k < c.vehicules.length; k++) {
        const v = c.vehicules[k];
        assert.ok(v.v >= 0 && v.v <= c.vMax + 1, `${c.cle} v = ${v.v}`); // freinage confortable : un léger excès en entrant dans un raccord
        if (k > 0 && c.type === 'voie') assert.ok(c.vehicules[k - 1].s - c.vehicules[k - 1].longueur - v.s > -0.5, `chevauchement sur ${c.cle}`);
        vu++;
      }
    }
  }
  assert.ok(vu > 100);
  const b = t.bilan();
  assert.ok(b.sortis > 0);
  assert.equal(b.sansIssue, 0); // la croix raccorde tout
});
test('au rouge, aucun bloc ne franchit la ligne d\'arrêt s\'il pouvait s\'arrêter', () => {
  const r = croix({ regulation: 'feux' });
  const t = creerTrafic(r, { graine: 5, demandeDe: () => ({ voiture: { aller: 900, retour: 900 } }) });
  const F = REFERENCES.feux;
  let franchis = 0, arretes = 0;
  const avant = new Map();
  for (let i = 0; i < 8000; i++) {
    for (const v of t.vehicules()) avant.set(v.id, { chemin: v.chemin, v: v.v, s: v.s });
    t.pas();
    for (const v of t.vehicules()) {
      const a = avant.get(v.id);
      if (!a || a.chemin === v.chemin || !a.chemin.feu) continue;
      // Il vient de quitter une voie à feu : était-ce au vert, ou ne pouvait-il plus s'arrêter ?
      const c = a.chemin;
      if (!vert(t.temps - 0.05, c.feu.phase, c.feu.np, F)) {
        const reste = c.longueur - a.s - 0.5;
        if (reste > 0 && (a.v * a.v) / (2 * reste) < 4.5) franchis++;
      }
    }
    if (i === 4000) arretes = t.vehicules().filter(v => v.chemin.feu && v.v < 0.5).length;
  }
  assert.equal(franchis, 0);
  assert.ok(arretes > 0, 'une file au feu');
});
test('fermer la seule sortie d\'une branche : les blocs qui y allaient sortent « sans issue » ; le débit mesuré se lit', () => {
  const r = croix();
  const t = creerTrafic(r, { graine: 2 });
  for (let i = 0; i < 12000; i++) t.pas();
  const m = t.mesures('ouest');
  assert.ok(m.debits.voiture > 0 && m.fenetreS === 600);
  // Une section sans voie automobile à l'est : les voitures n'y vont plus
  const r2 = croix({ sections: { est: { troncon: 'est', emprise: 12, axe: 6, prochain: 3, bandes: [bande('b1', 'trottoir', 6), bande('b2', 'cyclable', 6, 'double')] } } });
  t.reconstruire(r2);
  for (let i = 0; i < 2000; i++) t.pas();
  assert.equal(t.vehicules().filter(v => v.mode === 'voiture' && v.chemin.troncon === 'est').length, 0);
});
test('les feux : vert, puis temps perdu, puis la phase suivante', () => {
  const F = REFERENCES.feux;
  assert.equal(vert(1, 0, 2, F), true);
  assert.equal(vert(F.cycleS / 2 - 1, 0, 2, F), false);
  assert.equal(vert(F.cycleS / 2 + 1, 1, 2, F), true);
  assert.equal(vert(F.cycleS + 1, 0, 2, F), true);
});

group('trafic — le vrai corridor');
test('réseau réel : chemins continus, entrées au bord, 5 minutes simulées en temps raisonnable', () => {
  const reseau = lire('data/processed/network.json');
  const rues = lire('data/processed/streets.geojson');
  const segs = new Map(reseau.streetSegments.map(s => [s.id, s]));
  const nds = new Map(reseau.intersections.map(n => [n.id, n]));
  const lignesM = new Map(rues.features.map(f => [f.properties.id, f.geometry.coordinates.map(wgs84VersLambert)]));
  const t0 = performance.now();
  const r = construireReseau({ segments: segs, noeuds: nds, sectionDe: id => sectionMesuree(segs.get(id)), ligneDe: id => lignesM.get(id) ?? null, carrefourDe: () => null, regulationDe: () => null, vitesseVeloKmh: 18.6, D });
  const msReseau = performance.now() - t0;
  assert.ok(r.entrees.length > 50, `${r.entrees.length} entrées`);
  let trous = 0;
  // Par les clés (comme la reconstruction et le mode debug), pas seulement par les objets : une clé en double se verrait
  for (const c of r.chemins.values()) for (const s of c.suivants) if (r.chemins.get(s.cle) !== s || dist(c.points.at(-1), s.points[0]) > 0.01) trous++;
  assert.equal(trous, 0);
  const trafic = creerTrafic(r, { graine: 1 });
  const t1 = performance.now();
  for (let i = 0; i < 6000; i++) trafic.pas();
  const msSim = performance.now() - t1;
  assert.ok(trafic.nombre > 100, `${trafic.nombre} blocs`);
  console.log(`      réseau ${Math.round(msReseau)} ms, ${r.chemins.size} chemins, ${r.entrees.length} entrées ; 5 min simulées en ${Math.round(msSim)} ms, ${trafic.nombre} blocs, ${JSON.stringify(trafic.bilan())}`);
});
