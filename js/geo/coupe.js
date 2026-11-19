// Coupes transversales : mesure de l'emprise publique d'un tronçon sur les surfaces
// de voirie UrbIS (chaussée, trottoir, terre-plein, site propre…), en mètres Lambert 72.
// Pures, testées (test/coupe.test.mjs). Utilisées par le pipeline seulement.
//
// Méthode : en quelques points de l'axe (loin des carrefours), on trace une ligne
// perpendiculaire et on la découpe par les surfaces. Depuis l'axe, on suit de chaque
// côté les surfaces publiques contiguës (trou toléré : TROU_MAX) ; la coupe s'arrête
// à la première interruption (parcelle privée, bâtiment, fin des données).

import { distance, longueur } from './geometrie.js?v=0.7.0';

/** Types de surface UrbIS comptés dans l'emprise publique d'une rue (spécification LandCover). */
export const TYPES_EMPRISE = new Set(['S', 'SC', 'SW', 'M', 'C', 'K', 'A', 'AC']);
/** Paramètres de la mesure (constantes de méthode, pas de gameplay). */
export const METHODE_COUPE = {
  demiPortee: 40,       // m de part et d'autre de l'axe
  trouMax: 0.6,         // m de vide toléré entre deux surfaces contiguës
  margeCarrefour: 12,   // m : pas de coupe à moins de cette distance d'une extrémité
  fractions: [0.2, 0.35, 0.5, 0.65, 0.8],
  ecartConfiance: 1.5,  // m : au-delà, les coupes ne s'accordent pas → confiance faible
  largeurMin: 3,        // m : en dessous, la coupe n'est pas retenue
  bandeMin: 0.5,        // m : une bande plus fine (reste de dessin) rejoint sa voisine la plus large
};

/** Paramètres d'intersection du segment [a, b] avec [c, d] : t sur [a, b], ou null. */
function croisement(a, b, c, d) {
  const rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const qx = c[0] - a[0], qy = c[1] - a[1];
  const t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u < 1 ? t : null;
}

/** Anneaux d'une géométrie Polygon / MultiPolygon. */
export const anneaux = g => (g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : []);

/**
 * Intervalles [t0, t1] (fractions de [a, b]) où le segment est dans la surface (pair-impair
 * sur tous les anneaux, trous compris). Le segment est supposé commencer hors de la surface
 * ou y entrer : on compte la parité au point a.
 */
export function intervallesDans(a, b, rings) {
  const ts = [];
  let dedans = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const t = croisement(a, b, r[j], r[i]);
      if (t !== null) ts.push(t);
      const [xi, yi] = r[i], [xj, yj] = r[j];
      if ((yi > a[1]) !== (yj > a[1]) && a[0] < ((xj - xi) * (a[1] - yi)) / (yj - yi) + xi) dedans = !dedans;
    }
  }
  ts.sort((x, y) => x - y);
  const res = [];
  let debut = dedans ? 0 : null;
  for (const t of ts) {
    if (debut === null) debut = t;
    else { if (t - debut > 1e-9) res.push([debut, t]); debut = null; }
  }
  if (debut !== null && 1 - debut > 1e-9) res.push([debut, 1]);
  return res;
}

/** Index en grille de surfaces { type, rings, boite }. */
export function indexerSurfaces(surfaces, pas = 50) {
  const cases = new Map();
  for (const [k, s] of surfaces.entries()) {
    const [x0, y0, x1, y1] = s.boite;
    for (let i = Math.floor(x0 / pas); i <= Math.floor(x1 / pas); i++)
      for (let j = Math.floor(y0 / pas); j <= Math.floor(y1 / pas); j++) {
        const c = `${i},${j}`;
        if (!cases.has(c)) cases.set(c, []);
        cases.get(c).push(k);
      }
  }
  return { surfaces, cases, pas };
}

function candidates(index, a, b) {
  const { pas, cases, surfaces } = index;
  const vu = new Set();
  const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])], [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
  for (let i = Math.floor(x0 / pas); i <= Math.floor(x1 / pas); i++)
    for (let j = Math.floor(y0 / pas); j <= Math.floor(y1 / pas); j++)
      for (const k of cases.get(`${i},${j}`) ?? []) vu.add(k);
  return [...vu].map(k => surfaces[k]).filter(s => s.boite[0] <= x1 && s.boite[2] >= x0 && s.boite[1] <= y1 && s.boite[3] >= y0);
}

/**
 * Coupe en un point p de cap θ (radians) : bandes contiguës de surfaces publiques
 * traversées par la perpendiculaire, de gauche (côté +90°) à droite. Rend null si l'axe
 * n'est sur aucune surface publique.
 * Bande : { type, largeur } en mètres ; plus { gauche, droite } distances depuis l'axe.
 */
