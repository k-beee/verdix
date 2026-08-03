import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Verdix | AI-Powered Smart Escrow & Verdict Protocol',
  description:
    'Verdix resolves service-based disputes through GenLayer validator consensus — neutral, on-chain, automatic. Lock funds, submit work, invoke the AI panel.',
  icons: { icon: '/favicon.ico' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      </head>
      <body>
        <div className="site-bg" aria-hidden="true" />
        <div className="site-overlay" aria-hidden="true" />
        {children}
      </body>
    </html>
  )
}
