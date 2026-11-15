// Les carrefours sur la carte (v0.4) : zone, traversées et raccords, convertis
// depuis la géométrie partagée avec la vue 3D (js/geo/raccords.js). Pur : la
// projection est passée en argument (proj4 dans le jeu). Testé.

/**
 * entrees : [{ noeud, geometrie (geometrieCarrefour, en mètres), complet (zone et raccords dessinés : le carrefour choisi) }]
 * voie : la voie entrante choisie (ses raccords sont mis en évidence) ; versLonLat : projection.
 * → FeatureCollection : Polygon { genre: 'zone' | 'traversee', type? } ; LineString { genre: 'raccord', id: "de>vers", de, vers, origine, choisi }.
 */
export function featuresCarrefours(entrees, voie, versLonLat) {
  const ll = l => l.map(p => versLonLat(p));
  const features = [];
  for (const { noeud, geometrie: g, complet } of entrees) {
    if (complet && g.zone) features.push({ type: 'Feature', properties: { genre: 'zone', noeud }, geometry: { type: 'Polygon', coordinates: [ll(g.zone)] } });
    for (const tr of g.traversees) {
      features.push({ type: 'Feature', properties: { genre: 'traversee', noeud, type: tr.type, troncon: tr.troncon, id: `${noeud}:${tr.troncon}:${tr.type}` }, geometry: { type: 'Polygon', coordinates: [ll(tr.anneau)] } });
    }
    if (!complet) continue;
    for (const r of g.raccords) {
      features.push({
        type: 'Feature',
        properties: { genre: 'raccord', noeud, id: `${r.de}>${r.vers}`, de: r.de, vers: r.vers, origine: r.origine, choisi: r.de === voie },
        geometry: { type: 'LineString', coordinates: ll(r.ligne) },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}
