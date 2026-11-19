// La simulation simplifiée (v0.5) : currentScenario → simulationState (pilier 5).
// Statique, par tronçon et par mode (Jérôme, v0.5.0) : aucune boucle, aucune
// affectation sur le graphe ; le calcul est refait à chaque modification. Pur, testé
// (test/simulation.test.mjs). Le joueur n'édite que le scénario ; rien ici ne le modifie.
//
// Règles (pilier 6) : une valeur qu'on ne peut pas calculer sans inventer reste null,
// avec la raison (clé « sim.raison.<raison> ») ; chaque valeur calculée porte sa méthode.
// - Demande : choix du joueur (scenario.demande), sinon comptage (data/processed/comptages.json), sinon null.
// - Capacité : voies de la section × débit de saturation (REFERENCES), × part de vert si le
//   carrefour d'aval est à feux. Chaussée non découpée : nombre de voies d'OSM, sinon null.
// - Personnes : demande (ou débit écoulé, borné par la capacité) × occupation (hypothèse du joueur).
// - Temps : longueur / vitesse (limite OSM, vitesse mesurée des vélos, marche), chargé par la
//   fonction BPR ; délai uniforme de Webster au carrefour d'aval s'il est à feux.
// - Conflits : croisements des raccords et traversées d'un carrefour, par paire de modes
//   (exposition, jamais une prédiction d'accidents : pilier 3).
import { REFERENCES, MODES_DEMANDE, SEUILS, SAISIE } from './data/simulation.js?v=0.6.0';
import { segmentsSeCroisent } from './geo/geometrie.js?v=0.6.0';

const SENS = ['aller', 'retour'];
const nombre = v => typeof v === 'number' && Number.isFinite(v);
const somme = (a, b) => (nombre(a) && nombre(b) ? a + b : null);

/** Part de vert d'une approche de carrefour à feux (hypothèse de calcul, REFERENCES.feux). */
export function partDeVert(F = REFERENCES.feux) {
  return (F.cycleS - F.phases * F.perteParPhaseS) / (F.phases * F.cycleS);
}

/** Délai uniforme de Webster (s) : C (1 − λ)² / (2 (1 − min(x, 1) λ)). */
export function delaiWebster(x, F = REFERENCES.feux) {
  const l = partDeVert(F);
  const s = Math.min(nombre(x) ? x : 0, 1);
  return (F.cycleS * (1 - l) ** 2) / (2 * (1 - s * l));
}

/** Temps chargé (s) : t0 × (1 + α (v/c)^β) ; sans saturation connue, le temps à vide. */
export const tempsBpr = (t0, x, B = REFERENCES.bpr) => t0 * (1 + B.alpha * (nombre(x) ? x : 0) ** B.beta);

/**
 * Les voies d'une section par mode et par sens : { voiture: { aller, retour }, …, pieton: { largeur },
 * chaussees : nombre de bandes « chaussee » (voies non renseignées) }.
 * Une bande « double » compte une demi-voie dans chaque sens.
 */
export function voiesParMode(section) {
  const out = { voiture: { aller: 0, retour: 0 }, bus: { aller: 0, retour: 0 }, cyclable: { aller: 0, retour: 0 }, pieton: { largeur: 0 }, chaussees: 0 };
  for (const b of section?.bandes ?? []) {
    if (b.type === 'chaussee') { out.chaussees++; continue; }
    if (b.type === 'trottoir') { out.pieton.largeur = Math.round((out.pieton.largeur + b.largeur) * 10) / 10; continue; }
    const v = out[b.type];
    if (!v || !('aller' in v)) continue;
    if (b.sens === 'double') { v.aller += 0.5; v.retour += 0.5; } else if (b.sens === 'retour') v.retour += 1; else v.aller += 1;
  }
  return out;
}

/**
 * Les voies générales d'une chaussée non découpée, d'après OSM (lanes, oneway) :
 * { aller, retour } ou null si OSM ne permet pas de les répartir.
 */
export function voiesOsm(attributs) {
  const n = attributs?.lanes;
  if (!Number.isInteger(n) || n <= 0) return null;
  if (attributs.oneway === 'unique-direct') return { aller: n, retour: 0 };
  if (attributs.oneway === 'unique-inverse') return { aller: 0, retour: n };
  if (attributs.oneway === 'double' && n % 2 === 0) return { aller: n / 2, retour: n / 2 };
  return null;
}

