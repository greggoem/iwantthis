import { buildLink } from '../lib/affiliate'
import { useAffiliates } from '../lib/affiliate'
import type { ReactNode } from 'react'
import Icon from './Icon'

/** Lien « Voir le produit » : applique automatiquement le parrainage du site si le magasin en propose un
 */
export default function ItemLink({ url }: { url: string | null }) {
  const programs = useAffiliates()
  const link = buildLink(url, programs)
  if (!link) return null
  return (
    <a className="itemlink" title={link.host} href={link.href} target="_blank" rel="noopener noreferrer sponsored nofollow">
      <span className="itemlink-host">{link.host}</span><Icon name="external" size={13} />
    </a>
  )
}

/** Enveloppe un élément (photo, nom) d'un lien vers le produit — sans soulignement ni changement de couleur */
export function ItemAnchor({ url, className, children }: { url: string | null; className?: string; children: ReactNode }) {
  const programs = useAffiliates()
  const link = buildLink(url, programs)
  if (!link) return <div className={className}>{children}</div>
  return (
    <a className={`plainlink ${className ?? ''}`} href={link.href} target="_blank" rel="noopener noreferrer sponsored nofollow">
      {children}
    </a>
  )
}
