// Le carrefour (v0.4) : les branches d'un nœud, les voies qui y entrent et en
// sortent, et leurs raccords. Pur, testé (test/carrefour.test.mjs).
//
// Les voies viennent des sections (js/section.js) : une bande de circulation
// (voiture, bus, cyclable) est une voie ; une chaussée non découpée est une voie
// « générale » (voies non renseignées), dont le sens vient de la source (OSM) ;
// un tronçon sans section mesurée a une seule voie générale, « inconnu ».
//
// Raccords (Jérôme, v0.4.0 : « proposés, à revoir ») : le jeu PROPOSE des raccords
// calculés (méthode dans proposer()) ; le joueur en retire, en ajoute ou les valide.
// Le scénario ne garde que ses choix : { ajoutes, retires, traversees, regulation, feux }.
// v0.7 : directions (flèches au sol : un clic allume ou éteint tous les raccords d'une voie vers une branche)
// et phases de feux (modèle proposé, durées de vert réglables).
// Les raccords en vigueur sont recalculés à partir des sections du moment : une voie
// ajoutée dans un tronçon reçoit ses raccords proposés, une voie retirée emporte
// les siens (ceux que le joueur avait choisis sont comptés « perdus »).
//
// Les opérations rendent { carrefour } (null : rien à garder) ou { refus, valeurs }.
import { decalages } from './section.js?v=0.9.7';
import { MODE_DE_BANDE, COMPATIBLES, REGULATIONS, TRAVERSEES, ANGLES, MODELES_FEUX, VERTS } from './data/carrefours.js?v=0.9.7';
import { REFERENCES } from './data/simulation.js?v=0.9.7';
import { longueur, pointA } from './geo/geometrie.js?v=0.9.7';

const DEUX_PI = 2 * Math.PI;
/** Angle ramené dans ]-π, π]. */
export const normaliser = a => { let x = a % DEUX_PI; if (x <= -Math.PI) x += DEUX_PI; if (x > Math.PI) x -= DEUX_PI; return x; };
const SENS_SOURCE = { 'unique-direct': 'aller', 'unique-inverse': 'retour' };
export const cle = (de, vers) => `${de}>${vers}`;
export const lireCle = k => { const [de, vers] = k.split('>'); return { de, vers }; };
export const compatible = (de, vers) => (COMPATIBLES[de] ?? []).includes(vers);

/**
 * Les branches d'un nœud, triées par angle.
 * ctx : { segments: Map(id → streetSegment), sectionDe(id) → section | null, ligneDe(id) → ligne métrique (du départ à l'arrivée) | null }
 * → [{ troncon, sortant (l'axe part du nœud), angle (cap en s'éloignant du nœud, rad), ligne (depuis le nœud), longueur, section, oneway, niveau, nom }]
 * Une boucle (départ = arrivée) n'est pas une branche ; un tronçon sans géométrie non plus.
 */
export function branchesDe(noeud, { segments, sectionDe, ligneDe }) {
  const out = [];
  for (const id of noeud?.connectedSegmentIds ?? []) {
    const s = segments.get(id);
    if (!s || s.fromNode === s.toNode) continue;
    const sortant = s.fromNode === noeud.id;
    if (!sortant && s.toNode !== noeud.id) continue;
    const brute = ligneDe(id);
    if (!brute || brute.length < 2) continue;
    const ligne = sortant ? brute.map(p => [...p]) : brute.map(p => [...p]).reverse();
    const l = longueur(ligne);
    if (!l) continue;
    // Le cap pris à quelques mètres du nœud : un premier sommet très proche ne le fausse pas
    const q = pointA(ligne, Math.min(1, Math.min(15, l / 2) / l));
    out.push({
      troncon: id, sortant, angle: Math.atan2(q[1] - ligne[0][1], q[0] - ligne[0][0]), ligne, longueur: l,
      section: sectionDe(id) ?? null, oneway: s.sourceAttributes?.oneway ?? null, niveau: s.niveau ?? null, nom: s.nom ?? null,
    });
  }
  return out.sort((a, b) => a.angle - b.angle);
}

/**
 * Les voies d'une branche : [{ id ("troncon:bande"), troncon, bande, type, mode, sens, entrante, sortante, cote, gauche, droite, connue }]
 * cote : décalage du milieu de la voie, à gauche (positif) en s'éloignant du nœud ; gauche / droite : ses bords, même repère.
 * connue : false pour une chaussée non découpée ou un tronçon sans section (voies non renseignées).
 */
