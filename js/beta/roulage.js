// Le trafic du jeu beta : voitures et vélos sur les voies de geometrie.js.
// Déterministe (générateur à graine, pas de Math.random, temps de la boucle) et
// sans DOM ni three.js : testé (test/beta.test.mjs). L'état simulé est mutable
// pour la vitesse, mais il n'est jamais sauvegardé (il repart à chaque ouverture).
//
// Chaque véhicule suit sa voie et garde la distance (modèle IDM). Au bout d'une
// voie il continue par un raccord vers une branche tirée au hasard ; il entre
// dans un carrefour seulement si sa trajectoire ne croise celle d'aucun véhicule
// déjà engagé, et si la voie de sortie a de la place. Qui attend depuis
// longtemps se réserve le carrefour. Les bouts de carte et les impasses font
// naître et disparaître les voitures ; les bouts de piste, les vélos.
// Feux (v0.9.2) : on n'entre qu'au vert de sa branche. Passages piétons : on s'arrête
// avant un passage où quelqu'un traverse, et l'on n'entre pas dans un carrefour dont le
// passage de sortie est occupé. Les piétons eux-mêmes vivent dans pietons.js.
import { createRng } from '../lib/rng.js?v=0.9.10';
import { longueur, pointA, projeterSurLigne, feuxDe, aPiste, voieBus, nbVoies, extraDe } from './reseau.js?v=0.9.10';
import { geometrieReseau, ligneVoie, raccord, seGenent, filesVelo, cheminAnneau, coteEntree, coteSortie, cheminGiratoire, cheminBretelle, cheminVirage, longerAmorce, estBretelle } from './geometrie.js?v=0.9.10';
import { etatFeux, decalageDe } from './feux.js?v=0.9.10';
import { creerPietons, avancerPietons, reconcilierPietons } from './pietons.js?v=0.9.10';
import { mouvementsDu, cle as cleMouvement, deCle } from './mouvements.js?v=0.9.10';

const cleVoie = v => `${v.troncon}|${v.sens}|${v.voie}`;

/** Le chemin d'une voie à une autre dans un carrefour (raccord, rond-point ou bretelle) : pour les contrôles. */
export const cheminRaccord = (ctx, entree, sortie) => raccordDe(ctx, entree, sortie);

/** Le contexte de simulation d'un réseau : sa géométrie, et le cache des raccords. */
export function preparerTrafic(reseau, R, F) {
  const geo = geometrieReseau(reseau, R);
  const feux = {};
  for (const id of Object.keys(reseau.noeuds)) { const f = F && feuxDe(reseau, id, F); if (f) feux[id] = f; }
  // Les mouvements de chaque carrefour (de quelle voie vers quelle voie) : les voitures les suivent
  const mouvements = {};
  for (const [id, n] of Object.entries(geo.noeuds)) if (n.degre >= 3 && !n.giratoire) mouvements[id] = mouvementsDu(reseau, n, id);
  return { reseau, R, F, geo, feux, mouvements, raccords: new Map(), conflits: new Map() };
}

export function creerTrafic(T, graine = T.graine) {
  const rng = createRng(graine);
  return { t: 0, vehicules: [], prochainId: 1, sources: {}, rng, sortis: { voiture: 0, velo: 0, bus: 0 }, abandons: 0, feux: {}, traversees: new Map(), traverseesVelo: new Map(), ...creerPietons(rng.fork('pietons')) };
}

/** La branche (indice dans l'ordre des angles) par laquelle une voie arrive à son nœud de fin. */
function brancheArrivee(ctx, v) {
  const n = noeudFin(ctx, v);
  return ctx.geo.noeuds[n].branches.findIndex(b => b.troncon === v.troncon && b.sens === -v.sens);
}
const brancheDepart = (ctx, n, v) => ctx.geo.noeuds[n].branches.findIndex(b => b.troncon === v.troncon && b.sens === v.sens);
/** Quelqu'un de la liste est-il sur le point Q (à la demi-largeur près d'une voie), ou va-t-il y arriver ? */
// `avance` : jusqu'où l'on regarde qui vient vers sa voie (un vélo arrive trois fois plus vite qu'un piéton)
const genants = (liste, Q, demi, avance = 2.2) => (liste || []).some(o => {
  const dx = Q[0] - o.p[0], dy = Q[1] - o.p[1], d = Math.hypot(dx, dy);
  return d < demi + 0.4 || (d < demi + avance && dx * o.dir[0] + dy * o.dir[1] > 0);
});
const DEMI = { voiture: 1.2, bus: 1.4, velo: 0.6 };
/**
 * Doit-on céder sur la branche i du nœud n, à l'endroit où sa voie (ligne) croise le passage piéton
 * — et, pour une voiture ou un bus, la traversée cyclable ? `arrivee` : la voie arrive au nœud (sinon elle en part).
 * Seulement à qui est sur sa voie ou s'apprête à y entrer (Jérôme, v0.9.4).
 */
export function aCeder(etat, ctx, n, i, ligne, arrivee, mode) {
  const g = ctx.geo.noeuds[n], b = g.branches[i];
  if (!g.traversees || !b || !ligne) return false;
  const L = longueur(ligne), au = s => pointA(ligne, arrivee ? L - s : s).p, cle = `${n}|${i}`;
  if (b.passage && genants(etat.traversees.get(cle), au(b.z0 + ctx.R.largeurTraversee / 2), DEMI[mode])) return true;
  return mode !== 'velo' && g.protege && genants(etat.traverseesVelo.get(cle), au(b.Lv / 2), DEMI[mode], 6);
}
/** Abscisse de la ligne d'arrêt d'une voie : avant le passage piéton (et la traversée cyclable) s'il y en a. */
const arret = (ctx, veh) => {
  const n = ctx.geo.noeuds[noeudFin(ctx, veh.voie)], b = n.branches[brancheArrivee(ctx, veh.voie)];
  return veh.L - (b ? b.arret : 0.5);
};
/** Un segment d'anneau : son identité et son sens de parcours. */
const cleSeg = seg => `${seg.id}@${seg.ligne[0][0].toFixed(2)},${seg.ligne[0][1].toFixed(2)}`;
const famille = mode => (mode === 'velo' ? 'velo' : 'voiture'); // un bus roule sur les voies des voitures

