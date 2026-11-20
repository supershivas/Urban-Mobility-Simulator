// Le réseau de routes du jeu beta : des nœuds et des tronçons (une polyligne entre
// deux nœuds). Pur, testé (test/beta.test.mjs). Rien n'est modifié en place :
// chaque opération rend { reseau } ou { refus: code } (section 12 : un ordre
// impossible se refuse à voix haute, l'écran montre la raison).
//
// Repère : mètres, x vers l'est, y vers le nord. Un tronçon garde ses voies par
// sens (1 à 4) et ses pistes cyclables par côté, vu de a vers b :
// `pistes = { g, d }`, chacun null, 'simple' (à sens unique, dans le sens de la circulation
// voisine) ou 'double' (à double sens, chacun tient sa droite).
// Un nœud peut porter des feux : { verts: [s par branche, dans l'ordre des angles], pietons: s }.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const norme = a => Math.hypot(a[0], a[1]);
const unit = a => { const l = norme(a) || 1; return [a[0] / l, a[1] / l]; };
const gauche = d => [-d[1], d[0]];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// ─── Polylignes ────────────────────────────────────────────────────────────
export function longueur(ligne) {
  let l = 0;
  for (let i = 1; i < ligne.length; i++) l += dist(ligne[i - 1], ligne[i]);
  return l;
}

/** Le point à l'abscisse s (bornée) et la direction unitaire de la ligne en ce point. */
export function pointA(ligne, s) {
  let reste = Math.max(0, s);
  for (let i = 1; i < ligne.length; i++) {
    const l = dist(ligne[i - 1], ligne[i]);
    if (reste <= l || i === ligne.length - 1) {
      const k = l > 0 ? Math.min(1, reste / l) : 0;
      const a = ligne[i - 1], b = ligne[i];
      return { p: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], dir: unit(sub(b, a)) };
    }
    reste -= l;
  }
  return { p: [...ligne[0]], dir: [1, 0] };
}

/** La portion de ligne entre les abscisses s0 et s1. */
export function sousLigne(ligne, s0, s1) {
  const out = [pointA(ligne, s0).p];
  let acc = 0;
  for (let i = 1; i < ligne.length; i++) {
    acc += dist(ligne[i - 1], ligne[i]);
    if (acc > s0 + 1e-6 && acc < s1 - 1e-6) out.push([...ligne[i]]);
  }
  out.push(pointA(ligne, s1).p);
  return out;
}

/** Le point de la ligne le plus proche de p : { s, p, d, dir }. */
export function projeterSurLigne(ligne, p) {
  let best = null, acc = 0;
  for (let i = 1; i < ligne.length; i++) {
    const a = ligne[i - 1], b = ligne[i], ab = sub(b, a), l2 = dot(ab, ab), l = Math.sqrt(l2);
    const k = l2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2)) : 0;
    const q = [a[0] + ab[0] * k, a[1] + ab[1] * k], d = dist(p, q);
    if (!best || d < best.d) best = { s: acc + l * k, p: q, d, dir: unit(ab) };
    acc += l;
  }
  return best;
}

// ─── Réseau ────────────────────────────────────────────────────────────────
/** La carte vierge : une route droite d'ouest en est, ses deux bouts sont des bords de carte. */
export function reseauDepart({ longueur: L }) {
  return {
    v: 1,
    suivant: 3,
    noeuds: { n1: { x: -L / 2, y: 0, bord: true }, n2: { x: L / 2, y: 0, bord: true } },
    troncons: { t1: { a: 'n1', b: 'n2', points: [[-L / 2, 0], [L / 2, 0]], voies: 1, pistes: SANS_PISTE } },
  };
}

const pos = n => [n.x, n.y];

