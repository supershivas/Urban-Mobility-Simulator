// Les piétons du jeu beta (Jérôme, v0.9.2 : « piétons partout »). Pur, à graine, testé.
// Ils sortent des bâtiments (un point au hasard d'un trottoir), marchent, tournent au
// hasard aux coins, traversent aux passages, puis entrent quelque part (ils disparaissent)
// après un parcours tiré au hasard. Aux bouts de carte, ils sortent du jeu.
// Traverser : aux feux, seulement pendant la phase piétonne ; sans feux, le piéton a la
// priorité, mais il ne s'engage pas devant un véhicule qui ne pourrait plus s'arrêter
// (roulage.js lui dit si le passage est menacé). Une fois engagé, les véhicules l'attendent.
import { longueur, pointA, projeterSurLigne } from './reseau.js?v=0.9.5';

export const creerPietons = rng => ({ pietons: [], prochainPieton: 1, rngPietons: rng });

/** Les trottoirs du réseau piéton (un seul sens par trottoir), avec leurs longueurs cumulées. */
function trottoirs(ctx) {
  if (ctx.trottoirs) return ctx.trottoirs;
  const liste = [];
  let total = 0;
  for (const [id, pt] of Object.entries(ctx.geo.pietons.points)) for (const l of pt.liens) {
    if (!l.trottoir || id > l.vers) continue; // chaque trottoir une fois
    const L = longueur(l.ligne);
    if (L < 1) continue;
    total += L;
    liste.push({ de: id, lien: l, L, cumul: total });
  }
  return (ctx.trottoirs = { liste, total });
}

function engager(p, de, lien) {
  p.de = de; p.lien = lien; p.L = longueur(lien.ligne); p.s = 0; p.attend = !!lien.traversee;
}

/** Le lien suivant depuis un point (pas de demi-tour, sauf s'il n'y a que lui). */
function suivant(etat, ctx, idPoint, venu) {
  const pt = ctx.geo.pietons.points[idPoint];
  if (!pt || pt.bord) return null;
  const options = pt.liens.filter(l => l.vers !== venu);
  return etat.rngPietons.pick(options.length ? options : pt.liens);
}

function naitre(etat, ctx, P) {
  const { liste, total } = trottoirs(ctx);
  if (!liste.length) return;
  const rng = etat.rngPietons, cible = Math.min(P.max, total * P.densite);
  for (let k = 0; k < 3 && etat.pietons.length < cible; k++) {
    const x = rng() * total;
    let lo = 0, hi = liste.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (liste[m].cumul < x) lo = m + 1; else hi = m; }
    const t = liste[lo];
    const p = { id: etat.prochainPieton++, lat: rng.range(-P.ecartLateral, P.ecartLateral), reste: rng.range(...P.parcours), ne: P.fondu, part: null };
    // Dans un sens ou dans l'autre du trottoir, à un point au hasard
    if (rng.chance(0.5)) engager(p, t.de, t.lien);
    else engager(p, t.lien.vers, ctx.geo.pietons.points[t.lien.vers].liens.find(l => l.vers === t.de && l.trottoir === t.lien.trottoir));
    p.s = rng() * p.L;
    p.ne = P.fondu; p.apparu = 0;
    etat.pietons.push(p);
  }
}

/**
 * Avance les piétons de dt secondes. `menacee(n, i)` : un véhicule empêche-t-il de
 * s'engager sur le passage i du nœud n ? Met à jour etat.traversees (occupation des passages).
 */
export function avancerPietons(etat, ctx, P, V, dt, menacee) {
  naitre(etat, ctx, P);
  const vitesse = V.pieton.vitesse, restants = [];
  for (const p of etat.pietons) {
    p.apparu = (p.apparu || 0) + vitesse * dt;
    if (p.attend) {
      const [n, i] = p.lien.traversee.split('|'), feux = etat.feux[n];
      const temps = p.L / vitesse;
      const permis = feux ? feux.pietons && feux.resteVert > temps * 0.5 : true;
      if (!permis || menacee(n, +i, p.lien.moitie)) { restants.push(p); continue; }
      p.attend = false;
    }
    let pas = vitesse * dt;
    if (p.part !== null) { p.part -= pas; if (p.part > 0) { p.s = Math.min(p.L, p.s + pas); restants.push(p); } continue; }
    while (pas > 0) {
      const avance = Math.min(pas, p.L - p.s);
      p.s += avance; pas -= avance;
      if (p.lien.trottoir) p.reste -= avance;
      if (p.reste <= 0 && p.lien.trottoir) { p.part = P.fondu; break; } // il entre dans un bâtiment
      if (p.s < p.L) break;
      const prochain = suivant(etat, ctx, p.lien.vers, p.de);
      if (!prochain) { p.sorti = true; break; } // bout de carte
      engager(p, p.lien.vers, prochain);
      if (p.attend) break;
    }
    if (!p.sorti) restants.push(p);
  }
  etat.pietons = restants;
  const occ = new Map();
  // Qui est engagé sur chaque passage, où, et dans quel sens (une voiture ne cède qu'à qui est sur sa voie ou va y entrer)
  for (const p of etat.pietons) if (p.lien.traversee && !p.attend) {
    const { p: q, dir } = pointA(p.lien.ligne, p.s);
    if (!occ.has(p.lien.traversee)) occ.set(p.lien.traversee, []);
    occ.get(p.lien.traversee).push({ p: q, dir });
  }
  etat.traversees = occ;
}

/** Position et taille apparente (fondu en sortant d'un bâtiment ou en y entrant) d'un piéton. */
export function posePieton(p, P) {
  const { p: q, dir } = pointA(p.lien.ligne, p.s);
  let e = Math.min(1, p.apparu / P.fondu);
  if (p.part !== null) e = Math.min(e, Math.max(0, p.part / P.fondu));
  return { x: q[0] - dir[1] * p.lat, y: q[1] + dir[0] * p.lat, cap: Math.atan2(dir[1], dir[0]), echelle: e };
}

/**
 * Après une modification du réseau : chacun est reposé sur le trottoir le plus proche, dans
 * le même sens de marche ; qui n'en trouve pas à moins de 3 m (son trottoir a été démoli) disparaît.
 */
export function reconcilierPietons(etat, ctx) {
  const liens = [];
  for (const [id, pt] of Object.entries(ctx.geo.pietons.points)) for (const l of pt.liens) if (l.trottoir) liens.push({ de: id, l });
  const restants = [];
  for (const p of etat.pietons) {
    const { p: q, dir } = pointA(p.lien.ligne, p.s);
    let best = null;
    for (const c of liens) {
      const pr = projeterSurLigne(c.l.ligne, q);
      if (pr.d < 3 && pr.dir[0] * dir[0] + pr.dir[1] * dir[1] > 0.5 && (!best || pr.d < best.d)) best = { ...pr, c };
    }
    if (!best) continue;
    engager(p, best.c.de, best.c.l);
    p.s = best.s;
    restants.push(p);
  }
  etat.pietons = restants;
  etat.traversees = new Map();
}
