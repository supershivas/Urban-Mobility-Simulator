// Les maillages de la scène 3D, calculés depuis les MÊMES GeoJSON que la carte
// (mêmes objets, mêmes identifiants), convertis dans le repère local en mètres.
// Pur : des tableaux typés et des tables d'identifiants, aucun objet three.js
// (seule la triangulation des polygones vient de three : ShapeUtils, earcut).
// Testé dans Node (test/scene.test.mjs).
import { ShapeUtils, Vector2 } from '../../vendor/three/three.module.js?v=0.9.7';
import { versScene } from '../geo/repere.js?v=0.9.7';
import { decalerLigne } from '../geo/decalage.js?v=0.9.7';
import { decalages } from '../section.js?v=0.9.7';

/** Les polygones d'une géométrie GeoJSON, en local : [[anneauExtérieur, ...trous]], sans point de fermeture répété. */
export function polygonesLocaux(geometrie, repere) {
  const polys = geometrie.type === 'Polygon' ? [geometrie.coordinates] : geometrie.type === 'MultiPolygon' ? geometrie.coordinates : [];
  return polys.map(anneaux => anneaux.map(a => {
    const pts = a.map(p => repere.lonLatVersLocal(p));
    const [d, f] = [pts[0], pts.at(-1)];
    if (pts.length > 1 && d[0] === f[0] && d[1] === f[1]) pts.pop();
    return pts;
  }).filter(a => a.length >= 3)).filter(p => p.length);
}

/** Les lignes d'une géométrie GeoJSON, en local (les anneaux d'un polygone deviennent des lignes fermées). */
export function lignesLocales(geometrie, repere) {
  const c = geometrie.coordinates;
  const brutes = { LineString: [c], MultiLineString: c, Polygon: c, MultiPolygon: c.flat?.() }[geometrie.type] ?? [];
  return brutes.map(l => l.map(p => repere.lonLatVersLocal(p)));
}

const v2 = a => a.map(([x, y]) => new Vector2(x, y));
const triangles = poly => ShapeUtils.triangulateShape(v2(poly[0]), poly.slice(1).map(v2));

// Un tampon qui grandit : les tailles finales ne sont connues qu'à la fin.
function tampon(Type = Float32Array) {
  let t = new Type(1 << 16), n = 0;
  return {
    pousser(...v) {
      if (n + v.length > t.length) { const u = new Type(Math.max(t.length * 2, n + v.length)); u.set(t); t = u; }
      for (const x of v) t[n++] = x;
    },
    get taille() { return n; },
    fin: () => t.slice(0, n),
  };
}

/**
 * Surfaces à plat (y = 0), une couleur par objet.
 * couleurDe(properties) → [r, g, b] (linéaire) ou null pour ne pas dessiner.
 * → { positions, couleurs, indices, ids }
 */
export function maillerSurfaces(features, repere, couleurDe) {
  const pos = tampon(), col = tampon(), ind = tampon(Uint32Array), ids = [];
  for (const f of features) {
    const c = couleurDe(f.properties);
    if (!c) continue;
    ids.push(f.properties.id);
    for (const poly of polygonesLocaux(f.geometry, repere)) {
      const base = pos.taille / 3;
      for (const a of poly) for (const p of a) { pos.pousser(...versScene(p, 0)); col.pousser(...c); }
      for (const [a, b, d] of triangles(poly)) ind.pousser(base + a, base + b, base + d);
    }
  }
  return { positions: pos.fin(), couleurs: col.fin(), indices: ind.fin(), ids };
}

/**
 * Bâtiments : un prisme par emprise quand la hauteur est connue (properties.hauteur,
 * en mètres), l'emprise à plat quand elle est null — jamais une hauteur supposée.
 * couleurs : { toit, plat, mur(orientation 0..1) } → [r, g, b] linéaires.
 * → { positions, couleurs, indices, ids, debuts, hauteurs, contours, contoursPlats }
 *   debuts[i] : premier triangle du bâtiment ids[i] (debuts[ids.length] = total) ;
 *   contours : segments [x,y,z, x,y,z, …] des toits ; contoursPlats : ceux des bâtiments sans hauteur.
 */
