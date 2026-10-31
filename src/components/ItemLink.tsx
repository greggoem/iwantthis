import { buildLink } from '../lib/affiliate'
import { useAffiliates } from '../lib/affiliate'

/** Lien « Voir le produit » : applique automatiquement le parrainage du site si le magasin en propose un */
export default function ItemLink({ url }: { url: string | null }) {
  const programs = useAffiliates()
  const link = buildLink(url, programs)
  if (!link) return null
  return (
    <a className="itemlink" href={link.href} target="_blank" rel="noopener noreferrer sponsored nofollow">
      {link.host} ↗
      {link.affiliated && <span className="tag" title="Lien partenaire">partenaire</span>}
    </a>
  )
}