/** Les branches d'un nœud : chaque tronçon qui y touche, avec la direction qui en part. */
export function branches(reseau, idNoeud) {
  const out = [];
  for (const [id, t] of Object.entries(reseau.troncons)) {
    if (t.a === idNoeud) out.push({ troncon: id, sens: 1, dir: unit(sub(t.points[1], t.points[0])) });
    if (t.b === idNoeud) { const n = t.points.length; out.push({ troncon: id, sens: -1, dir: unit(sub(t.points[n - 2], t.points[n - 1])) }); }
  }
  return out;
}

/** La route la plus proche du point p, à moins de `rayon` m : { troncon, s, p, d, dir }. */
export function viser(reseau, p, rayon) {
  let best = null;
  for (const [id, t] of Object.entries(reseau.troncons)) {
    const r = projeterSurLigne(t.points, p);
    if (r.d <= rayon && (!best || r.d < best.d)) best = { troncon: id, ...r };
  }
  return best;
}

/**
 * Un point d'accroche sur le réseau, depuis une visée : le nœud tout proche s'il y en a
 * un (à moins de ecartNoeud le long du tronçon), sinon le point du tronçon.
 * → { noeud, p, dir } ou { troncon, s, p, dir }
 */
export function accroche(reseau, visee, T) {
  const t = reseau.troncons[visee.troncon], L = longueur(t.points);
  if (visee.s < T.ecartNoeud) return { noeud: t.a, p: pos(reseau.noeuds[t.a]), dir: visee.dir };
  if (L - visee.s < T.ecartNoeud) return { noeud: t.b, p: pos(reseau.noeuds[t.b]), dir: visee.dir };
  return { troncon: visee.troncon, s: visee.s, p: visee.p, dir: visee.dir };
}

/**
 * Le tracé d'une route qui part de `depart` ({ p, dir }, dir = sens de la route existante)
 * perpendiculairement, du côté du point visé, et tourne en arc de cercle jusqu'à `fin`.
 * → { points, rayon (signé, Infinity si droite), longueur }
 */
export function tracerArc(depart, fin, pasArc) {
  const P0 = depart.p, q = sub(fin, P0);
  const n = gauche(depart.dir);
  // Au bout d'une impasse, la route se prolonge (depart.d0) ; ailleurs elle part vers le côté du pointeur
  const d0 = depart.d0 ?? (dot(q, n) >= 0 ? n : [-n[0], -n[1]]);
  const m = gauche(d0);
  const avant = dot(q, d0), lat = dot(q, m), L2 = dot(q, q);
  if (Math.abs(lat) < 1e-6 * Math.max(1, L2) || avant <= 0) {
    const l = Math.sqrt(L2), k = Math.max(1, Math.ceil(l / pasArc));
    return { points: Array.from({ length: k + 1 }, (_, i) => [P0[0] + (q[0] * i) / k, P0[1] + (q[1] * i) / k]), rayon: Infinity, longueur: l, dirDepart: d0 };
  }
  const r = L2 / (2 * lat); // signé : positif, l'arc tourne à gauche
  const C = [P0[0] + m[0] * r, P0[1] + m[1] * r];
  const balayage = 2 * Math.atan2(lat, avant); // signé, au plus un demi-tour
  const l = Math.abs(r * balayage), k = Math.max(2, Math.ceil(l / pasArc));
  const a0 = Math.atan2(P0[1] - C[1], P0[0] - C[0]);
  const points = Array.from({ length: k + 1 }, (_, i) => {
    const a = a0 + (balayage * i) / k;
    return [C[0] + Math.abs(r) * Math.cos(a), C[1] + Math.abs(r) * Math.sin(a)];
  });
  points[k] = [...fin];
  return { points, rayon: r, longueur: l, dirDepart: d0 };
}

const angleEntre = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a, b))));

