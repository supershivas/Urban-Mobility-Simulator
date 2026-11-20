// La scène 3D lit les mêmes objets que la carte 2D, avec les mêmes identifiants,
// et ne dessine une hauteur que si la source en donne une.
import { readFileSync } from 'node:fs';
import { creerRepere } from '../js/geo/repere.js';
import { maillerBatiments, maillerBatiment, maillerSurfaces, maillerAxes, maillerRuban, maillerRubans, segmentsDeLignes, polygonesLocaux, lignesLocales, rangDuTriangle, tirets, marquagesSection } from '../js/scene/geometrie3d.js';
import { positionSoleil, directionSoleil, partDeJour } from '../js/scene/soleil.js';
import { hauteurDepuisSolides, etenduesVerticales } from '../outils/donnees/urbis3d.mjs';

const lire = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
const meta = lire('data/processed/metadata.json');
const reseau = lire('data/processed/network.json');
const batiments = lire('data/processed/buildings.geojson');
const rues = lire('data/processed/streets.geojson');
const surfaces = lire('data/processed/street-surfaces.geojson');
const repere = creerRepere(meta.repereLocal.origine);
const TEINTES = { toit: [1, 1, 1], plat: [0.5, 0.5, 0.5], mur: () => [0.8, 0.8, 0.8] };
const mb = maillerBatiments(batiments.features, repere, TEINTES);
const ma = maillerAxes(rues.features, repere, () => ({ couleur: [0, 0, 0], largeur: 2 }));

group('scène 3D — mêmes objets que la carte');
test('les tronçons de la scène sont ceux du modèle et de la carte, mêmes identifiants', () => {
  assert.deepEqual([...ma.ids].sort(), reseau.streetSegments.map(s => s.id).sort());
  assert.deepEqual(ma.ids, rues.features.map(f => f.properties.id));
  assert.equal(ma.lignes.size, reseau.streetSegments.length);
});
test('les bâtiments de la scène sont ceux de la carte, mêmes identifiants, dans le même ordre', () => {
  assert.deepEqual(mb.ids, batiments.features.map(f => f.properties.id));
  assert.equal(new Set(mb.ids).size, meta.comptes.buildings);
  for (const id of mb.ids.slice(0, 50)) assert.match(id, /^bld-u\d+$/);
});
test('chaque triangle retrouve son bâtiment (pour le clic)', () => {
  assert.equal(mb.debuts.length, mb.ids.length + 1);
  assert.equal(mb.debuts.at(-1), mb.indices.length / 3);
  for (const i of [0, 1, 777, mb.ids.length - 1]) {
    assert.equal(rangDuTriangle(mb.debuts, mb.debuts[i]), i);
    assert.equal(rangDuTriangle(mb.debuts, mb.debuts[i + 1] - 1), i);
  }
  assert.equal(rangDuTriangle(mb.debuts, -1), -1);
  assert.equal(rangDuTriangle(mb.debuts, mb.debuts.at(-1)), -1);
});
test('les surfaces gardent leurs identifiants ; celles que la carte ne dessine pas ne sont pas maillées', () => {
  const m = maillerSurfaces(surfaces.features, repere, p => (p.niveau < 0 ? null : [1, 1, 1]));
  const attendus = surfaces.features.filter(f => f.properties.niveau >= 0).map(f => f.properties.id);
  assert.deepEqual(m.ids, attendus);
  assert.ok(m.indices.length > 0 && m.positions.every(Number.isFinite));
});
test('toute la scène tient dans le repère local, en mètres (jamais de lon/lat brutes)', () => {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < mb.positions.length; i += 3) { min = Math.min(min, mb.positions[i], mb.positions[i + 2]); max = Math.max(max, mb.positions[i], mb.positions[i + 2]); }
  assert.ok(min < -1000 && max > 1000 && min > -5000 && max < 5000, `${min} … ${max}`);
});