/** Le nœud au bout d'une voie. */
const noeudFin = (ctx, v) => { const t = ctx.reseau.troncons[v.troncon]; return v.sens === 1 ? t.b : t.a; };

function raccordDe(ctx, entree, sortie) {
  const cle = `${cleVoie(entree)}>${cleVoie(sortie)}`;
  let r = ctx.raccords.get(cle);
  if (!r) {
    const ne = ctx.geo.noeuds[noeudFin(ctx, entree)];
    // Bretelle : depuis la voie de droite, vers la branche voisine en sens horaire
    const iE = ne.branches.findIndex(b => b.troncon === entree.troncon && b.sens === -entree.sens), iS = ne.branches.findIndex(b => b.troncon === sortie.troncon && b.sens === sortie.sens);
    const bretelle = ne.giratoire && estBretelle(ne, iE, iS) && entree.voie === nbVoies(ctx.reseau.troncons[entree.troncon], entree.sens) - 1;
    const ligne = bretelle ? cheminBretelle(ne, ligneVoie(ctx.geo, entree), ligneVoie(ctx.geo, sortie)) : ne.giratoire ? cheminGiratoire(ne, ligneVoie(ctx.geo, entree), ligneVoie(ctx.geo, sortie), entree.voie) : ne.virage ? cheminVirage(ne, iE, ligneVoie(ctx.geo, entree), ligneVoie(ctx.geo, sortie)) : raccordProlonge(ne, iE, iS, ligneVoie(ctx.geo, entree), ligneVoie(ctx.geo, sortie));
    // Le virage du raccord (angle entre l'entrée et la sortie) : tout droit, on ne ralentit pas
    const a = pointA(ligne, 0).dir, b = pointA(ligne, longueur(ligne)).dir;
    const virage = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1])));
    r = { cle, ligne, longueur: longueur(ligne), entree: cleVoie(entree), sortie: cleVoie(sortie), virage: ne.giratoire ? Math.PI : virage, fusion: ne.giratoire && !bretelle ? ligne[6] : null, bretelle,
      longEntree: ne.giratoire && !bretelle ? longueur(ligne.slice(0, 7)) : 0 };
    ctx.raccords.set(cle, r);
  }
  return r;
}

/**
 * Le raccord d'un carrefour. Dans un carrefour protégé, la chaussée se resserre : la voie continue tout droit
 * sur son amorce (jusqu'à la zone des voitures), tourne, puis repart tout droit sur l'amorce de sortie — sans
 * jamais mordre sur les îlots de coin.
 */
function raccordProlonge(n, iE, iS, entree, sortie) {
  const bE = n.branches[iE], bS = n.branches[iS], aE = bE?.amorce ?? 0, aS = bS?.amorce ?? 0;
  if (!(aE > 0.05 || aS > 0.05)) return raccord(entree, sortie);
  // Le long des amorces (elles suivent la rue, qui peut tourner), puis la courbe d'une amorce à l'autre
  const avant = aE > 0.05 ? longerAmorce(bE.amorceAxe, entree[entree.length - 1]) : null;
  const apres = aS > 0.05 ? longerAmorce(bS.amorceAxe, sortie[0]).reverse() : null;
  const milieu = raccord(avant ?? entree, apres ?? sortie);
  return [...(avant ?? []).slice(0, -1), ...milieu, ...(apres ?? []).slice(1)];
}

function compatibles(ctx, a, b, seuil) {
  if (a.entree === b.entree) return true; // une file sur la même voie : elle se suit
  if (a.sortie === b.sortie) return false; // deux files qui fusionnent
  const cle = a.cle < b.cle ? `${a.cle}#${b.cle}` : `${b.cle}#${a.cle}`;
  let c = ctx.conflits.get(cle);
  if (c === undefined) { c = !seGenent(a.ligne, b.ligne, seuil); ctx.conflits.set(cle, c); }
  return c;
}

/** La branche suivante au bout d'une voie (tirée au hasard), ou null : le véhicule sort. */
function choisirSuite(etat, ctx, v, mode) {
  const n = noeudFin(ctx, v), g = ctx.geo.noeuds[n];
  if (g.degre <= 1) return null;
  const options = g.branches.filter(b => !(b.troncon === v.troncon && b.sens === -v.sens));
  if (mode === 'velo') {
    // Un vélo continue sur une file vélo de ce sens (piste à sa droite, ou piste à double sens d'en face)
    const files = options.flatMap(b => filesVelo(ctx.geo, b.troncon, b.sens));
    return files.length ? etat.rng.pick(files) : null;
  }
  if (!options.length) return null;
  const permis = ctx.mouvements[n]?.[cleMouvement(v)];
  if (permis?.length) {
    // Un mouvement permis depuis sa voie ; un bus va sur la voie bus de la sortie s'il y en a une
    const s = deCle(etat.rng.pick(permis)), t = ctx.reseau.troncons[s.troncon];
    return { troncon: s.troncon, sens: s.sens, voie: mode === 'bus' ? voieDe(t, s.sens, 'bus', 0) : voieDe(t, s.sens, mode, s.voie) };
  }
  const b = etat.rng.pick(options), t = ctx.reseau.troncons[b.troncon];
  // Entre deux tronçons qui se suivent : on garde sa voie, sauf là où une voie apparaît (présélection, à gauche :
  // les autres se décalent, et la voie de gauche s'y range une fois sur deux) ou disparaît (insertion : on se rabat)
  const tIn = ctx.reseau.troncons[v.troncon], exIn = extraDe(tIn, v.sens), exOut = extraDe(t, b.sens);
  let k = v.voie;
  if (exOut === 'gauche' && exIn !== 'gauche') k = v.voie === 0 && etat.rng.chance(0.5) ? 0 : v.voie + 1;
  else if (exIn === 'gauche' && exOut !== 'gauche') k = Math.max(0, v.voie - 1);
  return { troncon: b.troncon, sens: b.sens, voie: voieDe(t, b.sens, mode, k) };
}