/** Une branche nouvelle (direction `dir`) au nœud ou au point d'un tronçon : refus éventuel. */
function refusBranche(reseau, point, dir, T) {
  const exist = point.noeud ? branches(reseau, point.noeud).map(b => b.dir) : [point.dir, [-point.dir[0], -point.dir[1]]];
  if (exist.length + 1 > T.branchesMax) return 'plein';
  if (point.noeud && reseau.noeuds[point.noeud].bord && exist.length === 1) return 'bord';
  const min = (T.angleMin * Math.PI) / 180;
  if (exist.some(e => angleEntre(e, dir) < min)) return 'angle';
  return null;
}

/** Distance du point p au réseau, sans compter les tronçons de `sauf`. */
function distanceAuReseau(reseau, p, sauf) {
  let d = Infinity;
  for (const [id, t] of Object.entries(reseau.troncons)) if (!sauf.has(id)) d = Math.min(d, projeterSurLigne(t.points, p).d);
  return d;
}

/**
 * Le projet de route complet, sans rien construire : départ, arrivée (accrochée ou libre),
 * tracé, et refus s'il y en a un. Sert à l'aperçu au survol comme à la construction.
 * depart : { noeud } | { troncon, s } (une accroche) ; pointeur : [x, y].
 */
export function projetRoute(reseau, depart, pointeur, R, T) {
  if (depart.noeud && !depart.d0) {
    const b = branches(reseau, depart.noeud);
    if (b.length === 1) depart = { ...depart, d0: [-b[0].dir[0], -b[0].dir[1]] };
  }
  let fin = { libre: true, p: pointeur };
  const v = viser(reseau, pointeur, T.accroche);
  if (v) {
    const a = accroche(reseau, v, T);
    const memePoint = (a.noeud && a.noeud === depart.noeud) || dist(a.p, depart.p) < T.ecartNoeud;
    if (!memePoint) fin = a;
  }
  const trace = tracerArc(depart, fin.p, R.pasArc);
  const projet = { depart, fin, ...trace };
  const refus = refusProjet(reseau, projet, T);
  return refus ? { ...projet, refus } : projet;
}

function refusProjet(reseau, projet, T) {
  const { depart, fin, points } = projet;
  if (projet.longueur < T.longueurMin) return 'court';
  if (Math.abs(projet.rayon) < T.rayonMin) return 'serre';
  if (points.some(p => Math.abs(p[0]) > T.zone || Math.abs(p[1]) > T.zone)) return 'hors';
  const rd = refusBranche(reseau, depart, projet.dirDepart, T);
  if (rd) return rd;
  if (!fin.libre) {
    const n = points.length, dirFin = unit(sub(points[n - 2], points[n - 1]));
    const rf = refusBranche(reseau, fin, dirFin, T);
    if (rf) return rf;
    if (fin.noeud && fin.noeud === depart.noeud) return 'boucle';
    // Déjà reliés directement : pas de second tronçon entre les deux mêmes nœuds
    if (fin.noeud && depart.noeud && Object.values(reseau.troncons).some(t => (t.a === fin.noeud && t.b === depart.noeud) || (t.b === fin.noeud && t.a === depart.noeud))) return 'double';
  }
  // Le tracé ne frôle ni ne croise aucune route, hors de ses deux bouts
  const L = projet.longueur, marge0 = T.ecartRoutes + 1, marge1 = fin.libre ? 0 : 2 * T.ecartRoutes + 1;
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) s += dist(points[i - 1], points[i]);
    if (s < marge0 || s > L - marge1) continue;
    if (distanceAuReseau(reseau, points[i], new Set()) < T.ecartRoutes) return 'proche';
  }
  // Une impasse ne finit pas sur le flanc d'une route trop proche
  if (fin.libre && distanceAuReseau(reseau, fin.p, new Set()) < T.ecartRoutes) return 'proche';
  return null;
}

