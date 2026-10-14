// Classes partagées par les champs de saisie : bord net, anneau vert au focus.
export const CHAMP =
  'w-full min-w-0 rounded-[10px] border border-bord-fort bg-surface px-3 py-2.5 text-[15px] text-texte shadow-[0_1px_1px_rgb(15_38_33/0.03)] placeholder:text-texte-3 hover:border-texte-3 focus:border-marque focus:outline-none focus:ring-4 focus:ring-marque/15'

/** Variante compacte, pour les formulaires en ligne (règles, fusion, paramètres). */
export const CHAMP_COMPACT =
  'min-w-0 rounded-lg border border-bord-fort bg-surface px-2.5 py-1.5 text-sm text-texte placeholder:text-texte-3 hover:border-texte-3 focus:border-marque focus:outline-none focus:ring-4 focus:ring-marque/15'

/** Ligne d'en-tête de tableau : petite, en clair, sur fond calme. */
export const ENTETE_TABLEAU = 'bg-surface-2 text-left text-xs font-medium text-texte-2'
