// La géométrie du réseau beta, lue à la fois par le dessin (scene.js), par le
// trafic (roulage.js) et par les piétons (pietons.js) : tous voient exactement les
// mêmes voies, trottoirs et traversées. Pur, testé.
//
// Conduite à droite. Pour un tronçon a → b, le sens +1 roule à droite de l'axe
// (décalage négatif), le sens −1 sur la ligne inversée, à droite elle aussi.
// Voie 0 = la plus proche de l'axe. Les tronçons s'arrêtent au recul de chaque
// carrefour ; la zone du carrefour est dessinée par-dessus, les raccords y passent.
// Devant un carrefour (trois branches et plus), chaque branche a un passage piéton
// de `largeurTraversee` m, puis la ligne d'arrêt.
//
// Les branches d'un nœud sont rangées par angle croissant (sens trigonométrique) :
// c'est l'ordre des phases de feux et des coins de trottoir.
//
// Recul (v0.9.3, d'après la pratique des urbanistes : passages perpendiculaires à la rue,
// posés là où les trottoirs de deux branches voisines se séparent) : chaque branche recule
// jusqu'au point où le bord extérieur de son trottoir croise celui de chaque voisine ;
// plus l'angle est aigu, plus elle recule. Plus jamais deux passages l'un sur l'autre.
import { longueur, pointA, sousLigne, branches, demiLargeurs, aPiste } from './reseau.js?v=0.9.3';
import { decalerLigne } from '../geo/decalage.js?v=0.9.3';

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];

/** Demi-largeurs de la chaussée à gauche et à droite de l'axe (vu de a vers b), pistes comprises. */
export const largeurs = demiLargeurs;
export const demiLargeur = (t, R) => { const l = largeurs(t, R); return Math.max(l.g, l.d); };

/** Décalage (positif à gauche du sens de marche) du milieu d'une voie automobile. */
export const decalageVoie = (t, voie, R) => -(voie + 0.5) * R.largeurVoie;

/**
 * Les files vélo d'un sens, sur la ligne de ce sens (l'axe pour +1, l'axe retourné pour −1) :
 * d'abord la piste à sa droite (simple, ou moitié extérieure d'une double), puis, s'il y en a
 * une, la moitié intérieure de la piste à double sens d'en face. Décalages positifs à gauche.
 */
export function decalagesVelo(t, R, sens) {
  const { x0 } = largeurs(t, R), Ld = R.largeurPisteDouble;
  const droite = sens === 1 ? t.pistes.d : t.pistes.g, gauche = sens === 1 ? t.pistes.g : t.pistes.d;
  const out = [];
  if (droite === 'simple') out.push(-(x0 + R.largeurPiste / 2));
  if (droite === 'double') out.push(-(x0 + (3 * Ld) / 4));
  if (gauche === 'double') out.push(x0 + Ld / 4);
  return out;
}
/** Les noms des files vélo d'un sens : 'velo' (la première), 'velo2' (la seconde). */
export const FILES_VELO = ['velo', 'velo2'];

