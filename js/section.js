// La section transversale d'un tronçon : des bandes ordonnées de gauche à droite
// (gauche = côté gauche quand on suit l'axe UrbIS du nœud de départ au nœud
// d'arrivée), dans une emprise fixe mesurée sur les surfaces UrbIS.
// Pur, testé (test/section.test.mjs). Les opérations ne modifient jamais leur
// argument : elles rendent { section } ou { refus, valeurs } (section 12 : un
// ordre impossible se refuse à voix haute ; le texte est « refus.<refus> »).
//
// Règle centrale (pilier 2) : la somme des largeurs ne dépasse jamais l'emprise.
// Le reste éventuel est de l'espace « libre », dessiné après la dernière bande.
// Les calculs se font en décimètres entiers : aucune somme flottante ne dérive.
import { BANDES, BANDE_DEPUIS_SURFACE, LARGEURS } from './data/bandes.js?v=0.4.0';

export const dm = m => Math.round(m * 10);
const m = d => d / 10;
const MIN = dm(LARGEURS.min);

/** La section de départ d'un tronçon : les bandes mesurées, ou null si l'emprise n'est pas connue. */
export function sectionMesuree(segment) {
  const e = segment?.emprise;
  if (!e) return null;
  const bandes = e.bandes.map((b, i) => ({ id: `b${i + 1}`, type: BANDE_DEPUIS_SURFACE[b.type] ?? 'chaussee', largeur: b.largeur, sens: null }));
  // Deux surfaces voisines qui deviennent le même type de bande n'en font qu'une
  const fondues = [];
  for (const b of bandes) {
    const der = fondues.at(-1);
    if (der && der.type === b.type) der.largeur = m(dm(der.largeur) + dm(b.largeur));
    else fondues.push({ ...b });
  }
  return { troncon: segment.id, emprise: e.largeur, axe: e.axeDepuisGauche, bandes: fondues, prochain: bandes.length + 1 };
}

export const occupe = s => s.bandes.reduce((t, b) => t + dm(b.largeur), 0);
/** Espace libre, en mètres. */
export const libre = s => m(dm(s.emprise) - occupe(s));

const avec = (s, bandes, plus = {}) => ({ section: { ...s, bandes, ...plus } });
const refus = (cle, valeurs = {}) => ({ refus: cle, valeurs });
const dans = (s, i) => Number.isInteger(i) && i >= 0 && i < s.bandes.length;

/**
 * Déplace la limite droite de la bande i de delta mètres (positif : vers la droite).
 * La bande i grandit, sa voisine de droite (ou l'espace libre après la dernière) rétrécit.
 * Le mouvement est borné pour que chacune garde le minimum ; borne : il a été réduit.
 */
export function deplacerLimite(s, i, delta) {
  if (!dans(s, i)) return refus('bande');
  const a = dm(s.bandes[i].largeur);
  const voisine = i + 1 < s.bandes.length ? dm(s.bandes[i + 1].largeur) : null;
  const reste = dm(s.emprise) - occupe(s);
  let d = dm(delta);
  const dMax = voisine === null ? reste : voisine - MIN;
  const dMin = MIN - a;
  const voulu = d;
  d = Math.max(dMin, Math.min(dMax, d));
  if (d === 0) return refus(voulu > 0 ? (voisine === null ? 'emprise' : 'min') : 'min', { min: LARGEURS.min });
  const bandes = s.bandes.map((b, k) => (k === i ? { ...b, largeur: m(a + d) } : k === i + 1 ? { ...b, largeur: m(voisine - d) } : b));
  return { ...avec(s, bandes), borne: d !== voulu };
}

/** Fixe la largeur de la bande i ; l'écart est pris sur l'espace libre (jamais sur une autre bande). */
export function definirLargeur(s, i, largeur) {
  if (!dans(s, i)) return refus('bande');
  const l = dm(largeur);
  if (!Number.isFinite(l) || l < MIN) return refus('min', { min: LARGEURS.min });
  const depasse = occupe(s) - dm(s.bandes[i].largeur) + l - dm(s.emprise);
  if (depasse > 0) return refus('emprise-de', { n: m(depasse) });
  return avec(s, s.bandes.map((b, k) => (k === i ? { ...b, largeur: m(l) } : b)));
}

