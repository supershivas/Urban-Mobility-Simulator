// Lignes parallèles à un axe, en mètres (Lambert 72 ou repère local) : les bords
// des bandes d'une section transversale. Pures, testées (test/section.test.mjs).
// Même calcul pour la carte et pour la vue 3D : les deux dessinent les mêmes bords.

/** Normale unitaire à gauche du segment [a, b]. */
const normale = (a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
  return [-dy / l, dx / l];
};

/** Supprime les points répétés (une normale y serait indéfinie). */
export const sansDoublons = ligne => ligne.filter((p, i) => i === 0 || p[0] !== ligne[i - 1][0] || p[1] !== ligne[i - 1][1]);

/**
 * La ligne décalée de d mètres (positif : à gauche dans le sens de la ligne).
 * Joints en onglet, bornés à `ongletMax` fois |d| (un virage serré ne projette pas de pointe).
 * Même nombre de points que la ligne : les bandes voisines partagent exactement leurs bords.
 */
export function decalerLigne(ligne, d, ongletMax = 3) {
  const l = sansDoublons(ligne);
  if (l.length < 2) return l.map(p => [...p]);
  return l.map((p, i) => {
    const n1 = i > 0 ? normale(l[i - 1], p) : null, n2 = i < l.length - 1 ? normale(p, l[i + 1]) : null;
    if (!n1 || !n2) { const n = n1 ?? n2; return [p[0] + n[0] * d, p[1] + n[1] * d]; }
    let bx = n1[0] + n2[0], by = n1[1] + n2[1];
    const lb = Math.hypot(bx, by);
    if (lb < 1e-9) return [p[0] + n1[0] * d, p[1] + n1[1] * d]; // demi-tour : pas d'onglet
    bx /= lb; by /= lb;
    const cos = bx * n1[0] + by * n1[1];
    const k = Math.min(1 / cos, ongletMax);
    return [p[0] + bx * d * k, p[1] + by * d * k];
  });
}

/** Le contour fermé d'une bande comprise entre les décalages gauche et droite (gauche > droite). */
export function contourBande(ligne, gauche, droite) {
  const g = decalerLigne(ligne, gauche), dr = decalerLigne(ligne, droite);
  return [...g, ...dr.reverse(), g[0]];
}
