// Les GeoJSON du corridor, lus une seule fois et seulement quand on en a besoin
// (vue 3D, inspecteur d'un bâtiment). La carte MapLibre charge les mêmes
// fichiers de son côté, par leur adresse : un seul jeu de données, deux lecteurs.
const memo = new Map();

export async function lireJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} : HTTP ${r.status}`);
  return r.json();
}

const FICHIERS = {
  batiments: 'data/processed/buildings.geojson',
  surfaces: 'data/processed/street-surfaces.geojson',
  rues: 'data/processed/streets.geojson',
  noeuds: 'data/processed/intersections.geojson',
  infra: 'data/processed/mobility-infrastructure.geojson',
};

/** La couche demandée (promesse mémorisée). */
export function couche(nom) {
  if (!memo.has(nom)) memo.set(nom, lireJSON(FICHIERS[nom]));
  return memo.get(nom);
}

/** Toutes les couches de la scène 3D : { batiments, surfaces, rues, noeuds, infra }. */
export async function couchesScene() {
  const noms = Object.keys(FICHIERS);
  const lues = await Promise.all(noms.map(couche));
  return Object.fromEntries(noms.map((n, i) => [n, lues[i]]));
}
