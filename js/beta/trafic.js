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
import { createRng } from '../lib/rng.js?v=0.9.0';
import { longueur, pointA, projeterSurLigne } from './reseau.js?v=0.9.0';
import { geometrieReseau, ligneVoie, raccord, seGenent } from './geometrie.js?v=0.9.0';

const cleVoie = v => `${v.troncon}|${v.sens}|${v.voie}`;

/** Le contexte de simulation d'un réseau : sa géométrie, et le cache des raccords. */
export function preparerTrafic(reseau, R) {
  return { reseau, R, geo: geometrieReseau(reseau, R), raccords: new Map(), conflits: new Map() };
}

export function creerTrafic(T, graine = T.graine) {
  return { t: 0, vehicules: [], prochainId: 1, sources: {}, rng: createRng(graine), sortis: { voiture: 0, velo: 0 }, abandons: 0 };
}

/** Le nœud au bout d'une voie. */
const noeudFin = (ctx, v) => { const t = ctx.reseau.troncons[v.troncon]; return v.sens === 1 ? t.b : t.a; };

function raccordDe(ctx, entree, sortie) {
  const cle = `${cleVoie(entree)}>${cleVoie(sortie)}`;
  let r = ctx.raccords.get(cle);
  if (!r) {
    const ligne = raccord(ligneVoie(ctx.geo, entree), ligneVoie(ctx.geo, sortie));
    // Le virage du raccord (angle entre l'entrée et la sortie) : tout droit, on ne ralentit pas
    const a = pointA(ligne, 0).dir, b = pointA(ligne, longueur(ligne)).dir;
    const virage = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1])));
    r = { cle, ligne, longueur: longueur(ligne), entree: cleVoie(entree), sortie: cleVoie(sortie), virage };
    ctx.raccords.set(cle, r);
  }
  return r;
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
  const options = g.branches.filter(b => !(b.troncon === v.troncon && b.sens === -v.sens)).filter(b => mode !== 'velo' || ctx.reseau.troncons[b.troncon].velo);
  if (!options.length) return null;
  const b = etat.rng.pick(options);
  const voies = ctx.reseau.troncons[b.troncon].voies;
  return { troncon: b.troncon, sens: b.sens, voie: mode === 'velo' ? 'velo' : Math.min(v.voie, voies - 1) };
}

function placer(etat, ctx, veh, voie) {
  const ligne = ligneVoie(ctx.geo, voie);
  veh.voie = voie; veh.etape = 'voie'; veh.ligne = ligne; veh.L = longueur(ligne);
  veh.suite = choisirSuite(etat, ctx, voie, veh.mode);
  veh.admis = false; veh.demande = null;
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
      out.push({ cle: `${id}|auto`, noeud: id, mode: 'voiture', voies: Array.from({ length: t.voies }, (_, k) => ({ troncon: b.troncon, sens: b.sens, voie: k })), intervalle });
    }
    const pistes = n.branches.filter(b => ctx.reseau.troncons[b.troncon].velo);
    if (pistes.length === 1) out.push({ cle: `${id}|velo`, noeud: id, mode: 'velo', voies: [{ troncon: pistes[0].troncon, sens: pistes[0].sens, voie: 'velo' }], intervalle: T.intervalleVelo });
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
  for (const veh of etat.vehicules) ajouter(veh.etape === 'voie' ? cleVoie(veh.voie) : veh.raccord.cle, veh);
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
function devant(veh, parCle, ctx, V) {
  const l = parCle.get(veh.etape === 'voie' ? cleVoie(veh.voie) : veh.raccord.cle);
  const i = l.indexOf(veh), suivant = l[i + 1];
  if (suivant) return { gap: suivant.s - veh.s - V[suivant.mode].longueur, v: suivant.v };
  const reste = veh.L - veh.s;
  if (veh.etape === 'voie') {
    if (!veh.suite) return { gap: Infinity, v: 0 };
    if (!veh.admis) return { gap: reste - 0.5, v: 0 }; // la ligne d'arrêt
    // Engagé : ce qui roule déjà sur les raccords qui partent de sa voie, puis sur sa voie de sortie
    const k = cleVoie(veh.voie) + '>';
    const cles = [...parCle.keys()].filter(c => c.startsWith(k));
    const r = premierSur(parCle, cles);
    if (r) return { gap: reste + r.s - V[r.mode].longueur, v: r.v };
    const o = premierSur(parCle, [cleVoie(veh.suite)]);
    if (o) return { gap: reste + veh.raccord.longueur + o.s - V[o.mode].longueur, v: o.v };
    return { gap: Infinity, v: 0 };
  }
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
      if (veh.admis) continue;
      if (veh.L - veh.s <= Math.max(T.demandeMin, veh.v * T.demande)) {
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
    for (const veh of liste) {
      const r = raccordDe(ctx, veh.voie, veh.suite);
      const sortie = premierSur(parCle, [r.sortie]);
      const place = !sortie || sortie.s > V[sortie.mode].longueur + V[veh.mode].ecart + 1;
      const ok = place && engages.every(o => compatibles(ctx, r, o, T.conflit)) && reserves.every(o => compatibles(ctx, r, o, T.conflit));
      if (ok) { veh.admis = true; veh.occupe = n; veh.engage = r; engages.push(r); }
      // Qui attend depuis longtemps se réserve le carrefour ; un vélo, lui, attend un trou (il ne bloque pas les voitures)
      else if (veh.mode !== 'velo' && etat.t - veh.demande > T.attenteMax) reserves.push(r);
    }
  }
}

