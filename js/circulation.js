// Le trafic en temps réel (v0.6) : des blocs qui circulent sur les voies réelles.
// Pur (aucun DOM, aucun dessin), déterministe à graine fixe, testé (test/trafic.test.mjs).
// La boucle (js/lib/loop.js) appelle pas(dt) à pas fixe ; le rendu lit positions().
//
// Réseau (construireReseau) : chaque voie de circulation d'un tronçon (bande voiture, bus,
// cyclable, ou chaussée non découpée : voie « générale ») devient un CHEMIN dirigé par sens
// (aller : du nœud de départ de l'axe à son nœud d'arrivée). Il part du point d'attache de
// la voie au carrefour de départ et finit à celui du carrefour d'arrivée (js/geo/raccords.js) ;
// chaque raccord en vigueur (js/carrefour.js) devient un chemin du bout d'une voie au début
// d'une autre. Les mêmes points que la carte et la 3D : un bloc suit exactement ce qui est dessiné.
//
// Règles (Jérôme, v0.5.0) : un bloc entre par une rue coupée par le bord du corridor (débit de
// jeu par hiérarchie UrbIS, js/data/circulation.js, ou la demande posée par le joueur) ; à chaque
// carrefour il prend AU HASARD un raccord de sa voie compatible avec son mode ; sans raccord
// il sort du jeu (compté « sans issue »). Il suit le véhicule de devant (modèle IDM, Treiber
// et al. 2000), s'arrête au rouge pour SON mouvement (phases du scénario, js/carrefour.js phasesDe :
// modèle proposé et durées de vert ; v0.7).
// Les blocs ne se gênent pas dans la zone d'un carrefour (exclu : priorités, conflits).
import { branchesDe, raccordsDe, phasesDe, auVert } from './carrefour.js?v=0.9.4';
import { geometrieCarrefour, recul, reculBranche, extraire, pointSurLigne } from './geo/raccords.js?v=0.9.4';
import { decalerLigne } from './geo/decalage.js?v=0.9.4';
import { decalages } from './section.js?v=0.9.4';
import { longueur } from './geo/geometrie.js?v=0.9.4';
import { MODE_DE_BANDE } from './data/carrefours.js?v=0.9.4';
import { DEBITS_JEU, VOIES_DU_MODE, DEMANDE_DU_MODE, VEHICULES, VITESSES, SIMULATION } from './data/circulation.js?v=0.9.4';
import { createRng } from './lib/rng.js?v=0.9.4';

const SENS_SOURCE = { 'unique-direct': 'aller', 'unique-inverse': 'retour' };
const LARGEUR_INCONNUE = 3; // m, dessin seulement : décale les deux sens d'une voie inconnue
const kmh = v => v / 3.6;

/** Les voies de circulation d'un tronçon, dans le repère de son axe : [{ voie, mode, sens, milieu, largeur }]. */
export function voiesDuTroncon(segment, section) {
  const sensSource = SENS_SOURCE[segment.sourceAttributes?.oneway] ?? 'double';
  if (!section) return [{ voie: `${segment.id}:inconnu`, mode: 'general', sens: sensSource, milieu: 0, largeur: LARGEUR_INCONNUE }];
  return decalages(section).filter(d => MODE_DE_BANDE[d.type]).map(d => ({
    voie: `${segment.id}:${d.id}`, mode: MODE_DE_BANDE[d.type],
    sens: d.type === 'chaussee' ? sensSource : d.sens ?? 'double',
    milieu: (d.gauche + d.droite) / 2, largeur: d.gauche - d.droite,
  }));
}