/** Coupe un tronçon en deux à l'abscisse s : rend le nouveau réseau et le nœud créé. */
export function couper(reseau, idTroncon, s) {
  const t = reseau.troncons[idTroncon], L = longueur(t.points);
  const p = pointA(t.points, s).p;
  let n = reseau.suivant;
  const idN = `n${n++}`, id1 = `t${n++}`, id2 = `t${n++}`;
  const troncons = { ...reseau.troncons };
  delete troncons[idTroncon];
  troncons[id1] = { ...t, b: idN, points: sousLigne(t.points, 0, s) };
  troncons[id2] = { ...t, a: idN, points: sousLigne(t.points, s, L) };
  return { reseau: { ...reseau, suivant: n, noeuds: { ...reseau.noeuds, [idN]: { x: p[0], y: p[1] } }, troncons }, noeud: idN };
}

/** Le nœud d'une accroche, en coupant le tronçon s'il le faut (le point est re-visé : un tronçon a pu être coupé avant). */
function noeudDe(reseau, point, T) {
  if (point.noeud) return { reseau, noeud: point.noeud };
  const v = viser(reseau, point.p, 0.5);
  if (!v) return { reseau, noeud: null };
  const t = reseau.troncons[v.troncon], L = longueur(t.points);
  if (v.s < 0.5) return { reseau, noeud: t.a };
  if (L - v.s < 0.5) return { reseau, noeud: t.b };
  return couper(reseau, v.troncon, v.s);
}

/** Construit le projet : → { reseau, troncon } ou { refus }. Les voies de la nouvelle route reprennent celles du départ. */
export function construireRoute(reseau, projet, T) {
  if (projet.refus) return { refus: projet.refus };
  const voies = 1;
  let r = noeudDe(reseau, projet.depart, T);
  const idA = r.noeud;
  let idB;
  if (projet.fin.libre) {
    idB = `n${r.reseau.suivant}`;
    r = { reseau: { ...r.reseau, suivant: r.reseau.suivant + 1, noeuds: { ...r.reseau.noeuds, [idB]: { x: projet.fin.p[0], y: projet.fin.p[1] } } } };
  } else {
    r = noeudDe(r.reseau, projet.fin, T);
    idB = r.noeud;
  }
  if (!idA || !idB) return { refus: 'perdu' };
  const res = r.reseau, id = `t${res.suivant}`;
  const pts = projet.points.map(p => [...p]);
  pts[0] = pos(res.noeuds[idA]); pts[pts.length - 1] = pos(res.noeuds[idB]);
  return { reseau: { ...res, suivant: res.suivant + 1, troncons: { ...res.troncons, [id]: { a: idA, b: idB, points: pts, voies, pistes: SANS_PISTE } } }, troncon: id };
}

/** Une voie de plus par sens (1 → 2 → … → voiesMax), ou de moins (delta = −1) ; au-delà de voiesMax, retour à 1. */
export function basculerVoies(reseau, id, R, T, delta = 1) {
  const t = reseau.troncons[id];
  if (!t) return { refus: 'perdu' };
  const voies = delta > 0 ? (t.voies >= R.voiesMax ? 1 : t.voies + 1) : Math.max(1, t.voies - 1);
  if (voies === t.voies) return { refus: 'uneVoie' };
  // Une voie bus demande au moins deux voies dans son sens : revenir à une voie la retire
  return changer(reseau, id, { ...t, voies, ...(voies < 2 ? { bus: SANS_BUS } : {}) }, R, T);
}

// ─── Voies bus (v0.9.4) ────────────────────────────────────────────────────
// `bus = { g, d }` (vu de a vers b) : la voie la plus à droite du sens qui roule de ce côté
// (côté d : sens +1 ; côté g : sens −1) est réservée aux bus.
export const SANS_BUS = Object.freeze({ g: false, d: false });
export const busDe = t => t.bus ?? SANS_BUS;
/** La voie bus d'un sens d'un tronçon (indice de voie), ou null. */
export const voieBus = (t, sens) => (busDe(t)[sens === 1 ? 'd' : 'g'] ? t.voies - 1 : null);