/** Enveloppe convexe (chaîne monotone d'Andrew). */
export function enveloppe(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const bas = [], haut = [];
  for (const q of p) { while (bas.length >= 2 && cr(bas[bas.length - 2], bas[bas.length - 1], q) <= 0) bas.pop(); bas.push(q); }
  for (const q of p.slice().reverse()) { while (haut.length >= 2 && cr(haut[haut.length - 2], haut[haut.length - 1], q) <= 0) haut.pop(); haut.push(q); }
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
 *  troncons[id] = { axe (raccourci aux reculs), g, d, demi, voies: { '1': [ligne…], '-1': [ligne…] }, pistes: { '1', '-1' } | null, trottoirs: { g, d } }
 *  noeuds[id]   = { p, degre, recul, traversees (bool), zone | null, branches: [{ troncon, sens, ext, gauche, droite, feu }] }
 *  pietons      = { points: { id: { p, bord, liens: [{ vers, ligne, traversee? }] } } }
 * Une branche « sort » du nœud : sens +1 si le tronçon part de ce nœud (a), −1 s'il y arrive (b) ;
 * ext est son axe vu depuis le nœud, gauche / droite ses demi-largeurs de ce point de vue.
 */
export function geometrieReseau(reseau, R) {
  const noeuds = {}, troncons = {};
  const Lp = R.largeurTraversee, bord = R.accotement, tw = R.largeurTrottoir;
  for (const [id, n] of Object.entries(reseau.noeuds)) {
    const br = branches(reseau, id).sort((a, b) => Math.atan2(a.dir[1], a.dir[0]) - Math.atan2(b.dir[1], b.dir[0]));
    const degre = br.length;
    noeuds[id] = { p: [n.x, n.y], degre, bord: !!n.bord, traversees: degre >= 3, branches: br.map(b => ({ troncon: b.troncon, sens: b.sens, angle: Math.atan2(b.dir[1], b.dir[0]) })) };
    for (const b of noeuds[id].branches) {
      const l = largeurs(reseau.troncons[b.troncon], R);
      b.gauche = b.sens === 1 ? l.g : l.d;
      b.droite = b.sens === 1 ? l.d : l.g;
    }
    reculer(noeuds[id], R);
  }
  const reculDe = (n, troncon, sens) => noeuds[n].branches.find(b => b.troncon === troncon && b.sens === sens).recul;
  for (const [id, t] of Object.entries(reseau.troncons)) {
    const L = longueur(t.points);
    const r0 = reculDe(t.a, id, 1), r1 = reculDe(t.b, id, -1);
    const axe = sousLigne(t.points, Math.min(r0, L / 2 - 0.5), Math.max(L - r1, L / 2 + 0.5));
    const inverse = axe.slice().reverse();
    const voies = { 1: [], '-1': [] };
    for (let v = 0; v < t.voies; v++) {
      const d = decalageVoie(t, v, R);
      voies[1].push(decalerLigne(axe, d));
      voies[-1].push(decalerLigne(inverse, d));
    }
    const pistes = aPiste(t) ? { 1: decalagesVelo(t, R, 1).map(d => decalerLigne(axe, d)), '-1': decalagesVelo(t, R, -1).map(d => decalerLigne(inverse, d)) } : null;
    const { g, d } = largeurs(t, R), La = longueur(axe);
    // Trottoirs : la ligne où l'on marche, du point piéton d'un bout à celui de l'autre
    const s0 = noeuds[t.a].traversees ? Math.min(Lp / 2, r0) : 0, s1 = noeuds[t.b].traversees ? Math.min(Lp / 2, r1) : 0;
    const milieu = s0 + s1 < La - 1 ? sousLigne(axe, s0, La - s1) : axe;
    const trottoirs = { g: decalerLigne(milieu, g + bord + tw / 2), d: decalerLigne(milieu, -(d + bord + tw / 2)) };
    troncons[id] = { axe, g, d, demi: Math.max(g, d), voies, pistes, trottoirs, longueur: La };
  }
  // Chaque branche vue depuis son nœud ; la zone du carrefour est l'enveloppe des bouts de ses branches
  for (const n of Object.values(noeuds)) {
    for (const b of n.branches) {
      const g = troncons[b.troncon];
      b.ext = b.sens === 1 ? g.axe : g.axe.slice().reverse();
    }
    if (n.degre < 2) { n.zone = null; continue; }
    const coins = [n.p];
    for (const b of n.branches) {
      const pa = pointA(b.ext, 0), nrm = [-pa.dir[1], pa.dir[0]];
      coins.push([pa.p[0] + nrm[0] * b.gauche, pa.p[1] + nrm[1] * b.gauche], [pa.p[0] - nrm[0] * b.droite, pa.p[1] - nrm[1] * b.droite]);
    }
    n.zone = enveloppe(coins);
  }
  // Les feux : un mât à droite des files qui arrivent, sur le trottoir, au droit de la ligne d'arrêt
  for (const [id, n] of Object.entries(noeuds)) {
    for (const b of n.branches) {
      const pa = pointA(b.ext, (n.traversees ? Lp : 0) + 1), nrm = [-pa.dir[1], pa.dir[0]];
      const k = b.gauche + bord + 0.7; // les files qui arrivent sont à gauche de la branche vue depuis le nœud
      b.feu = { p: [pa.p[0] + nrm[0] * k, pa.p[1] + nrm[1] * k], velo: aPiste(reseau.troncons[b.troncon]) };
    }
    n.id = id;
  }
  return { noeuds, troncons, pietons: reseauPieton(reseau, noeuds, troncons, R) };
}

/**
 * Le réseau des piétons. Points : `${nœud}:${i}:g|d`, le bout du trottoir gauche / droit
 * de la branche i (vue depuis le nœud). Liens : les trottoirs le long des tronçons, les
 * coins (de la branche i à gauche vers la branche i + 1 à droite), les traversées (de la
 * droite à la gauche d'une même branche, devant un carrefour), le tour d'une impasse.
 */
function reseauPieton(reseau, noeuds, troncons, R) {
  const points = {};
  const point = (id, p) => (points[id] ??= { p, bord: false, liens: [] });
  const lier = (a, b, ligne, plus = {}) => {
    points[a].liens.push({ vers: b, ligne, ...plus });
    points[b].liens.push({ vers: a, ligne: ligne.slice().reverse(), ...plus });
  };
  const indice = (n, troncon, sens) => noeuds[n].branches.findIndex(b => b.troncon === troncon && b.sens === sens);
  for (const [id, t] of Object.entries(reseau.troncons)) {
    const g = troncons[id], ia = indice(t.a, id, 1), ib = indice(t.b, id, -1);
    // À gauche de a → b : la gauche de la branche en a, la droite de la branche en b
    const G = g.trottoirs.g, D = g.trottoirs.d;
    point(`${t.a}:${ia}:g`, G[0]); point(`${t.b}:${ib}:d`, G[G.length - 1]);
    point(`${t.a}:${ia}:d`, D[0]); point(`${t.b}:${ib}:g`, D[D.length - 1]);
    lier(`${t.a}:${ia}:g`, `${t.b}:${ib}:d`, G, { trottoir: id });
    lier(`${t.a}:${ia}:d`, `${t.b}:${ib}:g`, D, { trottoir: id });
  }
  for (const [id, n] of Object.entries(noeuds)) {
    const k = n.degre;
    if (k === 1) {
      const pg = points[`${id}:0:g`], pd = points[`${id}:0:d`];
      if (n.bord) { pg.bord = pd.bord = true; continue; }
      // Impasse : le tour du bout arrondi
      const ang0 = Math.atan2(pg.p[1] - n.p[1], pg.p[0] - n.p[0]), r = (dist(pg.p, n.p) + dist(pd.p, n.p)) / 2;
      const arc = Array.from({ length: 9 }, (_, j) => { const a = ang0 + (Math.PI * j) / 8; return [n.p[0] + r * Math.cos(a), n.p[1] + r * Math.sin(a)]; });
      arc[0] = pg.p; arc[8] = pd.p;
      lier(`${id}:0:g`, `${id}:0:d`, arc, { coin: id });
      continue;
    }
    for (let i = 0; i < k; i++) {
      const a = points[`${id}:${i}:g`], b = points[`${id}:${(i + 1) % k}:d`];
      lier(`${id}:${i}:g`, `${id}:${(i + 1) % k}:d`, [a.p, b.p], { coin: id });
      if (n.traversees) lier(`${id}:${i}:d`, `${id}:${i}:g`, [points[`${id}:${i}:d`].p, points[`${id}:${i}:g`].p], { traversee: `${id}|${i}` });
    }
  }
  return { points };
}

/**
 * Le recul de chaque branche d'un nœud (m, depuis le nœud) : au-delà du point où le bord
 * extérieur de son trottoir croise celui de sa voisine, de chaque côté, plus une marge.
 * Pour deux branches qui font un angle θ (< π), ce point est à (w_j + w_i·cos θ) / sin θ
 * le long de la branche i, w étant la demi-largeur trottoir compris du côté qui se fait face.
 */
function reculer(n, R) {
  const k = n.degre, bord = R.accotement + R.largeurTrottoir;
  if (k <= 1) { for (const b of n.branches) b.recul = 0; n.recul = 0; return; }
  if (k === 2) { for (const b of n.branches) b.recul = R.reculPassage; n.recul = R.reculPassage; return; }
  const tour = 2 * Math.PI;
  n.branches.forEach((b, i) => {
    const g = n.branches[(i + 1) % k], d = n.branches[(i - 1 + k) % k];
    let s = 0;
    const croise = (wi, wj, theta) => (theta < Math.PI - 1e-3 ? (wj + wi * Math.cos(theta)) / Math.sin(theta) : 0);
    s = Math.max(s, croise(b.gauche + bord, g.droite + bord, (((g.angle - b.angle) % tour) + tour) % tour));
    s = Math.max(s, croise(b.droite + bord, d.gauche + bord, (((b.angle - d.angle) % tour) + tour) % tour));
    b.recul = s + R.margeCarrefour;
  });
  n.recul = Math.max(...n.branches.map(b => b.recul));
}

/** La ligne parcourue d'une voie : { troncon, sens, voie (entier, 'velo' ou 'velo2') }. */
export function ligneVoie(geo, v) {
  const g = geo.troncons[v.troncon];
  if (!g) return null;
  const k = FILES_VELO.indexOf(v.voie);
  return k >= 0 ? g.pistes?.[v.sens]?.[k] ?? null : g.voies[v.sens]?.[v.voie] ?? null;
}
/** Les files vélo d'un sens d'un tronçon : [{ troncon, sens, voie }]. */
export const filesVelo = (geo, troncon, sens) => (geo.troncons[troncon]?.pistes?.[sens] ?? []).map((_, k) => ({ troncon, sens, voie: FILES_VELO[k] }));

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

/**
 * Les traversées cyclables marquées dans les carrefours : seulement tout droit, d'une file vélo
 * qui arrive à la file qui continue en face (comme les urbanistes : une bande parallèle au passage
 * piéton, jamais de courbe peinte à travers le carrefour). → [{ ligne, double }]
 */
export function liaisonsVelo(reseau, geo) {
  const out = [];
  for (const n of Object.values(geo.noeuds)) {
    if (n.degre < 2) continue;
    for (const e of n.branches) for (const s of n.branches) {
      if (e === s) continue;
      for (const fe of filesVelo(geo, e.troncon, -e.sens)) for (const fs of filesVelo(geo, s.troncon, s.sens)) {
        const entree = ligneVoie(geo, fe), sortie = ligneVoie(geo, fs);
        const t0 = pointA(entree, longueur(entree)).dir, t1 = pointA(sortie, 0).dir;
        const virage = Math.acos(Math.max(-1, Math.min(1, t0[0] * t1[0] + t0[1] * t1[1])));
        const ecart = Math.abs(cross(t0, [sortie[0][0] - entree[entree.length - 1][0], sortie[0][1] - entree[entree.length - 1][1]]));
        if (virage < 0.35 && ecart < 1.5) out.push(raccord(entree, sortie));
      }
    }
  }
  return out;
}
