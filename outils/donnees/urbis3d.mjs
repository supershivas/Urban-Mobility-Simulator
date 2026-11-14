// UrbIS – Constructions 3D (Paradigm, CC0) : lecture des tuiles Shapefile et
// règle de hauteur des bâtiments. Aucune dépendance : un zip, un .dbf et un
// .shp MultiPatch se lisent en quelques lignes, et seules les étendues
// verticales (Zmin, Zmax) des solides servent.
//
// Spécification : https://urbisdownload.datastore.brussels/UrbIS/TechSpec/3D_TechSpec_FR20240409.pdf
// Chaque solide (BuildingSolids, LoD 2, photogrammétrie) porte l'identifiant du
// bâtiment 2D auquel il est associé (BU_ID) : c'est la même clé que la couche
// Buildings d'UrbIS, donc aucune correspondance géométrique à deviner.

import { inflateRawSync } from 'node:zlib';

/** Les fichiers d'une archive zip : Map(nom → Buffer). Lit le répertoire central. */
export function lireZip(zip) {
  let fin = zip.length - 22;
  while (fin >= 0 && zip.readUInt32LE(fin) !== 0x06054b50) fin--;
  if (fin < 0) throw new Error('Archive zip illisible (fin du répertoire central introuvable)');
  const n = zip.readUInt16LE(fin + 10);
  let o = zip.readUInt32LE(fin + 16);
  const fichiers = new Map();
  for (let i = 0; i < n; i++) {
    if (zip.readUInt32LE(o) !== 0x02014b50) throw new Error('Répertoire central du zip corrompu');
    const methode = zip.readUInt16LE(o + 10), taille = zip.readUInt32LE(o + 20);
    const lNom = zip.readUInt16LE(o + 28), lExtra = zip.readUInt16LE(o + 30), lComm = zip.readUInt16LE(o + 32);
    const local = zip.readUInt32LE(o + 42);
    const nom = zip.toString('utf8', o + 46, o + 46 + lNom);
    const debut = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const brut = zip.subarray(debut, debut + taille);
    if (methode !== 0 && methode !== 8) throw new Error(`${nom} : méthode de compression ${methode} non prise en charge`);
    fichiers.set(nom, () => (methode === 8 ? inflateRawSync(brut) : brut));
    o += 46 + lNom + lExtra + lComm;
  }
  return fichiers;
}

/** Les enregistrements d'un .dbf : [{ CHAMP: 'texte' }] (champs texte et nombres, rendus en texte). */
export function lireDbf(dbf) {
  const n = dbf.readUInt32LE(4), entete = dbf.readUInt16LE(8), longueur = dbf.readUInt16LE(10);
  const champs = [];
  for (let o = 32; dbf[o] !== 0x0d; o += 32) champs.push({ nom: dbf.toString('latin1', o, o + 11).replace(/\0.*$/, ''), taille: dbf[o + 16] });
  const lignes = [];
  for (let i = 0; i < n; i++) {
    let p = entete + i * longueur + 1;
    const ligne = {};
    for (const c of champs) { ligne[c.nom] = dbf.toString('utf8', p, p + c.taille).trim(); p += c.taille; }
    lignes.push(ligne);
  }
  return lignes;
}

/** L'étendue verticale de chaque enregistrement d'un .shp MultiPatch (type 31) : [[zmin, zmax] | null]. */
export function etenduesVerticales(shp) {
  const type = shp.readInt32LE(32);
  if (type !== 31) throw new Error(`Shapefile de type ${type} : MultiPatch (31) attendu`);
  const out = [];
  for (let o = 100; o < shp.length;) {
    const mots = shp.readInt32BE(o + 4);
    if (shp.readInt32LE(o + 8) !== 31) out.push(null); // forme nulle
    else {
      const parties = shp.readInt32LE(o + 44), points = shp.readInt32LE(o + 48);
      const z = o + 52 + 8 * parties + 16 * points; // indices et types des parties, puis les points XY
      out.push([shp.readDoubleLE(z), shp.readDoubleLE(z + 8)]);
    }
    o += 8 + 2 * mots;
  }
  return out;
}

/** Les solides d'une tuile zippée : [{ solide, batiment (URI ou null), zmin, zmax }]. */
export function solidesDeLaTuile(zip) {
  const fichiers = lireZip(zip);
  const nom = ext => [...fichiers.keys()].find(f => f.endsWith(`_BuildingSolids.${ext}`));
  if (!nom('shp') || !nom('dbf')) throw new Error('Tuile sans BuildingSolids');
  const attributs = lireDbf(fichiers.get(nom('dbf'))());
  const z = etenduesVerticales(fichiers.get(nom('shp'))());
  if (attributs.length !== z.length) throw new Error(`BuildingSolids : ${attributs.length} attributs pour ${z.length} formes`);
  return attributs.map((a, i) => (z[i] ? { solide: a.INSPIRE_ID, batiment: a.BU_ID || null, zmin: z[i][0], zmax: z[i][1] } : null)).filter(Boolean);
}

export const METHODE_HAUTEUR = 'Hauteur = altitude du point le plus haut des solides UrbIS 3D (LoD 2) associés au bâtiment par son identifiant (BU_ID), moins l\'altitude de leur point le plus bas (base du solide). Hauteur au faîte, toiture comprise ; arrondie au décimètre.';

/**
 * La hauteur d'un bâtiment d'après ses solides [[zmin, zmax], …].
 * Aucun solide, ou une étendue incohérente : null (jamais une valeur supposée).
 */
export function hauteurDepuisSolides(solides) {
  if (!solides?.length) return null;
  const base = Math.min(...solides.map(s => s[0])), sommet = Math.max(...solides.map(s => s[1]));
  const h = Math.round((sommet - base) * 10) / 10;
  if (!Number.isFinite(h) || h <= 0) return null;
  return { hauteur: h, solides: solides.length };
}
