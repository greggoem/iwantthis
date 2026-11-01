import MyPurchases from '../components/MyPurchases'

export default function ToGive() {
  return (
    <div className="narrow">
      <h1>Mes cadeaux à offrir</h1>
      <p className="muted">Les cadeaux que vous avez indiqué acheter pour vos proches. Un changement d'avis ? Annulez l'achat : le cadeau redevient disponible pour les autres invités.</p>
      <MyPurchases />
    </div>
  )
}
