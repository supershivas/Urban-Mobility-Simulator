// Annuler / rétablir : une pile d'états immuables (le scénario entier, petit).
// Pur, testé (test/section.test.mjs). Le jeu ne modifie jamais un état en place :
// chaque opération en produit un nouveau, que l'historique garde.
export function creerHistorique(initial, { limite = 200 } = {}) {
  let passe = [], futur = [], present = initial;
  return {
    get etat() { return present; },
    /** Un nouvel état : le futur (ce qui avait été annulé) est oublié. */
    faire(etat) {
      passe.push(present);
      if (passe.length > limite) passe.shift();
      present = etat;
      futur = [];
      return present;
    },
    annuler() { if (!passe.length) return null; futur.push(present); present = passe.pop(); return present; },
    retablir() { if (!futur.length) return null; passe.push(present); present = futur.pop(); return present; },
    get peutAnnuler() { return passe.length > 0; },
    get peutRetablir() { return futur.length > 0; },
    /** Repart d'un état (nouvelle partie, chargement) sans historique. */
    reinitialiser(etat) { passe = []; futur = []; present = etat; },
  };
}