/**
 * La demande d'un mode sur un tronçon : { aller, retour, total, origine, compteurs? }.
 * Le choix du joueur prime ; sinon le comptage (deux sens ensemble) ; sinon tout null.
 */
export function demandeDe(mode, choix, comptage) {
  const j = choix?.[mode];
  if (j && (nombre(j.aller) || nombre(j.retour) || nombre(j.total))) {
    const aller = nombre(j.aller) ? j.aller : null, retour = nombre(j.retour) ? j.retour : null;
    return { aller, retour, total: nombre(j.total) ? j.total : somme(aller, retour), origine: 'joueur' };
  }
  if (comptage && comptage.mode === mode && nombre(comptage.parHeure)) {
    return { aller: null, retour: null, total: comptage.parHeure, origine: 'comptage', compteurs: comptage.compteurs };
  }
  return { aller: null, retour: null, total: null, origine: null };
}

/**
 * L'état simulé d'un tronçon.
 * ctx : { segment, section (js/section.js, ou null : emprise inconnue), choix (scenario.demande[id] ou null),
 *         comptage (comptages.parTroncon[id] ou null), hypotheses ({ occupationVoiture, occupationBus }),
 *         regulation ({ aller: régulation du nœud d'arrivée, retour: du nœud de départ }), vitesseVeloKmh, references? }
 * → { modes: { <mode>: { demande, capacite, saturation, temps, delai, personnes } }, personnes, saturationMax, renseigne }
 */
