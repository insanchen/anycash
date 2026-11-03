import Link from 'next/link';

/**
 * AnyCash wordmark that swaps with the theme.
 * Both SVGs are always in the DOM. globals.css shows one or the other based on the `.dark`
 * class that ThemeProvider sets, so no client JS is needed for the swap.
 */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="AnyCash"
      className={`relative inline-flex h-8 w-auto items-center ${className ?? ''}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-wordmark.svg"
        alt=""
        aria-hidden="true"
        className="logo-light h-full w-auto"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-wordmark-dark.svg"
        alt=""
        aria-hidden="true"
        className="logo-dark h-full w-auto"
      />
    </span>
  );
}

/** Glyph-only mark with no wordmark text. Use it where space is tight. */
export function BrandGlyph({ className }: { className?: string }) {
  return (
    <Link href="/dashboard" aria-label="AnyCash" className={className ?? ''}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-appicon.svg" alt="" aria-hidden="true" className="h-full w-auto" />
    </Link>
  );
}