group('scène 3D — hauteurs');
test('une hauteur vient de la source ou reste null', () => {
  const h = meta.batiments.hauteurs;
  assert.equal(h.source, 'urbis3d');
  assert.ok(h.methode && h.confiance && h.dateSource);
  let connues = 0;
  for (const f of batiments.features) {
    const p = f.properties;
    if (p.hauteur === null) assert.equal(p.solides, 0, `${p.id} : null seulement sans solide`);
    else { connues++; assert.ok(typeof p.hauteur === 'number' && p.hauteur > 0 && p.hauteur < 200 && p.solides >= 1, `${p.id} : ${p.hauteur}`); }
  }
  assert.equal(connues, h.renseignees);
  assert.equal(batiments.features.length - connues, h.nonRenseignees);
  assert.ok(h.nonRenseignees > 0, 'le cas « non renseigné » existe dans les données');
});
test('les hauteurs se recalculent depuis l\'extrait de la source (Zmax − Zmin par bâtiment)', () => {
  const extrait = lire('data/original/urbis3d/solides.json');
  const parBatiment = new Map();
  for (const [, bat, zmin, zmax] of extrait.solides) parBatiment.set(bat, [...(parBatiment.get(bat) ?? []), [zmin, zmax]]);
  for (const f of batiments.features) {
    const attendu = hauteurDepuisSolides(parBatiment.get(Number(f.properties.id.replace('bld-u', ''))));
    assert.equal(f.properties.hauteur, attendu ? attendu.hauteur : null, f.properties.id);
  }
});
test('règle de hauteur : aucun solide ou étendue nulle → null', () => {
  assert.equal(hauteurDepuisSolides(undefined), null);
  assert.equal(hauteurDepuisSolides([]), null);
  assert.equal(hauteurDepuisSolides([[80, 80]]), null);
  assert.deepEqual(hauteurDepuisSolides([[80.04, 95.5]]), { hauteur: 15.5, solides: 1 });
  assert.deepEqual(hauteurDepuisSolides([[80, 90], [79, 101.26]]), { hauteur: 22.3, solides: 2 });
});
test('lecture d\'un MultiPatch : Zmin et Zmax après les parties et les points', () => {
  const parties = 2, points = 3, contenu = 44 + 8 * parties + 16 * points + 16 + 8 * points;
  const b = Buffer.alloc(100 + 8 + contenu);
  b.writeInt32LE(31, 32);
  b.writeInt32BE(1, 100); b.writeInt32BE(contenu / 2, 104);
  b.writeInt32LE(31, 108); b.writeInt32LE(parties, 144); b.writeInt32LE(points, 148);
  const z = 152 + 8 * parties + 16 * points;
  b.writeDoubleLE(71.5, z); b.writeDoubleLE(93.25, z + 8);
  assert.deepEqual(etenduesVerticales(b), [[71.5, 93.25]]);
  b.writeInt32LE(5, 32);
  assert.throws(() => etenduesVerticales(b));
});
test('un bâtiment de hauteur connue monte à sa hauteur ; inconnu, il reste à plat', () => {
  const carre = h => ({ type: 'Feature', properties: { id: 'bld-u1', hauteur: h }, geometry: { type: 'Polygon', coordinates: [[[4.4, 50.84], [4.4002, 50.84], [4.4002, 50.8401], [4.4, 50.8401], [4.4, 50.84]]] } });
  const haut = maillerBatiment(carre(12.5), repere, [1, 0, 0]);
  const ys = new Set(); for (let i = 1; i < haut.positions.length; i += 3) ys.add(haut.positions[i]);
  assert.deepEqual([...ys].sort((a, b) => a - b), [0, 12.5]);
  assert.equal(haut.indices.length / 3, 2 + 4 * 2, 'un toit (2 triangles) et 4 murs');
  assert.equal(haut.contours.length / 6, 4);
  assert.equal(haut.contoursPlats.length, 0);
  const plat = maillerBatiment(carre(null), repere, [1, 0, 0]);
  for (let i = 1; i < plat.positions.length; i += 3) assert.equal(plat.positions[i], 0);
  assert.equal(plat.indices.length / 3, 2, 'l\'emprise seule : aucun mur');
  assert.equal(plat.contoursPlats.length / 6, 4);
  assert.deepEqual(plat.hauteurs, [null]);
});
test('dans le maillage d\'ensemble, chaque bâtiment sans hauteur est à plat et sans mur', () => {
  let plats = 0;
  mb.hauteurs.forEach((h, i) => {
    if (h !== null) return;
    plats++;
    for (let t = mb.debuts[i] * 3; t < mb.debuts[i + 1] * 3; t++) assert.equal(mb.positions[mb.indices[t] * 3 + 1], 0);
  });
  assert.equal(plats, meta.batiments.hauteurs.nonRenseignees);
  assert.equal(Math.max(...mb.hauteurs.filter(h => h !== null)), meta.batiments.hauteurs.maxMetres);
});