export function etatTroncon(ctx) {
  const R = ctx.references ?? REFERENCES;
  const { segment, section } = ctx;
  const L = segment.lengthMeters;
  const lambda = partDeVert(R.feux);
  const aFeux = sens => ctx.regulation?.[sens] === 'feux';
  const voies = section ? voiesParMode(section) : null;
  const osm = voies?.chaussees === 1 ? voiesOsm(segment.sourceAttributes) : null;
  const occupation = { voiture: ctx.hypotheses?.occupationVoiture ?? null, bus: ctx.hypotheses?.occupationBus ?? null, cyclable: 1, pieton: 1 };
  const modes = {};

  for (const mode of MODES_DEMANDE) {
    const demande = demandeDe(mode, ctx.choix, ctx.comptage);
    // ── Capacité (par sens ; le piéton : les deux sens ensemble) ──
    let capacite;
    if (!voies) capacite = { aller: null, retour: null, total: null, raison: 'section-inconnue' };
    else if (mode === 'pieton') {
      capacite = voies.pieton.largeur > 0
        ? { aller: null, retour: null, total: Math.round(voies.pieton.largeur * R.pietonParMetre.valeur), methode: 'pieton', source: R.pietonParMetre.source, confiance: R.pietonParMetre.confiance }
        : { aller: null, retour: null, total: 0, methode: 'aucune-bande' };
    } else if (mode === 'bus') {
      capacite = { aller: null, retour: null, total: null, raison: 'bus-non-modelise' };
    } else {
      const sat = mode === 'voiture' ? R.saturationVoie : R.saturationPiste;
      const c = {};
      let raison = null;
      for (const s of SENS) {
        let n = voies[mode][s];
        if (mode === 'voiture' && voies.chaussees) {
          if (osm) n += osm[s];
          else { c[s] = null; raison = 'voies-inconnues'; continue; }
        }
        if (mode === 'cyclable' && n === 0 && voies.chaussees + voies.voiture.aller + voies.voiture.retour > 0) { c[s] = null; raison = 'circulation-melee'; continue; }
        c[s] = Math.round(n * sat.valeur * (aFeux(s) ? lambda : 1));
      }
      capacite = {
        ...c, total: somme(c.aller, c.retour), raison,
        methode: osm && mode === 'voiture' ? 'voies-osm' : 'voies', source: sat.source, confiance: osm && mode === 'voiture' ? 'faible' : sat.confiance,
        feux: SENS.filter(aFeux),
      };
    }
    // ── Saturation : par sens si la demande l'est, sinon les deux sens ensemble ──
    const ratio = (d, c) => (nombre(d) && nombre(c) ? (c > 0 ? d / c : d > 0 ? Infinity : 0) : null);
    const saturation = mode === 'pieton' || (demande.aller === null && demande.retour === null)
      ? { aller: null, retour: null, total: ratio(demande.total, capacite.total) }
      : { aller: ratio(demande.aller, capacite.aller), retour: ratio(demande.retour, capacite.retour), total: null };
    const xs = [saturation.aller, saturation.retour, saturation.total].filter(x => x !== null);
    // ── Personnes : demande et débit écoulé (borné par la capacité) ──
    const occ = occupation[mode];
    const ecoule = (d, c) => (!nombre(d) ? null : mode === 'bus' ? d : nombre(c) ? Math.min(d, c) : null);
    const parSens = mode !== 'pieton' && (demande.aller !== null || demande.retour !== null);
    const vehDemande = demande.total ?? somme(demande.aller ?? 0, demande.retour ?? 0);
    const vehEcoule = parSens
      ? (() => { const a = demande.aller === null ? 0 : ecoule(demande.aller, capacite.aller), r = demande.retour === null ? 0 : ecoule(demande.retour, capacite.retour); return somme(a, r); })()
      : ecoule(demande.total, capacite.total);
    const renseigne = demande.origine !== null;
    const personnes = {
      demande: renseigne && nombre(occ) ? Math.round(vehDemande * occ) : null,
      transportees: renseigne && nombre(occ) && nombre(vehEcoule) ? Math.round(vehEcoule * occ) : null,
      raison: !renseigne ? 'sans-demande' : !nombre(occ) ? 'occupation-inconnue' : !nombre(vehEcoule) ? capacite.raison ?? 'capacite-inconnue' : null,
    };
    // ── Temps de parcours (s) et délai au carrefour d'aval (s) ──
    const temps = {}, delai = {};
    const vitesse = mode === 'voiture' ? (nombre(segment.sourceAttributes?.speedLimit) ? segment.sourceAttributes.speedLimit / 3.6 : null)
      : mode === 'cyclable' ? (nombre(ctx.vitesseVeloKmh) ? ctx.vitesseVeloKmh / 3.6 : null)
        : mode === 'pieton' ? R.marche.valeur : null;
    const raisonDelai = {};
    for (const s of mode === 'pieton' ? ['total'] : SENS) {
      const x = saturation[s] ?? saturation.total; // null : sans demande connue, le temps à vide
      const t0 = vitesse ? L / vitesse : null;
      const ferme = mode !== 'pieton' && capacite[s] === 0; // aucune voie de ce mode dans ce sens
      temps[s] = t0 === null || ferme ? null : Math.round(mode === 'pieton' ? t0 : tempsBpr(t0, x, R.bpr));
      delai[s] = mode === 'pieton' || mode === 'bus' || ferme || !aFeux(s) ? null : Math.round(delaiWebster(x, R.feux));
      if (mode !== 'pieton') {
        const reg = ctx.regulation?.[s] ?? null;
        raisonDelai[s] = delai[s] !== null ? null : mode === 'bus' ? 'bus-non-modelise' : ferme ? 'aucune-voie' : reg === null ? 'regulation-inconnue' : 'regulation-non-modelisee';
      }
    }
    modes[mode] = {
      demande, capacite, saturation, saturationMax: xs.length ? Math.max(...xs) : null, personnes, temps, delai,
      raisonTemps: vitesse ? null : mode === 'bus' ? 'bus-non-modelise' : 'vitesse-inconnue', raisonDelai,
    };
  }
  const vals = MODES_DEMANDE.map(m => modes[m]);
  const renseignes = vals.filter(m => m.demande.origine !== null);
  const xs = vals.map(m => m.saturationMax).filter(x => x !== null);
  // Personnes du tronçon : seulement si tous les modes renseignés le sont en personnes (sinon la somme mentirait)
  const total = cle => (renseignes.length && renseignes.every(m => nombre(m.personnes[cle])) ? renseignes.reduce((a, m) => a + m.personnes[cle], 0) : null);
  return {
    troncon: segment.id, modes,
    personnes: { demande: total('demande'), transportees: total('transportees'), modes: renseignes.length },
    saturationMax: xs.length ? Math.max(...xs) : null,
    renseigne: renseignes.length > 0,
  };
}

/** Niveau de saturation pour la carte : 'fluide', 'proche', 'sature' ou null (inconnu). */
export const niveau = x => (x === null || x === undefined ? null : x >= SEUILS.sature ? 'sature' : x >= SEUILS.proche ? 'proche' : 'fluide');

/** Le bilan du corridor : tronçons renseignés, saturés, proches de la saturation, sans capacité connue. */
export function bilan(etats) {
  const b = { renseignes: 0, satures: 0, proches: 0, inconnus: 0 };
  for (const e of etats) {
    if (!e.renseigne) continue;
    b.renseignes++;
    const n = niveau(e.saturationMax);
    if (n === 'sature') b.satures++; else if (n === 'proche') b.proches++; else if (n === null) b.inconnus++;
  }
  return b;
}