export function maillerBatiments(features, repere, couleurs) {
  const pos = tampon(), col = tampon(), ind = tampon(Uint32Array), cont = tampon(), plats = tampon();
  const ids = [], hauteurs = [], debuts = [];
  for (const f of features) {
    const h = f.properties.hauteur ?? null;
    ids.push(f.properties.id);
    hauteurs.push(h);
    debuts.push(ind.taille / 3);
    for (const poly of polygonesLocaux(f.geometry, repere)) {
      const base = pos.taille / 3, y = h ?? 0, teinte = h === null ? couleurs.plat : couleurs.toit;
      for (const a of poly) for (const p of a) { pos.pousser(...versScene(p, y)); col.pousser(...teinte); }
      for (const [a, b, d] of triangles(poly)) ind.pousser(base + a, base + b, base + d);
      for (const a of poly) {
        for (let i = 0; i < a.length; i++) {
          const p = a[i], q = a[(i + 1) % a.length];
          (h === null ? plats : cont).pousser(...versScene(p, y), ...versScene(q, y));
          if (h === null) continue;
          // Mur : 4 sommets propres (une teinte par façade, selon son orientation)
          const m = pos.taille / 3;
          const teinteMur = couleurs.mur(orientation(p, q));
          pos.pousser(...versScene(p, h), ...versScene(q, h), ...versScene(q, 0), ...versScene(p, 0));
          for (let k = 0; k < 4; k++) col.pousser(...teinteMur);
          ind.pousser(m, m + 1, m + 2, m, m + 2, m + 3);
        }
      }
    }
  }
  debuts.push(ind.taille / 3);
  return {
    positions: pos.fin(), couleurs: col.fin(), indices: ind.fin(), ids, hauteurs,
    debuts: Uint32Array.from(debuts), contours: cont.fin(), contoursPlats: plats.fin(),
  };
}

/** Orientation d'une façade, de 0 à 1 (repliée sur un demi-tour : deux façades opposées ont la même teinte). */
export function orientation(p, q) {
  const a = Math.atan2(q[1] - p[1], q[0] - p[0]);
  return Math.abs(Math.sin(a));
}

/** Le rang du bâtiment auquel appartient un triangle (recherche dichotomique dans debuts). */
export function rangDuTriangle(debuts, triangle) {
  let a = 0, b = debuts.length - 2;
  if (triangle < 0 || triangle >= debuts[debuts.length - 1]) return -1;
  while (a < b) {
    const m = (a + b + 1) >> 1;
    if (debuts[m] <= triangle) a = m; else b = m - 1;
  }
  return a;
}

/** Un seul bâtiment (surbrillance) : mêmes sommets que dans le maillage d'ensemble. */
export const maillerBatiment = (feature, repere, couleur) => maillerBatiments([feature], repere, { toit: couleur, plat: couleur, mur: () => couleur });

/**
 * Un ruban à plat le long d'une ligne locale : le trait d'un axe, épais de
 * `largeur` mètres (une épaisseur de dessin, pas une largeur de chaussée).
 * Ajoute au tampon { pos, ind } ; rend le nombre de triangles ajoutés.
 */
