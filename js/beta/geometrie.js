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
import { longueur, pointA, sousLigne, branches, demiLargeurs, aPiste } from './reseau.js?v=0.9.4';
import { decalerLigne } from '../geo/decalage.js?v=0.9.4';

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
    disposer(noeuds[id], reseau, R, !!n.feux);
  }
  // Deux passages presque collés (un tronçon court entre deux carrefours) n'en font qu'un : celui du bout a
  for (const [id, t] of Object.entries(reseau.troncons)) {
    const ba = noeuds[t.a].branches.find(x => x.troncon === id && x.sens === 1), bb = noeuds[t.b].branches.find(x => x.troncon === id && x.sens === -1);
    if (!noeuds[t.a].traversees || !noeuds[t.b].traversees) continue;
    const ecart = longueur(t.points) - ba.recul - bb.recul - (ba.z0 + Lp) - (bb.z0 + Lp);
    if (ecart < R.fusionTraversees) { bb.passage = false; bb.arret = (noeuds[t.b].protege ? bb.Lv : 0) + 1 + bb.sas; }
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
    const pas = (n, sens) => { const b = noeuds[n].branches.find(x => x.troncon === id && x.sens === sens); return noeuds[n].traversees ? b.z0 + Lp / 2 : 0; };
    const s0 = Math.min(pas(t.a, 1), La / 2 - 0.5), s1 = Math.min(pas(t.b, -1), La / 2 - 0.5);
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
    n.zoneTotale = n.zone;
    if (n.protege) compacter(n, reseau, R);
  }
  // Les feux : un mât à droite des files qui arrivent, sur le trottoir, au droit de la ligne d'arrêt
  for (const [id, n] of Object.entries(noeuds)) {
    for (const b of n.branches) {
      const pa = pointA(b.ext, b.arret), nrm = [-pa.dir[1], pa.dir[0]];
      const k = b.gauche + bord + 0.7; // les files qui arrivent sont à gauche de la branche vue depuis le nœud
      b.feu = { p: [pa.p[0] + nrm[0] * k, pa.p[1] + nrm[1] * k], velo: aPiste(reseau.troncons[b.troncon]) };
    }
    n.id = id;
    n.anneau = n.protege ? anneau(n, R) : null;
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
      if (n.traversees && n.branches[i].passage) lier(`${id}:${i}:d`, `${id}:${i}:g`, [points[`${id}:${i}:d`].p, points[`${id}:${i}:g`].p], { traversee: `${id}|${i}` });
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

/**
 * L'ordre des marquages devant chaque branche, depuis le carrefour (le recul) vers l'extérieur,
 * comme dans un carrefour protégé néerlandais : la traversée cyclable (à double sens si une piste
 * à double sens y arrive), un écart, le passage piéton, la ligne d'arrêt des vélos, puis — aux
 * feux — le sas vélo et la ligne d'arrêt des voitures (b.sas, b.arret).
 *   b.pisteG / b.pisteD : la piste de chaque côté de la branche vue depuis le nœud
 *   b.Lv (largeur de la traversée cyclable, 0 sans), b.double, b.z0 (début du passage piéton), b.arret
 * Un carrefour est « protégé » (n.protege) dès qu'une de ses branches a une piste.
 */
function disposer(n, reseau, R, feux) {
  const k = n.degre, Lp = R.largeurTraversee;
  for (const b of n.branches) {
    const p = reseau.troncons[b.troncon].pistes;
    b.pisteG = b.sens === 1 ? p.g : p.d;
    b.pisteD = b.sens === 1 ? p.d : p.g;
  }
  n.protege = n.traversees && n.branches.some(b => b.pisteG || b.pisteD);
  n.branches.forEach((b, i) => {
    // Les pistes qui se font face par-dessus cette branche : la droite de la voisine de gauche, la gauche de celle de droite
    const g = n.branches[(i + 1) % k], d = n.branches[(i - 1 + k) % k];
    b.double = n.protege && (g.pisteD === 'double' || d.pisteG === 'double');
    b.Lv = n.protege ? (b.double ? R.largeurTraverseeVeloDouble : R.largeurTraverseeVelo) : 0;
    b.z0 = n.protege ? b.Lv + R.ecartTraversees : 0;
    b.passage = n.traversees;
    // Sas vélo aux feux : la ligne des voitures recule, les vélos attendent devant elles
    b.sas = feux && n.traversees ? R.sas : 0;
    b.arret = n.traversees ? b.z0 + Lp + 1 + b.sas : 0.5;
  });
}

/**
 * Carrefour protégé : la zone des voitures se resserre sur les chaussées automobiles (leurs bords se
 * croisent plus près du nœud que les trottoirs) ; entre elle et l'anneau cyclable, les îlots de coin.
 * n.zone devient cette zone compacte, n.amorces les bouts de chaussée qui la relient aux branches ;
 * n.zoneTotale garde l'ancienne, pour les trottoirs.
 */
function compacter(n, reseau, R) {
  const k = n.degre, tour = 2 * Math.PI, croise = (wi, wj, th) => (th < Math.PI - 1e-3 ? (wj + wi * Math.cos(th)) / Math.sin(th) : 0);
  const voiture = b => reseau.troncons[b.troncon].voies * R.largeurVoie;
  const coins = [], amorces = [];
  n.branches.forEach((b, i) => {
    const g = n.branches[(i + 1) % k], d = n.branches[(i - 1 + k) % k], w = voiture(b) + 0.3;
    const r = Math.max(croise(w, voiture(g) + 0.3, (((g.angle - b.angle) % tour) + tour) % tour), croise(w, voiture(d) + 0.3, (((b.angle - d.angle) % tour) + tour) % tour)) + 1;
    const pa = pointA(b.ext, 0), u = pa.dir, nrm = [-u[1], u[0]], recul = Math.max(0, b.recul - Math.min(r, b.recul));
    const au = (s, o) => [pa.p[0] - u[0] * s + nrm[0] * o, pa.p[1] - u[1] * s + nrm[1] * o];
    const V = voiture(b);
    coins.push(au(recul, V), au(recul, -V));
    if (recul > 0.05) amorces.push([au(0, V), au(recul, V), au(recul, -V), au(0, -V)]);
  });
  n.zone = enveloppe([n.p, ...coins]);
  n.amorces = amorces;
}

/**
 * L'anneau cyclable d'un carrefour protégé : un point de chaque côté de chaque branche (au milieu
 * de sa traversée cyclable, dans l'axe de la piste), les traversées (de la droite à la gauche de la
 * branche) et les coins (de la gauche de la branche i à la droite de la branche i + 1), qui tournent
 * autour d'un îlot. On le parcourt dans le sens trigonométrique, ou à rebours sur les traversées à double sens.
 */
function anneau(n, R) {
  const k = n.degre, points = {}, coins = [], traversees = [];
  const centre = (b, cote) => {
    const t = { voies: 0 }, kind = cote === 'g' ? b.pisteG : b.pisteD;
    const voiture = (cote === 'g' ? b.gauche : b.droite) - (kind ? R.separateurPiste + (kind === 'double' ? R.largeurPisteDouble : R.largeurPiste) : 0);
    return voiture + R.separateurPiste + (kind === 'double' ? R.largeurPisteDouble : R.largeurPiste) / 2;
  };
  n.branches.forEach((b, i) => {
    const pa = pointA(b.ext, b.Lv / 2), nrm = [-pa.dir[1], pa.dir[0]];
    for (const [cote, sg] of [['g', 1], ['d', -1]]) {
      const o = centre(b, cote) * sg;
      points[`${i}:${cote}`] = [pa.p[0] + nrm[0] * o, pa.p[1] + nrm[1] * o];
    }
    b.voitureG = b.gauche - (b.pisteG ? R.separateurPiste + (b.pisteG === 'double' ? R.largeurPisteDouble : R.largeurPiste) : 0);
    b.voitureD = b.droite - (b.pisteD ? R.separateurPiste + (b.pisteD === 'double' ? R.largeurPisteDouble : R.largeurPiste) : 0);
  });
  n.branches.forEach((b, i) => {
    traversees.push({ i, ligne: [points[`${i}:d`], points[`${i}:g`]], double: b.double, largeur: b.Lv });
    // Coin : la piste contourne l'îlot par l'extérieur — courbe dont le point de contrôle est le coin
    // extérieur (là où la piste de la branche i, tournée vers la branche j, rejoint celle de j)
    const j = (i + 1) % k, c = n.branches[j], a = points[`${i}:g`], z = points[`${j}:d`];
    const u = pointA(b.ext, 0).dir, v = pointA(c.ext, 0).dir;
    const det = v[0] * u[1] - v[1] * u[0];
    let ligne = [a, z];
    if (Math.abs(det) > 1e-3) {
      // a + t·v = z + m·u
      const w = [z[0] - a[0], z[1] - a[1]], t = (w[0] * u[1] - w[1] * u[0]) / det, m = (w[0] * v[1] - w[1] * v[0]) / det;
      if (t > 0 && m > 0) {
        const ctl = [a[0] + v[0] * t, a[1] + v[1] * t];
        ligne = Array.from({ length: 9 }, (_, m) => { const t = m / 8, q = 1 - t; return [q * q * a[0] + 2 * q * t * ctl[0] + t * t * z[0], q * q * a[1] + 2 * q * t * ctl[1] + t * t * z[1]]; });
      }
    }
    const kinds = [b.pisteG, c.pisteD];
    coins.push({ i, ligne, largeur: kinds.includes('double') ? R.largeurPisteDouble : R.largeurPiste, piste: kinds.some(Boolean) });
  });
  return { points, coins, traversees };
}

/**
 * Le chemin d'un vélo sur l'anneau, de la branche i (côté c) à la branche j (côté c2) :
 * [{ ligne, traversee: 'nœud|indice' | null }]. Dans le sens trigonométrique toujours permis ;
 * à rebours seulement sur des traversées à double sens. Le plus court des deux.
 */
export function cheminAnneau(n, i, c, j, c2) {
  const k = n.degre, A = n.anneau, pos = (b, cote) => 2 * b + (cote === 'g' ? 1 : 0), N = 2 * k;
  const depart = pos(i, c), arrivee = pos(j, c2);
  const arete = (p, sens) => {
    // Position p → p + sens (mod N) : un coin entre g(b) et d(b+1), une traversée entre d(b) et g(b)
    const q = (p + sens + N) % N, bas = sens === 1 ? p : q;
    if (bas % 2 === 1) { const co = A.coins[(bas - 1) / 2]; return { ligne: sens === 1 ? co.ligne : co.ligne.slice().reverse(), traversee: null, id: `${n.id}|c${(bas - 1) / 2}` }; }
    const tr = A.traversees[bas / 2];
    return { ligne: sens === 1 ? tr.ligne : tr.ligne.slice().reverse(), traversee: `${n.id}|${bas / 2}`, double: tr.double, id: `${n.id}|t${bas / 2}` };
  };
  const parcours = sens => {
    const out = [];
    for (let p = depart; p !== arrivee; p = (p + sens + N) % N) out.push(arete(p, sens));
    return out;
  };
  const direct = parcours(1), rebours = parcours(-1);
  const long = ch => ch.reduce((s, e) => s + longueur(e.ligne), 0);
  const reboursPermis = rebours.every(e => !e.traversee || e.double);
  return reboursPermis && long(rebours) < long(direct) ? rebours : direct;
}
/** Côté de l'anneau où arrive une file vélo ('velo' : à sa droite = gauche de la branche) et d'où part une file. */
export const coteEntree = voie => (voie === 'velo' ? 'g' : 'd');
export const coteSortie = voie => (voie === 'velo' ? 'd' : 'g');

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
    if (n.degre < 2 || n.protege) continue; // un carrefour protégé a son anneau
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
