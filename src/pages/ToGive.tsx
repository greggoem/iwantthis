import MyPurchases from '../components/MyPurchases'
import GroupGifts from '../components/GroupGifts'

export default function ToGive() {
  return (
    <div className="narrow stack">
      <h1>Mes cadeaux à offrir</h1>
      <GroupGifts />
      <h2 className="gg-h2" style={{ margin: '1rem 0 0' }}>Mes achats</h2>
      <p className="muted" style={{ margin: 0 }}>Les cadeaux que vous avez indiqué avoir achetés pour vos proches. Un changement d'avis ? Annulez l'achat : le cadeau redevient disponible pour les autres invités.</p>
      <MyPurchases />
    </div>
  )
}