/** La voie prise sur un tronçon : un bus prend la voie bus (ou la plus à droite) ; une voiture n'y va jamais. */
function voieDe(t, sens, mode, voulue) {
  const vb = voieBus(t, sens);
  if (mode === 'bus') return vb ?? nbVoies(t, sens) - 1;
  const v = Math.min(voulue, nbVoies(t, sens) - 1);
  return vb !== null && v === vb ? v - 1 : v;
}

function placer(etat, ctx, veh, voie) {
  const ligne = ligneVoie(ctx.geo, voie);
  veh.voie = voie; veh.etape = 'voie'; veh.ligne = ligne; veh.L = longueur(ligne);
  veh.suite = choisirSuite(etat, ctx, voie, veh.mode);
  veh.admis = false; veh.demande = null; veh.anneau = null; veh.reprise = 0;
  const n = ctx.geo.noeuds[noeudFin(ctx, voie)];
  if (veh.mode === 'velo' && veh.suite && n.protege) {
    // Carrefour protégé : le vélo fait le tour par l'anneau (coins, traversées), jamais par le milieu
    const i = brancheArrivee(ctx, voie), j = brancheDepart(ctx, n.id, veh.suite);
    // On entre (et l'on sort) par le côté de l'anneau où est sa piste : d'ordinaire à sa droite, mais une piste à
    // double sens peut être de l'autre côté de la chaussée — jamais de traversée de la chaussée hors des traversées
    const lsuite = ligneVoie(ctx.geo, veh.suite), proche = (k, q, defaut) => {
      const a = n.anneau.points[`${k}:g`], b = n.anneau.points[`${k}:d`];
      if (!a || !b) return defaut;
      return Math.hypot(a[0] - q[0], a[1] - q[1]) < Math.hypot(b[0] - q[0], b[1] - q[1]) ? 'g' : 'd';
    };
    const ce = proche(i, ligne[ligne.length - 1], coteEntree(voie.voie)), cs = proche(j, lsuite[0], coteSortie(veh.suite.voie));
    const pe = n.anneau.points[`${i}:${ce}`], ps = n.anneau.points[`${j}:${cs}`];
    // La piste s'arrête au bord de la traversée cyclable de sa branche (sans la traverser pour revenir sur l'anneau) ;
    // en sortant, on reprend la piste au bord de la traversée de la branche de sortie
    const bord = (lg, q, b, signe) => Math.max(0, Math.min(longueur(lg), projeterSurLigne(lg, q).s + signe * (b.Lv / 2 + 0.2)));
    veh.L = Math.max(0.1, bord(ligne, pe, n.branches[i], -1));
    veh.reprise = bord(lsuite, ps, n.branches[j], 1);
    const fin = pointA(ligne, veh.L).p, debut = pointA(lsuite, veh.reprise).p;
    veh.anneau = [{ ligne: [fin, pe], traversee: null, id: `${n.id}|e${i}${ce}` }, ...cheminAnneau(n, i, ce, j, cs), { ligne: [ps, debut], traversee: null, id: `${n.id}|s${j}${cs}` }]
      .filter(seg => longueur(seg.ligne) > 0.05);
    veh.raccord = null;
    return;
  }
  veh.raccord = veh.suite ? raccordDe(ctx, voie, veh.suite) : null; // prévu : il règle la vitesse d'approche
}

// ─── Les sources ───────────────────────────────────────────────────────────
/** Où naissent les véhicules : { cle, noeud, mode, voie, intervalle }. */
export function sources(ctx, T) {
  const out = [];
  for (const [id, n] of Object.entries(ctx.geo.noeuds)) {
    if (n.degre === 1) {
      const b = n.branches[0], t = ctx.reseau.troncons[b.troncon];
      const intervalle = n.bord ? T.intervalleBord : T.intervalleImpasse;
      // Une demande par bout de route, quelle que soit sa largeur : doubler les voies ajoute de la place, pas des voitures
      const vb = voieBus(t, b.sens);
      out.push({ cle: `${id}|auto`, noeud: id, mode: 'voiture', voies: Array.from({ length: nbVoies(t, b.sens) }, (_, k) => ({ troncon: b.troncon, sens: b.sens, voie: k })).filter(v => v.voie !== vb), intervalle });
      // Les bus arrivent par les bouts de la carte
      if (n.bord) out.push({ cle: `${id}|bus`, noeud: id, mode: 'bus', voies: [{ troncon: b.troncon, sens: b.sens, voie: voieDe(t, b.sens, 'bus', 0) }], intervalle: T.intervalleBus });
    }
    // Un bout du réseau cyclable : un seul tronçon à piste touche ce nœud
    const pistes = n.branches.filter(b => aPiste(ctx.reseau.troncons[b.troncon]));
    const files = pistes.length === 1 ? filesVelo(ctx.geo, pistes[0].troncon, pistes[0].sens) : [];
    if (files.length) out.push({ cle: `${id}|velo`, noeud: id, mode: 'velo', voies: files, intervalle: T.intervalleVelo });
  }
  return out;
}

function faireNaitre(etat, ctx, T, V, parCle) {
  if (etat.vehicules.length >= T.maxVehicules) return;
  for (const src of sources(ctx, T)) {
    const prochain = etat.sources[src.cle];
    if (prochain === undefined) { etat.sources[src.cle] = etat.t + etat.rng.range(0, src.intervalle); continue; }
    if (etat.t < prochain) continue;
    const spec = V[src.mode];
    const libres = src.voies.filter(v => { const f = parCle.get(cleVoie(v)); return !f?.length || f[0].s > spec.longueur + spec.ecart + 3; });
    if (!libres.length) continue; // pas de place : on réessaie au pas suivant
    const veh = { raccord: null, id: etat.prochainId++, mode: src.mode, s: 0, v: spec.vitesse * 0.6, ne: true, occupe: null, engage: null, arret: 0 };
    placer(etat, ctx, veh, etat.rng.pick(libres));
    etat.vehicules.push(veh);
    etat.sources[src.cle] = etat.t + src.intervalle * (1 + etat.rng.range(-T.alea, T.alea));
  }
}

