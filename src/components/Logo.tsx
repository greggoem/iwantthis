/** Logo provisoire « I Want This » : un « i » blanc dont le point est l'accent de la marque */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden focusable="false">
      <rect width="32" height="32" rx="9" fill="#0f0f10" />
      <rect x="14" y="13" width="4" height="12" rx="2" fill="#fff" />
      <circle cx="16" cy="8.4" r="2.6" fill="#ff5a36" />
    </svg>
  )
}

export default function Logo({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <span className="logo">
      <LogoMark size={size} />
      <span className="logo-name">{name}</span>
    </span>
  )
}
