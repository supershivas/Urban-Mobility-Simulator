// La géométrie d'un carrefour (v0.4), en mètres (Lambert 72 ou repère local) :
// le recul où les voies s'arrêtent, le point d'attache de chaque voie, les
// raccords (courbes de la voie entrante à la voie sortante), la zone de carrefour
// et les traversées. Calculée une seule fois et lue par la carte ET la vue 3D :
// les deux dessinent les mêmes points. Pure, testée (test/carrefour.test.mjs).
import { contourBande } from './decalage.js?v=0.9.5';
import { voiesDe } from '../carrefour.js?v=0.9.5';

/** Le point à la distance d le long d'une ligne, et la tangente unitaire en ce point. */
export function pointSurLigne(ligne, d) {
  let reste = Math.max(0, d);
  for (let i = 1; i < ligne.length; i++) {
    const a = ligne[i - 1], b = ligne[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!l) continue;
    if (reste <= l || i === ligne.length - 1) {
      const u = Math.min(1, reste / l);
      return { p: [a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1])], t: [(b[0] - a[0]) / l, (b[1] - a[1]) / l] };
    }
    reste -= l;
  }
  return { p: [...ligne[0]], t: [1, 0] };
}

/** La portion d'une ligne entre les distances d0 et d1 depuis son début. */
export function extraire(ligne, d0, d1) {
  const out = [pointSurLigne(ligne, d0).p];
  let cumul = 0;
  for (let i = 1; i < ligne.length; i++) {
    cumul += Math.hypot(ligne[i][0] - ligne[i - 1][0], ligne[i][1] - ligne[i - 1][1]);
    if (cumul > d0 && cumul < d1) out.push([...ligne[i]]);
  }
  out.push(pointSurLigne(ligne, d1).p);
  return out;
}

/** Le recul commun du carrefour : la demi-emprise la plus large de ses branches, plus une marge. */
export function recul(branches, D) {
  const demi = Math.max(0, ...branches.map(b => (b.section ? Math.max(b.section.axe, b.section.emprise - b.section.axe) : 0)));
  return Math.max(D.reculMinM, demi + D.reculMargeM);
}
/** Le recul sur une branche : le recul commun, borné à une part de la longueur de la branche. */
export const reculBranche = (b, r, D) => Math.min(r, b.longueur * D.reculPart);

/** Bords de l'emprise d'une branche, en s'éloignant du nœud (gauche > droite), ou null sans section. */
function bords(b) {
  if (!b.section) return null;
  const g = b.section.axe, d = b.section.axe - b.section.emprise;
  return b.sortant ? { gauche: g, droite: d } : { gauche: -d, droite: -g };
}

const plus = (p, v, k) => [p[0] + v[0] * k, p[1] + v[1] * k];
const gaucheDe = t => [-t[1], t[0]];

/** Point d'intersection des droites p + s·u et q + w·v (null si parallèles). */
function croisement(p, u, q, v) {
  const det = u[0] * v[1] - u[1] * v[0];
  if (Math.abs(det) < 1e-6) return null;
  const s = ((q[0] - p[0]) * v[1] - (q[1] - p[1]) * v[0]) / det;
  const w = ((q[0] - p[0]) * u[1] - (q[1] - p[1]) * u[0]) / det;
  return { point: plus(p, u, s), s, w };
}

/** Courbe de Bézier quadratique de a (direction de marche ua) à b (direction vb), n points. */
export function courbe(a, ua, b, vb, n) {
  const x = croisement(a, ua, b, vb);
  const c = x && x.s > 0 && x.w < 0 ? x.point : [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const out = [];
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1), j = 1 - k;
    out.push([j * j * a[0] + 2 * j * k * c[0] + k * k * b[0], j * j * a[1] + 2 * j * k * c[1] + k * k * b[1]]);
  }
  return out;
}

/**
 * La géométrie d'un carrefour.
 * branches : js/carrefour.js (branchesDe) ; raccords : [{ de, vers, origine }] ; traversees : [{ troncon, type }] ; D : DESSIN_CARREFOUR.
 * → { recul, zone (anneau fermé ou null), ancres: Map(voie → { point, direction (vers le nœud), voie }),
 *     raccords: [{ de, vers, origine, ligne }], traversees: [{ troncon, type, anneau }] }
 */
export function geometrieCarrefour(branches, raccords, traversees, D) {
  const r = recul(branches, D);
  const ancres = new Map(), zone = [];
  for (const b of branches) {
    const rb = reculBranche(b, r, D);
    const { p, t } = pointSurLigne(b.ligne, rb), n = gaucheDe(t);
    for (const v of voiesDe(b)) ancres.set(v.id, { point: plus(p, n, v.cote), direction: [-t[0], -t[1]], voie: v });
    const e = bords(b);
    if (e) zone.push(plus(p, n, e.droite), plus(p, n, e.gauche)); else zone.push(p);
  }
  // La zone : les bords des branches au recul, dans l'ordre des branches (triées par angle)
  const anneau = zone.length >= 3 ? [...zone, zone[0]] : null;
  const lignes = raccords.map(x => {
    const a = ancres.get(x.de), b = ancres.get(x.vers);
    if (!a || !b) return null;
    // Sortir : on marche en s'éloignant du nœud, à l'opposé de la direction d'arrivée
    return { ...x, ligne: courbe(a.point, a.direction, b.point, [-b.direction[0], -b.direction[1]], D.pointsCourbe) };
  }).filter(Boolean);
  const pistes = [];
  for (const tr of traversees) {
    const b = branches.find(y => y.troncon === tr.troncon), e = b && bords(b);
    if (!e) continue;
    const rb = reculBranche(b, r, D);
    // La traversée cyclable au plus près du carrefour, le passage piéton juste derrière
    const velo = traversees.some(x => x.troncon === tr.troncon && x.type === 'velo');
    const d0 = tr.type === 'velo' ? rb : rb + (velo ? D.largeurVeloM : 0);
    const d1 = Math.min(b.longueur, d0 + (tr.type === 'velo' ? D.largeurVeloM : D.largeurPietonM));
    if (d1 <= d0) continue;
    const axe = extraire(b.ligne, d0, d1);
    // Passage piéton : des bandes parallèles à la rue, de la largeur d'un pas de zèbre (dessin, pas une norme)
    const bandes = [];
    if (tr.type === 'pieton') for (let g = e.gauche; g - D.zebreM > e.droite; g -= 2 * D.zebreM) bandes.push(contourBande(axe, g, g - D.zebreM));
    pistes.push({ troncon: tr.troncon, type: tr.type, anneau: contourBande(axe, e.gauche, e.droite), bandes });
  }
  return { recul: r, zone: anneau, ancres, raccords: lignes, traversees: pistes };
}
