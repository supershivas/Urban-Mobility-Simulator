// L'éditeur de carrefour (v0.4) : le même bandeau sous la carte que l'éditeur de
// section (Jérôme, v0.4.0). Une carte par branche (dans l'ordre des branches autour
// du nœud, lettre reprise sur la carte et en 3D) : ses traversées, ses voies qui
// entrent et qui sortent. On choisit une voie entrante, puis on clique les voies
// sortantes à raccorder ou à détacher. Ce module dessine et écoute : il ne modifie
// jamais le carrefour, il demande à main.js (surOperation), qui applique les règles
// de js/carrefour.js et tient l'historique.
import { REGULATIONS, ANGLES, VERTS } from './data/carrefours.js?v=0.9.10';
import { normaliser } from './carrefour.js?v=0.9.10';

export const lettre = i => String.fromCharCode(65 + i);

/**
 * racine : l'élément du bandeau (partagé avec l'éditeur de section, jamais ouverts ensemble) ; t, lang : textes.
 * rappels : surOperation(nom, args) → { refus? } ; surAnnuler(), surRetablir(), surRemettre(), surFermer(),
 *           surChoixVoie(id | null) : la voie entrante choisie a changé (pour la carte et la 3D).
 */
export function creerEditeurCarrefour({ racine, t: tr, lang: langue, rappels }) {
  let t = tr, lang = langue;
  const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
  let info = null, choisie = null, dernier = { texte: '', refus: false };

  const bouton = (cle, onclick, extra = {}) => el('button', { type: 'button', className: 'bouton editeur-bouton', textContent: t(cle), onclick, ...extra });
  const nomVoie = v => t(`bande.${v.type}.sigle`);
  const titreVoie = v => `${t(`mode.${v.mode}`)}${v.connue ? '' : ` · ${t('carrefour.voies-inconnues')}`}`;

  function message(texte = '', refus = false) {
    dernier = { texte, refus };
    const m = racine.querySelector('.editeur-message');
    if (!m) return;
    m.textContent = texte || resume();
    m.classList.toggle('refus', refus);
  }
  // Sans message : l'état du carrefour (alertes), sinon l'aide
  function resume() {
    if (!info) return '';
    const { impasses, inaccessibles } = info.verif;
    const parts = [];
    if (impasses.length || inaccessibles.length) parts.push(t('carrefour.alertes', { i: impasses.length, a: inaccessibles.length }));
    if (info.perdus.length) parts.push(t('carrefour.perdus', { n: info.perdus.length }));
    return parts.length ? parts.join(' · ') : t('carrefour.aide');
  }

  function operer(nom, args) {
    const r = rappels.surOperation(nom, args);
    if (r?.refus) message(t(`refus.${r.refus}`, traduire(r.valeurs)), true);
    else if (r) message(r.raccorde === undefined ? '' : t(r.raccorde ? 'carrefour.raccord-ajoute' : 'carrefour.raccord-retire'));
    return r;
  }
  const traduire = (v = {}) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'de' || k === 'vers' ? t(`mode.${x}`) : x]));

  function choisir(id) {
    choisie = id;
    rappels.surChoixVoie?.(id);
    dessiner();
  }

  // Où va une branche, vue d'une voie entrante : à gauche, tout droit, à droite
  function direction(branche) {
    const v = choisie && info.voies.get(choisie);
    if (!v) return null;
    const a = info.branches.find(b => b.troncon === v.troncon);
    if (a === branche) return t('carrefour.dir.demi-tour');
    const virage = normaliser(branche.angle - (a.angle + Math.PI)) * 180 / Math.PI;
    return t(Math.abs(virage) < ANGLES.toutDroitDegres ? 'carrefour.dir.droit' : virage > 0 ? 'carrefour.dir.gauche' : 'carrefour.dir.droite');
  }

  function carteBranche(b, i) {
    const voies = [...info.voies.values()].filter(v => v.troncon === b.troncon);
    const entrantes = voies.filter(v => v.entrante).sort((x, y) => x.cote - y.cote);
    const sortantes = voies.filter(v => v.sortante).sort((x, y) => y.cote - x.cote);
    const dir = direction(b);
    const tete = el('div', { className: 'carrefour-branche-tete' },
      el('span', { className: 'carrefour-lettre', textContent: lettre(i) }),
      el('span', { className: `carrefour-branche-nom${b.nomTexte ? '' : ' inconnu'}`, textContent: b.nomTexte ?? t('valeur.inconnu'), title: b.troncon }),
      ...(dir ? [el('span', { className: 'carrefour-dir', textContent: dir })] : []));
    const ligneVoies = (cle, liste, rendre) => el('div', { className: 'carrefour-voies' },
      el('span', { className: 'carrefour-sens', textContent: t(cle) }),
      ...(liste.length ? liste.map(rendre) : [el('span', { className: 'carrefour-aucune', textContent: '—' })]));
    const entree = v => {
      const sansIssue = info.verif.impasses.includes(v.id);
      const n = info.raccords.filter(r => r.de === v.id).length;
      const btn = el('button', { type: 'button', className: `carrefour-voie entree${v.id === choisie ? ' choisie' : ''}${sansIssue ? ' alerte' : ''}`, onclick: () => choisir(v.id === choisie ? null : v.id) },
        el('b', { textContent: nomVoie(v) }), ` ${n}`);
      btn.dataset.voie = v.id;
      btn.setAttribute('aria-pressed', String(v.id === choisie));
      btn.title = `${titreVoie(v)} · ${t('carrefour.n-raccords', { n })}${sansIssue ? ` · ${t('carrefour.sans-issue')}` : ''}`;
      btn.setAttribute('aria-label', btn.title);
      return btn;
    };
    const sortie = v => {
      const r = choisie ? info.raccords.find(x => x.de === choisie && x.vers === v.id) : null;
      const isolee = info.verif.inaccessibles.includes(v.id);
      const etat = !choisie ? '' : r ? (r.origine === 'propose' ? 'propose' : 'joueur') : 'libre';
      const signe = { propose: ' ✓?', joueur: ' ✓', libre: ' ·', '': '' }[etat];
      const btn = el('button', { type: 'button', className: `carrefour-voie sortie ${etat}${isolee ? ' alerte' : ''}`, onclick: () => {
        if (!choisie) { message(t('carrefour.choisir-entree'), true); return; }
        operer('basculerRaccord', [choisie, v.id]);
      } }, el('b', { textContent: nomVoie(v) }), signe);
      btn.dataset.voie = v.id;
      if (choisie) btn.setAttribute('aria-pressed', String(!!r));
      btn.title = `${titreVoie(v)}${etat ? ` · ${t(`carrefour.etat.${etat}`)}` : ''}${isolee ? ` · ${t('carrefour.jamais-atteinte')}` : ''}`;
      btn.setAttribute('aria-label', btn.title);
      return btn;
    };
    const traversee = type => {
      const v = info.carrefour?.traversees?.[b.troncon]?.[type] ?? null;
      const s = el('select', { className: 'editeur-choix', onchange: e => {
        const r = operer('definirTraversee', [b.troncon, type, e.target.value === '' ? null : e.target.value === 'oui']);
        if (r?.refus) e.target.value = v === null ? '' : v ? 'oui' : 'non';
      } });
      // Le nom de la traversée est dans chaque option : deux choix tiennent sur une ligne de la carte
      for (const [val, cle] of [['', 'traversee.inconnu'], ['oui', 'traversee.oui'], ['non', 'traversee.non']]) s.append(el('option', { value: val, textContent: `${t(`traversee.${type}.court`)} : ${t(cle).toLowerCase()}` }));
      s.value = v === null ? '' : v ? 'oui' : 'non';
      s.setAttribute('aria-label', t(`traversee.${type}`));
      s.title = t(`traversee.${type}`);
      s.classList.add('carrefour-traversee');
      return s;
    };
    const c = el('div', { className: 'carrefour-branche' }, tete,
      ligneVoies('carrefour.entrantes', entrantes, entree),
      ligneVoies('carrefour.sortantes', sortantes, sortie),
      el('div', { className: 'carrefour-traversees' }, traversee('pieton'), traversee('velo')));
    c.dataset.branche = b.troncon;
    return c;
  }

  // Feux (v0.7) : le modèle proposé, une frise du cycle, un curseur de vert par phase
  function rangeeFeux() {
    const f = info.feux;
    const lettreDe = troncon => lettre(info.branches.findIndex(b => b.troncon === troncon));
    const qui = (ph, i) => {
      const origines = [...new Set([...ph.mouvements].map(m => lettreDe(m.split('>')[0])))].join(', ');
      const quoi = f.modele === 'tag-protege' ? (i % 2 ? 'feux.gauche' : 'feux.droit-droite') : 'feux.tous';
      return `${origines || '—'} (${t(quoi)})`;
    };
    const modele = el('select', { className: 'editeur-choix', onchange: e => { const r = operer('definirModeleFeux', [e.target.value]); if (r?.refus) e.target.value = f.modele; } });
    modele.append(...f.modeles.map(m => el('option', { value: m, textContent: t(`feux.modele.${m}`) })));
    modele.value = f.modele;
    modele.setAttribute('aria-label', t('feux.modele'));
    const frise = el('div', { className: 'feux-frise', title: t('feux.cycle', { c: f.cycle, p: f.perte * f.phases.length }) },
      ...f.phases.flatMap(ph => [el('span', { className: 'vert', style: `flex: ${ph.vert}` }), el('span', { className: 'perte', style: `flex: ${f.perte}` })]));
    const phases = f.phases.map((ph, i) => {
      const valeur = el('b', { textContent: `${ph.vert} s` });
      const curseur = el('input', { type: 'range', min: String(VERTS.minS), max: String(VERTS.maxS), step: String(VERTS.pasS), value: String(ph.vert) });
      curseur.setAttribute('aria-label', t('feux.vert', { n: i + 1 }));
      curseur.oninput = () => { valeur.textContent = `${curseur.value} s`; };
      curseur.onchange = () => operer('definirVert', [i, Number(curseur.value)]);
      curseur.dataset.phase = String(i);
      return el('label', { className: 'feux-phase' }, el('span', { textContent: t('feux.phase', { n: i + 1, qui: qui(ph, i) }) }), curseur, valeur);
    });
    return el('div', { className: 'feux' }, el('label', { className: 'carrefour-regulation' }, el('span', { textContent: t('feux.modele') }), modele),
      el('span', { textContent: t('feux.cycle', { c: f.cycle, p: f.perte * f.phases.length }) }), ...phases, frise);
  }

  function dessiner() {
    if (!info) return;
    const actif = document.activeElement && racine.contains(document.activeElement) ? document.activeElement : null;
    const focus = actif?.dataset.voie ? `[data-voie="${CSS.escape(actif.dataset.voie)}"]` : actif?.dataset.phase ? `[data-phase="${actif.dataset.phase}"]` : null;
    const fermer = el('button', { type: 'button', className: 'icone', onclick: rappels.surFermer });
    fermer.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    fermer.setAttribute('aria-label', t('carrefour.fermer'));
    const regulation = el('select', { className: 'editeur-choix', onchange: e => {
      const r = operer('definirRegulation', [e.target.value || null]);
      if (r?.refus) e.target.value = info.carrefour?.regulation ?? '';
    } });
    regulation.append(el('option', { value: '', textContent: t('valeur.inconnu') }), ...REGULATIONS.map(k => el('option', { value: k, textContent: t(`regulation.${k}`) })));
    regulation.value = info.carrefour?.regulation ?? '';
    const proposes = info.raccords.filter(r => r.origine === 'propose').length;
    racine.replaceChildren(
      el('div', { className: 'editeur-tete' },
        el('h2', { textContent: t('carrefour.titre') }),
        el('span', { className: `editeur-nom${info.nom ? '' : ' inconnu'}`, textContent: info.nom ?? t('valeur.inconnu'), title: info.id }),
        el('label', { className: 'carrefour-regulation' }, el('span', { textContent: t('champ.regulation') }), regulation),
        el('span', { className: 'editeur-espace' }),
        bouton('editeur.annuler', rappels.surAnnuler, { disabled: !info.peutAnnuler, title: 'Ctrl+Z' }),
        bouton('editeur.retablir', rappels.surRetablir, { disabled: !info.peutRetablir, title: 'Ctrl+Y' }),
        bouton('carrefour.valider', () => operer('validerPropositions', []), { disabled: !proposes, title: t('carrefour.valider-titre') }),
        bouton('carrefour.remettre', rappels.surRemettre, { disabled: !info.carrefour, title: t('carrefour.remettre-titre') }),
        fermer),
      el('div', { className: 'carrefour-ligne' },
        el('span', { className: 'carrefour-compte', textContent: t('carrefour.compte', { n: info.raccords.length, p: proposes }), title: t('valeur.methode-raccords') }),
        el('p', { className: `editeur-message carrefour-message${dernier.refus ? ' refus' : ''}`, role: 'status', textContent: dernier.texte || resume() })),
      ...(info.feux ? [rangeeFeux()] : []),
      el('div', { className: 'carrefour-branches' }, ...info.branches.map(carteBranche)),
    );
    if (focus) racine.querySelector(focus)?.focus();
  }

  return {
    /** Affiche un carrefour : { id, nom, branches (avec nomTexte), voies: Map, raccords, verif, perdus, carrefour, peutAnnuler, peutRetablir }. */
    afficher(i) {
      const nouveau = info?.id !== i.id;
      info = i;
      if (nouveau) { choisie = null; message(''); }
      if (choisie && !i.voies.get(choisie)?.entrante) { choisie = null; rappels.surChoixVoie?.(null); }
      racine.hidden = false;
      dessiner();
    },
    masquer() { info = null; choisie = null; racine.hidden = true; racine.replaceChildren(); },
    message,
    get voieChoisie() { return choisie; },
    get ouvert() { return !!info; },
    choisir,
    langue(nt, nl) { t = nt; lang = nl; dessiner(); },
  };
}
