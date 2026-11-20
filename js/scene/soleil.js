// La position du soleil pour la vue 3D semi-réaliste (v0.10, Jérôme : « le soleil suit l'heure »).
// Pur, testé (test/scene.test.mjs). Formules astronomiques simplifiées (déclinaison
// sinusoïdale, angle horaire, sans équation du temps) : précises à quelques degrés près,
// assez pour la lumière d'une scène ; le jour de l'année est un réglage de jeu, pas une mesure.

const rad = d => (d * Math.PI) / 180;

/**
 * heure : heure légale décimale (8.5 = 8 h 30) ; jour : jour de l'année (1..365) ;
 * latitude, longitude : degrés ; decalageUTC : heures (2 en été à Bruxelles).
 * → { elevation (rad, négative la nuit), azimut (rad depuis le nord, sens horaire) }
 */
export function positionSoleil(heure, jour, latitude, longitude, decalageUTC) {
  const decl = rad(23.44) * Math.sin((2 * Math.PI * (284 + jour)) / 365);
  const solaire = heure - decalageUTC + longitude / 15; // heure solaire (le soleil au plus haut à 12 h)
  const H = rad(15 * (solaire - 12)), phi = rad(latitude);
  const sinEl = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(H);
  const elevation = Math.asin(Math.max(-1, Math.min(1, sinEl)));
  const azimut = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) + Math.PI;
  return { elevation, azimut: ((azimut % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) };
}

/** Direction vers le soleil dans le repère de la scène (X = est, Y = haut, Z = −nord), vecteur unitaire. */
export function directionSoleil({ elevation, azimut }) {
  const c = Math.cos(elevation);
  return [Math.sin(azimut) * c, Math.sin(elevation), -Math.cos(azimut) * c];
}

/**
 * La part de jour (0 la nuit, 1 en plein jour), en douceur autour de l'horizon :
 * de `crepuscule` (rad, sous l'horizon) à `plein` (rad, au-dessus).
 */
export function partDeJour(elevation, crepuscule, plein) {
  const t = Math.max(0, Math.min(1, (elevation - crepuscule) / (plein - crepuscule)));
  return t * t * (3 - 2 * t);
}