export function voiesDe(b) {
  const voies = [];
  const sensSource = SENS_SOURCE[b.oneway] ?? 'double';
  const signe = b.sortant ? 1 : -1; // repère de l'axe (du départ à l'arrivée) → repère « en s'éloignant du nœud »
  const pousser = (bande, type, sens, g, d, connue) => {
    const [gauche, droite] = [g * signe, d * signe].sort((x, y) => y - x);
    voies.push({
      id: `${b.troncon}:${bande}`, troncon: b.troncon, bande, type, mode: MODE_DE_BANDE[type] ?? 'general', sens,
      // aller : du nœud de départ au nœud d'arrivée de l'axe
      entrante: sens === 'double' || (sens === 'aller') !== b.sortant,
      sortante: sens === 'double' || (sens === 'aller') === b.sortant,
      cote: (gauche + droite) / 2, gauche, droite, connue,
    });
  };
  if (!b.section) pousser('inconnu', 'chaussee', sensSource, 0, 0, false);
  else {
    for (const d of decalages(b.section)) {
      if (!MODE_DE_BANDE[d.type]) continue;
      const chaussee = d.type === 'chaussee';
      pousser(d.id, d.type, chaussee ? sensSource : d.sens ?? 'double', d.gauche, d.droite, !chaussee);
    }
  }
  return voies;
}

/** Toutes les voies du carrefour : Map(id → voie). */
export const toutesLesVoies = branches => new Map(branches.flatMap(b => voiesDe(b)).map(v => [v.id, v]));

// Ordre gauche → droite pour qui ARRIVE au nœud (sa gauche est la droite « en s'éloignant ») et pour qui en PART
const gaucheDroiteEntree = (a, b) => a.cote - b.cote;
const gaucheDroiteSortie = (a, b) => b.cote - a.cote;

/**
 * Les raccords proposés : [{ de, vers }]. Méthode (affichée au joueur, confiance faible) :
 * pour chaque voie entrante, vers chaque autre branche (pas de demi-tour), une voie sortante du
 * mode le plus proche (COMPATIBLES). Les branches sont réparties de gauche à droite entre les voies
 * entrantes d'un même mode (la plus à gauche prend les tourne-à-gauche, la plus à droite les
 * tourne-à-droite) ; tout droit est servi par toutes. À l'arrivée, un tourne-à-gauche prend la voie
 * la plus à gauche, un tourne-à-droite la plus à droite, tout droit la voie de même rang.
 */
export function proposer(branches) {
  const toutDroit = (ANGLES.toutDroitDegres * Math.PI) / 180;
  const voies = new Map(branches.map(b => [b.troncon, voiesDe(b)]));
  const out = [];
  for (const A of branches) {
    const cibles = branches.filter(B => B !== A)
      .map(B => ({ B, virage: normaliser(B.angle - (A.angle + Math.PI)) }))
      .sort((x, y) => y.virage - x.virage); // à gauche d'abord
    if (!cibles.length) continue;
    const iDroit = cibles.reduce((m, c, j) => (Math.abs(c.virage) < Math.abs(cibles[m].virage) ? j : m), 0);
    const droit = Math.abs(cibles[iDroit].virage) < toutDroit ? iDroit : -1;
    const familles = new Map();
    for (const v of voies.get(A.troncon).filter(x => x.entrante)) (familles.get(v.mode) ?? familles.set(v.mode, []).get(v.mode)).push(v);
    for (const famille of familles.values()) {
      famille.sort(gaucheDroiteEntree);
      const k = famille.length, m = cibles.length;
      cibles.forEach((c, j) => {
        const servantes = j === droit || k === 1 ? famille.map((_, i) => i) : [m === 1 ? 0 : Math.round((j * (k - 1)) / (m - 1))];
        for (const i of servantes) {
          const vers = choisirSortie(famille[i], i, k, voies.get(c.B.troncon).filter(x => x.sortante), c.virage, toutDroit);
          if (vers) out.push({ de: famille[i].id, vers: vers.id });
        }
      });
    }
  }
  return out;
}

function choisirSortie(voie, rang, k, sorties, virage, toutDroit) {
  for (const mode of COMPATIBLES[voie.mode] ?? []) {
    const c = sorties.filter(s => s.mode === mode).sort(gaucheDroiteSortie);
    if (!c.length) continue;
    if (virage >= toutDroit) return c[0];
    if (virage <= -toutDroit) return c.at(-1);
    return c[k === 1 ? 0 : Math.round((rang * (c.length - 1)) / (k - 1))];
  }
  return null;
}

