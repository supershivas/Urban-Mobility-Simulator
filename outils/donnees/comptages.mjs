// Comptages de référence (v0.5) : les compteurs vélo de Bruxelles Mobilité, rattachés
// à un tronçon et réduits à un débit horaire de référence. Pur (lit des objets,
// rend des objets), appelé par construire.mjs.
//
// Méthode (affichée au joueur) :
// - heure de référence : pointe du matin, 8 h – 9 h, heure de Bruxelles ;
// - jours retenus : lundi à vendredi de la période téléchargée, sauf les jours où le
//   compteur ne compte rien de toute la journée (panne présumée) ;
// - débit = moyenne des quatre quarts d'heure additionnés, sur les jours retenus ;
// - rattachement : le tronçon de surface (niveau 0) le plus proche à moins de
//   RAYON m ; plusieurs compteurs sur un même tronçon s'additionnent (pistes des
//   deux côtés) ; les sens sont comptés ensemble (aucun compteur ne les sépare) ;
// - vitesse des vélos : moyenne des vitesses des quarts d'heure de référence,
//   pondérée par les vélos (capteurs non étalonnés : confiance faible).
import { wgs84VersLambert } from '../../js/geo/coordonnees.js';
import { distancePointLigne } from '../../js/geo/geometrie.js';

export const METHODE_COMPTAGES = { heureLocale: 8, decalageUtc: 2, rayonM: 25 };

export function comptagesVelo(original, segments, m = METHODE_COMPTAGES) {
  const premierQuart = (m.heureLocale - m.decalageUtc) * 4 + 1; // time_gap 1 = 00:00–00:15 UTC
  const quarts = new Set([0, 1, 2, 3].map(i => premierQuart + i));
  const surface = segments.filter(s => s.niveau === 0 && s.ligne?.length >= 2);
  const compteurs = [];
  for (const c of original.compteurs) {
    const p = wgs84VersLambert(c.geometry.coordinates);
    let meilleur = null;
    for (const s of surface) {
      const d = distancePointLigne(p, s.ligne).distance;
      if (d <= m.rayonM && (!meilleur || d < meilleur.d)) meilleur = { s, d };
    }
    const parJour = new Map();
    let vitesse = 0, poids = 0; // vitesse moyenne pondérée par le nombre de vélos, à l'heure de référence
    for (const q of c.historique.data ?? []) {
      const j = parJour.get(q.count_date) ?? parJour.set(q.count_date, { jour: 0, heure: 0 }).get(q.count_date);
      j.jour += q.count ?? 0;
      if (quarts.has(q.time_gap)) {
        j.heure += q.count ?? 0;
        if (q.count > 0 && q.average_speed > 0) { vitesse += q.average_speed * q.count; poids += q.count; }
      }
    }
    const ouvrables = [...parJour.entries()].filter(([d]) => { const w = new Date(d.replaceAll('/', '-') + 'T12:00:00Z').getUTCDay(); return w >= 1 && w <= 5; });
    const retenus = ouvrables.filter(([, v]) => v.jour > 0).map(([, v]) => v.heure);
    compteurs.push({
      id: c.properties.device_name,
      lieu: { fr: c.properties.road_fr, nl: c.properties.road_nl },
      position: c.geometry.coordinates,
      troncon: meilleur?.s.id ?? null,
      distanceM: meilleur ? Math.round(meilleur.d * 10) / 10 : null,
      joursRetenus: retenus.length,
      joursEcartes: ouvrables.length - retenus.length,
      parHeure: retenus.length ? Math.round(retenus.reduce((a, b) => a + b, 0) / retenus.length) : null,
      min: retenus.length ? Math.min(...retenus) : null,
      max: retenus.length ? Math.max(...retenus) : null,
      vitesseKmh: poids ? Math.round((vitesse / poids) * 10) / 10 : null,
      velosVitesse: poids,
    });
  }
  const parTroncon = {};
  for (const c of compteurs) {
    if (!c.troncon || c.parHeure === null) continue;
    const t = (parTroncon[c.troncon] ??= { mode: 'cyclable', sens: 'total', parHeure: 0, compteurs: [] });
    t.parHeure += c.parHeure;
    t.compteurs.push(c.id);
  }
  // Vitesse de référence des vélos : moyenne de tous les compteurs, pondérée par les vélos
  const p = compteurs.reduce((a, c) => a + (c.vitesseKmh ? c.velosVitesse : 0), 0);
  const vitesseVeloKmh = p ? Math.round((compteurs.reduce((a, c) => a + (c.vitesseKmh ? c.vitesseKmh * c.velosVitesse : 0), 0) / p) * 10) / 10 : null;
  return { compteurs, parTroncon, vitesseVeloKmh };
}
