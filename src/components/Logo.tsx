/** Logo provisoire « I Want This » : un paquet cadeau (même dessin que le favicon) */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden focusable="false">
      <rect width="32" height="32" rx="9" fill="#0f0f10" />
      <rect x="8" y="15" width="16" height="11" rx="2" fill="#fff" />
      <rect x="6.5" y="11.5" width="19" height="5" rx="1.6" fill="#fff" />
      <rect x="14.5" y="11.5" width="3" height="14.5" fill="#ff5a36" />
      <path d="M16 11.5C13.5 11.5 11.2 10.4 11.2 8.6c0-1.3 1.1-2 2.2-1.7 1.4.4 2.2 2.3 2.6 4.6Z" fill="#ff5a36" />
      <path d="M16 11.5c2.5 0 4.8-1.1 4.8-2.9 0-1.3-1.1-2-2.2-1.7-1.4.4-2.2 2.3-2.6 4.6Z" fill="#ff5a36" />
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
