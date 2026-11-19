// Le bandeau des flux (v0.5) : le même bandeau sous la carte que les éditeurs de section
// et de carrefour (jamais deux ouverts). Pour le tronçon choisi et l'heure de référence :
// la demande par mode et par sens (choix du joueur, sinon comptage, sinon rien), les
// hypothèses d'occupation du scénario, et ce que la simulation en tire. Ce module dessine
// et écoute : il ne modifie rien, il demande à main.js (surOperation), qui applique les
// règles de js/simulation.js et tient l'historique.
import { MODES_DEMANDE, SAISIE } from './data/simulation.js?v=0.7.0';

/**
 * racine : l'élément du bandeau ; t, lang : textes.
 * rappels : surOperation(nom, args) → { refus? } ; surAnnuler(), surRetablir(), surEffacer(), surFermer().
 */
export function creerEditeurFlux({ racine, t: tr, lang: langue, rappels }) {
  let t = tr, lang = langue;
  const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
  let info = null, dernier = { texte: '', refus: false };
  const loc = () => (lang === 'en' ? 'en-GB' : 'fr-BE');
  const n = v => v.toLocaleString(loc(), { maximumFractionDigits: 0 });
  const bouton = (cle, onclick, extra = {}) => el('button', { type: 'button', className: 'bouton editeur-bouton', textContent: t(cle), onclick, ...extra });

  function message(texte = '', refus = false) {
    dernier = { texte, refus };
    const m = racine.querySelector('.editeur-message');
    if (!m) return;
    m.textContent = texte || t('flux.aide');
    m.classList.toggle('refus', refus);
  }
  function operer(nom, args) {
    const r = rappels.surOperation(nom, args);
    if (r?.refus) message(t(`refus.${r.refus}`, r.valeurs), true);
    else if (r) message('');
    return r;
  }
  const lire = v => (v.trim() === '' ? null : Number(v.replace(',', '.')));

  function champ({ valeur, attendu, aria, onchange, max, pas = 10, min = 0 }) {
    const i = el('input', { type: 'number', className: 'flux-champ', min: String(min), max: String(max), step: String(pas), inputMode: 'numeric' });
    i.value = valeur ?? '';
    i.placeholder = attendu ?? '—';
    i.setAttribute('aria-label', aria);
    i.title = aria;
    i.onchange = () => { const r = onchange(lire(i.value)); if (r?.refus) i.value = valeur ?? ''; };
    return i;
  }

  // Une cellule de résultat : par sens (→ ←), ou les deux sens ensemble (⇄), ou la raison de l'absence
  const signe = s => (s === 'total' ? t('sim.deux-sens') : t(`sens.${s}.signe`));
  function cellule(o, f, raison) {
    const parts = o.total !== null && o.total !== undefined && (o.aller ?? null) === null && (o.retour ?? null) === null
      ? [`${f(o.total)} ${signe('total')}`]
      : ['aller', 'retour'].filter(s => o[s] !== null && o[s] !== undefined).map(s => `${f(o[s])} ${signe(s)}`);
    if (parts.length) return el('td', { textContent: parts.join(' · ') });
    return el('td', { className: 'inconnu', textContent: raison ? t(`sim.court.${raison}`) : '—', title: raison ? t(`sim.raison.${raison}`) : '' });
  }
  const pc = x => (x === Infinity ? t('sim.sans-voie') : `${Math.round(x * 100)} %`);

  function ligne(mode) {
    const m = info.etat.modes[mode];
    const choix = info.choix?.[mode] ?? {};
    const compte = m.demande.origine === 'comptage' ? m.demande.total : null;
    const saisie = sens => champ({
      valeur: choix[sens] ?? null,
      attendu: sens === 'total' && compte !== null ? n(compte) : '—',
      aria: `${t(`sim.mode.${mode}`)} — ${t(`flux.sens.${sens}`)}`,
      max: SAISIE.debitMax,
      onchange: v => operer('definirDemande', [mode, sens, v]),
    });
    const demande = mode === 'pieton'
      ? [el('td', { colSpan: 2 }, saisie('total'))]
      : [el('td', {}, saisie('aller')), el('td', {}, saisie('retour'))];
    const origine = m.demande.origine === 'comptage'
      ? el('td', { className: 'flux-origine', textContent: t('flux.origine.comptage', { n: n(compte) }), title: t('sim.source-comptage', { compteurs: m.demande.compteurs.join(', ') }) })
      : el('td', { className: `flux-origine${m.demande.origine ? '' : ' inconnu'}`, textContent: t(m.demande.origine ? 'flux.origine.joueur' : 'flux.origine.aucune') });
    const sat = m.saturation;
    const tr = el('tr', {},
      el('th', { scope: 'row', textContent: t(`sim.mode.${mode}`) }),
      ...demande, origine,
      cellule(m.capacite, n, m.capacite.raison && m.capacite.total === null && m.capacite.aller === null && m.capacite.retour === null ? m.capacite.raison : null),
      cellule(sat, pc, m.demande.origine ? null : 'sans-demande'),
      m.personnes.transportees !== null
        ? el('td', { textContent: t('flux.personnes', { e: n(m.personnes.transportees), d: n(m.personnes.demande) }) })
        : el('td', { className: 'inconnu', textContent: t(`sim.court.${m.personnes.raison}`), title: t(`sim.raison.${m.personnes.raison}`) }));
    tr.dataset.mode = mode;
    const niveau = m.saturationMax === null ? '' : m.saturationMax >= 1 ? 'sature' : m.saturationMax >= 0.8 ? 'proche' : 'fluide';
    if (niveau) tr.dataset.niveau = niveau;
    return tr;
  }

  function dessiner() {
    if (!info) return;
    const actif = document.activeElement && racine.contains(document.activeElement) ? document.activeElement.getAttribute('aria-label') : null;
    const fermer = el('button', { type: 'button', className: 'icone', onclick: rappels.surFermer });
    fermer.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    fermer.setAttribute('aria-label', t('flux.fermer'));
    const hypothese = (cle, max) => el('label', { className: 'flux-hypothese' },
      el('span', { textContent: t(`flux.${cle}`) }),
      champ({ valeur: info.hypotheses?.[cle] ?? null, attendu: '?', aria: t(`flux.${cle}`), max, pas: 0.1, min: SAISIE.occupationMin, onchange: v => operer('definirHypothese', [cle, v]) }));
    const p = info.etat.personnes;
    racine.replaceChildren(
      el('div', { className: 'editeur-tete' },
        el('h2', { textContent: t('flux.titre') }),
        el('span', { className: `editeur-nom${info.nom ? '' : ' inconnu'}`, textContent: info.nom ?? t('valeur.inconnu'), title: info.id }),
        hypothese('occupationVoiture', SAISIE.occupationVoitureMax),
        hypothese('occupationBus', SAISIE.occupationBusMax),
        el('span', { className: 'editeur-espace' }),
        bouton('editeur.annuler', rappels.surAnnuler, { disabled: !info.peutAnnuler, title: 'Ctrl+Z' }),
        bouton('editeur.retablir', rappels.surRetablir, { disabled: !info.peutRetablir, title: 'Ctrl+Y' }),
        bouton('flux.effacer', rappels.surEffacer, { disabled: !info.choix, title: t('flux.effacer-titre') }),
        fermer),
      el('div', { className: 'carrefour-ligne' },
        el('span', { className: 'carrefour-compte', textContent: p.transportees !== null ? t('flux.bilan', { e: n(p.transportees), d: n(p.demande) }) : t('flux.bilan-inconnu'), title: t('sim.methode-personnes') }),
        el('p', { className: `editeur-message carrefour-message${dernier.refus ? ' refus' : ''}`, role: 'status', textContent: dernier.texte || t('flux.aide') })),
      el('div', { className: 'flux-table-cadre' },
        el('table', { className: 'flux-table' },
          el('thead', {}, el('tr', {}, ...['mode', 'aller', 'retour', 'origine', 'capacite', 'saturation', 'personnes'].map(k => el('th', { scope: 'col', textContent: t(`flux.col.${k}`) })))),
          el('tbody', {}, ...MODES_DEMANDE.map(ligne)))),
    );
    if (actif) [...racine.querySelectorAll('input')].find(i => i.getAttribute('aria-label') === actif)?.focus();
  }

  return {
    /** Affiche un tronçon : { id, nom, etat (etatTroncon), choix (scenario.demande[id] ou null), hypotheses, peutAnnuler, peutRetablir }. */
    afficher(i) {
      if (info?.id !== i.id) dernier = { texte: '', refus: false };
      info = i;
      racine.hidden = false;
      dessiner();
    },
    masquer() { info = null; racine.hidden = true; racine.replaceChildren(); },
    message,
    get ouvert() { return !!info; },
    langue(nt, nl) { t = nt; lang = nl; dessiner(); },
  };
}
