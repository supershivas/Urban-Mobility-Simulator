// Les outils de la barre (v0.7) : un clic sur une voie, dans la vue, la transforme.
// Pur, testé (test/outils.test.mjs). Rend { section, indice, decoupee? } ou { refus, valeurs } :
// comme les opérations de js/section.js, dont il se sert (la largeur ne change jamais ici).
//
// La voie visée se trouve par son décalage à l'axe (mètres, positif à gauche dans le sens de l'axe),
// mesuré au point cliqué. Une chaussée non découpée (« voies non renseignées ») est d'abord découpée
// en voies (DECOUPE : proposition, signalée au joueur), puis l'outil s'applique à celle qui est visée.
import { decalages, changerType, changerSens, retirer, verifier } from './section.js?v=0.7.0';
import { OUTILS, DECOUPE, BANDES, LARGEURS } from './data/bandes.js?v=0.7.0';

const refus = (r, valeurs = {}) => ({ refus: r, valeurs });
const SUIVANT = { aller: 'retour', retour: 'double', double: 'aller' };

/** L'indice de la bande au décalage d (ou null hors de la section). */
export function bandeAuDecalage(section, d) {
  const i = decalages(section).findIndex(b => d <= b.gauche + 1e-6 && d >= b.droite - 1e-6);
  return i >= 0 ? i : null;
}

/**
 * Découpe la chaussée i en voies automobiles d'au plus DECOUPE.largeurVoieM.
 * sensSource : sens de la rue d'après OSM ('unique-direct', 'unique-inverse', autre : double sens).
 * Double sens : selon le côté de l'axe où passe chaque voie (on roule à droite).
 */
export function decouperChaussee(section, i, sensSource) {
  const b = section.bandes[i];
  if (b?.type !== 'chaussee') return refus('pas-chaussee');
  const total = Math.round(b.largeur * 10); // en décimètres : la somme reste exactement celle de la chaussée
  const n = Math.max(1, Math.min(Math.floor(total / Math.round(DECOUPE.largeurVoieM * 10)), Math.floor(total / Math.round(LARGEURS.min * 10))));
  const voies = Array.from({ length: n }, (_, k) => ({
    id: `b${section.prochain + k}`, type: 'voiture', sens: 'double',
    largeur: (Math.floor(total / n) + (k < total % n ? 1 : 0)) / 10,
  }));
  const s = { ...section, bandes: [...section.bandes.slice(0, i), ...voies, ...section.bandes.slice(i + 1)], prochain: section.prochain + n };
  // Le sens : celui de la rue s'il est unique ; sinon par rapport à l'axe (on roule à droite) : une voie dont le
  // milieu est à gauche de l'axe va contre lui ; une seule voie, ou une voie à cheval sur l'axe, reste à double sens
  const d = decalages(s);
  for (let k = 0; k < n; k++) {
    const m = (d[i + k].gauche + d[i + k].droite) / 2;
    s.bandes[i + k].sens = sensSource === 'unique-direct' ? 'aller' : sensSource === 'unique-inverse' ? 'retour'
      : n === 1 || (d[i + k].gauche > 0 && d[i + k].droite < 0) ? 'double' : m > 0 ? 'retour' : 'aller';
  }
  return { section: s, voies: n };
}

/**
 * Applique l'outil à la bande au décalage d.
 * → { section, indice, decoupee: nombre de voies si une chaussée a été découpée } ou { refus, valeurs }.
 */
export function appliquerOutil(section, d, outil, { sensSource = null } = {}) {
  if (!section) return refus('section-inconnue');
  if (!OUTILS.includes(outil)) return refus('outil');
  let i = bandeAuDecalage(section, d);
  if (i === null) return refus('hors-section');
  let s = section, decoupee = null;
  if (s.bandes[i].type === 'chaussee' && outil !== 'trottoir' && outil !== 'supprimer') {
    const r = decouperChaussee(s, i, sensSource);
    if (r.refus) return r;
    s = r.section; decoupee = r.voies;
    i = bandeAuDecalage(s, d) ?? i;
  }
  let r;
  if (outil === 'supprimer') r = retirer(s, i);
  else if (outil === 'sens') r = BANDES[s.bandes[i].type]?.sens ? changerSens(s, i, SUIVANT[s.bandes[i].sens ?? 'double'] ?? 'aller') : refus('sans-sens');
  else if (s.bandes[i].type === outil) r = decoupee ? { section: s } : refus('deja', { type: outil });
  else r = changerType(s, i, outil);
  if (r.refus) return r;
  if (verifier(r.section).length) throw new Error(`Section invalide après l'outil ${outil}`); // ne doit jamais arriver
  return { section: r.section, indice: i, ...(decoupee ? { decoupee } : {}) };
}
