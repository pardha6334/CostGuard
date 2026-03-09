// tests/unit/logger.test.ts
// CostGuard — Unit tests for central logger (writeLog, helpers, parseLogEntry)
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  lpush: vi.fn().mockResolvedValue(1),
  ltrim: vi.fn().mockResolvedValue('OK'),
  logCreate: vi.fn().mockResolvedValue({}),
}))
vi.mock('@/lib/redis', () => ({ redis: { lpush: mocks.lpush, ltrim: mocks.ltrim } }))
vi.mock('@/lib/db', () => ({ prisma: { log: { create: mocks.logCreate } } }))

import { writeLog, log, parseLogEntry, REDIS_LOG_KEY, REDIS_GLOBAL_KEY, MAX_REDIS_LOGS } from '@/lib/logger'

describe('logger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exports REDIS_LOG_KEY and REDIS_GLOBAL_KEY', () => {
    expect(REDIS_LOG_KEY('pid-123')).toBe('logs:pid-123')
    expect(REDIS_GLOBAL_KEY).toBe('logs:system')
    expect(MAX_REDIS_LOGS).toBe(500)
  })

  it('writeLog pushes to platform key when platformId set', async () => {
    await writeLog({
      platformId: 'platform-1',
      category: 'POLL',
      level: 'INFO',
      message: 'Test message',
    })
    expect(mocks.lpush).toHaveBeenCalledWith('logs:platform-1', expect.stringContaining('"message":"Test message"'))
    expect(mocks.ltrim).toHaveBeenCalledWith('logs:platform-1', 0, MAX_REDIS_LOGS - 1)
    expect(mocks.logCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          platformId: 'platform-1',
          category: 'POLL',
          level: 'INFO',
          message: 'Test message',
        }),
      })
    )
  })

  it('writeLog pushes to global key when platformId null', async () => {
    await writeLog({
      category: 'SYSTEM',
      level: 'WARN',
      message: 'System warn',
    })
    expect(mocks.lpush).toHaveBeenCalledWith(REDIS_GLOBAL_KEY, expect.any(String))
    expect(mocks.logCreate).toHaveBeenCalled()
  })

  it('log.info calls writeLog with correct params', async () => {
    await log.info('Info msg', { foo: 1 }, 'p1', 'SPEND')
    expect(mocks.logCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          level: 'INFO',
          category: 'SPEND',
          message: 'Info msg',
          platformId: 'p1',
          meta: { foo: 1 },
        }),
      })
    )
  })

  it('log.error uses ERROR category by default', async () => {
    await log.error('Error msg', undefined, 'p2')
    expect(mocks.logCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          level: 'ERROR',
          category: 'ERROR',
          message: 'Error msg',
        }),
      })
    )
  })

  it('log.success uses SUCCESS level', async () => {
    await log.success('Done', undefined, undefined, 'KILL')
    expect(mocks.logCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          level: 'SUCCESS',
          category: 'KILL',
          message: 'Done',
        }),
      })
    )
  })

  describe('parseLogEntry', () => {
    it('returns LogEntry for valid JSON with message and createdAt', () => {
      const raw = JSON.stringify({
        id: 'x',
        category: 'POLL',
        level: 'INFO',
        message: 'hello',
        createdAt: '2025-03-05T12:00:00.000Z',
      })
      const out = parseLogEntry(raw)
      expect(out).not.toBeNull()
      expect(out?.message).toBe('hello')
      expect(out?.createdAt).toBe('2025-03-05T12:00:00.000Z')
    })

    it('returns null for invalid JSON', () => {
      expect(parseLogEntry('not json')).toBeNull()
      expect(parseLogEntry('')).toBeNull()
    })

    it('returns null for object missing message', () => {
      const raw = JSON.stringify({ id: 'x', createdAt: '2025-03-05T12:00:00.000Z' })
      expect(parseLogEntry(raw)).toBeNull()
    })

    it('returns null for object missing createdAt', () => {
      const raw = JSON.stringify({ id: 'x', message: 'hi' })
      expect(parseLogEntry(raw)).toBeNull()
    })
  })

  describe('writeLog failure logging', () => {
    it('logs to console.error when Redis write fails', async () => {
      const err = new Error('Redis connection failed')
      mocks.lpush.mockRejectedValueOnce(err)
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      await writeLog({
        category: 'SYSTEM',
        level: 'INFO',
        message: 'test',
      })
      expect(consoleSpy).toHaveBeenCalledWith('[LOGGER] Redis write failed:', err)
      consoleSpy.mockRestore()
    })

    it('logs to console.error when DB write fails', async () => {
      const err = new Error('Prisma error')
      mocks.logCreate.mockRejectedValueOnce(err)
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      await writeLog({
        category: 'SYSTEM',
        level: 'INFO',
        message: 'test',
      })
      expect(consoleSpy).toHaveBeenCalledWith('[LOGGER] DB write failed:', err)
      consoleSpy.mockRestore()
    })
  })
})
