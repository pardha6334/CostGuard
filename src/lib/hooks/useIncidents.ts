'use client'
// src/lib/hooks/useIncidents.ts
// CostGuard — SWR hook for GET /api/incidents, auto-refreshes every 30s
import useSWR from 'swr'
import type { Incident } from '@/lib/types'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function useIncidents(params?: { status?: string; platformId?: string; limit?: number }) {
  const query = new URLSearchParams()
  if (params?.status) query.set('status', params.status)
  if (params?.platformId) query.set('platformId', params.platformId)
  if (params?.limit) query.set('limit', String(params.limit))
  const url = `/api/incidents${query.toString() ? '?' + query.toString() : ''}`

  const { data, error, isLoading, mutate } = useSWR<{
    incidents: Incident[]
    totalSaved: number
    count: number
  }>(url, fetcher, { refreshInterval: 30_000 })

  return {
    incidents: data?.incidents ?? [],
    totalSaved: data?.totalSaved ?? 0,
    count: data?.count ?? 0,
    isLoading,
    error,
    mutate,
  }
}