/** Avance le trafic de dt secondes. */
export function avancer(etat, ctx, T, V, dt) {
  etat.t += dt;
  let parCle = indexer(etat);
  faireNaitre(etat, ctx, T, V, parCle);
  parCle = indexer(etat);
  admettre(etat, ctx, T, V, parCle);
  // Vitesses (IDM), calculées toutes avant de bouger
  const acc = etat.vehicules.map(veh => {
    const s = V[veh.mode], d = devant(veh, parCle, ctx, V);
    const vr = veh.raccord && veh.raccord.virage > T.virageDroit ? s.vitesseVirage : s.vitesse;
    let v0 = veh.etape === 'raccord' ? vr : s.vitesse;
    if (veh.etape === 'voie' && veh.suite) v0 = Math.min(v0, Math.sqrt(vr ** 2 + 2 * s.freinage * Math.max(0, veh.L - veh.s)));
    const etoile = s.ecart + Math.max(0, veh.v * s.temps + (veh.v * (veh.v - d.v)) / (2 * Math.sqrt(s.acceleration * s.freinage)));
    const gap = Math.max(0.1, d.gap);
    return { a: s.acceleration * (1 - (veh.v / v0) ** 4 - (etoile / gap) ** 2), gap: d.gap };
  });
  const restants = [];
  etat.vehicules.forEach((veh, i) => {
    veh.v = Math.max(0, Math.min(V[veh.mode].vitesse * 1.05, veh.v + acc[i].a * dt));
    veh.s += Math.min(veh.v * dt, Math.max(0, acc[i].gap - 0.2));
    // Soupape d'un bouchon en boucle : un conducteur arrêté trop longtemps renonce (hypothèse de jeu)
    veh.arret = veh.v < 0.1 ? veh.arret + dt : 0;
    if (veh.arret > T.bloqueMax) { veh.sorti = true; etat.abandons++; return; }
    if (veh.occupe && veh.etape === 'voie' && !veh.admis && veh.s >= V[veh.mode].longueur) { veh.occupe = null; veh.engage = null; } // il a quitté le carrefour
    while (veh.s >= veh.L) {
      if (veh.etape === 'voie') {
        if (!veh.suite) { veh.sorti = true; etat.sortis[veh.mode]++; break; }
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
    if (g.pistes) lignes.push({ mode: 'velo', voie: { troncon: id, sens, voie: 'velo' }, ligne: g.pistes[sens] });
  }
  const restants = [];
  for (const veh of etat.vehicules) {
    const { p, dir } = pointA(veh.ligne, veh.s);
    let best = null;
    for (const c of lignes) {
      if (c.mode !== veh.mode) continue;
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
}

export const compter = etat => {
  const n = { voiture: 0, velo: 0 };
  for (const v of etat.vehicules) n[v.mode]++;
  return n;
};
