// Classes partagées par les champs de saisie : filet net, encre au focus.
export const CHAMP =
  'w-full min-w-0 rounded-[4px] border border-trait-fort bg-feuille px-3 py-2 text-sm placeholder:text-texte-3 hover:border-texte-3 focus:border-encre focus:outline-none focus-visible:outline-2 focus-visible:outline-tampon'

/** Variante compacte, pour les formulaires en ligne (règles, fusion, paramètres). */
export const CHAMP_COMPACT =
  'min-w-0 rounded-[4px] border border-trait-fort bg-feuille px-2.5 py-1.5 text-sm placeholder:text-texte-3 hover:border-texte-3 focus:border-encre focus:outline-none focus-visible:outline-2 focus-visible:outline-tampon'

/** Ligne d'en-tête de tableau : petite, en clair, jamais en capitales. */
export const ENTETE_TABLEAU = 'border-b border-trait text-left text-xs text-texte-2'
