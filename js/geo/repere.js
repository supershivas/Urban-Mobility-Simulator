// Le repère local de la scène 3D : des mètres Lambert 72 comptés depuis une
// origine proche du corridor (data/processed/metadata.json → repereLocal).
// three.js ne reçoit jamais de longitude/latitude brutes (pitch §8.3), et des
// coordonnées Lambert entières (150 000 m) perdraient leur précision en float32.
// Pur, testé (test/repere.test.mjs).
//
//   local  : [x, y]    = [Est − origine, Nord − origine], en mètres
//   scène  : [X, Y, Z] = [x, hauteur, −y]  (three.js : Y vers le haut, le nord vers −Z)
import { wgs84VersLambert, lambertVersWgs84 } from './coordonnees.js?v=0.9.7';

export function creerRepere(origine) {
  if (!Array.isArray(origine) || origine.length !== 2 || !origine.every(Number.isFinite)) throw new Error('Repère local : origine [x, y] Lambert 72 attendue');
  const [ox, oy] = origine;
  const versLocal = ([x, y]) => [x - ox, y - oy];
  const depuisLocal = ([x, y]) => [x + ox, y + oy];
  return {
    origine: [ox, oy],
    /** [x, y] Lambert 72 → [x, y] local. */
    versLocal,
    /** [x, y] local → [x, y] Lambert 72. */
    depuisLocal,
    /** [lon, lat] WGS84 → [x, y] local (par proj4, jamais à la main). */
    lonLatVersLocal: lonLat => versLocal(wgs84VersLambert(lonLat)),
    /** [x, y] local → [lon, lat] WGS84. */
    localVersLonLat: p => lambertVersWgs84(depuisLocal(p)),
  };
}

/** [x, y] local (+ hauteur en mètres) → [X, Y, Z] de la scène. */
export const versScene = ([x, y], hauteur = 0) => [x, hauteur, -y];
/** [X, Y, Z] de la scène → [x, y] local. */
export const depuisScene = ([X, , Z]) => [X, -Z];