/** Ajoute une bande du type donné après la bande `apres` (-1 : en tête), prise sur l'espace libre. */
export function ajouter(s, type, apres = s.bandes.length - 1) {
  const def = BANDES[type];
  if (!def?.ajoutable) return refus('type');
  const reste = dm(s.emprise) - occupe(s);
  if (reste < MIN) return refus('plein', { min: LARGEURS.min });
  const largeur = m(Math.min(dm(def.largeurDefaut), reste));
  const bande = { id: `b${s.prochain}`, type, largeur, sens: def.sens ? 'aller' : null };
  const k = Math.max(-1, Math.min(s.bandes.length - 1, apres)) + 1;
  return { ...avec(s, [...s.bandes.slice(0, k), bande, ...s.bandes.slice(k)], { prochain: s.prochain + 1 }), indice: k };
}

/** Retire la bande i : sa largeur redevient de l'espace libre. */
export function retirer(s, i) {
  if (!dans(s, i)) return refus('bande');
  if (s.bandes.length === 1) return refus('derniere');
  return avec(s, s.bandes.filter((_, k) => k !== i));
}

/** Échange la bande i avec sa voisine (dir = -1 : gauche, +1 : droite). */
export function deplacer(s, i, dir) {
  if (!dans(s, i)) return refus('bande');
  const j = i + Math.sign(dir);
  if (!dans(s, j) || j === i) return refus('bord');
  const bandes = [...s.bandes];
  [bandes[i], bandes[j]] = [bandes[j], bandes[i]];
  return { ...avec(s, bandes), indice: j };
}

/** Coupe la bande i en deux bandes du même type (la gauche prend le décimètre impair). */
export function diviser(s, i) {
  if (!dans(s, i)) return refus('bande');
  const l = dm(s.bandes[i].largeur);
  if (l < 2 * MIN) return refus('trop-etroite', { min: m(2 * MIN) });
  const g = Math.ceil(l / 2);
  const b = s.bandes[i];
  const bandes = [...s.bandes.slice(0, i), { ...b, largeur: m(g) }, { ...b, id: `b${s.prochain}`, largeur: m(l - g) }, ...s.bandes.slice(i + 1)];
  return avec(s, bandes, { prochain: s.prochain + 1 });
}

/** Change le type de la bande i (le sens n'existe que pour les bandes de circulation). */
export function changerType(s, i, type) {
  if (!dans(s, i)) return refus('bande');
  const def = BANDES[type];
  if (!def?.ajoutable) return refus('type');
  return avec(s, s.bandes.map((b, k) => (k === i ? { ...b, type, sens: def.sens ? b.sens ?? 'aller' : null } : b)));
}

/** Change le sens de la bande i ('aller', 'retour', 'double'). */
export function changerSens(s, i, sens) {
  if (!dans(s, i)) return refus('bande');
  if (!BANDES[s.bandes[i].type]?.sens) return refus('sans-sens');
  if (!['aller', 'retour', 'double'].includes(sens)) return refus('sens');
  return avec(s, s.bandes.map((b, k) => (k === i ? { ...b, sens } : b)));
}

export const OPERATIONS = { deplacerLimite, definirLargeur, ajouter, retirer, deplacer, diviser, changerType, changerSens };

/** Ce qui ne va pas dans une section ([] si elle respecte toutes les règles). */
export function verifier(s) {
  const pb = [];
  if (occupe(s) > dm(s.emprise)) pb.push({ regle: 'emprise', depasse: m(occupe(s) - dm(s.emprise)) });
  for (const b of s.bandes) if (dm(b.largeur) < MIN) pb.push({ regle: 'min', bande: b.id });
  if (new Set(s.bandes.map(b => b.id)).size !== s.bandes.length) pb.push({ regle: 'ids' });
  return pb;
}

/**
 * Position de chaque bande par rapport à l'axe, en mètres (positif à gauche) :
 * [{ id, type, sens, gauche, droite }], gauche > droite, sans chevauchement.
 */
export function decalages(s) {
  let bord = dm(s.axe);
  return s.bandes.map(b => {
    const g = bord;
    bord -= dm(b.largeur);
    return { id: b.id, type: b.type, sens: b.sens, gauche: m(g), droite: m(bord) };
  });
}

/** Deux sections décrivent-elles la même rue (mêmes bandes, mêmes largeurs, même ordre) ? */
export const memeSection = (a, b) => !!a && !!b && a.bandes.length === b.bandes.length
  && a.bandes.every((x, i) => x.type === b.bandes[i].type && dm(x.largeur) === dm(b.bandes[i].largeur) && x.sens === b.bandes[i].sens);