/** Un raccord est-il possible entre ces deux voies ? → null, ou { refus, valeurs }. */
function refusRaccord(voies, de, vers) {
  const a = voies.get(de), b = voies.get(vers);
  if (!a || !b) return { refus: 'voie', valeurs: {} };
  if (!a.entrante) return { refus: 'pas-entrante', valeurs: {} };
  if (!b.sortante) return { refus: 'pas-sortante', valeurs: {} };
  if (a.troncon === b.troncon) return { refus: 'demi-tour', valeurs: {} };
  if (!compatible(a.mode, b.mode)) return { refus: 'mode', valeurs: { de: a.mode, vers: b.mode } };
  return null;
}

/**
 * Les raccords en vigueur : propositions − retirés + ajoutés, entre voies qui existent.
 * → { raccords: [{ de, vers, origine: 'propose' | 'joueur' }], perdus: [clé] (choix du joueur dont une voie a disparu) }
 */
export function raccordsDe(branches, c) {
  const voies = toutesLesVoies(branches);
  const retires = new Set(c?.retires ?? []);
  const out = new Map(), perdus = [];
  for (const p of proposer(branches)) { const k = cle(p.de, p.vers); if (!retires.has(k)) out.set(k, { ...p, origine: 'propose' }); }
  for (const k of c?.ajoutes ?? []) {
    const r = lireCle(k);
    if (refusRaccord(voies, r.de, r.vers)) perdus.push(k); else out.set(k, { ...r, origine: 'joueur' });
  }
  return { raccords: [...out.values()], perdus };
}

/**
 * Ce qui ne va pas : les voies entrantes sans issue, les voies sortantes que rien n'atteint,
 * et toute incohérence d'un raccord (ne doit jamais arriver : raccordsDe filtre).
 */
export function verifierCarrefour(branches, raccords) {
  const voies = toutesLesVoies(branches);
  const departs = new Set(raccords.map(r => r.de)), arrivees = new Set(raccords.map(r => r.vers));
  const voiesList = [...voies.values()];
  return {
    impasses: voiesList.filter(v => v.entrante && !departs.has(v.id)).map(v => v.id),
    inaccessibles: voiesList.filter(v => v.sortante && !arrivees.has(v.id)).map(v => v.id),
    invalides: raccords.filter(r => refusRaccord(voies, r.de, r.vers)).map(r => cle(r.de, r.vers)),
  };
}

// ─── Opérations du joueur ─────────────────────────────────────────────────
export const carrefourVide = () => ({ ajoutes: [], retires: [], traversees: {}, regulation: null, feux: null });
const normal = c => {
  const traversees = Object.fromEntries(Object.entries(c.traversees ?? {})
    .map(([id, t]) => [id, Object.fromEntries(Object.entries(t).filter(([, v]) => v !== null))]).filter(([, t]) => Object.keys(t).length));
  const n = { ajoutes: [...new Set(c.ajoutes ?? [])], retires: [...new Set(c.retires ?? [])], traversees, regulation: c.regulation ?? null };
  if (n.regulation === 'feux' && c.feux) n.feux = c.feux; // le réglage des feux ne survit pas à une autre régulation
  return n.ajoutes.length || n.retires.length || Object.keys(traversees).length || n.regulation ? n : null;
};
const refus = (r, valeurs = {}) => ({ refus: r, valeurs });

/** Raccorde la voie `de` à la voie `vers`, ou les détache si elles le sont déjà. */
export function basculerRaccord(c, branches, de, vers) {
  const x = { ...carrefourVide(), ...c };
  const k = cle(de, vers);
  const { raccords } = raccordsDe(branches, x);
  const actuel = raccords.find(r => r.de === de && r.vers === vers);
  if (actuel) {
    // Détacher : un choix du joueur s'efface ; une proposition est retirée
    const propose = proposer(branches).some(p => p.de === de && p.vers === vers);
    return { carrefour: normal({ ...x, ajoutes: x.ajoutes.filter(a => a !== k), retires: propose ? [...x.retires, k] : x.retires }), raccorde: false };
  }
  const r = refusRaccord(toutesLesVoies(branches), de, vers);
  if (r) return r;
  const propose = proposer(branches).some(p => p.de === de && p.vers === vers);
  return { carrefour: normal(propose ? { ...x, retires: x.retires.filter(a => a !== k) } : { ...x, ajoutes: [...x.ajoutes, k] }), raccorde: true };
}

