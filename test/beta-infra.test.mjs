// Le banc d'essai des infrastructures du jeu beta : des réseaux tirés au hasard (à graine), construits avec
// tous les outils, puis vérifiés comme le ferait un urbaniste. Chaque contrôle dit ce qui cloche et où.
//   - les voitures restent sur la chaussée (raccords, ronds-points, bretelles), jamais sur un îlot ou un trottoir ;
//   - les pistes ne traversent la chaussée qu'aux traversées cyclables ;
//   - les trottoirs ne passent pas sur la chaussée, et forment un réseau d'un seul tenant ;
//   - deux passages ne se chevauchent pas ;
//   - chaque voie qui arrive à un carrefour mène quelque part ;
//   - le trafic roule sans chevauchement.
import { reseauDepart, viser, accroche, projetRoute, construireRoute, basculerVoies, basculerVelo, basculerPisteDouble, basculerIlot,
  basculerBus, basculerFeux, basculerGiratoire, basculerBretelle, basculerInsertion, demolir, branches, longueur, pointA, nbVoies } from '../js/beta/reseau.js';
import { geometrieReseau, ligneVoie, decalageVariable, boutImpasse, cheminBretelle } from '../js/beta/geometrie.js';
import { preparerTrafic, creerTrafic, avancer, cheminRaccord } from '../js/beta/roulage.js';
import { decalerLigne } from '../js/geo/decalage.js';
import { createRng } from '../js/lib/rng.js';
import { ROUTE, TRACE, TRAFIC, VEHICULES, FEUX, PIETONS } from '../js/beta/donnees.js';

// ─── Un réseau au hasard ─────────────────────────────────────────────────────
export function reseauAuHasard(graine, etapes = 22) {
  const rng = createRng(graine);
  let r = reseauDepart({ longueur: 1100 });
  const journal = [];
  const tronconAuHasard = () => rng.pick(Object.keys(r.troncons));
  const pointSur = id => { const t = r.troncons[id], L = longueur(t.points); return pointA(t.points, rng.range(0.15, 0.85) * L); };
  const carrefours = () => Object.keys(r.noeuds).filter(n => branches(r, n).length >= 3);
  for (let k = 0; k < etapes; k++) {
    const op = rng.weighted([{ v: 'route', w: 6 }, { v: 'voies', w: 2 }, { v: 'velo', w: 2 }, { v: 'double', w: 1 }, { v: 'ilot', w: 1 }, { v: 'bus', w: 1 },
      { v: 'feux', w: 1 }, { v: 'giratoire', w: 1 }, { v: 'bretelle', w: 1 }, { v: 'insertion', w: 1 }, { v: 'demolir', w: 1 }]);
    let res = null;
    if (op === 'route') {
      const id = tronconAuHasard(), q = pointSur(id).p, v = viser(r, q, 1);
      if (!v) continue;
      const a = accroche(r, v, TRACE), ang = rng.range(0, 2 * Math.PI), d = rng.range(50, 220);
      const p = projetRoute(r, a, [q[0] + Math.cos(ang) * d, q[1] + Math.sin(ang) * d], ROUTE, TRACE);
      if (!p.refus) res = construireRoute(r, p, TRACE);
    } else if (op === 'voies') res = basculerVoies(r, tronconAuHasard(), ROUTE, TRACE, rng.chance(0.8) ? 1 : -1);
    else if (op === 'velo') res = basculerVelo(r, tronconAuHasard(), ROUTE, TRACE);
    else if (op === 'double') res = basculerPisteDouble(r, tronconAuHasard(), rng.pick(['gauche', 'droite']), ROUTE, TRACE);
    else if (op === 'ilot') res = basculerIlot(r, tronconAuHasard(), ROUTE, TRACE);
    else if (op === 'bus') res = basculerBus(r, tronconAuHasard(), rng.pick(['gauche', 'droite']));
    else if (op === 'demolir') res = demolir(r, tronconAuHasard());
    else if (op === 'insertion') {
      const c = carrefours(); if (!c.length) continue;
      const n = rng.pick(c), b = rng.pick(branches(r, n)), t = r.troncons[b.troncon];
      const pt = pointA(b.sens === 1 ? t.points : t.points.slice().reverse(), 12), nrm = [-pt.dir[1], pt.dir[0]], o = rng.pick([3, -3]);
      res = basculerInsertion(r, b.troncon, [pt.p[0] + nrm[0] * o, pt.p[1] + nrm[1] * o], ROUTE, TRACE);
    } else {
      const c = carrefours(); if (!c.length) continue;
      const n = rng.pick(c);
      if (op === 'feux') res = basculerFeux(r, n, FEUX);
      else if (op === 'giratoire') res = basculerGiratoire(r, n);
      else if (op === 'bretelle') res = basculerBretelle(r, n, rng.pick(branches(r, n)).troncon);
    }
    if (res?.reseau) { r = res.reseau; journal.push(op); }
  }
  return { reseau: r, journal };
}