// ─── Un pas ────────────────────────────────────────────────────────────────
function indexer(etat) {
  const parCle = new Map();
  const ajouter = (k, veh) => { let l = parCle.get(k); if (!l) parCle.set(k, (l = [])); l.push(veh); };
  for (const veh of etat.vehicules) if (veh.etape !== 'anneau') ajouter(veh.etape === 'voie' ? cleVoie(veh.voie) : veh.raccord.cle, veh);
  for (const l of parCle.values()) l.sort((a, b) => a.s - b.s);
  return parCle;
}

/** Le premier véhicule (le plus en arrière) sur une liste de clés, avec son abscisse. */
function premierSur(parCle, cles) {
  let best = null;
  for (const k of cles) { const l = parCle.get(k); if (l?.length && (!best || l[0].s < best.s)) best = l[0]; }
  return best;
}

/** Distance libre devant un véhicule (m) et vitesse de ce qui le précède. */
function devant(veh, parCle, ctx, V, etat) {
  const l = parCle.get(veh.etape === 'voie' ? cleVoie(veh.voie) : veh.raccord.cle);
  const i = l.indexOf(veh), suivant = l[i + 1];
  // Dans un rond-point, le suivant sur son propre chemin n'est pas forcément le plus proche : on le compare aux autres
  const dansGiratoire = veh.etape === 'raccord' && ctx.geo.noeuds[noeudFin(ctx, veh.voie)].giratoire;
  if (suivant && !dansGiratoire) return { gap: suivant.s - veh.s - V[suivant.mode].longueur, v: suivant.v };
  const reste = veh.L - veh.s;
  if (veh.etape === 'voie') {
    if (!veh.suite) return { gap: Infinity, v: 0 };
    const n = noeudFin(ctx, veh.voie), xa = arret(ctx, veh);
    // Vélo vers l'anneau : il ne cède qu'aux piétons du passage de sa branche ; l'anneau fait le reste
    if (veh.anneau) {
      if (aCeder(etat, ctx, n, brancheArrivee(ctx, veh.voie), veh.ligne, true, 'velo') && veh.s < xa + 0.5) return { gap: xa - veh.s, v: 0 };
      // Les vélos déjà sur ses deux premiers segments d'anneau (la porte, puis le coin où d'autres le rejoignent)
      let gap = Infinity;
      const k0 = cleSeg(veh.anneau[0]), k1 = veh.anneau[1] && cleSeg(veh.anneau[1]), L0 = longueur(veh.anneau[0].ligne);
      for (const o of etat.vehicules) {
        if (o.etape !== 'anneau') continue;
        const k = cleSeg(o.anneau[o.iseg]);
        if (k === k0) gap = Math.min(gap, reste + o.s - V.velo.longueur);
        else if (k === k1) gap = Math.min(gap, reste + L0 + o.s - V.velo.longueur);
      }
      // Un vélo de l'anneau passe à la porte : on attend 1 m avant (il est déjà sur l'anneau, il a la priorité)
      const pe = veh.anneau[0].ligne[veh.anneau[0].ligne.length - 1];
      for (const o of etat.vehicules) {
        if (o.etape !== 'anneau' || cleSeg(o.anneau[o.iseg]) === k0) continue;
        const q = pointA(o.ligne, o.s).p;
        if (Math.hypot(q[0] - pe[0], q[1] - pe[1]) < 2.4) gap = Math.min(gap, reste - 1);
      }
      // Et le vélo qui sort d'une traversée juste devant la porte (il a la priorité : il est déjà sur l'anneau)
      if (reste < 6) {
        const { p, dir } = pointA(veh.ligne, veh.s);
        for (const o of etat.vehicules) {
          if (o.etape !== 'anneau') continue;
          const q = pointA(o.ligne, o.s).p, dx = q[0] - p[0], dy = q[1] - p[1], d = Math.hypot(dx, dy);
          if (d < 3 && dx * dir[0] + dy * dir[1] > 0) gap = Math.min(gap, d - V.velo.longueur);
        }
      }
      return { gap, v: 0 };
    }
    // La ligne d'arrêt : tant qu'on n'est pas admis, ou si quelqu'un traverse devant (avant d'y être engagé)
    const g = ctx.geo.noeuds[n], bA = g.branches[brancheArrivee(ctx, veh.voie)];
    // Où l'on attend les piétons (au rond-point : avant le passage ; on cède ensuite à l'entrée de l'anneau)
    const xp = bA ? veh.L - bA.arretPassage : xa;
    if (veh.s < xp + 0.5 && aCeder(etat, ctx, n, brancheArrivee(ctx, veh.voie), veh.ligne, true, veh.mode)) return { gap: xp - veh.s, v: 0 };
    // Passé la ligne d'arrêt, avant la traversée cyclable de sa branche : un vélo qui s'y est engagé passe d'abord
    if (g.protege && veh.mode !== 'velo' && veh.s >= xp + 0.5 && veh.s < veh.L - bA.Lv - 0.3
      && genants(etat.traverseesVelo.get(`${n}|${brancheArrivee(ctx, veh.voie)}`), pointA(veh.ligne, veh.L - bA.Lv / 2).p, DEMI[veh.mode])) return { gap: veh.L - bA.Lv - 0.6 - veh.s, v: 0 };
    if (!veh.admis) return { gap: xa - veh.s, v: 0 };
    // Engagé : ce qui roule déjà sur les raccords qui partent de sa voie, puis sur sa voie de sortie
    const k = cleVoie(veh.voie) + '>';
    const cles = [...parCle.keys()].filter(c => c.startsWith(k));
    const r = premierSur(parCle, cles);
    if (r) return { gap: reste + r.s - V[r.mode].longueur, v: r.v };
    const o = premierSur(parCle, [cleVoie(veh.suite)]);
    if (o) return { gap: reste + veh.raccord.longueur + o.s - V[o.mode].longueur, v: o.v };
    return { gap: Infinity, v: 0 };
  }
  // Dans le carrefour : on attend au bout du raccord si quelqu'un traverse la branche de sortie
  const n = noeudFin(ctx, veh.voie);
  if (ctx.geo.noeuds[n].giratoire) {
    // Dans l'anneau, des chemins différents se partagent la chaussée. Sur une voie de l'anneau, on suit le plus
    // proche devant soi en angle (sens trigonométrique) ; sur sa courbe d'entrée ou de sortie, qui est devant soi.
    const G = ctx.geo.noeuds[n].giratoire, c = ctx.geo.noeuds[n].p, lv = (G.rayon - G.interieur) / G.voies;
    const { p, dir } = pointA(veh.ligne, veh.s);
    const voieDe_ = q => { const r = Math.hypot(q[0] - c[0], q[1] - c[1]); const k = G.anneaux.findIndex(a => Math.abs(r - a) < lv * 0.55); return k; };
    const kv = veh.raccord.bretelle ? -1 : voieDe_(p), thv = Math.atan2(p[1] - c[1], p[0] - c[0]);
    let gap = suivant ? suivant.s - veh.s - V[suivant.mode].longueur : Infinity, vd = suivant ? suivant.v : 0;
    for (const o of etat.vehicules) {
      if (o === veh || o === suivant || o.etape !== 'raccord' || noeudFin(ctx, o.voie) !== n) continue;
      const q = pointA(o.ligne, o.s).p, d = [q[0] - p[0], q[1] - p[1]], lo = V[o.mode].longueur;
      // Venus de la même voie : même courbe d'entrée, même voie d'anneau — l'ordre est celui du parcours
      if (o.raccord.entree === veh.raccord.entree && o.raccord.bretelle === veh.raccord.bretelle && veh.s < (veh.raccord.longEntree ?? 0) + 4) {
        if (o.s > veh.s && o.s - veh.s < 40 && o.s - veh.s - lo < gap) { gap = o.s - veh.s - lo; vd = o.v; }
        continue;
      }
      if (kv >= 0 && !o.raccord.bretelle && voieDe_(q) === kv) {
        let da = Math.atan2(q[1] - c[1], q[0] - c[0]) - thv;
        da = ((da % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        const le_long = da * G.anneaux[kv];
        if (le_long > 0 && le_long < 40 && le_long - lo < gap) { gap = le_long - lo; vd = o.v; }
        continue;
      }
      const le_long = d[0] * dir[0] + d[1] * dir[1], cote = Math.abs(d[0] * dir[1] - d[1] * dir[0]);
      if (le_long > 0 && cote < 2.2 && le_long - lo < gap) { gap = le_long - lo; vd = o.v; }
      // Sur sa courbe (entrée, sortie depuis une voie intérieure) : on cède à qui roule sur l'anneau tout près
      else if (kv < 0 && !veh.raccord.bretelle && voieDe_(q) >= 0 && Math.hypot(d[0], d[1]) < lo + 2.5 && le_long > -1.5 && cote < 3) { gap = Math.min(gap, Math.max(0, le_long - lo)); vd = 0; }
    }
    if (gap < Infinity) {
      const o = premierSur(parCle, [veh.raccord.sortie]);
      const g2 = o ? reste + o.s - V[o.mode].longueur : Infinity;
      if (aCeder(etat, ctx, n, brancheDepart(ctx, n, veh.suite), ligneVoie(ctx.geo, veh.suite), false, veh.mode)) return { gap: Math.min(gap, reste - 0.3), v: 0 };
      return g2 < gap ? { gap: g2, v: o.v } : { gap, v: vd };
    }
  }
  if (aCeder(etat, ctx, n, brancheDepart(ctx, n, veh.suite), ligneVoie(ctx.geo, veh.suite), false, veh.mode)) return { gap: reste - 0.3, v: 0 };
  const o = premierSur(parCle, [veh.raccord.sortie]);
  if (o) return { gap: reste + o.s - V[o.mode].longueur, v: o.v };
  return { gap: Infinity, v: 0 };
}

function admettre(etat, ctx, T, V, parCle) {
  const candidats = new Map(); // nœud → [véhicule]
  const occupants = new Map();
  for (const veh of etat.vehicules) if (veh.occupe) { if (!occupants.has(veh.occupe)) occupants.set(veh.occupe, []); occupants.get(veh.occupe).push(veh); }
  for (const l of parCle.values()) {
    // Par voie : le premier véhicule non engagé, s'il approche du bout
    for (let i = l.length - 1; i >= 0; i--) {
      const veh = l[i];
      if (veh.etape !== 'voie' || !veh.suite) break;
      if (veh.admis || veh.anneau) continue;
      if (arret(ctx, veh) - veh.s <= Math.max(T.demandeMin, veh.v * T.demande)) {
        if (veh.demande === null) veh.demande = etat.t;
        const n = noeudFin(ctx, veh.voie);
        if (!candidats.has(n)) candidats.set(n, []);
        candidats.get(n).push(veh);
      }
      break;
    }
  }
  for (const [n, liste] of candidats) {
    liste.sort((a, b) => a.demande - b.demande || a.id - b.id);
    const engages = (occupants.get(n) || []).map(o => o.engage);
    const reserves = [];
    const feux = etat.feux[n], g = ctx.geo.noeuds[n];
    for (const veh of liste) {
      // Aux feux : seulement au vert de sa branche ; et jamais vers un passage où quelqu'un traverse
      if (feux && feux.couleurs[brancheArrivee(ctx, veh.voie)] !== 'vert') continue;
      if (aCeder(etat, ctx, n, brancheDepart(ctx, n, veh.suite), ligneVoie(ctx.geo, veh.suite), false, veh.mode) || aCeder(etat, ctx, n, brancheArrivee(ctx, veh.voie), veh.ligne, true, veh.mode)) continue;
      const r = raccordDe(ctx, veh.voie, veh.suite);
      const sortie = premierSur(parCle, [r.sortie]);
      const place = !sortie || sortie.s > V[sortie.mode].longueur + V[veh.mode].ecart + 1;
      if (g.giratoire) {
        // Rond-point : on cède à qui roule déjà dans l'anneau et arrive vers notre point d'entrée
        // Par la bretelle : on ne coupe pas l'anneau ; on cède seulement à qui en sort vers la même voie
        const libre = r.bretelle
          ? !etat.vehicules.some(o => o.etape === 'raccord' && o.raccord?.sortie === r.sortie && !o.raccord.bretelle && o.L - o.s < 14)
          : !anneauCharge(etat, ctx, V, n, r.fusion) && !sortiePar(etat, ctx, n, veh.voie);
        if (place && libre) { veh.admis = true; veh.occupe = n; veh.engage = r; }
        continue;
      }
      const ok = place && engages.every(o => compatibles(ctx, r, o, T.conflit)) && reserves.every(o => compatibles(ctx, r, o, T.conflit));
      if (ok) { veh.admis = true; veh.occupe = n; veh.engage = r; engages.push(r); }
      // Qui attend depuis longtemps se réserve le carrefour ; un vélo, lui, attend un trou (il ne bloque pas les voitures)
      else if (veh.mode !== 'velo' && etat.t - veh.demande > T.attenteMax) reserves.push(r);
    }
  }
}

/** Avance le trafic de dt secondes. */
export function avancer(etat, ctx, T, V, dt, P) {
  etat.t += dt;
  etat.feux = {};
  for (const [n, f] of Object.entries(ctx.feux)) etat.feux[n] = etatFeux(f, ctx.F, etat.t, decalageDe(n));
  if (P) avancerPietons(etat, ctx, P, V, dt, (n, i, moitie) => traverseeMenacee(etat, ctx, V, P, n, i, 'pieton', moitie));
  avancerAnneaux(etat, ctx, V, P, dt);
  let parCle = indexer(etat);
  faireNaitre(etat, ctx, T, V, parCle);
  parCle = indexer(etat);
  admettre(etat, ctx, T, V, parCle);
  // Vitesses (IDM), calculées toutes avant de bouger
  const acc = etat.vehicules.map(veh => {
    if (veh.etape === 'anneau') return null;
    const s = V[veh.mode], d = devant(veh, parCle, ctx, V, etat);
    const vr = veh.raccord && veh.raccord.virage > T.virageDroit ? s.vitesseVirage : s.vitesse;
    let v0 = veh.etape === 'raccord' ? vr : s.vitesse;
    if (veh.etape === 'voie' && veh.suite) v0 = Math.min(v0, Math.sqrt(vr ** 2 + 2 * s.freinage * Math.max(0, veh.L - veh.s)));
    const etoile = s.ecart + Math.max(0, veh.v * s.temps + (veh.v * (veh.v - d.v)) / (2 * Math.sqrt(s.acceleration * s.freinage)));
    const gap = Math.max(0.1, d.gap);
    return { a: s.acceleration * (1 - (veh.v / v0) ** 4 - (etoile / gap) ** 2), gap: d.gap };
  });
  const restants = [];
  etat.vehicules.forEach((veh, i) => {
    if (!acc[i]) { restants.push(veh); return; } // sur l'anneau : avancé par avancerAnneaux
    veh.v = Math.max(0, Math.min(V[veh.mode].vitesse * 1.05, veh.v + acc[i].a * dt));
    veh.s += Math.min(veh.v * dt, Math.max(0, acc[i].gap - 0.2));
    // Soupape d'un bouchon en boucle : un conducteur arrêté trop longtemps renonce (hypothèse de jeu)
    veh.arret = veh.v < 0.1 ? veh.arret + dt : 0;
    if (veh.arret > T.bloqueMax) { veh.sorti = true; etat.abandons++; return; }
    if (veh.occupe && veh.etape === 'voie' && !veh.admis && veh.s >= V[veh.mode].longueur) { veh.occupe = null; veh.engage = null; } // il a quitté le carrefour
    while (veh.s >= veh.L) {
      if (veh.etape === 'voie') {
        if (!veh.suite) { veh.sorti = true; etat.sortis[veh.mode]++; break; }
        if (veh.anneau) { // un vélo entre dans l'anneau du carrefour protégé, s'il y a la place
          const id0 = veh.anneau[0].id, ecart = V.velo.longueur + V.velo.ecart;
          const pris = etat.vehicules.some(o => o !== veh && o.etape === 'anneau' && o.anneau[o.iseg].id === id0 && o.anneau[o.iseg].ligne[0] === veh.anneau[0].ligne[0] && o.s < ecart);
          if (pris) { veh.s = veh.L; veh.v = 0; break; }
          veh.s = 0; veh.etape = 'anneau'; veh.iseg = 0; veh.ligne = veh.anneau[0].ligne; veh.L = longueur(veh.ligne); veh.part = false;
          break;
        }
        veh.s -= veh.L; veh.etape = 'raccord'; veh.ligne = veh.raccord.ligne; veh.L = veh.raccord.longueur;
      } else {
        const s = veh.s - veh.L;
        placer(etat, ctx, veh, veh.suite);
        veh.s = s; veh.ne = false;
      }
    }
    if (!veh.sorti) restants.push(veh);
  });
  etat.vehicules = restants;
}

/** Quelqu'un sort-il du rond-point n par la branche où arrive la voie `voie` (sa courbe de sortie croiserait la nôtre) ? */
function sortiePar(etat, ctx, n, voie) {
  const t = voie.troncon;
  return etat.vehicules.some(o => o.etape === 'raccord' && !o.raccord?.bretelle && noeudFin(ctx, o.voie) === n && o.suite?.troncon === t && o.L - o.s < 22);
}

/** Un véhicule de l'anneau du rond-point n arrive-t-il vers le point d'entrée P (ou y est-il) ? */
function anneauCharge(etat, ctx, V, n, P) {
  const G = ctx.geo.noeuds[n].giratoire, c = ctx.geo.noeuds[n].p, aP = Math.atan2(P[1] - c[1], P[0] - c[0]);
  for (const o of etat.vehicules) {
    if (o.etape !== 'raccord' || noeudFin(ctx, o.voie) !== n) continue;
    const q = pointA(o.ligne, o.s).p, d = Math.hypot(q[0] - P[0], q[1] - P[1]);
    if (d < V[o.mode].longueur + 2.5) return true;
    if (o.raccord.bretelle) continue; // la bretelle ne passe pas par l'anneau
    // Dans l'anneau, ou encore sur sa courbe d'entrée : ce qu'il lui reste à tourner (sens trigonométrique) jusqu'à P
    const r = Math.max(G.interieur, Math.min(G.rayon, Math.hypot(q[0] - c[0], q[1] - c[1])));
    let da = aP - Math.atan2(q[1] - c[1], q[0] - c[0]);
    da = ((da % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    // Seulement s'il passe bien par P (il ne sort pas avant) : sa sortie est plus loin que P sur son chemin
    const restant = o.L - o.s, versP = da * r;
    if (versP < restant && versP < Math.max(12, o.v * 3 + V[o.mode].longueur + 4)) return true;
  }
  return false;
}

/**
 * Peut-on s'engager sur la branche i du nœud n — le passage piéton (type 'pieton') ou la traversée
 * cyclable (type 'velo') ? Non si un véhicule est dessus, arrive trop vite pour s'arrêter, ou est
 * engagé dans le carrefour vers cette branche. Un véhicule arrêté ne gêne pas : il attend qu'on passe.
 * Un vélo qui traverse ne regarde que les voitures et les bus.
 */
export function traverseeMenacee(etat, ctx, V, P, n, i, type = 'pieton', moitie = null) {
  const b = ctx.geo.noeuds[n].branches[i], Lp = ctx.R.largeurTraversee;
  const [a0, a1] = type === 'velo' ? [0, b.Lv] : [b.z0, b.z0 + Lp]; // la bande, en m depuis le recul
  const versBranche = v => v && v.troncon === b.troncon && v.sens === b.sens;
  for (const veh of etat.vehicules) {
    if (veh.etape === 'anneau' || (type === 'velo' && veh.mode === 'velo')) continue;
    // Menace : qui arrive vite, ou qui a déjà passé sa ligne d'arrêt (admis, il va repartir même à l'arrêt)
    const len = V[veh.mode].longueur, proche = d => d >= 0 && ((veh.v > 0.5 && d < Math.max(P.regardMin, veh.v * P.regardVoiture)) || (veh.admis && d < 3));
    // Traversée en deux fois (îlot central) : la moitié 'd' coupe les files qui partent, la moitié 'g' celles qui arrivent
    const partants = moitie !== 'g', arrivants = moitie !== 'd';
    if (veh.etape === 'raccord') { if (partants && noeudFin(ctx, veh.voie) === n && versBranche(veh.suite)) return true; continue; }
    const v = veh.voie;
    if (v.troncon === b.troncon && v.sens === -b.sens && noeudFin(ctx, v) === n) { // il arrive par cette branche
      if (!arrivants) continue;
      const d = veh.L - a1 - veh.s;
      if ((d < 0 && d > -(a1 - a0 + len)) || proche(d)) return true;
    } else if (versBranche(v)) { // il en repart : sur la bande ?
      if (partants && veh.s > a0 && veh.s - len < a1) return true;
    } else if (partants && veh.admis && veh.occupe === n && versBranche(veh.suite) && proche(arret(ctx, veh) - veh.s)) return true;
  }
  return false;
}

/**
 * Les vélos sur l'anneau d'un carrefour protégé : ils suivent leurs segments à vitesse de virage,
 * gardent leurs distances, et ne s'engagent sur une traversée que si elle est libre de voitures
 * (aux feux : quand la branche traversée est au rouge). Met à jour etat.traverseesVelo.
 */
function avancerAnneaux(etat, ctx, V, P, dt) {
  const sur = etat.vehicules.filter(v => v.etape === 'anneau');
  const spec = V.velo, regard = P || { regardMin: 3, regardVoiture: 1.6 }, ecart = spec.longueur + spec.ecart;
  // Qui est où : par segment (identité + sens de parcours), l'abscisse de chacun
  const cle = cleSeg;
  const prets = etat.vehicules.filter(o => o.mode === 'velo' && o.etape === 'voie' && o.anneau && o.v > 0.3 && o.L - o.s < 3);
  const parSeg = new Map();
  for (const v of sur) { const k = cle(v.anneau[v.iseg]); if (!parSeg.has(k)) parSeg.set(k, []); parSeg.get(k).push(v); }
  /** La place libre devant (m) : sur son segment, puis au début du suivant (ou de sa piste de sortie). */
  const placeDevant = veh => {
    let gap = Infinity;
    for (const o of parSeg.get(cle(veh.anneau[veh.iseg])) || []) if (o !== veh && (o.s > veh.s || (o.s === veh.s && o.id < veh.id))) gap = Math.min(gap, o.s - veh.s - spec.longueur);
    // Un vélo qui arrive par une porte et roule déjà dans le passage (pas s'il attend : c'est lui qui cède)
    const { p, dir } = pointA(veh.ligne, veh.s);
    for (const o of prets) {
      const q = pointA(o.ligne, o.s).p, dx = q[0] - p[0], dy = q[1] - p[1], d = Math.hypot(dx, dy);
      if (d < 1.6 && dx * dir[0] + dy * dir[1] > 0) gap = Math.min(gap, d - spec.longueur);
    }
    // Tout vélo de l'anneau juste devant, arrêté ou qui va dans le même sens (celui qui attend de sortir reste à la jonction) ;
    // pas celui qui vient en face sur une traversée à double sens : chacun tient sa droite
    for (const o of sur) {
      if (o === veh) continue;
      const po = pointA(o.ligne, o.s), dx = po.p[0] - p[0], dy = po.p[1] - p[1], d = Math.hypot(dx, dy);
      if (d < 1.6 && dx * dir[0] + dy * dir[1] > 0.3 * d && (o.v < 0.3 || po.dir[0] * dir[0] + po.dir[1] * dir[1] > 0)) gap = Math.min(gap, d - spec.longueur);
    }
    const reste = veh.L - veh.s, suivant = veh.anneau[veh.iseg + 1];
    if (suivant) {
      for (const o of parSeg.get(cle(suivant)) || []) gap = Math.min(gap, reste + o.s - spec.longueur);
      // Deux vélos qui vont rejoindre le même segment : le plus près du point de jonction passe d'abord
      const ks = cle(suivant);
      for (const o of sur) {
        if (o === veh || o.etape !== 'anneau' || o.iseg + 1 >= o.anneau.length || cle(o.anneau[o.iseg + 1]) !== ks || cle(o.anneau[o.iseg]) === cle(veh.anneau[veh.iseg])) continue;
        const r2 = o.L - o.s;
        if (r2 < reste || (r2 === reste && o.id < veh.id)) gap = Math.min(gap, reste - r2 - spec.longueur);
      }
    } else for (const o of etat.vehicules) if (o.etape === 'voie' && o.voie.troncon === veh.suite.troncon && o.voie.sens === veh.suite.sens && o.voie.voie === veh.suite.voie) gap = Math.min(gap, reste + o.s - (veh.reprise ?? 0) - spec.longueur); // on reprend la piste au bord de la traversée
    return gap;
  };
  for (const veh of sur) {
    if (veh.etape !== 'anneau') continue;
    let limite = placeDevant(veh) - spec.ecart;
    // Avant une traversée : on attend 1,5 m avant, tant qu'elle n'est pas libre (aux feux : branche traversée au rouge)
    const suivant = veh.anneau[veh.iseg + 1];
    // Revue à chaque pas jusqu'à l'engagement : une voiture a pu arriver depuis
    if (suivant?.traversee && veh.L - veh.s < 4) {
      const [n, i] = suivant.traversee.split('|'), feux = etat.feux[n];
      veh.permis = (!feux || feux.couleurs[+i] === 'rouge') && !traverseeMenacee(etat, ctx, V, regard, n, +i, 'velo');
    }
    if (suivant?.traversee && !veh.permis) limite = Math.min(limite, veh.L - 1.5 - veh.s);
    const avance = Math.max(0, Math.min(spec.vitesseVirage * dt, limite));
    veh.v = avance / dt; veh.arret = avance > 0 ? 0 : veh.arret + dt;
    veh.s += avance;
    while (veh.s >= veh.L) {
      const reste = veh.s - veh.L, k0 = cle(veh.anneau[veh.iseg]);
      parSeg.set(k0, (parSeg.get(k0) || []).filter(o => o !== veh));
      if (veh.iseg + 1 < veh.anneau.length) {
        veh.iseg++; veh.ligne = veh.anneau[veh.iseg].ligne; veh.L = longueur(veh.ligne); veh.s = reste;
        veh.part = !!veh.anneau[veh.iseg].traversee; veh.permis = false;
        const k1 = cle(veh.anneau[veh.iseg]);
        if (!parSeg.has(k1)) parSeg.set(k1, []);
        parSeg.get(k1).push(veh);
      } else { // sorti de l'anneau : sur sa piste de sortie, au bord de la traversée
        const reprise = veh.reprise ?? 0;
        placer(etat, ctx, veh, veh.suite);
        veh.s = reprise + reste; veh.ne = false;
        break;
      }
    }
  }
  const occ = new Map();
  for (const veh of sur) {
    if (veh.etape !== 'anneau') continue;
    const seg = veh.anneau[veh.iseg];
    if (seg.traversee && veh.part) {
      const { p, dir } = pointA(veh.ligne, veh.s);
      if (!occ.has(seg.traversee)) occ.set(seg.traversee, []);
      occ.get(seg.traversee).push({ p, dir });
    }
  }
  etat.traverseesVelo = occ;
}

// ─── Lecture ───────────────────────────────────────────────────────────────
/** Position, cap (rad, depuis l'est) et taille apparente (0 à 1 : fondu aux bouts) d'un véhicule. */
export function poseVehicule(veh, T) {
  const { p, dir } = pointA(veh.ligne, veh.s);
  let echelle = 1;
  if (veh.etape === 'voie' && veh.ne) echelle = Math.min(echelle, veh.s / T.fondu);
  if (veh.etape === 'voie' && !veh.suite) echelle = Math.min(echelle, (veh.L - veh.s) / T.fondu);
  return { x: p[0], y: p[1], cap: Math.atan2(dir[1], dir[0]), echelle: Math.max(0, Math.min(1, echelle)) };
}

/**
 * Après une modification du réseau : chaque véhicule est reposé sur la voie la plus proche
 * de même mode et de même direction ; celui qui n'en trouve pas (il était au milieu d'un
 * carrefour redessiné) disparaît. Les engagements repartent de zéro.
 */
export function reconcilier(etat, ctx) {
  const lignes = [];
  for (const [id, g] of Object.entries(ctx.geo.troncons)) for (const sens of [1, -1]) {
    g.voies[sens].forEach((ligne, k) => lignes.push({ mode: 'voiture', voie: { troncon: id, sens, voie: k }, ligne }));
    if (g.pistes) for (const f of filesVelo(ctx.geo, id, sens)) lignes.push({ mode: 'velo', voie: f, ligne: ligneVoie(ctx.geo, f) });
  }
  const restants = [];
  for (const veh of etat.vehicules) {
    const { p, dir } = pointA(veh.ligne, veh.s);
    let best = null;
    for (const c of lignes) {
      if (c.mode !== famille(veh.mode)) continue;
      const pr = projeterSurLigne(c.ligne, p);
      if (pr.d < 2.5 && pr.dir[0] * dir[0] + pr.dir[1] * dir[1] > 0.7 && (!best || pr.d < best.d)) best = { ...pr, c };
    }
    if (!best) continue;
    const ne = veh.ne && veh.etape === 'voie';
    placer(etat, ctx, veh, best.c.voie);
    veh.s = best.s; veh.ne = ne; veh.arret = 0; veh.occupe = null; veh.engage = null;
    restants.push(veh);
  }
  etat.vehicules = restants;
  reconcilierPietons(etat, ctx);
}

export const compter = etat => {
  const n = { voiture: 0, velo: 0, bus: 0 };
  for (const v of etat.vehicules) n[v.mode]++;
  return n;
};