/** Le joueur fait siens tous les raccords proposés en vigueur (ils ne sont plus « à revoir »). */
export function validerPropositions(c, branches) {
  const x = { ...carrefourVide(), ...c };
  const nouveaux = raccordsDe(branches, x).raccords.filter(r => r.origine === 'propose').map(r => cle(r.de, r.vers));
  if (!nouveaux.length) return refus('rien-a-valider');
  return { carrefour: normal({ ...x, ajoutes: [...x.ajoutes, ...nouveaux] }) };
}

/** Passage piéton ou traversée cyclable sur une branche : true, false ou null (non renseigné). */
export function definirTraversee(c, branches, troncon, type, valeur) {
  const x = { ...carrefourVide(), ...c };
  const b = branches.find(y => y.troncon === troncon);
  if (!b) return refus('branche');
  const def = TRAVERSEES[type];
  if (!def) return refus('traversee');
  if (![true, false, null].includes(valeur)) return refus('traversee');
  if (valeur === true) {
    if (!b.section) return refus('section-inconnue');
    if (!b.section.bandes.some(d => d.type === def.exige)) return refus(def.refus);
  }
  return { carrefour: normal({ ...x, traversees: { ...x.traversees, [troncon]: { ...x.traversees[troncon], [type]: valeur } } }) };
}

/** Régulation du carrefour (REGULATIONS) ou null : non renseignée. */
export function definirRegulation(c, branches, valeur) {
  if (valeur !== null && !REGULATIONS.includes(valeur)) return refus('regulation');
  return { carrefour: normal({ ...carrefourVide(), ...c, regulation: valeur }) };
}

export const OPERATIONS_CARREFOUR = { basculerRaccord, validerPropositions, definirTraversee, definirRegulation, basculerDirection: (...a) => basculerDirection(...a), definirModeleFeux: (...a) => definirModeleFeux(...a), definirVert: (...a) => definirVert(...a) };

/**
 * Les traversées en vigueur d'un carrefour : celles que le joueur a posées et dont la branche
 * a encore la bande exigée (une traversée cyclable disparaît avec la piste). → [{ troncon, type }]
 */
export function traverseesDe(branches, c) {
  const out = [];
  for (const [troncon, t] of Object.entries(c?.traversees ?? {})) {
    const b = branches.find(y => y.troncon === troncon);
    for (const [type, v] of Object.entries(t)) {
      if (v !== true || !b?.section) continue;
      if (b.section.bandes.some(d => d.type === TRAVERSEES[type]?.exige)) out.push({ troncon, type });
    }
  }
  return out;
}

// ─── Directions (v0.7) : les flèches au sol d'une voie qui entre ─────────
/** Où va une branche B pour qui arrive par A : 'gauche', 'droit' ou 'droite' (seuil : ANGLES.toutDroitDegres). */
export function direction(A, B) {
  const virage = normaliser(B.angle - (A.angle + Math.PI));
  return { virage, direction: Math.abs(virage) < (ANGLES.toutDroitDegres * Math.PI) / 180 ? 'droit' : virage > 0 ? 'gauche' : 'droite' };
}

/**
 * Les directions d'une voie entrante : une par autre branche, de la plus à gauche à la plus à droite.
 * → [{ troncon, direction, virage, actif, raccords }] ; [] si la voie n'entre pas dans le carrefour.
 */
export function directionsDe(branches, raccords, voieId) {
  const voies = toutesLesVoies(branches), v = voies.get(voieId);
  if (!v?.entrante) return [];
  const A = branches.find(b => b.troncon === v.troncon);
  return branches.filter(B => B !== A).map(B => ({
    troncon: B.troncon, ...direction(A, B),
    raccords: raccords.filter(r => r.de === voieId && voies.get(r.vers)?.troncon === B.troncon),
  })).map(d => ({ ...d, actif: d.raccords.length > 0 })).sort((a, b) => b.virage - a.virage);
}

/** Allume ou éteint une direction : tous les raccords de la voie vers la branche, ou un seul raccord choisi comme les propositions. */
export function basculerDirection(c, branches, voieId, troncon) {
  const { raccords } = raccordsDe(branches, c);
  const d = directionsDe(branches, raccords, voieId).find(x => x.troncon === troncon);
  if (!d) return refus('voie');
  let x = { ...carrefourVide(), ...c };
  if (d.actif) {
    for (const r of d.raccords) x = basculerRaccord(x, branches, r.de, r.vers).carrefour ?? carrefourVide();
    return { carrefour: normal(x), actif: false };
  }
  const voies = toutesLesVoies(branches), v = voies.get(voieId);
  const sorties = [...voies.values()].filter(s => s.troncon === troncon && s.sortante);
  const vers = choisirSortie(v, 0, 1, sorties, d.virage, (ANGLES.toutDroitDegres * Math.PI) / 180);
  if (!vers) return refus('sans-sortie', { de: v.mode });
  const r = basculerRaccord(x, branches, voieId, vers.id);
  return r.refus ? r : { carrefour: r.carrefour, actif: true };
}

