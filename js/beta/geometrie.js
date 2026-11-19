// La géométrie du réseau beta, lue à la fois par le dessin (scene.js) et par le
// trafic (roulage.js) : les deux voient exactement les mêmes voies. Pur, testé.
//
// Conduite à droite. Pour un tronçon a → b, le sens +1 roule à droite de l'axe
// (décalage négatif), le sens −1 sur la ligne inversée, à droite elle aussi.
// Voie 0 = la plus proche de l'axe. Les tronçons s'arrêtent au recul de chaque
// carrefour ; la zone du carrefour est dessinée par-dessus, les raccords y passent.
import { longueur, pointA, sousLigne, branches } from './reseau.js?v=0.9.1';
import { decalerLigne } from '../geo/decalage.js?v=0.9.1';

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export const demiLargeur = (t, R) => t.voies * R.largeurVoie + (t.velo ? R.separateurPiste + R.largeurPiste : 0);

/** Décalage (positif à gauche) du milieu d'une voie, ou de la piste (voie = 'velo'), pour le sens +1. */
export const decalageVoie = (t, voie, R) =>
  voie === 'velo' ? -(t.voies * R.largeurVoie + R.separateurPiste + R.largeurPiste / 2) : -(voie + 0.5) * R.largeurVoie;

/** Enveloppe convexe (chaîne monotone d'Andrew). */
export function enveloppe(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const bas = [], haut = [];
  for (const q of p) { while (bas.length >= 2 && cross(bas[bas.length - 2], bas[bas.length - 1], q) <= 0) bas.pop(); bas.push(q); }
  for (const q of p.slice().reverse()) { while (haut.length >= 2 && cross(haut[haut.length - 2], haut[haut.length - 1], q) <= 0) haut.pop(); haut.push(q); }
  return bas.slice(0, -1).concat(haut.slice(0, -1));
}

/** Échantillonne une courbe de Bézier cubique. */
function bezier(p0, p1, p2, p3, n) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
  });
}

/**
 * Tout ce qui se dessine et se parcourt :
 *  troncons[id] = { axe (raccourci aux reculs), demi, voies: { '1': [ligne…], '-1': [ligne…] }, pistes: { '1', '-1' } | null }
 *  noeuds[id]   = { p, degre, recul, zone (polygone) | null, branches: [{ troncon, sens }] }
 * Un sens « sortant » d'un nœud : sens +1 si le tronçon part de ce nœud (a), −1 s'il y arrive (b).
 */
export function geometrieReseau(reseau, R) {
  const noeuds = {}, troncons = {};
  for (const [id, n] of Object.entries(reseau.noeuds)) {
    const br = branches(reseau, id);
    const degre = br.length;
    const demis = br.map(b => demiLargeur(reseau.troncons[b.troncon], R));
    const recul = degre <= 1 ? 0 : degre === 2 ? R.reculPassage : Math.max(...demis) + R.margeCarrefour;
    noeuds[id] = { p: [n.x, n.y], degre, recul, bord: !!n.bord, branches: br.map(b => ({ troncon: b.troncon, sens: b.sens })) };
  }
  for (const [id, t] of Object.entries(reseau.troncons)) {
    const L = longueur(t.points);
    const r0 = noeuds[t.a].recul, r1 = noeuds[t.b].recul;
    const axe = sousLigne(t.points, Math.min(r0, L / 2 - 0.5), Math.max(L - r1, L / 2 + 0.5));
    const inverse = axe.slice().reverse();
    const voies = { 1: [], '-1': [] };
    for (let v = 0; v < t.voies; v++) {
      const d = decalageVoie(t, v, R);
      voies[1].push(decalerLigne(axe, d));
      voies[-1].push(decalerLigne(inverse, d));
    }
    const pistes = t.velo ? { 1: decalerLigne(axe, decalageVoie(t, 'velo', R)), '-1': decalerLigne(inverse, decalageVoie(t, 'velo', R)) } : null;
    troncons[id] = { axe, demi: demiLargeur(t, R), voies, pistes, longueur: longueur(axe) };
  }
  // La zone de chaque carrefour : l'enveloppe des bouts de ses branches
  for (const [id, n] of Object.entries(noeuds)) {
    if (n.degre < 2) { n.zone = null; continue; }
    const coins = [n.p];
    for (const b of n.branches) {
      const g = troncons[b.troncon], ext = b.sens === 1 ? g.axe : g.axe.slice().reverse();
      const pa = pointA(ext, 0);
      const nrm = [-pa.dir[1], pa.dir[0]];
      for (const k of [1, -1]) coins.push([pa.p[0] + nrm[0] * g.demi * k, pa.p[1] + nrm[1] * g.demi * k]);
    }
    n.zone = enveloppe(coins);
  }
  return { noeuds, troncons };
}

/** La ligne parcourue d'une voie : { troncon, sens, voie (entier ou 'velo') }. */
export function ligneVoie(geo, v) {
  const g = geo.troncons[v.troncon];
  if (!g) return null;
  return v.voie === 'velo' ? g.pistes?.[v.sens] ?? null : g.voies[v.sens]?.[v.voie] ?? null;
}

/** Le raccord dans un carrefour, de la fin d'une voie au début d'une autre (Bézier tangente aux deux). */
export function raccord(ligneEntree, ligneSortie) {
  const n = ligneEntree.length;
  const p0 = ligneEntree[n - 1], p3 = ligneSortie[0];
  const t0 = pointA(ligneEntree, longueur(ligneEntree)).dir, t1 = pointA(ligneSortie, 0).dir;
  const h = Math.max(0.5, dist(p0, p3) * 0.45);
  return bezier(p0, [p0[0] + t0[0] * h, p0[1] + t0[1] * h], [p3[0] - t1[0] * h, p3[1] - t1[1] * h], p3, 10);
}

/** Deux raccords se gênent-ils (plus proches que `seuil` en un point) ? */
export function seGenent(a, b, seuil) {
  for (const p of a) for (const q of b) if (dist(p, q) < seuil) return true;
  return false;
}