export function couperEn(p, theta, index, m = METHODE_COUPE) {
  const nx = -Math.sin(theta), ny = Math.cos(theta); // normale à gauche
  const L = m.demiPortee;
  const a = [p[0] + nx * L, p[1] + ny * L], b = [p[0] - nx * L, p[1] - ny * L];
  // Intervalles en mètres depuis a (0 = gauche lointaine, 2L = droite lointaine), centre = L.
  const morceaux = [];
  for (const s of candidates(index, a, b)) {
    if (!TYPES_EMPRISE.has(s.type)) continue;
    for (const [t0, t1] of intervallesDans(a, b, s.rings)) morceaux.push({ type: s.type, d0: t0 * 2 * L, d1: t1 * 2 * L });
  }
  morceaux.sort((x, y) => x.d0 - y.d0);
  // Fusion des recouvrements éventuels (le premier venu garde l'espace).
  const propres = [];
  for (const mo of morceaux) {
    const der = propres.at(-1);
    if (der && mo.d0 < der.d1) { if (mo.d1 > der.d1) propres.push({ type: mo.type, d0: der.d1, d1: mo.d1 }); }
    else propres.push({ ...mo });
  }
  const centre = propres.findIndex(x => x.d0 <= L + 1e-6 && x.d1 >= L - 1e-6);
  if (centre < 0) return null;
  let i0 = centre, i1 = centre;
  while (i0 > 0 && propres[i0].d0 - propres[i0 - 1].d1 <= m.trouMax) i0--;
  while (i1 < propres.length - 1 && propres[i1 + 1].d0 - propres[i1].d1 <= m.trouMax) i1++;
  const bandes = [];
  for (let i = i0; i <= i1; i++) {
    const x = propres[i];
    const der = bandes.at(-1);
    // Un trou toléré revient à la bande précédente ; deux morceaux du même type se fondent.
    if (der && der.type === x.type) der.d1 = x.d1;
    else { if (der) der.d1 = x.d0; bandes.push({ type: x.type, d0: x.d0, d1: x.d1 }); }
  }
  return bandes.map(x => ({ type: x.type, largeur: x.d1 - x.d0, gauche: L - x.d0, droite: x.d1 - L }));
}

/** Cap local de la polyligne à la distance curviligne s. */
function capEn(ligne, s) {
  let reste = s;
  for (let i = 1; i < ligne.length; i++) {
    const d = distance(ligne[i - 1], ligne[i]);
    if (reste <= d || i === ligne.length - 1) {
      const u = d ? Math.min(1, reste / d) : 0;
      return {
        p: [ligne[i - 1][0] + u * (ligne[i][0] - ligne[i - 1][0]), ligne[i - 1][1] + u * (ligne[i][1] - ligne[i - 1][1])],
        theta: Math.atan2(ligne[i][1] - ligne[i - 1][1], ligne[i][0] - ligne[i - 1][0]),
      };
    }
    reste -= d;
  }
  return null;
}

const dm = v => Math.round(v * 10); // décimètres entiers : les sommes restent exactes

/** Fond les bandes plus fines que `min` dans leur voisine la plus large (restes de dessin des surfaces). */
export function nettoyerBandes(bandes, min) {
  const b = bandes.map(x => ({ ...x }));
  for (;;) {
    let i = -1, plusFine = min;
    b.forEach((x, k) => { if (x.largeur < plusFine && b.length > 1) { plusFine = x.largeur; i = k; } });
    if (i < 0) return b;
    const g = b[i - 1], d = b[i + 1];
    const cible = !g ? d : !d ? g : g.largeur >= d.largeur ? g : d;
    cible.largeur += b[i].largeur;
    b.splice(i, 1);
    // Deux voisines du même type se rejoignent
    for (let k = b.length - 1; k > 0; k--) if (b[k].type === b[k - 1].type) { b[k - 1].largeur += b[k].largeur; b.splice(k, 1); }
  }
}

/**
 * Mesure de l'emprise publique d'un tronçon (polyligne Lambert 72).
 * Rend { largeur, bandes: [{ type, largeur }] (de gauche à droite dans le sens de l'axe),
 * axeDepuisGauche, coupes, ecart, confiance } ou null si aucune coupe n'est possible.
 * Largeurs au décimètre ; la largeur est exactement la somme des bandes.
 */
export function mesurerTroncon(ligne, index, m = METHODE_COUPE) {
  const L = longueur(ligne);
  const coupes = [];
  for (const f of m.fractions) {
    const s = f * L;
    if (s < m.margeCarrefour || L - s < m.margeCarrefour) continue;
    const { p, theta } = capEn(ligne, s);
    const bandes = couperEn(p, theta, index, m);
    if (!bandes) continue;
    const largeur = bandes.reduce((t, b) => t + b.largeur, 0);
    if (largeur < m.largeurMin) continue;
    // Une coupe qui touche la portée maximale n'a pas trouvé de bord : place, carrefour.
    if (bandes[0].gauche >= m.demiPortee - 0.01 || bandes.at(-1).droite >= m.demiPortee - 0.01) continue;
    coupes.push({ largeur, bandes, axe: bandes[0].gauche });
  }
  if (!coupes.length) return null;
  const tri = [...coupes].sort((x, y) => x.largeur - y.largeur);
  const med = tri[Math.floor((tri.length - 1) / 2)];
  const ecart = tri.at(-1).largeur - tri[0].largeur;
  // Arrondi au décimètre sur les limites cumulées : la somme des bandes vaut la largeur.
  const propres = nettoyerBandes(med.bandes, m.bandeMin);
  let cumul = 0;
  const bandes = propres.map(b => {
    const avant = dm(cumul);
    cumul += b.largeur;
    return { type: b.type, largeur: (dm(cumul) - avant) / 10 };
  }).filter(b => b.largeur > 0);
  return {
    largeur: bandes.reduce((t, b) => t + dm(b.largeur), 0) / 10,
    bandes,
    axeDepuisGauche: dm(med.axe) / 10,
    coupes: coupes.length,
    ecart: dm(ecart) / 10,
    confiance: coupes.length >= 2 && ecart <= m.ecartConfiance ? 'moyenne' : 'faible',
  };
}
