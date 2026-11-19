// Contrôles topologiques du réseau (pitch §9.4). Purs, en mètres (Lambert 72).
// Ils RAPPORTENT les anomalies ; ils ne corrigent rien et ne fusionnent rien.
import { distance, longueur, segmentsSeCroisent } from './geometrie.js?v=0.9.0';

export const TOLERANCE_NOEUD = 0.5; // m : écart admis entre une extrémité d'axe et son nœud

/**
 * segments : [{ id, fromNode, toNode, ligne, niveau, typeCode }]
 * noeuds   : [{ id, position, niveau }]
 * → { anomalies: [{ type, ids, detail }], degres: Map(noeudId → n), croisementsDenivele: n }
 */
export function controler(segments, noeuds) {
  const anomalies = [];
  const parId = new Map(noeuds.map(n => [n.id, n]));
  const degres = new Map(noeuds.map(n => [n.id, 0]));
  const ids = new Set();

  for (const s of segments) {
    if (ids.has(s.id)) anomalies.push({ type: 'identifiant-double', ids: [s.id] });
    ids.add(s.id);
    if (longueur(s.ligne) < 0.01) anomalies.push({ type: 'longueur-nulle', ids: [s.id] });
    for (const [cle, bout] of [['fromNode', s.ligne[0]], ['toNode', s.ligne[s.ligne.length - 1]]]) {
      const n = parId.get(s[cle]);
      if (!s[cle]) { anomalies.push({ type: 'noeud-absent-source', ids: [s.id], detail: cle }); continue; }
      if (!n) { anomalies.push({ type: 'noeud-introuvable', ids: [s.id, s[cle]], detail: cle }); continue; }
      degres.set(n.id, degres.get(n.id) + 1);
      const d = distance(bout, n.position);
      if (d > TOLERANCE_NOEUD) anomalies.push({ type: 'extremite-eloignee-du-noeud', ids: [s.id, n.id], detail: `${d.toFixed(2)} m` });
    }
  }
  for (const [id, d] of degres) if (d === 0) anomalies.push({ type: 'noeud-isole', ids: [id] });

  // Deux axes de même tracé (dans un sens ou l'autre) : doublon probable dans la source
  const traces = new Map();
  for (const s of segments) {
    const cle = JSON.stringify(s.ligne), inverse = JSON.stringify([...s.ligne].reverse());
    const deja = traces.get(cle) ?? traces.get(inverse);
    if (deja) anomalies.push({ type: 'geometrie-dupliquee', ids: [deja, s.id] });
    else traces.set(cle, s.id);
  }

  // Croisements géométriques sans nœud commun : un croisement en plan n'est pas
  // forcément une intersection (ponts, tunnels). Niveaux différents → dénivelé attendu.
  const croisements = croisementsSansNoeud(segments);
  let croisementsDenivele = 0;
  for (const [a, b] of croisements) {
    if (a.niveau !== b.niveau) croisementsDenivele++;
    else anomalies.push({ type: 'croisement-sans-noeud', ids: [a.id, b.id], detail: `niveau ${a.niveau}` });
  }
  return { anomalies, degres, croisementsDenivele };
}

export function croisementsSansNoeud(segments, cellule = 50) {
  const grille = new Map();
  const morceaux = [];
  for (const s of segments) for (let i = 1; i < s.ligne.length; i++) {
    const m = { s, a: s.ligne[i - 1], b: s.ligne[i] };
    const idx = morceaux.push(m) - 1;
    const x0 = Math.floor(Math.min(m.a[0], m.b[0]) / cellule), x1 = Math.floor(Math.max(m.a[0], m.b[0]) / cellule);
    const y0 = Math.floor(Math.min(m.a[1], m.b[1]) / cellule), y1 = Math.floor(Math.max(m.a[1], m.b[1]) / cellule);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const k = `${x},${y}`;
      if (!grille.has(k)) grille.set(k, []);
      grille.get(k).push(idx);
    }
  }
  const vus = new Set(), paires = [];
  for (const liste of grille.values()) for (let i = 0; i < liste.length; i++) for (let j = i + 1; j < liste.length; j++) {
    const p = morceaux[liste[i]], q = morceaux[liste[j]];
    if (p.s === q.s) continue;
    const cle = p.s.id < q.s.id ? `${p.s.id}|${q.s.id}` : `${q.s.id}|${p.s.id}`;
    if (vus.has(cle)) continue;
    const partagent = [p.s.fromNode, p.s.toNode].some(n => n && (n === q.s.fromNode || n === q.s.toNode));
    if (partagent) continue;
    if (segmentsSeCroisent(p.a, p.b, q.a, q.b)) { vus.add(cle); paires.push(p.s.id < q.s.id ? [p.s, q.s] : [q.s, p.s]); }
  }
  return paires;
}
