// src/app/api/health/route.ts
// CostGuard — Health check endpoint for uptime monitoring
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { redis } from '@/lib/redis'

export async function GET() {
  const checks = { db: false, redis: false, ts: new Date().toISOString() }

  try {
    await prisma.$queryRaw`SELECT 1`
    checks.db = true
  } catch {
    // db unhealthy
  }

  try {
    await redis.ping()
    checks.redis = true
  } catch {
    // redis unhealthy
  }

  const healthy = checks.db && checks.redis
  return NextResponse.json(checks, { status: healthy ? 200 : 503 })
}
