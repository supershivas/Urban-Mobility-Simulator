// Conversions de coordonnées : jamais réimplémentées à la main (pitch §8.4),
// toujours par proj4js. Travail métrique en EPSG:31370 (Belgian Lambert 72),
// affichage en WGS84 longitude/latitude (RFC 7946).
// Ce module sert au jeu, au pipeline de données (outils/donnees/) et aux tests.
import proj4 from '../../vendor/proj4/proj4.mjs?v=0.9.5';

// Définition publiée par epsg.io/31370 (transformation BD72 → WGS84 à 7 paramètres).
// Vérifiée contre la reprojection du serveur UrbIS (test/coordonnees.test.mjs).
export const LAMBERT72 = 'EPSG:31370';
export const WGS84 = 'EPSG:4326';
proj4.defs(LAMBERT72, '+proj=lcc +lat_0=90 +lon_0=4.36748666666667 +lat_1=51.1666672333333 +lat_2=49.8333339 '
  + '+x_0=150000.013 +y_0=5400088.438 +ellps=intl '
  + '+towgs84=-106.8686,52.2978,-103.7239,0.3366,-0.457,1.8422,-1.2747 +units=m +no_defs +type=crs');

const versWgs = proj4(LAMBERT72, WGS84);

/** [x, y] Lambert 72 (m) → [lon, lat] WGS84 (degrés). */
export const lambertVersWgs84 = ([x, y]) => versWgs.forward([x, y]);
/** [lon, lat] WGS84 → [x, y] Lambert 72. */
export const wgs84VersLambert = ([lon, lat]) => versWgs.inverse([lon, lat]);

/** Arrondit une position (le GeoJSON n'a pas besoin de plus que le centimètre). */
export const arrondir = (p, decimales) => p.map(v => Math.round(v * 10 ** decimales) / 10 ** decimales);

/** Applique f à chaque position d'une géométrie GeoJSON (Point → MultiPolygon). */
export function convertirGeometrie(g, f) {
  const prof = { Point: 0, MultiPoint: 1, LineString: 1, MultiLineString: 2, Polygon: 2, MultiPolygon: 3 }[g.type];
  if (prof === undefined) throw new Error(`Géométrie non prise en charge : ${g.type}`);
  const marcher = (c, n) => (n === 0 ? f(c) : c.map(x => marcher(x, n - 1)));
  return { type: g.type, coordinates: marcher(g.coordinates, prof) };
}
