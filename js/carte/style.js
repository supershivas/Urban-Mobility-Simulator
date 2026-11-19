// Le style MapLibre de la carte, construit depuis la palette et les réglages.
// Pur (aucun DOM) : testé dans Node. Aucune source distante : pas de fond de
// carte en ligne, pas de glyphes (les noms passent par le DOM, pas par MapLibre).
import { BANDES } from '../data/bandes.js?v=0.7.1';

export const COUCHES = {
  // id de couche activable → couches MapLibre qu'elle commande
  batiments: ['batiments', 'batiments-contour', 'batiments-selection', 'batiments-selection-contour'],
  surfaces: ['surfaces', 'surfaces-contour'],
  rues: ['rues-tunnel', 'rues'],
  intersections: ['noeuds'],
  rails: ['rails-tram', 'rails-train'],
  ouvrages: ['tunnels', 'ponts'],
  stations: ['stations'],
  emprise: ['emprise'],
  // Sections et carrefours modifiés (v0.3, v0.4) : une seule case, les touches 1 à 9 sont prises
  sections: ['sections', 'sections-motif', 'sections-contour', 'sections-sens', 'sections-choisie-cerne', 'sections-choisie',
    'carrefours-zone', 'carrefours-zone-contour', 'carrefours-traversee', 'carrefours-raccord-cerne', 'carrefours-raccord', 'carrefours-raccord-propose', 'carrefours-raccord-sens'],
  // Flux (v0.5) : la saturation des tronçons qui ont une demande (touche 0)
  flux: ['flux-cerne', 'flux', 'flux-inconnu'],
};
export const COUCHES_ACTIVES = { batiments: true, surfaces: true, rues: true, intersections: true, rails: true, ouvrages: false, stations: true, emprise: true, sections: true, flux: true };
export const COUCHES_SELECTIONNABLES = ['rues', 'rues-tunnel'];

// Partagés avec la scène 3D (js/scene/scene3d.js) : mêmes filtres, mêmes teintes dans les deux vues
export const HIERARCHIE_PRINCIPALE = ['H', 'MER', 'MAR'];
export const SURFACE_PIETONNE = ['SW', 'M', 'P', 'G'];
export const SURFACE_SOUTERRAINE = ['MS', 'MT', 'RT', 'RS'];

// Épaisseur proportionnelle au zoom (x2 par niveau au-delà de 15, comme le terrain)
const largeur = px => ['interpolate', ['exponential', 2], ['zoom'], 11, px * 0.4, 15, px, 20, px * 8];
// Même courbe, épaisseur choisie par une condition à chaque palier (MapLibre
// n'admet qu'une seule interpolation sur le zoom par expression).
const largeurSelon = (condition, oui, non) => ['interpolate', ['exponential', 2], ['zoom'],
  ...[[11, 0.4], [15, 1], [20, 8]].flatMap(([z, k]) => [z, ['case', condition, oui * k, non * k]])];

