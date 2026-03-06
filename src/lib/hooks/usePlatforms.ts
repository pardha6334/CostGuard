'use client'
// src/lib/hooks/usePlatforms.ts
// CostGuard — SWR hook for GET /api/platforms, auto-refreshes every 30s
import useSWR from 'swr'
import type { Platform } from '@/lib/types'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function usePlatforms() {
  const { data, error, isLoading, mutate } = useSWR<{ platforms: Platform[] }>(
    '/api/platforms',
    fetcher,
    { refreshInterval: 30_000 }
  )

  return {
    platforms: data?.platforms ?? [],
    isLoading,
    error,
    mutate,
  }
}
