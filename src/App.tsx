import { useRoute } from './app/routeur'
import { FournisseurApp, nombreAValider, useApp } from './app/store'
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
  if (!etat.pret) return <p className="p-10 text-slate-500">Chargement de la démo…</p>
  return (
    <Coquille route={route} nomCabinet={etat.donnees.parametres.nomCabinet} piecesAValider={nombreAValider(etat.donnees)}>
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
