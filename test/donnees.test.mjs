// Tests de données (pitch §18) sur data/processed/, data/original/ et le registre des sources.
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const lire = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
const reseau = lire('data/processed/network.json');
const rues = lire('data/processed/streets.geojson');
const noeuds = lire('data/processed/intersections.geojson');
const COUCHES = ['streets', 'intersections', 'street-surfaces', 'buildings', 'mobility-infrastructure'];

// Boîte de la Région de Bruxelles-Capitale (lon, lat), large
const dansBruxelles = ([lon, lat]) => lon > 4.2 && lon < 4.5 && lat > 50.75 && lat < 50.95;
const positions = g => (g.type === 'Point' ? [g.coordinates] : g.coordinates.flat(g.type === 'LineString' ? 0 : g.type === 'MultiPolygon' ? 2 : 1));

group('données');
test('les données originales sont intactes (empreintes du manifeste)', () => {
  const m = lire('data/original/manifest.json');
  for (const [chemin, info] of Object.entries(m.fichiers)) {
    const contenu = readFileSync(new URL(`../${chemin}`, import.meta.url));
    assert.equal(createHash('sha256').update(contenu).digest('hex'), info.sha256, chemin);
  }
});
test('chaque GeoJSON est une FeatureCollection en lon/lat dans Bruxelles', () => {
  for (const c of COUCHES) {
    const g = lire(`data/processed/${c}.geojson`);
    assert.equal(g.type, 'FeatureCollection', c);
    assert.ok(!g.crs, `${c} : pas de membre crs (RFC 7946)`);
    for (const f of g.features) for (const p of positions(f.geometry)) assert.ok(dansBruxelles(p), `${c} ${f.properties.id} : ${p}`);
  }
});
test('identifiants internes uniques dans chaque couche', () => {
  for (const c of COUCHES) {
    const ids = lire(`data/processed/${c}.geojson`).features.map(f => f.properties.id);
    assert.equal(new Set(ids).size, ids.length, c);
  }
});
test('le modèle et la carte portent les mêmes tronçons, mêmes identifiants', () => {
  assert.deepEqual(reseau.streetSegments.map(s => s.id).sort(), rues.features.map(f => f.properties.id).sort());
  assert.deepEqual(reseau.intersections.map(n => n.id).sort(), noeuds.features.map(f => f.properties.id).sort());
});
test('100 % des fromNode / toNode renseignés existent', () => {
  const ids = new Set(reseau.intersections.map(n => n.id));
  for (const s of reseau.streetSegments) for (const n of [s.fromNode, s.toNode]) if (n !== null) assert.ok(ids.has(n), `${s.id} → ${n}`);
});
test('chaque nœud référence ses tronçons, et réciproquement', () => {
  const segs = new Map(reseau.streetSegments.map(s => [s.id, s]));
  for (const n of reseau.intersections) for (const id of n.connectedSegmentIds) assert.ok([segs.get(id).fromNode, segs.get(id).toNode].includes(n.id));
});
test('chaque tronçon garde son identifiant source', () => {
  for (const s of reseau.streetSegments) assert.match(s.sourceIds.urbis, /^https:\/\/databrussels\.be\/id\/streetaxe\/\d+$/);
});
test('aucune valeur inventée : sens, voies, vitesse seulement avec leur provenance OSM', () => {
  for (const s of reseau.streetSegments) {
    const a = s.sourceAttributes;
    if (a.oneway !== null || a.lanes !== null || a.speedLimit !== null) {
      assert.ok(s.complementOsm && s.complementOsm.methode && s.complementOsm.confiance === 'moyenne', s.id);
    }
    assert.equal(a.roadOwner, null);
    assert.equal(a.roadManager, null);
    assert.ok(!('width' in s) && !('largeur' in s), `${s.id} : aucune largeur n'est connue`);
  }
});
test('les longueurs sont métriques et cohérentes avec UrbIS (à 1 m près pour 95 %)', () => {
  const ok = reseau.streetSegments.filter(s => s.longueurSource === null || Math.abs(s.longueurSource - s.lengthMeters) <= 1).length;
  assert.ok(ok / reseau.streetSegments.length >= 0.95, `${ok}/${reseau.streetSegments.length}`);
});
test('les anomalies topologiques sont rapportées', () => {
  const meta = lire('data/processed/metadata.json');
  assert.ok(meta.topologie && meta.topologie.anomalies);
  assert.ok(existsSync(new URL('../data/metadata/quality-report.md', import.meta.url)));
});
test('chaque source retenue est documentée (URL, date, format, licence, attribution)', () => {
  const { sources } = lire('data/metadata/sources.json');
  for (const s of sources) for (const k of ['organisme', 'nom', 'urlFiche', 'urlService', 'dateRecuperation', 'format', 'systemeCoordonnees', 'licence', 'attribution', 'restrictions', 'couches', 'qualite']) {
    assert.ok(s[k], `${s.id} : ${k}`);
  }
  const m = lire('data/original/manifest.json');
  const ids = new Set(sources.map(s => s.id));
  for (const f of Object.values(m.fichiers)) assert.ok(ids.has(f.source), `source ${f.source} non documentée`);
});
