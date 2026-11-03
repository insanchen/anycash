import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AnyCash',
    short_name: 'AnyCash',
    description: 'Privacy-first personal finance',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#FAFAF8',
    theme_color: '#4A6B53',
    icons: [
      {
        src: '/logo-appicon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}