/** Pose ou retire la voie bus du côté cliqué ; il faut au moins deux voies dans ce sens. */
export function basculerBus(reseau, id, cote) {
  const t = reseau.troncons[id];
  if (!t) return { refus: 'perdu' };
  const k = cote === 'gauche' ? 'g' : 'd', bus = busDe(t);
  if (!bus[k] && t.voies < 2) return { refus: 'busUneVoie' };
  return avecTroncon(reseau, id, { ...t, bus: { ...bus, [k]: !bus[k] } });
}

const avecTroncon = (reseau, id, t) => ({ reseau: { ...reseau, troncons: { ...reseau.troncons, [id]: t } } });

export const SANS_PISTE = Object.freeze({ g: null, d: null });
export const aPiste = t => !!(t.pistes.g || t.pistes.d);
const memesPistes = (a, b) => a.g === b.g && a.d === b.d;
const retournees = p => ({ g: p.d, d: p.g });

/** Une piste à sens unique de chaque côté d'un tronçon, ou plus de piste (les pistes à double sens deviennent simples). */
export function basculerVelo(reseau, id, R, T) {
  const t = reseau.troncons[id];
  if (!t) return { refus: 'perdu' };
  const simples = t.pistes.g === 'simple' && t.pistes.d === 'simple';
  return changer(reseau, id, { ...t, pistes: simples ? SANS_PISTE : { g: 'simple', d: 'simple' } }, R, T);
}

/** Le côté d'un tronçon où tombe le point p : 'gauche' ou 'droite', vu de a vers b. */
export function coteDe(reseau, id, p) {
  const t = reseau.troncons[id], pr = projeterSurLigne(t.points, p);
  return (p[0] - pr.p[0]) * -pr.dir[1] + (p[1] - pr.p[1]) * pr.dir[0] >= 0 ? 'gauche' : 'droite';
}

/** Une piste à double sens du côté `cote` ('gauche' | 'droite'), l'autre côté gardé ; un second clic la retire. */
export function basculerPisteDouble(reseau, id, cote, R, T) {
  const t = reseau.troncons[id];
  if (!t) return { refus: 'perdu' };
  const k = cote === 'gauche' ? 'g' : 'd';
  return changer(reseau, id, { ...t, pistes: { ...t.pistes, [k]: t.pistes[k] === 'double' ? null : 'double' } }, R, T);
}

/** Demi-largeurs de la chaussée, pistes comprises (même calcul que geometrie.js). */
export function demiLargeurs(t, R) {
  const voiture = t.voies * R.largeurVoie, x0 = voiture + R.separateurPiste;
  const cote = p => (p === 'simple' ? x0 + R.largeurPiste : p === 'double' ? x0 + R.largeurPisteDouble : voiture);
  return { g: cote(t.pistes.g), d: cote(t.pistes.d), voiture, x0 };
}

/**
 * Un tronçon élargi tient-il ? Refus si la chaussée (pistes comprises) dépasse R.largeurMax,
 * ou si elle mord sur une autre route (hors des carrefours qu'elle partage avec elle).
 */
function changer(reseau, id, t, R, T) {
  if (R && T) {
    const l = demiLargeurs(t, R);
    if (l.g + l.d > R.largeurMax) return { refus: 'large' };
    const ancien = demiLargeurs(reseau.troncons[id], R);
    if (l.g > ancien.g || l.d > ancien.d) {
      const L = longueur(t.points), demi = Math.max(l.g, l.d);
      for (const [autre, u] of Object.entries(reseau.troncons)) {
        if (autre === id) continue;
        const lu = demiLargeurs(u, R), commun = [t.a, t.b].filter(n => n === u.a || n === u.b);
        for (let s = 0; s <= L; s += 4) {
          const p = pointA(t.points, s).p;
          // Près d'un carrefour partagé, les deux routes se touchent forcément
          if (commun.some(n => Math.hypot(p[0] - reseau.noeuds[n].x, p[1] - reseau.noeuds[n].y) < demi + Math.max(lu.g, lu.d) + T.ecartRoutes)) continue;
          if (projeterSurLigne(u.points, p).d < demi + Math.max(lu.g, lu.d) + R.accotement * 2 + R.largeurTrottoir) return { refus: 'chevauche' };
        }
      }
    }
  }
  return avecTroncon(reseau, id, t);
}