// ─── Feux (v0.7) : phases proposées, durées de vert ────────────────────────
/** Les modèles possibles pour ce carrefour. */
export const modelesPossibles = branches => Object.entries(MODELES_FEUX).filter(([, m]) => m.branches === null || m.branches === branches.length).map(([id]) => id);
export const modeleParDefaut = branches => (branches.length === 4 ? 'axes' : 'par-branche');

/**
 * Les phases en vigueur : [{ mouvements: Set("de>vers" entre tronçons), vert (s) }], le temps perdu par phase et le cycle.
 * Un mouvement est le passage d'une branche à une autre ; une phase met au vert tous ses mouvements.
 */
export function phasesDe(branches, c) {
  const possibles = modelesPossibles(branches);
  const modele = possibles.includes(c?.feux?.modele) ? c.feux.modele : modeleParDefaut(branches);
  const mvt = (A, filtre = () => true) => branches.filter(B => B !== A && filtre(direction(A, B).direction)).map(B => `${A.troncon}>${B.troncon}`);
  const groupes = modele === 'axes' ? [[0, 2], [1, 3]].map(ix => ix.flatMap(i => mvt(branches[i])))
    : modele === 'tag-protege' ? [[[0, 2], d => d !== 'gauche'], [[0, 2], d => d === 'gauche'], [[1, 3], d => d !== 'gauche'], [[1, 3], d => d === 'gauche']]
      .map(([ix, f]) => ix.flatMap(i => mvt(branches[i], f)))
      : branches.map(b => mvt(b));
  const F = REFERENCES.feux, n = groupes.length;
  const defaut = Math.round((F.cycleS - n * F.perteParPhaseS) / n);
  const verts = c?.feux?.modele === modele && c.feux.verts?.length === n ? c.feux.verts : groupes.map(() => defaut);
  const phases = groupes.map((g, i) => ({ mouvements: new Set(g), vert: verts[i] }));
  return { modele, modeles: possibles, phases, perte: F.perteParPhaseS, cycle: verts.reduce((a, b) => a + b, 0) + n * F.perteParPhaseS };
}

/** Choisit un modèle de feux (et passe le carrefour aux feux) ; les durées repartent des valeurs proposées. */
export function definirModeleFeux(c, branches, modele) {
  if (!modelesPossibles(branches).includes(modele)) return refus('modele-feux');
  const n = phasesDe(branches, { feux: { modele } }).phases.length;
  return { carrefour: normal({ ...carrefourVide(), ...c, regulation: 'feux', feux: { modele, verts: phasesDe(branches, { feux: { modele } }).phases.map(p => p.vert).slice(0, n) } }) };
}

/** Règle la durée de vert (s) de la phase i. */
export function definirVert(c, branches, i, secondes) {
  if (c?.regulation !== 'feux') return refus('pas-de-feux');
  const p = phasesDe(branches, c);
  if (!Number.isInteger(i) || i < 0 || i >= p.phases.length) return refus('phase');
  if (!Number.isFinite(secondes) || secondes < VERTS.minS || secondes > VERTS.maxS) return refus('vert', { min: VERTS.minS, max: VERTS.maxS });
  const verts = p.phases.map((ph, k) => (k === i ? Math.round(secondes) : ph.vert));
  return { carrefour: normal({ ...carrefourVide(), ...c, feux: { modele: p.modele, verts } }) };
}

/** À l'instant t (s), quelle phase est au vert (null : temps perdu, tout au rouge) et combien de temps il lui reste. */
export function etatFeux(feux, t) {
  let local = ((t % feux.cycle) + feux.cycle) % feux.cycle;
  for (let i = 0; i < feux.phases.length; i++) {
    const v = feux.phases[i].vert;
    if (local < v) return { phase: i, reste: v - local };
    local -= v;
    if (local < feux.perte) return { phase: null, reste: feux.perte - local, apres: (i + 1) % feux.phases.length };
    local -= feux.perte;
  }
  return { phase: null, reste: 0 };
}
/** Un mouvement "de>vers" est-il au vert à l'instant t ? */
export const auVert = (feux, t, mouvement) => { const e = etatFeux(feux, t); return e.phase !== null && feux.phases[e.phase].mouvements.has(mouvement); };

