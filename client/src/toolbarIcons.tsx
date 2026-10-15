type IconProps = {
  title?: string
}

const svgProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true as const,
  focusable: false as const,
}

export function IconFirst(_props: IconProps) {
  return (
    <svg {...svgProps}>
      <path d="M3 3v10" />
      <path d="M13 3L7 8l6 5" />
    </svg>
  )
}

export function IconPrevious(_props: IconProps) {
  return (
    <svg {...svgProps}>
      <path d="M11 3L5 8l6 5" />
    </svg>
  )
}

export function IconNext(_props: IconProps) {
  return (
    <svg {...svgProps}>
      <path d="M5 3l6 5-6 5" />
    </svg>
  )
}

export function IconLast(_props: IconProps) {
  return (
    <svg {...svgProps}>
      <path d="M13 3v10" />
      <path d="M3 3l6 5-6 5" />
    </svg>
  )
}

export function IconRefresh(_props: IconProps) {
  return (
    <svg {...svgProps}>
      <path d="M13 8a5 5 0 1 1-1.2-3.3" />
      <path d="M13 3v3.5H9.5" />
    </svg>
  )
}

export function IconBack(_props: IconProps) {
  return (
    <svg {...svgProps}>
      <circle cx="8" cy="8" r="5.25" />
      <path d="M9.25 5.5L6.5 8l2.75 2.5" />
    </svg>
  )
}

export function IconExport(_props: IconProps) {
  return (
    <svg {...svgProps}>
      <path d="M3 13h10" />
      <path d="M5 11V5.5h6V11" />
      <path d="M5 7.5h6" />
      <path d="M5 9.5h4" />
    </svg>
  )
}

export function IconPrint(_props: IconProps) {
  return (
    <svg {...svgProps}>
      <path d="M4 6V3h8v3" />
      <path d="M4 10H3V7.5h10V10h-1" />
      <path d="M4 10h8v3H4z" />
    </svg>
  )
}

export function IconFind(_props: IconProps) {
  return (
    <svg {...svgProps}>
      <circle cx="7" cy="7" r="3.5" />
      <path d="M10 10l3 3" />
    </svg>
  )
}

export function IconFindNext(_props: IconProps) {
  return (
    <svg {...svgProps}>
      <path d="M5 3l6 5-6 5" />
    </svg>
  )
}

export function IconMaximize(_props: IconProps) {
  return (
    <svg {...svgProps}>
      <path d="M9 3h4v4" />
      <path d="M13 3L8.5 7.5" />
      <path d="M7 13H3V9" />
      <path d="M3 13l4.5-4.5" />
    </svg>
  )
}

export function IconRestore(_props: IconProps) {
  return (
    <svg {...svgProps}>
      <path d="M13 7V3H9" />
      <path d="M13 3L8.5 7.5" />
      <path d="M3 9v4h4" />
      <path d="M3 13l4.5-4.5" />
    </svg>
  )
}