// ─── Exposition aux conflits d'un carrefour ───────────────────────────────
const famille = mode => (mode === 'cyclable' ? 'velo' : 'motorise');
const paire = (a, b) => [a, b].sort().join('×');
function croisent(l1, l2) {
  for (let i = 0; i + 1 < l1.length; i++) for (let j = 0; j + 1 < l2.length; j++) if (segmentsSeCroisent(l1[i], l1[i + 1], l2[j], l2[j + 1])) return true;
  return false;
}

/**
 * Les points de conflit d'un carrefour, par paire de modes.
 * geometrie : js/geo/raccords.js (geometrieCarrefour) ; voies : Map(id → voie) (js/carrefour.js).
 * Deux raccords se croisent s'ils ne partagent ni voie d'entrée ni voie de sortie et que leurs
 * courbes se coupent ; une traversée (piéton, vélo) est croisée par chaque raccord qui entre
 * dans sa branche ou en sort. → { paires: { 'motorise×velo': n, … }, total }
 */
export function conflits(geometrie, voies) {
  const paires = {};
  const ajouter = k => { paires[k] = (paires[k] ?? 0) + 1; };
  const r = geometrie.raccords.map(x => ({ ...x, a: voies.get(x.de), b: voies.get(x.vers) })).filter(x => x.a && x.b);
  for (let i = 0; i < r.length; i++) {
    for (let j = i + 1; j < r.length; j++) {
      const p = r[i], q = r[j];
      if (p.de === q.de || p.vers === q.vers) continue;
      if (croisent(p.ligne, q.ligne)) ajouter(paire(famille(p.a.mode), famille(q.a.mode)));
    }
  }
  for (const tr of geometrie.traversees) {
    const qui = tr.type === 'pieton' ? 'pieton' : 'velo';
    for (const x of r) {
      if (x.a.troncon !== tr.troncon && x.b.troncon !== tr.troncon) continue;
      if (qui === 'velo' && x.a.mode === 'cyclable') continue; // le vélo qui suit sa propre traversée
      ajouter(paire(qui, famille(x.a.mode)));
    }
  }
  return { paires, total: Object.values(paires).reduce((a, b) => a + b, 0) };
}

// ─── Opérations du joueur sur la demande et les hypothèses ────────────────
// Elles rendent { demande } (null : rien à garder pour ce tronçon) ou { refus, valeurs }.
const refus = (r, valeurs = {}) => ({ refus: r, valeurs });
const propre = d => {
  const out = {};
  for (const [mode, v] of Object.entries(d ?? {})) {
    const w = Object.fromEntries(Object.entries(v).filter(([, x]) => nombre(x)));
    if (Object.keys(w).length) out[mode] = w;
  }
  return Object.keys(out).length ? out : null;
};

/** Fixe la demande d'un mode dans un sens ('aller', 'retour', ou 'total' pour le piéton) ; null l'efface. */
export function definirDemande(choix, mode, sens, valeur) {
  if (!MODES_DEMANDE.includes(mode)) return refus('mode-demande');
  const sensValides = mode === 'pieton' ? ['total'] : SENS;
  if (!sensValides.includes(sens)) return refus('sens-demande');
  if (valeur !== null && (!nombre(valeur) || valeur < 0 || !Number.isInteger(valeur))) return refus('debit');
  if (valeur !== null && valeur > SAISIE.debitMax) return refus('debit-max', { max: SAISIE.debitMax });
  const d = { ...(choix ?? {}) };
  d[mode] = { ...(d[mode] ?? {}), [sens]: valeur };
  return { demande: propre(d) };
}

/** Fixe une hypothèse d'occupation (personnes par véhicule) ; null l'efface. */
export function definirHypothese(hypotheses, cle, valeur) {
  const max = { occupationVoiture: SAISIE.occupationVoitureMax, occupationBus: SAISIE.occupationBusMax }[cle];
  if (!max) return refus('hypothese');
  if (valeur !== null && (!nombre(valeur) || valeur < SAISIE.occupationMin || valeur > max)) return refus('occupation', { min: SAISIE.occupationMin, max });
  return { hypotheses: { ...(hypotheses ?? {}), [cle]: valeur === null ? null : Math.round(valeur * 10) / 10 } };
}