/** Prépare un chemin : longueurs cumulées. */
function chemin(points, plus) {
  // Points trop proches fondus, mais les deux bouts restent exacts (ils touchent les chemins voisins)
  const p = [points[0]];
  for (const q of points.slice(1)) if (Math.hypot(q[0] - p.at(-1)[0], q[1] - p.at(-1)[1]) > 0.05) p.push(q);
  if (p.length > 1) p[p.length - 1] = points.at(-1); else p.push(points.at(-1));
  const cumul = [0];
  for (let i = 1; i < p.length; i++) cumul.push(cumul[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  return { points: p, cumul, longueur: cumul.at(-1), suivants: [], vehicules: [], feu: null, ...plus };
}

/**
 * Le réseau de chemins du scénario.
 * ctx : { segments: Map, noeuds: Map, sectionDe(id), ligneDe(id) (Lambert 72, du départ à l'arrivée), carrefourDe(noeud) (choix du scénario),
 *         regulationDe(noeud), vitesseVeloKmh, D (DESSIN_CARREFOUR) }
 * → { chemins: Map(clé → chemin), entrees: [{ troncon, sens, hierarchie, chemins }], feux: Map(noeud → { phases }) }
 */
export function construireReseau({ segments, noeuds, sectionDe, ligneDe, carrefourDe, regulationDe, vitesseVeloKmh = null, D }) {
  // Les carrefours : recul par branche, points d'attache, raccords
  const infos = new Map();
  for (const n of noeuds.values()) {
    const branches = branchesDe(n, { segments, sectionDe, ligneDe });
    if (branches.length < 2) continue;
    const { raccords } = raccordsDe(branches, carrefourDe(n.id));
    const geo = geometrieCarrefour(branches, raccords, [], D);
    const r = recul(branches, D);
    const regulation = regulationDe(n.id);
    infos.set(n.id, {
      geo, regulation, feux: regulation === 'feux' ? phasesDe(branches, carrefourDe(n.id)) : null,
      rb: new Map(branches.map(b => [b.troncon, reculBranche(b, r, D)])),
    });
  }
  const chemins = new Map(), entrees = [];
  for (const s of segments.values()) {
    const ligne = ligneDe(s.id);
    if (!ligne || ligne.length < 2 || s.fromNode === s.toNode) continue;
    const L = longueur(ligne);
    if (!(L > 0)) continue;
    const vMax = typeof s.sourceAttributes?.speedLimit === 'number' ? kmh(s.sourceAttributes.speedLimit) : kmh(VITESSES.defautKmh);
    const parSens = { aller: [], retour: [] };
    for (const v of voiesDuTroncon(s, sectionDe(s.id))) {
      for (const sens of v.sens === 'double' ? ['aller', 'retour'] : [v.sens]) {
        const aller = sens === 'aller';
        const [depart, arrivee] = aller ? [s.fromNode, s.toNode] : [s.toNode, s.fromNode];
        const axe = aller ? ligne : [...ligne].reverse();
        const dA = infos.get(depart)?.rb.get(s.id) ?? 0, dB = infos.get(arrivee)?.rb.get(s.id) ?? 0;
        const decal = (aller ? v.milieu : -v.milieu) - (v.sens === 'double' ? v.largeur / 4 : 0); // on roule à droite
        const morceau = L - dA - dB > 0.5 ? extraire(axe, dA, L - dB) : [pointSurLigne(axe, L / 2).p, pointSurLigne(axe, L / 2 + 0.01).p];
        const milieu = decalerLigne(morceau, decal);
        const debut = infos.get(depart)?.geo.ancres.get(v.voie)?.point, fin = infos.get(arrivee)?.geo.ancres.get(v.voie)?.point;
        const c = chemin([...(debut ? [debut] : []), ...milieu, ...(fin ? [fin] : [])], {
          cle: `${v.voie}|${aller ? 'a' : 'r'}`, type: 'voie', troncon: s.id, voie: v.voie, mode: v.mode, sens, depart, arrivee, vMax,
          sortie: !infos.has(arrivee), // finit au bord du corridor (ou à un cul-de-sac) : le bloc sort du jeu
        });
        const info = infos.get(arrivee);
        if (info?.feux) c.feu = info.feux; // le feu dit, pour le mouvement choisi (raccord suivant), s'il est au vert
        chemins.set(c.cle, c);
        if (!infos.has(depart)) parSens[sens].push(c);
      }
    }
    for (const sens of ['aller', 'retour']) if (parSens[sens].length) entrees.push({ troncon: s.id, sens, hierarchie: s.hierarchieCode ?? 'UN', chemins: parSens[sens] });
  }
  // Les raccords : du bout d'une voie qui arrive au nœud au début d'une voie qui en part
  for (const [n, info] of infos) {
    for (const r of info.geo.raccords) {
      const de = [...['a', 'r']].map(x => chemins.get(`${r.de}|${x}`)).find(c => c?.arrivee === n);
      const vers = [...['a', 'r']].map(x => chemins.get(`${r.vers}|${x}`)).find(c => c?.depart === n);
      if (!de || !vers) continue;
      // Clé avec le nœud : deux tronçons entre les deux mêmes nœuds donnent le même « de>vers » à chaque bout
      const lien = chemin(r.ligne.map(p => [...p]), {
        cle: `${n}/${r.de}>${r.vers}`, type: 'raccord', noeud: n, mode: vers.mode, vMax: Math.min(kmh(VITESSES.raccordKmh), vers.vMax),
        mouvement: `${de.troncon}>${vers.troncon}`, // d'une branche à l'autre : ce que les phases de feux mettent au vert
      });
      lien.suivants.push(vers);
      de.suivants.push(lien);
      chemins.set(lien.cle, lien);
    }
  }
  const feux = new Map([...infos].filter(([, i]) => i.feux).map(([n, i]) => [n, i.feux]));
  return { chemins, entrees, feux, vitesseVeloKmh };
}


/** Un mode peut-il emprunter ce chemin ? (un raccord : selon la voie où il mène) */
const permis = (mode, c) => VOIES_DU_MODE[mode].includes(c.type === 'raccord' ? c.suivants[0].mode : c.mode);

/**
 * Le trafic : un état qui avance par pas fixes.
 * options : { graine, demandeDe(troncon) → scenario.demande[troncon] | null, debits (DEBITS_JEU) }
 */
export function creerTrafic(reseau, { graine = SIMULATION.graine, demandeDe = () => null, debits = DEBITS_JEU } = {}) {
  const rng = createRng(graine);
  let R = reseau, temps = 0, prochainId = 1, numeroPas = 0;
  const vehicules = new Set();
  const bilan = { entres: 0, sortis: 0, sansIssue: 0, refuses: 0 };
  const passages = new Map(); // troncon → { mode → [temps d'entrée] } (et « mode@type de voie »)
  const perdus = new Map(); // nœud → [temps] des blocs sortis « sans issue » à ce carrefour (v0.8)
  const vitesseMode = mode => (mode === 'velo' ? kmh(R.vitesseVeloKmh ?? VITESSES.veloDefautKmh) : Infinity);

  function choisirSuite(veh) {
    const c = veh.chemin;
    const possibles = c.suivants.filter(x => permis(veh.mode, x));
    veh.prochain = possibles.length ? possibles[Math.floor(rng() * possibles.length)] : null;
  }
  function placer(veh, c, s, compter = true) {
    veh.chemin = c; veh.s = s; veh.k = 0;
    const l = c.vehicules;
    let i = l.length;
    while (i > 0 && l[i - 1].s < s) i--; // trié du plus avancé au moins avancé
    l.splice(i, 0, veh);
    choisirSuite(veh);
    if (compter && c.type === 'voie') {
      const p = passages.get(c.troncon) ?? passages.set(c.troncon, {}).get(c.troncon);
      (p[veh.mode] ??= []).push(temps);
      (p[`${veh.mode}@${c.mode}`] ??= []).push(temps); // par type de voie (v0.8 : des vélos sur la piste)
    }
  }
  const retirerDe = veh => { const l = veh.chemin.vehicules, i = l.indexOf(veh); if (i >= 0) l.splice(i, 1); };

  /** Le débit d'entrée (véh./h) d'un sens d'une rue d'entrée, pour un mode : choix du joueur, sinon valeur de jeu. */
  function debitEntree(e, mode) {
    const choix = demandeDe(e.troncon)?.[DEMANDE_DU_MODE[mode]]?.[e.sens];
    if (typeof choix === 'number') return { debit: choix, origine: 'joueur' };
    return { debit: (debits[e.hierarchie] ?? debits.UN)[mode] ?? 0, origine: 'jeu' };
  }

  function faireEntrer(dt) {
    if (vehicules.size >= SIMULATION.maxVehicules) return;
    for (const e of R.entrees) {
      for (const mode of Object.keys(VEHICULES)) {
        const voies = e.chemins.filter(c => permis(mode, c));
        if (!voies.length) continue;
        const { debit } = debitEntree(e, mode);
        if (!(debit > 0) || rng() >= (debit * dt) / 3600) continue;
        const c = voies[Math.floor(rng() * voies.length)];
        const G = VEHICULES[mode], dernier = c.vehicules.at(-1);
        if (dernier && dernier.s - dernier.longueur < G.s0 + G.longueur) { bilan.refuses++; continue; } // entrée bouchée
        const veh = { id: prochainId++, mode, longueur: G.longueur, v: Math.min(c.vMax, vitesseMode(mode)) * 0.6, s: 0, chemin: null, prochain: null, k: 0, pas: -1 };
        vehicules.add(veh);
        placer(veh, c, 0);
        bilan.entres++;
      }
    }
  }

  function avancer(veh, devant, dt) {
    const G = VEHICULES[veh.mode], c = veh.chemin;
    let v0 = Math.min(c.vMax, vitesseMode(veh.mode));
    // Ralentir à temps avant un chemin plus lent (raccord) : v² ≤ v_suivant² + 2 b d
    if (veh.prochain && veh.prochain.vMax < v0) v0 = Math.max(veh.prochain.vMax, Math.min(v0, Math.sqrt(veh.prochain.vMax ** 2 + 2 * G.b * Math.max(0, c.longueur - veh.s))));
    let ecart = Infinity, dv = 0;
    if (devant) { ecart = devant.s - devant.longueur - veh.s; dv = veh.v - devant.v; }
    else if (veh.prochain) {
      const d2 = veh.prochain.vehicules.at(-1);
      if (d2) { ecart = c.longueur - veh.s + d2.s - d2.longueur; dv = veh.v - d2.v; }
    }
    // Feu rouge pour son mouvement au bout de la voie : un obstacle immobile à la ligne d'arrêt, sauf si l'on ne peut plus s'arrêter
    if (c.feu && veh.prochain && !auVert(c.feu, temps, veh.prochain.mouvement)) {
      const arret = c.longueur - veh.s - 0.5;
      if (arret > 0 && veh.v * veh.v / (2 * arret) < SIMULATION.freinageMax && arret < ecart) { ecart = arret; dv = veh.v; }
    }
    const etoile = G.s0 + Math.max(0, veh.v * G.T + (veh.v * dv) / (2 * Math.sqrt(G.a * G.b)));
    const acc = G.a * (1 - (veh.v / v0) ** 4 - (etoile / Math.max(ecart, 0.1)) ** 2);
    veh.v = Math.min(v0, Math.max(0, veh.v + Math.max(acc, -9) * dt)); // la courbe de freinage borne la vitesse (IDM la suit mal quand v0 baisse)
    veh.s += veh.v * dt;
  }

  function pas(dt = SIMULATION.pasS) {
    numeroPas++;
    faireEntrer(dt);
    const sortants = [];
    for (const c of R.chemins.values()) {
      const l = c.vehicules;
      for (let i = 0; i < l.length; i++) {
        const veh = l[i];
        if (veh.pas === numeroPas) continue; // déjà avancé ce pas (il vient d'un autre chemin)
        veh.pas = numeroPas;
        avancer(veh, i > 0 ? l[i - 1] : null, dt);
        if (veh.s >= c.longueur) sortants.push(veh);
      }
      // Le suivi garde l'ordre ; une rare inversion (deux entrées au même pas) est réparée
      for (let i = 1; i < l.length; i++) if (l[i].s > l[i - 1].s) { l.sort((a, b) => b.s - a.s); break; }
    }
    for (const veh of sortants) {
      const c = veh.chemin, reste = veh.s - c.longueur;
      // Insertion : deux raccords peuvent mener à la même voie ; on n'y entre que s'il y a la place
      const d2 = veh.prochain?.vehicules.at(-1);
      if (d2 && d2.s - d2.longueur < reste + VEHICULES[veh.mode].s0 * 0.5) { veh.s = c.longueur - 0.01; veh.v = 0; continue; }
      retirerDe(veh);
      if (veh.prochain) placer(veh, veh.prochain, Math.min(reste, veh.prochain.longueur * 0.5));
      else {
        vehicules.delete(veh);
        if (c.sortie) bilan.sortis++;
        else { bilan.sansIssue++; (perdus.get(c.arrivee) ?? perdus.set(c.arrivee, []).get(c.arrivee)).push(temps); } // carrefour sans raccord pour lui
      }
    }
    temps += dt;
    // Les passages hors de la fenêtre de mesure sont oubliés
    if (numeroPas % 200 === 0) {
      const t0 = temps - SIMULATION.fenetreS;
      for (const p of passages.values()) for (const m of Object.keys(p)) { const l = p[m]; let k = 0; while (k < l.length && l[k] < t0) k++; if (k) l.splice(0, k); }
      for (const l of perdus.values()) { let k = 0; while (k < l.length && l[k] < t0) k++; if (k) l.splice(0, k); }
    }
  }

  /** Change de réseau (le scénario a changé) : un bloc garde sa place si son chemin existe encore. */
  function reconstruire(reseau2) {
    const anciens = [...vehicules];
    R = reseau2;
    vehicules.clear();
    for (const veh of anciens) {
      const c = R.chemins.get(veh.chemin.cle);
      if (!c) continue;
      const prochain = veh.prochain?.cle;
      veh.pas = -1;
      vehicules.add(veh);
      placer(veh, c, Math.min(veh.s, c.longueur - 0.01), false); // déjà compté à son entrée
      const garde = c.suivants.find(x => x.cle === prochain);
      if (garde) veh.prochain = garde;
    }
  }

  /** Position d'un bloc : point et cap à la distance s (+ avance) sur son chemin. */
  function poser(veh, avance = 0) {
    const c = veh.chemin, s = Math.min(veh.s + avance, c.longueur);
    let k = Math.min(veh.k, c.cumul.length - 2);
    while (k > 0 && c.cumul[k] > s) k--;
    while (k < c.cumul.length - 2 && c.cumul[k + 1] < s) k++;
    veh.k = k;
    const a = c.points[k], b = c.points[k + 1], l = c.cumul[k + 1] - c.cumul[k] || 1, u = (s - c.cumul[k]) / l;
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, Math.atan2(b[1] - a[1], b[0] - a[0])];
  }

  return {
    pas,
    reconstruire,
    get temps() { return temps; },
    get nombre() { return vehicules.size; },
    get reseau() { return R; },
    bilan: () => ({ ...bilan, enCirculation: vehicules.size }),
    vehicules: () => [...vehicules],
    /**
     * Les blocs à dessiner, par mode : { voiture: Float32Array [x, y, cap, …], … } (Lambert 72).
     * alpha : fraction du pas suivant (interpolation du rendu).
     */
    positions(alpha = 0, dt = SIMULATION.pasS) {
      const n = {}, out = {};
      for (const m of Object.keys(VEHICULES)) { n[m] = 0; out[m] = new Float32Array(0); }
      const compte = {};
      for (const veh of vehicules) compte[veh.mode] = (compte[veh.mode] ?? 0) + 1;
      for (const m of Object.keys(VEHICULES)) out[m] = new Float32Array((compte[m] ?? 0) * 3);
      for (const veh of vehicules) {
        const [x, y, cap] = poser(veh, veh.v * alpha * dt);
        const t = out[veh.mode], i = n[veh.mode]++ * 3;
        t[i] = x; t[i + 1] = y; t[i + 2] = cap;
      }
      return out;
    },
    /** Ce qui passe sur un tronçon : débit mesuré (véh./h, sur la fenêtre), blocs présents, vitesse moyenne (km/h), à l'arrêt. */
    /** Un carrefour (v0.8) : blocs perdus « sans issue » depuis t0, blocs arrêtés sur ses voies d'approche (maintenant). */
    mesuresNoeud(noeud, t0 = 0) {
      let arretes = 0, approche = 0;
      for (const v of vehicules) if (v.chemin.type === 'voie' && v.chemin.arrivee === noeud) { approche++; if (v.v < 1) arretes++; }
      return { perdus: (perdus.get(noeud) ?? []).filter(x => x >= t0).length, arretes, approche };
    },
    /** Passages sur un tronçon depuis t0 : { mode, ou « mode@type de voie » → nombre }. */
    passagesDepuis(troncon, t0 = 0) {
      return Object.fromEntries(Object.entries(passages.get(troncon) ?? {}).map(([k, l]) => [k, l.filter(x => x >= t0).length]));
    },
    mesures(troncon) {
      const p = passages.get(troncon) ?? {};
      const fenetre = Math.min(SIMULATION.fenetreS, Math.max(temps, 1));
      const t0 = temps - SIMULATION.fenetreS;
      const debits = Object.fromEntries(Object.keys(VEHICULES).map(m => [m, Math.round(((p[m] ?? []).filter(x => x >= t0).length * 3600) / fenetre)]));
      const presents = [...vehicules].filter(v => v.chemin.type === 'voie' && v.chemin.troncon === troncon);
      return {
        debits, presents: presents.length, arretes: presents.filter(v => v.v < 1).length,
        vitesseKmh: presents.length ? Math.round((presents.reduce((a, v) => a + v.v, 0) / presents.length) * 3.6) : null,
        fenetreS: Math.round(fenetre),
      };
    },
    debitEntree,
  };
}
