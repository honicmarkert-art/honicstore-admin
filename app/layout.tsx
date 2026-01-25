import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Honicstore Admin Dashboard',
  description: 'Admin dashboard for Honic Company Store',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
