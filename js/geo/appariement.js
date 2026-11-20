// Appariement géométrique d'un tronçon UrbIS avec les chemins OSM (complément).
// Pur, en mètres (Lambert 72). Le résultat est une ESTIMATION : il porte sa
// méthode et sa confiance, et n'invente jamais une valeur absente d'OSM
// (pilier 6 : sens, voies, vitesse restent null si OSM ne les donne pas).
import { distancePointLigne, pointA, cap, ecartAngle } from './geometrie.js?v=0.9.9';

export const REGLES_APPARIEMENT = {
  echantillons: [0.2, 0.5, 0.8], // points du tronçon UrbIS testés
  distanceMax: 7,                 // m : écart toléré entre l'axe UrbIS et le chemin OSM
  angleMax: (25 * Math.PI) / 180, // écart de direction toléré (dans un sens ou l'autre)
  cellule: 100,                   // m : taille de la grille d'index
};

// Chemins OSM qui portent une chaussée (les trottoirs, sentiers et pistes séparées
// sont parallèles aux rues : ils fausseraient sens et voies).
export const HIGHWAY_CHAUSSEE = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified',
  'residential', 'living_street', 'service', 'pedestrian', 'busway', 'road',
  'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link']);

/** Index en grille des chemins OSM : [{ id, ligne (Lambert), tags }]. */
export function indexer(chemins, cellule = REGLES_APPARIEMENT.cellule) {
  const grille = new Map();
  for (const c of chemins) {
    const vus = new Set();
    for (const [x, y] of c.ligne) {
      const k = `${Math.floor(x / cellule)},${Math.floor(y / cellule)}`;
      if (vus.has(k)) continue;
      vus.add(k);
      if (!grille.has(k)) grille.set(k, []);
      grille.get(k).push(c);
    }
  }
  return { grille, cellule };
}

function voisins(index, p) {
  const cx = Math.floor(p[0] / index.cellule), cy = Math.floor(p[1] / index.cellule);
  const out = new Set();
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const c of index.grille.get(`${cx + dx},${cy + dy}`) || []) out.add(c);
  return out;
}

/** Sens de circulation lu dans les tags OSM, ramené au sens du tronçon UrbIS. */
export function lireSens(tags, memeDirection) {
  const o = tags.oneway;
  if (o === 'yes' || o === '1' || o === 'true') return memeDirection ? 'unique-direct' : 'unique-inverse';
  if (o === '-1' || o === 'reverse') return memeDirection ? 'unique-inverse' : 'unique-direct';
  if (o === 'no') return 'double';
  return null; // absent ou valeur non reconnue : non renseigné, jamais déduit
}

const entier = v => (v !== undefined && /^\d+$/.test(v) ? Number(v) : null);

/** Attributs retenus d'un chemin OSM, sans déduction. */
export function attributsOsm(tags, memeDirection) {
  return {
    sens: lireSens(tags, memeDirection),
    voies: entier(tags.lanes),
    voiesTexte: tags.lanes !== undefined && entier(tags.lanes) === null ? tags.lanes : null,
    vitesseKmh: entier(tags.maxspeed),
    vitesseTexte: tags.maxspeed !== undefined && entier(tags.maxspeed) === null ? tags.maxspeed : null,
  };
}

const CLES_COMPAREES = ['oneway', 'lanes', 'maxspeed'];
const memesTags = (a, b) => CLES_COMPAREES.every(k => a.tags[k] === b.tags[k]);

/**
 * Apparie une ligne UrbIS (Lambert) avec l'index OSM.
 * → null (aucun candidat) ou { confiance: 'moyenne'|'ambigue', osmIds, distanceMoyenne, memeDirection, attributs, tags }
 */
export function apparier(ligne, index, regles = REGLES_APPARIEMENT) {
  const points = regles.echantillons.map(t => pointA(ligne, t));
  const candidats = new Set();
  for (const p of points) for (const c of voisins(index, p)) candidats.add(c);
  const retenus = [];
  for (const c of candidats) {
    let somme = 0, ok = true, memeDir = 0;
    for (const p of points) {
      const { distance, segment } = distancePointLigne(p, c.ligne);
      if (distance > regles.distanceMax) { ok = false; break; }
      somme += distance;
      const { segment: su } = distancePointLigne(p, ligne);
      const e = ecartAngle(cap(ligne, su), cap(c.ligne, segment));
      if (e <= regles.angleMax) memeDir++;
      else if (Math.PI - e <= regles.angleMax) memeDir--;
      else { ok = false; break; }
    }
    if (ok) retenus.push({ c, distanceMoyenne: somme / points.length, memeDirection: memeDir > 0 });
  }
  if (!retenus.length) return null;
  retenus.sort((a, b) => a.distanceMoyenne - b.distanceMoyenne);
  const meilleur = retenus[0];
  const coherent = retenus.every(r => memesTags(r.c, meilleur.c));
  const tags = Object.fromEntries(Object.entries(meilleur.c.tags).filter(([k]) =>
    /^(highway|name|oneway|lanes|maxspeed|cycleway|busway|sidewalk|junction|surface|lanes:.*|cycleway:.*|busway:.*|sidewalk:.*|oneway:.*)$/.test(k)));
  return {
    confiance: coherent ? 'moyenne' : 'ambigue',
    osmIds: retenus.map(r => r.c.id),
    distanceMoyenne: Math.round(meilleur.distanceMoyenne * 10) / 10,
    memeDirection: meilleur.memeDirection,
    // Candidats aux tags contradictoires : on n'en retient aucun (pas de valeur choisie au hasard).
    attributs: coherent ? attributsOsm(meilleur.c.tags, meilleur.memeDirection) : attributsOsm({}, true),
    tags: coherent ? tags : {},
  };
}
