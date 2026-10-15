import { useRoute } from './app/routeur'
import { maintenant } from './app/horloge'
import { FournisseurApp, nombreAValider, useApp } from './app/store'
import { nombreRelancesAEnvoyer, relancesAPreparer } from './domain/tableaux'
import { Erreur } from './ui/composants'
import { Coquille } from './ui/Coquille'
import { Accueil } from './ui/ecrans/Accueil'
import { Clients, FicheClient } from './ui/ecrans/Clients'
import { Export } from './ui/ecrans/Export'
import { Parametres } from './ui/ecrans/Parametres'
import { Reception } from './ui/ecrans/Reception'
import { Relances } from './ui/ecrans/Relances'
import { Validation } from './ui/ecrans/Validation'

function Ecran() {
  const route = useRoute()
  const { etat } = useApp()
  if (etat.erreurChargement) {
    return (
      <div className="mx-auto max-w-2xl p-10">
        <Erreur>Chargement impossible : {etat.erreurChargement}</Erreur>
      </div>
    )
  }
  if (!etat.pret)
    return (
      <div className="grid min-h-screen place-items-center">
        <p className="flex items-center gap-3 text-[15px] text-texte-2">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-marque/25 border-t-marque" aria-hidden />
          Chargement de la démo…
        </p>
      </div>
    )
  const relancesAEnvoyer = nombreRelancesAEnvoyer(relancesAPreparer(etat.donnees, maintenant()))
  return (
    <Coquille
      route={route}
      nomCabinet={etat.donnees.parametres.nomCabinet}
      piecesAValider={nombreAValider(etat.donnees)}
      relancesAEnvoyer={relancesAEnvoyer}
      dateDemo={etat.dateDemo}
    >
      {route.ecran === 'accueil' && <Accueil />}
      {route.ecran === 'reception' && <Reception />}
      {route.ecran === 'validation' && <Validation pieceId={route.pieceId} />}
      {route.ecran === 'clients' && <Clients />}
      {route.ecran === 'client' && <FicheClient clientId={route.clientId} />}
      {route.ecran === 'relances' && <Relances />}
      {route.ecran === 'export' && <Export />}
      {route.ecran === 'parametres' && <Parametres key={JSON.stringify(etat.donnees.parametres)} />}
    </Coquille>
  )
}

export function App() {
  return (
    <FournisseurApp>
      <Ecran />
    </FournisseurApp>
  )
}