export function styleCarte(P, reglages, base = 'data/') {
  const t = reglages.traits;
  const source = fichier => ({ type: 'geojson', data: `${base}${fichier}`, attribution: '' });
  return {
    version: 8,
    name: 'Plan d\'urbaniste',
    sources: {
      surfaces: source('processed/street-surfaces.geojson'),
      batiments: source('processed/buildings.geojson'),
      rues: source('processed/streets.geojson'),
      noeuds: source('processed/intersections.geojson'),
      infra: source('processed/mobility-infrastructure.geojson'),
      emprise: source('metadata/corridor.geojson'),
      // Les sections modifiées (et celle qu'on édite) : remplies par le jeu, jamais lues sur le réseau
      sections: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      // Le carrefour choisi (zone, raccords) et les traversées posées (v0.4) : remplis par le jeu
      carrefours: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      // Les tronçons qui ont une demande et leur niveau de saturation (v0.5) : remplis par le jeu
      flux: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    },
    layers: [
      { id: 'fond', type: 'background', paint: { 'background-color': P.papier } },
      {
        id: 'surfaces', type: 'fill', source: 'surfaces',
        filter: ['all', ['>=', ['get', 'niveau'], 0], ['!', ['in', ['get', 'type'], ['literal', SURFACE_SOUTERRAINE]]]],
        paint: { 'fill-color': ['case', ['in', ['get', 'type'], ['literal', SURFACE_PIETONNE]], P.trottoir, P.voirie] },
      },
      {
        id: 'surfaces-contour', type: 'line', source: 'surfaces', minzoom: 16,
        filter: ['all', ['>=', ['get', 'niveau'], 0], ['!', ['in', ['get', 'type'], ['literal', SURFACE_SOUTERRAINE]]]],
        paint: { 'line-color': P.bord, 'line-width': 0.5 },
      },
      { id: 'batiments', type: 'fill', source: 'batiments', paint: { 'fill-color': P.bati } },
      { id: 'batiments-contour', type: 'line', source: 'batiments', minzoom: 15, paint: { 'line-color': P.bord, 'line-width': 0.5 } },
      // Bâtiment choisi : plein en couleur de sélection, cerné d'encre (même signe que dans la vue 3D)
      { id: 'batiments-selection', type: 'fill', source: 'batiments', filter: ['==', ['get', 'id'], ''], paint: { 'fill-color': P.selection } },
      { id: 'batiments-selection-contour', type: 'line', source: 'batiments', filter: ['==', ['get', 'id'], ''], paint: { 'line-color': P.encre, 'line-width': 1.5 } },
      {
        id: 'tunnels', type: 'line', source: 'infra', filter: ['==', ['get', 'famille'], 'tunnel'],
        paint: { 'line-color': P.encre, 'line-width': 1, 'line-dasharray': [2, 2] },
      },
      { id: 'ponts', type: 'line', source: 'infra', filter: ['==', ['get', 'famille'], 'pont'], paint: { 'line-color': P.encre, 'line-width': 2 } },
      {
        id: 'rails-train', type: 'line', source: 'infra', filter: ['all', ['==', ['get', 'famille'], 'rail'], ['==', ['get', 'type'], 'RW']],
        paint: { 'line-color': P.noeud, 'line-width': 1.5, 'line-dasharray': [4, 2] },
      },
      {
        id: 'rails-tram', type: 'line', source: 'infra', filter: ['all', ['==', ['get', 'famille'], 'rail'], ['==', ['get', 'type'], 'TW']],
        paint: { 'line-color': P.noeud, 'line-width': 1.2 },
      },
      // Sections transversales : une teinte par type de bande, doublée d'un motif (images faites par carte/motifs.js)
      {
        id: 'sections', type: 'fill', source: 'sections', filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': ['match', ['get', 'type'], ...Object.entries(BANDES).flatMap(([type, b]) => [type, P[b.couleur]]), P.voirie] },
      },
      {
        id: 'sections-motif', type: 'fill', source: 'sections', filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['!=', ['get', 'motif'], '']],
        paint: { 'fill-pattern': ['concat', 'motif-', ['get', 'motif']] },
      },
      {
        id: 'sections-contour', type: 'line', source: 'sections', filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'line-color': P.encre, 'line-width': ['interpolate', ['linear'], ['zoom'], 15, 0.3, 19, 1] },
      },
      // Carrefour (v0.4) : la zone où les voies se raccordent, les traversées (motif), les raccords
      {
        id: 'carrefours-zone', type: 'fill', source: 'carrefours', filter: ['==', ['get', 'genre'], 'zone'],
        paint: { 'fill-color': P.voirie },
      },
      {
        id: 'carrefours-zone-contour', type: 'line', source: 'carrefours', filter: ['==', ['get', 'genre'], 'zone'],
        paint: { 'line-color': P.encre, 'line-width': 1, 'line-dasharray': [3, 2] },
      },
      {
        id: 'carrefours-traversee', type: 'fill', source: 'carrefours', filter: ['==', ['get', 'genre'], 'traversee'],
        paint: { 'fill-pattern': ['concat', 'motif-traversee-', ['get', 'type']] },
      },
      {
        id: 'rues-tunnel', type: 'line', source: 'rues', filter: ['<', ['get', 'niveau'], 0],
        layout: { 'line-cap': 'butt' },
        paint: { 'line-color': P.bord, 'line-width': largeur(t.axeSecondairePx), 'line-dasharray': [2, 1.5] },
      },
      {
        id: 'rues', type: 'line', source: 'rues', filter: ['>=', ['get', 'niveau'], 0],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['case', ['in', ['get', 'hierarchie'], ['literal', HIERARCHIE_PRINCIPALE]], P.encre, P.bord],
          'line-width': largeurSelon(['in', ['get', 'hierarchie'], ['literal', HIERARCHIE_PRINCIPALE]], t.axePrincipalPx, t.axeSecondairePx),
        },
      },
      // Flux (v0.5) : la saturation se lit à la teinte ET à l'épaisseur (fluide < proche < saturé) ;
      // capacité inconnue : tirets « inconnu ». Sous les flèches et la sélection.
      // « Proche » : l'ocre seul ne ressort ni sur le papier ni sur la chaussée (lisibilite.config.mjs) : cerné d'encre
      {
        id: 'flux-cerne', type: 'line', source: 'flux', filter: ['==', ['get', 'niveau'], 'proche'],
        layout: { 'line-cap': 'butt', 'line-join': 'round' },
        paint: { 'line-color': P.encre, 'line-width': t.fluxProchePx + 3 },
      },
      {
        id: 'flux', type: 'line', source: 'flux', filter: ['!=', ['get', 'niveau'], 'inconnu'],
        layout: { 'line-cap': 'butt', 'line-join': 'round' },
        paint: {
          'line-color': ['match', ['get', 'niveau'], 'sature', P.encre, 'proche', P.bus, P.noeud],
          'line-width': ['match', ['get', 'niveau'], 'sature', t.fluxSaturePx, 'proche', t.fluxProchePx, t.fluxFluidePx],
        },
      },
      {
        id: 'flux-inconnu', type: 'line', source: 'flux', filter: ['==', ['get', 'niveau'], 'inconnu'],
        paint: { 'line-color': P.inconnu, 'line-width': t.fluxFluidePx, 'line-dasharray': [1.5, 1] },
      },
      // Le sens des bandes de circulation : des flèches (images, pas de glyphes) le long de la ligne médiane
      {
        id: 'sections-sens', type: 'symbol', source: 'sections', minzoom: 16, filter: ['==', ['geometry-type'], 'LineString'],
        layout: {
          'symbol-placement': 'line', 'symbol-spacing': 80, 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true,
          'icon-image': ['case', ['==', ['get', 'sens'], 'double'], 'fleche-double', 'fleche'],
          'icon-size': ['interpolate', ['exponential', 2], ['zoom'], 16, 0.35, 20, 1],
        },
      },
      // Bande choisie : trait de sélection sur un cerne d'encre (la sélection seule ne ressort pas sur la piste ni le bus)
      {
        id: 'sections-choisie-cerne', type: 'line', source: 'sections', filter: ['==', ['get', 'id'], ''],
        paint: { 'line-color': P.encre, 'line-width': 5 },
      },
      {
        id: 'sections-choisie', type: 'line', source: 'sections', filter: ['==', ['get', 'id'], ''],
        paint: { 'line-color': P.selection, 'line-width': 2.5 },
      },
      // Raccords : proposés en tirets (à revoir), choisis par le joueur en trait plein ; ceux de la voie choisie en sélection cernée
      {
        id: 'carrefours-raccord-cerne', type: 'line', source: 'carrefours', filter: ['all', ['==', ['get', 'genre'], 'raccord'], ['get', 'choisi']],
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': P.encre, 'line-width': 6 },
      },
      // (deux couches : le tireté ne dépend pas d'une propriété dans toutes les versions de MapLibre)
      {
        id: 'carrefours-raccord', type: 'line', source: 'carrefours', filter: ['all', ['==', ['get', 'genre'], 'raccord'], ['!=', ['get', 'origine'], 'propose']],
        paint: { 'line-color': ['case', ['get', 'choisi'], P.selection, P.noeud], 'line-width': ['case', ['get', 'choisi'], 3, 1.5] },
      },
      {
        id: 'carrefours-raccord-propose', type: 'line', source: 'carrefours', filter: ['all', ['==', ['get', 'genre'], 'raccord'], ['==', ['get', 'origine'], 'propose']],
        paint: { 'line-color': ['case', ['get', 'choisi'], P.selection, P.noeud], 'line-width': ['case', ['get', 'choisi'], 3, 1.5], 'line-dasharray': [2, 1.5] },
      },
      {
        id: 'carrefours-raccord-sens', type: 'symbol', source: 'carrefours', minzoom: 17, filter: ['all', ['==', ['get', 'genre'], 'raccord'], ['get', 'choisi']],
        layout: { 'symbol-placement': 'line-center', 'icon-image': 'fleche', 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-size': 0.6 },
      },
      {
        id: 'noeuds', type: 'circle', source: 'noeuds', minzoom: 14,
        paint: { 'circle-color': P.noeud, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, t.noeudRayonPx * 0.6, 18, t.noeudRayonPx * 2] },
      },
      {
        id: 'rues-selection', type: 'line', source: 'rues', filter: ['==', ['get', 'id'], ''],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': P.selection, 'line-width': ['interpolate', ['exponential', 2], ['zoom'], 11, t.selectionPx * 0.6, 15, t.selectionPx, 20, t.selectionPx * 6] },
      },
      {
        id: 'noeuds-selection', type: 'circle', source: 'noeuds', filter: ['in', ['get', 'id'], ['literal', []]],
        paint: { 'circle-color': P.voirie, 'circle-stroke-color': P.selection, 'circle-stroke-width': 3, 'circle-radius': 6 },
      },
      {
        id: 'stations', type: 'circle', source: 'infra', filter: ['==', ['get', 'famille'], 'station'],
        paint: { 'circle-color': P.encre, 'circle-radius': 7, 'circle-stroke-color': P.voirie, 'circle-stroke-width': 2 },
      },
      { id: 'emprise', type: 'line', source: 'emprise', paint: { 'line-color': P.encre, 'line-width': 1.5, 'line-dasharray': [6, 3] } },
    ],
  };
}

/** Les couleurs littérales d'un style (pour vérifier qu'il reste dans la palette). */
export function couleursDuStyle(style) {
  const out = new Set();
  const marcher = v => {
    if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) out.add(v.toUpperCase());
    else if (Array.isArray(v)) v.forEach(marcher);
    else if (v && typeof v === 'object') Object.values(v).forEach(marcher);
  };
  style.layers.forEach(l => marcher(l.paint));
  return out;
}
