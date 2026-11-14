// L'emprise du corridor, calculée à partir des stations UrbIS et de data/corridor.json.
// Partagée par le téléchargement et la construction : même entrée, même polygone.
import buffer from '@turf/buffer';
import { lambertVersWgs84, wgs84VersLambert } from '../../js/geo/coordonnees.js';

/** stations : features GeoJSON (Lambert 72) des Points d'intérêt TYPE = TS. */
export function calculerEmprise(corridor, stations) {
  const parNom = new Map(stations.map(f => [f.properties.NAMEFRE, f]));
  const station = nom => {
    const f = parNom.get(nom);
    if (!f) throw new Error(`Station introuvable dans UrbIS : ${nom}`);
    return f;
  };
  const ligne = corridor.ligne.map(n => lambertVersWgs84(station(n).geometry.coordinates));
  // Une ancre isolée devient un segment de 1 m : le tampon d'une MultiLineString
  // est calculé en une seule géométrie (pas de polygones superposés).
  const ancres = corridor.ancresSupplementaires.map(n => {
    const [x, y] = station(n).geometry.coordinates;
    return [lambertVersWgs84([x, y]), lambertVersWgs84([x + 1, y])];
  });
  const geom = { type: 'MultiLineString', coordinates: [ligne, ...ancres] };
  // @turf/buffer : tampon géodésique (projection azimutale locale) ; 16 pas par quart de cercle.
  const poly = buffer({ type: 'Feature', properties: {}, geometry: geom }, corridor.tamponMetres, { units: 'meters', steps: 16 });
  if (poly.geometry.type !== 'Polygon') throw new Error(`Emprise attendue en un seul polygone, obtenue : ${poly.geometry.type}`);
  const wgs84 = poly.geometry.coordinates[0];
  return {
    wgs84,                                   // anneau extérieur [lon, lat]
    lambert: wgs84.map(p => wgs84VersLambert(p)), // même anneau en Lambert 72
    stations: [...corridor.ligne, ...corridor.ancresSupplementaires].map(n => station(n)),
  };
}