group('scène 3D — géométrie');
test('un ruban a la largeur demandée, à plat', () => {
  const r = maillerRuban([[0, 0], [10, 0], [10, 10]], 2, 0.5);
  assert.equal(r.positions.length / 3, 6);
  assert.equal(r.indices.length / 3, 4);
  assert.deepEqual([...r.positions.slice(0, 6)], [0, 0.5, -1, 0, 0.5, 1]);
});
test('polygones et lignes : anneau fermé sans point répété, trous gardés', () => {
  const g = { type: 'Polygon', coordinates: [[[4.4, 50.84], [4.401, 50.84], [4.401, 50.841], [4.4, 50.84]], [[4.4004, 50.8402], [4.4006, 50.8402], [4.4006, 50.8404], [4.4004, 50.8402]]] };
  const [poly] = polygonesLocaux(g, repere);
  assert.deepEqual(poly.map(a => a.length), [3, 3]);
  assert.equal(lignesLocales(g, repere).length, 2);
  assert.equal(segmentsDeLignes([[[0, 0], [1, 0], [1, 1]]], 0.3).length, 12);
});

group('scène 3D — semi-réaliste (v0.10)');
const deg = r => (r * 180) / Math.PI;
test('le soleil de Bruxelles le 15 mai : se lève à l\'est vers 6 h, au plus haut au sud vers 13 h 40, couché à 21 h 30', () => {
  const S = h => positionSoleil(h, 135, 50.84, 4.4, 2);
  assert.ok(S(5.5).elevation < 0 && S(6.5).elevation > 0, 'lever entre 5 h 30 et 6 h 30');
  assert.ok(S(21).elevation > 0 && S(22).elevation < 0, 'coucher entre 21 h et 22 h');
  const midi = S(13.7);
  assert.ok(Math.abs(deg(midi.azimut) - 180) < 5, `au sud à midi solaire (${deg(midi.azimut).toFixed(1)}°)`);
  assert.ok(Math.abs(deg(midi.elevation) - 58) < 3, `hauteur ${deg(midi.elevation).toFixed(1)}° (≈ 90 − 50,8 + 18,8)`);
  assert.ok(deg(S(8).azimut) > 70 && deg(S(8).azimut) < 110, 'à l\'est le matin');
  const d = directionSoleil(midi);
  assert.ok(Math.abs(Math.hypot(...d) - 1) < 1e-9 && d[2] > 0.4 && d[1] > 0.8, 'au sud (Z = −nord) et haut');
  assert.equal(partDeJour(-0.3, -0.1, 0.17), 0);
  assert.equal(partDeJour(0.3, -0.1, 0.17), 1);
});
test('façades : chaque mur porte sa position (abscisse, hauteur, hauteur du bâtiment, longueur) ; toits et emprises à plat n\'en ont pas', () => {
  assert.equal(mb.facades.length / 4, mb.positions.length / 3);
  let murs = 0;
  for (let v = 0; v < mb.facades.length / 4; v++) {
    const [u, y, h, L] = mb.facades.slice(v * 4, v * 4 + 4);
    if (u < 0) { assert.ok(y === -1 && h === -1 && L === -1); continue; }
    murs++;
    assert.ok(u >= 0 && u <= L + 1e-6 && (y === 0 || y === h) && h > 0);
    assert.ok(Math.abs(mb.positions[v * 3 + 1] - y) < 1e-4, 'la hauteur sur le mur est celle du sommet');
  }
  assert.ok(murs > 0);
});
test('marquages : tirets entre deux voies d\'un même sens, ligne continue entre deux sens et le long d\'une piste, rien sur une chaussée non découpée', () => {
  const sect = (...bandes) => ({ troncon: 't', axe: bandes.reduce((a, b) => a + b.largeur, 0) / 2, bandes: bandes.map((b, i) => ({ id: `b${i}`, ...b })) });
  const ligne = [[0, 0], [100, 0]];
  const m = marquagesSection(ligne, sect({ type: 'trottoir', largeur: 2 }, { type: 'cyclable', largeur: 2, sens: 'retour' }, { type: 'voiture', largeur: 3, sens: 'retour' },
    { type: 'voiture', largeur: 3, sens: 'aller' }, { type: 'voiture', largeur: 3, sens: 'aller' }, { type: 'trottoir', largeur: 2 }));
  assert.deepEqual(m.map(x => x.style), ['continu', 'continu', 'tirets']);
  assert.ok(Math.abs(m[2].ligne[0][1] - (7.5 - 2 - 2 - 3 - 3)) < 1e-9, 'entre les deux voies « aller »');
  assert.deepEqual(marquagesSection(ligne, sect({ type: 'trottoir', largeur: 2 }, { type: 'chaussee', largeur: 9 }, { type: 'trottoir', largeur: 2 })), []);
  const t = tirets([[0, 0], [10, 0], [20, 0]], 3, 5);
  assert.deepEqual(t.map(l => [l[0][0], l.at(-1)[0]]), [[0, 3], [8, 11], [16, 19]]);
  assert.equal(maillerRubans(t, 0.15).indices.length / 3, 8, 'le tiret qui passe un sommet a deux morceaux');
});