// ─── La géométrie de contrôle ───────────────────────────────────────────────
export const dedans = (p, poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const bande = (ligne, g, d) => { const A = decalerLigne(ligne, g), B = decalerLigne(ligne, d); return [...A, ...B.reverse()]; };
// Un ruban découpé en quadrilatères (un polygone par segment) : pas de polygone qui se recoupe
const quads = (ligne, g, d) => { const A = decalerLigne(ligne, g), B = decalerLigne(ligne, d), out = []; for (let i = 1; i < ligne.length; i++) out.push([A[i - 1], A[i], B[i], B[i - 1]]); return out; };
const disque = (c, r) => Array.from({ length: 48 }, (_, i) => [c[0] + r * Math.cos((i / 48) * 2 * Math.PI), c[1] + r * Math.sin((i / 48) * 2 * Math.PI)]);

/** La chaussée telle qu'elle est dessinée (scene.js) : rubans des tronçons, zones et amorces, virages, impasses, anneaux, bretelles. */
export function chaussee(reseau, geo) {
  const polys = [];
  for (const [id, g] of Object.entries(geo.troncons)) polys.push(...quads(g.axe, g.g, -g.d));
  for (const n of Object.values(geo.noeuds)) {
    if (n.zone) polys.push(n.zone); // une étoile ordonnée autour du nœud : un polygone simple
    for (const a of n.amorces ?? []) polys.push(a);
    if (n.virage) {
      // Les bords passent d'une largeur à l'autre (biseau)
      const v = n.virage, A = decalageVariable(v.axe, v.g0, v.g1), B = decalageVariable(v.axe, -v.d0, -v.d1);
      for (let i = 1; i < v.axe.length; i++) polys.push([A[i - 1], A[i], B[i], B[i - 1]]);
    }
    if (n.degre === 1 && !n.bord) polys.push(boutImpasse(n, 0));
    // Les bretelles d'un rond-point : un ruban de 3,8 m (comme scene.js)
    for (const id of n.giratoire?.bretelles ?? []) {
      const i = n.branches.findIndex(b => b.troncon === id), b = n.branches[i], c = n.branches[(i + 1) % n.degre];
      const le = ligneVoie(geo, { troncon: b.troncon, sens: -b.sens, voie: nbVoies(reseau.troncons[b.troncon], -b.sens) - 1 });
      const ls = ligneVoie(geo, { troncon: c.troncon, sens: c.sens, voie: nbVoies(reseau.troncons[c.troncon], c.sens) - 1 });
      polys.push(...quads(cheminBretelle(n, le, ls), 1.9, -1.9));
    }
  }
  return polys;
}
/** La chaussée réservée aux voitures dans un carrefour (zone, amorces) : là où une piste ou un trottoir ne passe pas. */
const zonesVoitures = geo => Object.values(geo.noeuds).flatMap(n => (n.zone && (n.protege || n.giratoire) ? [n.zone, ...(n.amorces ?? [])] : []));

/** Les contrôles d'un réseau : une liste de défauts { quoi, ou }. */
export function controler(reseau) {
  const defauts = [], ajouter = (quoi, ou) => defauts.push({ quoi, ou });
  const geo = geometrieReseau(reseau, ROUTE), ctx = preparerTrafic(reseau, ROUTE, FEUX);
  const route = chaussee(reseau, geo), surRoute = p => route.some(poly => dedans(p, poly));

  // 1. Les voitures restent sur la chaussée : chaque mouvement de chaque carrefour, échantillonné, caisse comprise
  for (const [id, n] of Object.entries(geo.noeuds)) {
    if (n.degre < 2) continue;
    const paires = [];
    for (const e of n.branches) for (const s of n.branches) {
      if (e === s) continue;
      const te = reseau.troncons[e.troncon], ts = reseau.troncons[s.troncon];
      for (let k = 0; k < nbVoies(te, -e.sens); k++) for (let m = 0; m < nbVoies(ts, s.sens); m++) {
        const entree = { troncon: e.troncon, sens: -e.sens, voie: k }, sortie = { troncon: s.troncon, sens: s.sens, voie: m };
        const permis = ctx.mouvements[id]?.[`${entree.troncon}|${entree.sens}|${entree.voie}`];
        if (permis && !permis.includes(`${sortie.troncon}|${sortie.sens}|${sortie.voie}`)) continue;
        if (!permis && n.degre >= 3 && m !== Math.min(k, nbVoies(ts, s.sens) - 1) && !n.giratoire) continue;
        paires.push([entree, sortie]);
      }
    }
    for (const [entree, sortie] of paires) {
      const ligne = cheminRaccord(ctx, entree, sortie).ligne, L = longueur(ligne);
      for (let s = 0.5; s < L - 0.5; s += 1) {
        const { p, dir } = pointA(ligne, s), nrm = [-dir[1], dir[0]];
        for (const o of [0, 0.7, -0.7]) {
          const q = [p[0] + nrm[0] * o, p[1] + nrm[1] * o];
          if (!surRoute(q)) { ajouter('voiture hors chaussée', `${id} ${entree.troncon}→${sortie.troncon} à ${s.toFixed(0)} m (${q.map(x => x.toFixed(1))})`); s = L; break; }
        }
      }
    }
  }
  // 2. Les pistes ne passent pas dans la chaussée des voitures d'un carrefour (sauf aux traversées)
  const voitures = zonesVoitures(geo);
  for (const [id, n] of Object.entries(geo.noeuds)) for (const c of n.anneau?.coins ?? []) {
    const L = longueur(c.ligne);
    for (let s = 1; s < L - 1; s += 1) { const p = pointA(c.ligne, s).p; if (voitures.some(z => dedans(p, z))) { ajouter('piste dans la chaussée', `${id} coin ${c.i} à ${s} m`); break; } }
  }
  // 3. Les trottoirs ne passent pas sur la chaussée (hors traversées) ; le réseau piéton est d'un seul tenant
  const pts = geo.pietons.points;
  for (const [id, pt] of Object.entries(pts)) for (const l of pt.liens) {
    if (l.traversee || id > l.vers) continue;
    const L = longueur(l.ligne);
    for (let s = 0.6; s < L - 0.6; s += 1) { const p = pointA(l.ligne, s).p; if (surRoute(p)) { ajouter('trottoir sur la chaussée', `${id} → ${l.vers} (${l.coin ? 'coin' : 'trottoir'}) à ${s.toFixed(0)} m`); break; } }
  }
  // Chaque morceau du réseau routier (une démolition peut le couper) a un réseau piéton d'un seul tenant ;
  // deux s'il n'a aucun passage (une rue d'un bord de carte à l'autre, ou à une impasse) : ses deux trottoirs
  const morceaux = (ids, voisins) => { const comp = {}; let c = 0;
    for (const i of ids) { if (comp[i] !== undefined) continue; const f = [i]; comp[i] = c; while (f.length) for (const v of voisins(f.pop())) if (comp[v] === undefined) { comp[v] = c; f.push(v); } c++; }
    return comp; };
  const routes = morceaux(Object.keys(reseau.noeuds), n => Object.values(reseau.troncons).filter(t => t.a === n || t.b === n).map(t => (t.a === n ? t.b : t.a)));
  const pietons = morceaux(Object.keys(pts), id => pts[id].liens.map(l => l.vers));
  const parRoute = {};
  for (const [id, c] of Object.entries(pietons)) (parRoute[routes[id.split(':')[0]]] ??= { comps: new Set(), passage: false }).comps.add(c);
  for (const [id, pt] of Object.entries(pts)) if (pt.liens.some(l => l.traversee)) parRoute[routes[id.split(':')[0]]].passage = true;
  for (const [r, { comps, passage }] of Object.entries(parRoute)) if (comps.size > (passage ? 1 : 2)) ajouter('trottoirs en morceaux', `réseau ${r} : ${comps.size} morceaux de trottoir`);
  // 4. Deux passages piétons ne se chevauchent pas
  for (const [id, n] of Object.entries(geo.noeuds)) {
    if (!n.traversees) continue;
    const bandes = n.branches.filter(b => b.passage).map(b => {
      const ligne = sousAxe(b.ext, b.z0, b.z0 + ROUTE.largeurTraversee);
      return bande(ligne, b.gauche, -b.droite);
    });
    for (let i = 0; i < bandes.length; i++) for (let j = i + 1; j < bandes.length; j++) if (bandes[i].some(p => dedans(p, bandes[j]))) ajouter('passages qui se chevauchent', `${id} branches ${i} et ${j}`);
  }
  // 5. Chaque voie qui arrive à un carrefour mène quelque part
  for (const [id, mv] of Object.entries(ctx.mouvements)) for (const [e, liste] of Object.entries(mv)) if (!liste.length) ajouter('voie sans issue', `${id} ${e}`);
  return defauts;
}
const sousAxe = (ligne, s0, s1) => { const L = longueur(ligne); return [pointA(ligne, Math.min(s0, L)).p, pointA(ligne, Math.min((s0 + s1) / 2, L)).p, pointA(ligne, Math.min(s1, L)).p]; };

// ─── Les tests ──────────────────────────────────────────────────────────────
group('beta — banc d\'essai des infrastructures');
const GRAINES = Array.from({ length: 24 }, (_, i) => 1000 + i);
test('24 réseaux au hasard : chaussée, pistes, trottoirs, passages, voies', () => {
  const bilan = {};
  for (const g of GRAINES) {
    const { reseau } = reseauAuHasard(g);
    for (const d of controler(reseau)) (bilan[d.quoi] ??= []).push(`graine ${g} : ${d.ou}`);
  }
  const texte = Object.entries(bilan).map(([q, l]) => `${q} (${l.length}) — ${l.slice(0, 3).join(' ; ')}`).join('\n');
  assert.equal(Object.keys(bilan).length, 0, '\n' + texte);
});
test('le trafic de ces réseaux roule sans chevauchement', () => {
  for (const g of GRAINES.slice(0, 8)) {
    const { reseau } = reseauAuHasard(g);
    const ctx = preparerTrafic(reseau, ROUTE, FEUX), etat = creerTrafic(TRAFIC, g);
    for (let i = 0; i < 150 * 30; i++) {
      avancer(etat, ctx, TRAFIC, VEHICULES, 1 / 30, PIETONS);
      if (i % 30) continue;
      const pos = etat.vehicules.map(v => pointA(v.ligne, v.s).p);
      for (let a = 0; a < pos.length; a++) for (let b = a + 1; b < pos.length; b++) {
        const A = etat.vehicules[a], B = etat.vehicules[b], seuil = A.mode === 'velo' && B.mode === 'velo' ? 0.3 : 1;
        assert.ok(Math.hypot(pos[a][0] - pos[b][0], pos[a][1] - pos[b][1]) > seuil, `graine ${g}, t = ${etat.t.toFixed(0)} : ${A.mode} ${A.id} (${A.etape}) et ${B.mode} ${B.id} (${B.etape})`);
      }
    }
  }
});
