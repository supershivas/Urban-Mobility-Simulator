// Les missions (v0.8) : où en est la mission en cours, d'après le trafic simulé. Pur, testé
// (test/missions.test.mjs). main.js appelle evaluer() une fois par seconde simulée et garde l'état rendu
// ({ tenuS, echantillons, ... }) ; rien ici ne touche au scénario ni au DOM.
import { MISSIONS } from './data/missions.js?v=0.9.9';

export const mission = id => MISSIONS.find(m => m.id === id) ?? null;
/** La mission qui suit (null : c'était la dernière). */
export const suivante = id => MISSIONS[MISSIONS.findIndex(m => m.id === id) + 1] ?? null;

/** Un suivi neuf, au temps simulé t0 (le début de la mission). */
export const suivi = t0 => ({ t0, tenuS: 0, echantillons: [], valeur: null, reussie: false });

/**
 * Avance le suivi d'une mission d'un échantillon.
 * ctx : { temps, trafic (js/circulation.js : passagesDepuis, mesuresNoeud), section(id) }
 * → nouveau suivi : { valeur (ce qu'on montre), cible, ok (la condition tient maintenant), tenuS, reussie }
 */
export function evaluer(m, s, { temps, trafic, dt = 1 }) {
  const o = m.objectif;
  let valeur, cible, ok, echantillons = s.echantillons;
  if (o.type === 'velos-piste') {
    valeur = trafic.passagesDepuis(o.troncon, s.t0)['velo@cyclable'] ?? 0;
    cible = o.min;
    ok = valeur >= o.min;
  } else if (o.type === 'sans-issue') {
    // Les pertes de la dernière seconde : la condition tient tant qu'aucun bloc ne se perd
    valeur = trafic.mesuresNoeud(o.noeud, s.t0).perdus;
    cible = 0;
    ok = trafic.mesuresNoeud(o.noeud, temps - dt - 1e-9).perdus === 0;
  } else if (o.type === 'file') {
    echantillons = [...s.echantillons, trafic.mesuresNoeud(o.noeud).arretes].slice(-Math.round(o.moyenneS / dt));
    valeur = Math.round((echantillons.reduce((a, b) => a + b, 0) / echantillons.length) * 10) / 10;
    cible = o.max;
    // Une moyenne sur une fenêtre pleine seulement : les premières secondes ne jugent rien
    ok = echantillons.length * dt >= o.moyenneS && valeur <= o.max;
  } else throw new Error(`Objectif inconnu : ${o.type}`);
  const tenuS = ok ? s.tenuS + dt : 0;
  return { ...s, echantillons, valeur, cible, ok, tenuS, reussie: s.reussie || (ok && tenuS >= (o.tenirS ?? 0)) };
}

/** La progression du joueur (sauvegardée à part) : missions réussies, mission en cours. */
export const progressionVide = () => ({ reussies: [], enCours: MISSIONS[0].id, etape: 0 });
