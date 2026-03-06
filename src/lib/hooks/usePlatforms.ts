'use client'
// src/lib/hooks/usePlatforms.ts
// CostGuard — SWR hook for GET /api/platforms, live refresh without full reload
import useSWR from 'swr'
import type { Platform } from '@/lib/types'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function usePlatforms() {
  const { data, error, isLoading, mutate } = useSWR<{ platforms: Platform[] }>(
    '/api/platforms',
    fetcher,
    {
      refreshInterval: 15_000, // refresh every 15s so poll time and metrics update smoothly
      revalidateOnFocus: true,
      dedupingInterval: 5_000, // avoid duplicate requests within 5s
    }
  )

  return {
    platforms: data?.platforms ?? [],
    isLoading,
    error,
    mutate,
  }
}