function ruban(ligne, largeur, y, pos, ind) {
  const base = pos.taille / 3, d = largeur / 2;
  let n = 0;
  for (let i = 0; i < ligne.length; i++) {
    const a = ligne[Math.max(0, i - 1)], b = ligne[Math.min(ligne.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const nx = (-dy / l) * d, ny = (dx / l) * d;
    pos.pousser(...versScene([ligne[i][0] + nx, ligne[i][1] + ny], y), ...versScene([ligne[i][0] - nx, ligne[i][1] - ny], y));
    if (i > 0) { const k = base + 2 * i; ind.pousser(k - 2, k - 1, k, k - 1, k + 1, k); n += 2; }
  }
  return n;
}

/** Le ruban d'une seule ligne : { positions, indices }. */
export function maillerRuban(ligne, largeur, y = 0) {
  const pos = tampon(), ind = tampon(Uint32Array);
  ruban(ligne, largeur, y, pos, ind);
  return { positions: pos.fin(), indices: ind.fin() };
}

/**
 * Les axes de rue, en rubans. styleDe(properties) → { couleur: [r, g, b], largeur (m) } ou null.
 * → { positions, couleurs, indices, ids, lignes: Map(id → ligne locale) }
 */
export function maillerAxes(features, repere, styleDe, y = 0) {
  const pos = tampon(), col = tampon(), ind = tampon(Uint32Array), ids = [], lignes = new Map();
  for (const f of features) {
    const ligne = f.geometry.coordinates.map(p => repere.lonLatVersLocal(p));
    ids.push(f.properties.id);
    lignes.set(f.properties.id, ligne);
    const s = styleDe(f.properties);
    if (!s) continue;
    const avant = pos.taille / 3;
    ruban(ligne, s.largeur, y, pos, ind);
    for (let k = avant; k < pos.taille / 3; k++) col.pousser(...s.couleur);
  }
  return { positions: pos.fin(), couleurs: col.fin(), indices: ind.fin(), ids, lignes };
}

/** Des lignes (rails, ouvrages, emprise) en paires de sommets pour LineSegments. */
export function segmentsDeLignes(lignes, y = 0) {
  const pos = tampon();
  for (const l of lignes) for (let i = 1; i < l.length; i++) pos.pousser(...versScene(l[i - 1], y), ...versScene(l[i], y));
  return pos.fin();
}

/**
 * Les bandes des sections transversales, à plat (y), entre leurs bords décalés de l'axe :
 * les mêmes bords que sur la carte (js/geo/decalage.js), donc sans chevauchement.
 * entrees : [{ ligne (locale), section }] ; couleurDe(type) → [r, g, b] linéaire.
 * → { positions, couleurs, indices, ids ("troncon:bande"), bandes: Map(id → { gauche, droite, type }) }
 */
export function maillerSections(entrees, couleurDe, y = 0) {
  const pos = tampon(), col = tampon(), ind = tampon(Uint32Array), ids = [], bandes = new Map();
  for (const { ligne, section } of entrees) {
    for (const b of decalages(section)) {
      const g = decalerLigne(ligne, b.gauche), d = decalerLigne(ligne, b.droite), c = couleurDe(b.type);
      const base = pos.taille / 3;
      for (let i = 0; i < g.length; i++) {
        pos.pousser(...versScene(g[i], y), ...versScene(d[i], y));
        col.pousser(...c, ...c);
        if (i > 0) { const k = base + 2 * i; ind.pousser(k - 2, k - 1, k, k - 1, k + 1, k); }
      }
      const id = `${section.troncon}:${b.id}`;
      ids.push(id);
      bandes.set(id, { gauche: b.gauche, droite: b.droite, type: b.type });
    }
  }
  return { positions: pos.fin(), couleurs: col.fin(), indices: ind.fin(), ids, bandes };
}

/**
 * Des polygones à plat (y), une couleur chacun : zones de carrefour et traversées (v0.4).
 * entrees : [{ anneau (local, fermé ou non), couleur: [r, g, b] }] → { positions, couleurs, indices }
 */
export function maillerPolygones(entrees, y = 0) {
  const pos = tampon(), col = tampon(), ind = tampon(Uint32Array);
  for (const { anneau, couleur } of entrees) {
    const a = anneau.slice();
    const [d, f] = [a[0], a.at(-1)];
    if (a.length > 1 && d[0] === f[0] && d[1] === f[1]) a.pop();
    if (a.length < 3) continue;
    const base = pos.taille / 3;
    for (const p of a) { pos.pousser(...versScene(p, y)); col.pousser(...couleur); }
    for (const [i, j, k] of triangles([a])) ind.pousser(base + i, base + j, base + k);
  }
  return { positions: pos.fin(), couleurs: col.fin(), indices: ind.fin() };
}
