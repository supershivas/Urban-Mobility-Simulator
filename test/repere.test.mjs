// Le repère local de la scène 3D : des mètres Lambert 72 autour d'une origine proche du corridor.
import { readFileSync } from 'node:fs';
import { creerRepere, versScene, depuisScene } from '../js/geo/repere.js';
import { wgs84VersLambert } from '../js/geo/coordonnees.js';

const meta = JSON.parse(readFileSync(new URL('../data/processed/metadata.json', import.meta.url), 'utf8'));
const emprise = JSON.parse(readFileSync(new URL('../data/metadata/corridor.geojson', import.meta.url), 'utf8')).features[0].geometry.coordinates[0];
const repere = creerRepere(meta.repereLocal.origine);
// Stations UrbIS (mêmes références que test/coordonnees.test.mjs)
const SCHUMAN = { l72: [150926.711, 170267.119], wgs: [4.38190977, 50.84281178] };
const ROODEBEEK = { l72: [154701.642, 170792.617], wgs: [4.4355136, 50.84751717] };

group('repère local');
test('l\'origine est déclarée en Lambert 72 et tombe sur [0, 0]', () => {
  assert.equal(meta.repereLocal.crs, 'EPSG:31370');
  assert.deepEqual(repere.versLocal(meta.repereLocal.origine), [0, 0]);
});
test('l\'origine est proche du corridor : toute l\'emprise à moins de 4 km', () => {
  for (const p of emprise) {
    const [x, y] = repere.lonLatVersLocal(p);
    assert.ok(Math.hypot(x, y) < 4000, `${p} → ${x}, ${y}`);
  }
});
test('Lambert 72 → local : une simple translation, en mètres', () => {
  const [ox, oy] = meta.repereLocal.origine;
  assert.deepEqual(repere.versLocal(SCHUMAN.l72), [SCHUMAN.l72[0] - ox, SCHUMAN.l72[1] - oy]);
  const a = repere.versLocal(SCHUMAN.l72), b = repere.versLocal(ROODEBEEK.l72);
  const lambert = Math.hypot(ROODEBEEK.l72[0] - SCHUMAN.l72[0], ROODEBEEK.l72[1] - SCHUMAN.l72[1]);
  assert.ok(Math.abs(Math.hypot(b[0] - a[0], b[1] - a[1]) - lambert) < 1e-9, 'les distances sont conservées');
});
test('lon/lat → local passe par proj4 : moins de 5 cm d\'écart avec la référence UrbIS', () => {
  for (const s of [SCHUMAN, ROODEBEEK]) {
    const [x, y] = repere.lonLatVersLocal(s.wgs), [rx, ry] = repere.versLocal(s.l72);
    assert.ok(Math.hypot(x - rx, y - ry) < 0.05);
    assert.deepEqual(repere.lonLatVersLocal(s.wgs), repere.versLocal(wgs84VersLambert(s.wgs)));
  }
});
test('aller-retour local ↔ Lambert ↔ lon/lat au millimètre', () => {
  const p = repere.versLocal(SCHUMAN.l72);
  assert.deepEqual(repere.depuisLocal(p), SCHUMAN.l72);
  const [x, y] = repere.lonLatVersLocal(repere.localVersLonLat(p));
  assert.ok(Math.hypot(x - p[0], y - p[1]) < 0.001);
});
test('jamais de lon/lat brutes : des degrés pris pour des mètres Lambert sont loin de tout', () => {
  const [x, y] = repere.versLocal(SCHUMAN.wgs);
  assert.ok(Math.hypot(x, y) > 100000);
});
test('scène : X vers l\'est, Y vers le haut, le nord vers −Z', () => {
  assert.deepEqual(versScene([10, 20], 5), [10, 5, -20]);
  assert.deepEqual(versScene([10, 20]), [10, 0, -20]);
  assert.deepEqual(depuisScene(versScene([10, 20], 5)), [10, 20]);
  const s = versScene(repere.versLocal(SCHUMAN.l72)), r = versScene(repere.versLocal(ROODEBEEK.l72));
  assert.ok(r[0] > s[0], 'Roodebeek est à l\'est de Schuman');
  assert.ok(r[2] < s[2], 'Roodebeek est au nord de Schuman');
});
test('une origine invalide est refusée', () => {
  assert.throws(() => creerRepere(null));
  assert.throws(() => creerRepere([4.38, NaN]));
});
