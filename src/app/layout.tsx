// src/app/layout.tsx
// CostGuard — Root layout: fonts, theme, global styles
import type { Metadata } from 'next'
import { Barlow, Barlow_Condensed, Share_Tech_Mono } from 'next/font/google'
import { Suspense } from 'react'
import { PostHogProvider } from '@/components/PostHogProvider'
import './globals.css'

const barlow = Barlow({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800', '900'],
  variable: '--font-barlow',
})

const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-barlow-condensed',
})

const shareTechMono = Share_Tech_Mono({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-share-tech-mono',
})

export const metadata: Metadata = {
  title: 'CostGuard — AI Cost Control',
  description: 'Real-time AI/cloud spend monitoring with automated kill switches',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <body
        className={`${barlow.variable} ${barlowCondensed.variable} ${shareTechMono.variable}`}
        style={{ fontFamily: 'var(--font-barlow, Barlow), sans-serif' }}
      >
        <Suspense>
          <PostHogProvider>{children}</PostHogProvider>
        </Suspense>
      </body>
    </html>
  )
}
