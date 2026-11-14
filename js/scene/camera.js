// La caméra orbitale de la vue 3D (Jérôme, v0.2.0) : elle tourne autour d'un
// point du sol. Pur (ni three.js ni DOM), testé (test/camera.test.mjs).
//
// État : { cible: [x, y] local (m), distance (m), azimut (rad), inclinaison (rad) }
//   azimut      : direction du regard, 0 = vers le nord, positif vers l'est
//   inclinaison : écart à la verticale, 0 = vue de dessus
// Toutes les bornes viennent des réglages (aucun nombre magique ici).

const borner = (v, min, max) => Math.max(min, Math.min(max, v));

/** Direction du regard au sol et vecteur « droite de l'écran », en local [est, nord]. */
export const axes = azimut => ({ avant: [Math.sin(azimut), Math.cos(azimut)], droite: [Math.cos(azimut), -Math.sin(azimut)] });

/** Position, point visé et vecteur « haut » de la caméra, dans la scène (X est, Y haut, Z sud). */
export function pose(etat) {
  const { avant } = axes(etat.azimut);
  const recul = etat.distance * Math.sin(etat.inclinaison), hauteur = etat.distance * Math.cos(etat.inclinaison);
  const [cx, cy] = etat.cible;
  return {
    position: [cx - avant[0] * recul, hauteur, -(cy - avant[1] * recul)],
    cible: [cx, 0, -cy],
    // Perpendiculaire au regard quelle que soit l'inclinaison (y compris vue de dessus)
    haut: [avant[0] * Math.cos(etat.inclinaison), Math.sin(etat.inclinaison), -avant[1] * Math.cos(etat.inclinaison)],
  };
}

/** Mètres du terrain par pixel d'écran, au point visé. */
export const metresParPixel = (etat, hauteurPx, fovDeg) => (2 * etat.distance * Math.tan((fovDeg * Math.PI) / 360)) / hauteurPx;

/** Ramène un état dans ses bornes : { distanceMin, distanceMax, inclinaisonMax (rad), boite [minX, minY, maxX, maxY] }. */
export function contraindre(etat, l) {
  const tour = 2 * Math.PI;
  return {
    cible: [borner(etat.cible[0], l.boite[0], l.boite[2]), borner(etat.cible[1], l.boite[1], l.boite[3])],
    distance: borner(etat.distance, l.distanceMin, l.distanceMax),
    azimut: ((etat.azimut % tour) + tour + Math.PI) % tour - Math.PI,
    inclinaison: borner(etat.inclinaison, 0, l.inclinaisonMax),
  };
}

/** Glisser de (dx, dy) pixels : le sol suit le pointeur. */
export function deplacer(etat, dxPx, dyPx, mpp) {
  const { avant, droite } = axes(etat.azimut);
  // Un pixel vertical couvre plus de sol quand la vue est inclinée (plafonné : à l'horizon il en couvrirait une infinité)
  const k = mpp / Math.max(0.35, Math.cos(etat.inclinaison));
  return { ...etat, cible: [etat.cible[0] - droite[0] * dxPx * mpp + avant[0] * dyPx * k, etat.cible[1] - droite[1] * dxPx * mpp + avant[1] * dyPx * k] };
}

export const tourner = (etat, dAzimut, dInclinaison) => ({ ...etat, azimut: etat.azimut + dAzimut, inclinaison: etat.inclinaison + dInclinaison });
export const zoomer = (etat, facteur) => ({ ...etat, distance: etat.distance * facteur });

/** L'état qui montre toute une boîte [minX, minY, maxX, maxY] (retour à l'emprise). */
export function cadrer(boite, largeurPx, hauteurPx, fovDeg, { azimut = 0, inclinaison = 0, margePx = 0 } = {}) {
  const w = boite[2] - boite[0], h = boite[3] - boite[1];
  const tan = Math.tan((fovDeg * Math.PI) / 360);
  const utileW = Math.max(1, largeurPx - 2 * margePx), utileH = Math.max(1, hauteurPx - 2 * margePx);
  // Largeur vue au point visé = 2·d·tan·(largeur/hauteur) ; la profondeur est raccourcie par l'inclinaison.
  // Vue inclinée : le bord le plus proche de la caméra est plus près de (h/2)·sin(inclinaison), donc plus large à l'écran.
  const dLargeur = (w * hauteurPx) / (2 * tan * utileW) + (h / 2) * Math.sin(inclinaison);
  const dHauteur = (h * Math.cos(inclinaison) * hauteurPx) / (2 * tan * utileH);
  return { cible: [(boite[0] + boite[2]) / 2, (boite[1] + boite[3]) / 2], distance: Math.max(dLargeur, dHauteur), azimut, inclinaison };
}

// Correspondance avec la carte 2D (Web Mercator, tuiles de 512 px) : même échelle au point visé.
const EQUATEUR_M = 40075016.686;
export const mppDuZoom = (zoom, latitude) => (EQUATEUR_M * Math.cos((latitude * Math.PI) / 180)) / (512 * 2 ** zoom);
export const distancePourZoom = (zoom, latitude, hauteurPx, fovDeg) => (mppDuZoom(zoom, latitude) * hauteurPx) / (2 * Math.tan((fovDeg * Math.PI) / 360));
export const zoomPourDistance = (distance, latitude, hauteurPx, fovDeg) =>
  Math.log2((EQUATEUR_M * Math.cos((latitude * Math.PI) / 180) * hauteurPx) / (512 * 2 * distance * Math.tan((fovDeg * Math.PI) / 360)));

/** État intermédiaire d'un vol (t de 0 à 1), par le plus court chemin angulaire. */
export function interpoler(a, b, t) {
  const u = t * t * (3 - 2 * t);
  const mix = (x, y) => x + (y - x) * u;
  let dAz = (b.azimut - a.azimut) % (2 * Math.PI);
  if (dAz > Math.PI) dAz -= 2 * Math.PI; else if (dAz < -Math.PI) dAz += 2 * Math.PI;
  return {
    cible: [mix(a.cible[0], b.cible[0]), mix(a.cible[1], b.cible[1])],
    distance: a.distance * (b.distance / a.distance) ** u, // le zoom progresse en proportion, pas en mètres
    azimut: a.azimut + dAz * u,
    inclinaison: mix(a.inclinaison, b.inclinaison),
  };
}