// ─── Feux ──────────────────────────────────────────────────────────────────
/** Les feux d'un nœud, ramenés à son nombre de branches (une branche ajoutée ou démolie : durées par défaut). */
export function feuxDe(reseau, idNoeud, F) {
  const n = reseau.noeuds[idNoeud], k = branches(reseau, idNoeud).length;
  if (!n?.feux || k < 3) return null;
  return n.feux.verts?.length === k ? n.feux : { verts: Array(k).fill(F.vert), pietons: n.feux.pietons ?? F.vertPietons };
}
const avecNoeud = (reseau, id, n) => ({ reseau: { ...reseau, noeuds: { ...reseau.noeuds, [id]: n } } });

/** Pose des feux sur un carrefour (trois branches au moins), ou les retire. */
export function basculerFeux(reseau, idNoeud, F) {
  const n = reseau.noeuds[idNoeud];
  if (!n) return { refus: 'perdu' };
  if (n.feux) { const { feux, ...reste } = n; return avecNoeud(reseau, idNoeud, reste); }
  const k = branches(reseau, idNoeud).length;
  if (k < 3) return { refus: 'pasCarrefour' };
  return avecNoeud(reseau, idNoeud, { ...n, feux: { verts: Array(k).fill(F.vert), pietons: F.vertPietons } });
}

/** Allonge ou raccourcit un vert : phase = indice de branche, ou 'pietons'. */
export function reglerFeu(reseau, idNoeud, phase, delta, F) {
  const feux = feuxDe(reseau, idNoeud, F);
  if (!feux) return { refus: 'perdu' };
  const borne = v => Math.max(F.min, Math.min(F.max, v + delta));
  const nouveaux = phase === 'pietons' ? { ...feux, pietons: borne(feux.pietons) } : { ...feux, verts: feux.verts.map((v, i) => (i === phase ? borne(v) : v)) };
  return avecNoeud(reseau, idNoeud, { ...reseau.noeuds[idNoeud], feux: nouveaux });
}

/** Le carrefour le plus proche du point p, à moins de `rayon` m (trois branches au moins). */
export function viserCarrefour(reseau, p, rayon) {
  let best = null;
  for (const [id, n] of Object.entries(reseau.noeuds)) {
    const d = Math.hypot(n.x - p[0], n.y - p[1]);
    if (d <= rayon && (!best || d < best.d) && branches(reseau, id).length >= 3) best = { noeud: id, d };
  }
  return best;
}

/**
 * Démolit un tronçon. Un nœud resté seul disparaît ; un nœud qui ne relie plus que deux
 * tronçons pareils (mêmes voies, même piste) n'est plus un carrefour : les deux se recollent.
 * Un tronçon qui touche le bord de la carte ne se démolit pas (la route de départ reste reliée au monde).
 */
export function demolir(reseau, id) {
  const t = reseau.troncons[id];
  if (!t) return { refus: 'perdu' };
  if (reseau.noeuds[t.a].bord || reseau.noeuds[t.b].bord) return { refus: 'bordDemolir' };
  let res = { ...reseau, noeuds: { ...reseau.noeuds }, troncons: { ...reseau.troncons } };
  delete res.troncons[id];
  for (const n of new Set([t.a, t.b])) res = nettoyerNoeud(res, n);
  return { reseau: res };
}

