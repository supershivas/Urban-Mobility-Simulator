// Conversions Lambert 72 ↔ WGS84 contrôlées sur des points de référence (pitch §18).
// Référence : les stations UrbIS, reprojetées en EPSG:4326 par le serveur WFS d'UrbIS
// (GeoServer, indépendant de proj4js), 2026-11-14.
import { lambertVersWgs84, wgs84VersLambert, convertirGeometrie } from '../js/geo/coordonnees.js';

const REFERENCES = [
  { nom: 'Schuman', l72: [150926.711, 170267.119], wgs: [4.38190977, 50.84281178] },
  { nom: 'Roodebeek', l72: [154701.642, 170792.617], wgs: [4.4355136, 50.84751717] },
  { nom: 'Mérode', l72: [152026.501, 169904.955], wgs: [4.39752272, 50.83955321] },
  { nom: 'Montgomery', l72: [152712.638, 169714.078], wgs: [4.4072625, 50.83783447] },
  { nom: 'Stockel', l72: [156746.859, 170144.387], wgs: [4.46454285, 50.84166961] },
  { nom: 'Érasme', l72: [142836.031, 167203.242], wgs: [4.26709621, 50.81522622] },
];
// Écart en mètres entre deux positions WGS84 voisines (approximation locale suffisante pour un test)
const ecartMetres = (a, b) => Math.hypot((a[0] - b[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 110574);

group('coordonnées');
test('Lambert 72 → WGS84 : moins de 5 cm d\'écart avec la référence', () => {
  for (const r of REFERENCES) assert.ok(ecartMetres(lambertVersWgs84(r.l72), r.wgs) < 0.05, r.nom);
});
test('WGS84 → Lambert 72 : moins de 5 cm', () => {
  for (const r of REFERENCES) {
    const [x, y] = wgs84VersLambert(r.wgs);
    assert.ok(Math.hypot(x - r.l72[0], y - r.l72[1]) < 0.05, r.nom);
  }
});
test('aller-retour au millimètre', () => {
  for (const r of REFERENCES) {
    const [x, y] = wgs84VersLambert(lambertVersWgs84(r.l72));
    assert.ok(Math.hypot(x - r.l72[0], y - r.l72[1]) < 0.001, r.nom);
  }
});
test('ordre longitude, latitude (RFC 7946)', () => {
  const [lon, lat] = lambertVersWgs84(REFERENCES[0].l72);
  assert.ok(lon > 4 && lon < 5 && lat > 50 && lat < 51);
});
test('convertirGeometrie parcourt toutes les profondeurs', () => {
  const g = convertirGeometrie({ type: 'MultiPolygon', coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]]] }, ([x, y]) => [x + 1, y]);
  assert.deepEqual(g.coordinates[0][0][2], [2, 1]);
  assert.throws(() => convertirGeometrie({ type: 'GeometryCollection' }, p => p));
});
