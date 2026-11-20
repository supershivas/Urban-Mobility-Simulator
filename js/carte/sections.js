// Les sections transversales sur la carte : un polygone par bande, une ligne
// médiane par bande de circulation (le sens), construits depuis le même modèle
// (js/section.js) et les mêmes bords (js/geo/decalage.js) que la vue 3D.
// Pur : les projections sont passées en argument (proj4 dans le jeu). Testé.
import { decalages } from '../section.js?v=0.9.6';
import { decalerLigne, contourBande } from '../geo/decalage.js?v=0.9.6';
import { BANDES } from '../data/bandes.js?v=0.9.6';

/**
 * entrees : [{ ligne (WGS84 [lon, lat]), section }] ; versMetres / versLonLat : projections.
 * → FeatureCollection : Polygon par bande (properties { id, troncon, bande, type, motif, gauche, droite }),
 *   LineString par bande à sens (properties { id, troncon, bande, sens }), orientée dans le sens de circulation.
 */
export function featuresSections(entrees, versMetres, versLonLat) {
  const features = [];
  const lonLat = l => l.map(p => versLonLat(p));
  for (const { ligne, section } of entrees) {
    const metres = ligne.map(versMetres);
    for (const b of decalages(section)) {
      const id = `${section.troncon}:${b.id}`;
      features.push({
        type: 'Feature',
        properties: { id, troncon: section.troncon, bande: b.id, type: b.type, motif: BANDES[b.type]?.motif ?? '', gauche: b.gauche, droite: b.droite },
        geometry: { type: 'Polygon', coordinates: [lonLat(contourBande(metres, b.gauche, b.droite))] },
      });
      if (b.sens) {
        const milieu = decalerLigne(metres, (b.gauche + b.droite) / 2);
        features.push({
          type: 'Feature',
          properties: { id: `${id}:sens`, troncon: section.troncon, bande: b.id, sens: b.sens },
          geometry: { type: 'LineString', coordinates: lonLat(b.sens === 'retour' ? milieu.reverse() : milieu) },
        });
      }
    }
  }
  return { type: 'FeatureCollection', features };
}