function nettoyerNoeud(reseau, idNoeud) {
  if (!reseau.noeuds[idNoeud]) return reseau;
  const br = branches(reseau, idNoeud);
  if (br.length === 0) { const noeuds = { ...reseau.noeuds }; delete noeuds[idNoeud]; return { ...reseau, noeuds }; }
  if (br.length < 3 && reseau.noeuds[idNoeud].feux) { // plus un carrefour : plus de feux
    const { feux, ...n } = reseau.noeuds[idNoeud];
    reseau = { ...reseau, noeuds: { ...reseau.noeuds, [idNoeud]: n } };
  }
  if (br.length !== 2 || br[0].troncon === br[1].troncon || reseau.noeuds[idNoeud].bord) return reseau;
  const [b1, b2] = br, t1 = reseau.troncons[b1.troncon], t2 = reseau.troncons[b2.troncon];
  // t1 parcouru vers le nœud, puis t2 depuis le nœud ; les côtés des pistes s'échangent quand on retourne un tronçon
  const pistes = b1.sens !== -1 ? retournees(t1.pistes) : t1.pistes;
  const bus = b1.sens !== -1 ? retournees(busDe(t1)) : busDe(t1), bus2 = b2.sens !== 1 ? retournees(busDe(t2)) : busDe(t2);
  if (t1.voies !== t2.voies || !memesPistes(pistes, b2.sens !== 1 ? retournees(t2.pistes) : t2.pistes) || !memesPistes(bus, bus2)) {
    if (reseau.noeuds[idNoeud].feux) { const { feux, ...n } = reseau.noeuds[idNoeud]; return { ...reseau, noeuds: { ...reseau.noeuds, [idNoeud]: n } }; }
    return reseau;
  }
  const avant = b1.sens === -1 ? t1.points : t1.points.slice().reverse();
  const apres = b2.sens === 1 ? t2.points : t2.points.slice().reverse();
  const a = b1.sens === -1 ? t1.a : t1.b, b = b2.sens === 1 ? t2.b : t2.a;
  if (a === b) return reseau; // les deux tronçons formeraient une boucle sur elle-même : on garde le nœud
  const troncons = { ...reseau.troncons }, noeuds = { ...reseau.noeuds };
  delete troncons[b1.troncon]; delete troncons[b2.troncon]; delete noeuds[idNoeud];
  const nouveau = `t${reseau.suivant}`;
  troncons[nouveau] = { ...t1, a, b, pistes, bus, points: [...avant, ...apres.slice(1)] };
  return { ...reseau, suivant: reseau.suivant + 1, noeuds, troncons };
}

/** Relit un réseau sauvegardé : rend null s'il est incohérent (le jeu repart alors de la carte vierge). */
export function relireReseau(d) {
  if (!d || typeof d !== 'object' || !d.noeuds || !d.troncons) return null;
  for (const t of Object.values(d.troncons)) {
    if (!d.noeuds[t.a] || !d.noeuds[t.b] || !Array.isArray(t.points) || t.points.length < 2) return null;
    t.voies = Math.max(1, Math.min(4, Math.round(t.voies) || 1));
    // 0.9.0 et 0.9.1 : `velo` (booléen) ; 0.9.2 : `piste` ('deux' | 'gauche' | 'droite') → `pistes` { g, d }
    if (!t.pistes) {
      const p = 'piste' in t ? t.piste : t.velo ? 'deux' : null;
      t.pistes = p === 'deux' ? { g: 'simple', d: 'simple' } : p === 'gauche' ? { g: 'double', d: null } : p === 'droite' ? { g: null, d: 'double' } : { g: null, d: null };
    }
    delete t.velo; delete t.piste;
    for (const k of ['g', 'd']) if (!['simple', 'double'].includes(t.pistes[k])) t.pistes[k] = null;
    if (t.voies >= 2 && t.bus) t.bus = { g: !!t.bus.g, d: !!t.bus.d }; else delete t.bus;
  }
  return { v: 1, suivant: d.suivant || 1, noeuds: d.noeuds, troncons: d.troncons };
}
