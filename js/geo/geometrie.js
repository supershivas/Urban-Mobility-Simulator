// Géométrie plane, en mètres (coordonnées Lambert 72). Pures, testées.
// Aucune projection ici : seulement des distances dans un plan déjà métrique.

export const distance = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

export function longueur(ligne) {
  let l = 0;
  for (let i = 1; i < ligne.length; i++) l += distance(ligne[i - 1], ligne[i]);
  return l;
}

/** Distance d'un point au segment [a, b]. */
export function distancePointSegment(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return distance(p, [a[0] + t * dx, a[1] + t * dy]);
}

/** Distance d'un point à une polyligne, et l'indice du segment le plus proche. */
export function distancePointLigne(p, ligne) {
  let d = Infinity, i = -1;
  for (let k = 1; k < ligne.length; k++) {
    const dk = distancePointSegment(p, ligne[k - 1], ligne[k]);
    if (dk < d) { d = dk; i = k - 1; }
  }
  return { distance: d, segment: i };
}

/** Point situé à la fraction t (0..1) de la longueur d'une polyligne. */
export function pointA(ligne, t) {
  const total = longueur(ligne);
  let reste = t * total;
  for (let i = 1; i < ligne.length; i++) {
    const d = distance(ligne[i - 1], ligne[i]);
    if (reste <= d || i === ligne.length - 1) {
      const u = d ? Math.min(1, reste / d) : 0;
      return [ligne[i - 1][0] + u * (ligne[i][0] - ligne[i - 1][0]), ligne[i - 1][1] + u * (ligne[i][1] - ligne[i - 1][1])];
    }
    reste -= d;
  }
  return ligne[0];
}

/** Cap (radians) du segment i d'une polyligne. */
export const cap = (ligne, i) => Math.atan2(ligne[i + 1][1] - ligne[i][1], ligne[i + 1][0] - ligne[i][0]);

/** Écart angulaire entre deux caps, ramené à [0, π]. */
export function ecartAngle(a, b) {
  const d = Math.abs(a - b) % (2 * Math.PI);
  return d > Math.PI ? 2 * Math.PI - d : d;
}

/** Boîte englobante [minX, minY, maxX, maxY] de positions. */
export function boite(positions) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of positions) {
    if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y;
    if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y;
  }
  return b;
}

/** Intersection propre de deux segments [a,b] et [c,d] (hors extrémités communes). */
export function segmentsSeCroisent(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

/** Point dans un polygone (anneau extérieur, règle pair-impair). */
export function pointDansAnneau(p, anneau) {
  let dedans = false;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
    const [xi, yi] = anneau[i], [xj, yj] = anneau[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}
