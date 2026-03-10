// tests/unit/anthropic.adapter.test.ts
// CostGuard — Unit tests for Anthropic adapter
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  AnthropicAdapter,
  estimateCostFromTokens,
  type AnthropicSnapshot,
} from '@/modules/adapters/anthropic.adapter'

const mockFetch = vi.fn()

function mockJsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  }
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
  mockFetch.mockReset()
})

describe('AnthropicAdapter', () => {
  const adminKey = 'sk-ant-admin-test-key-12345678901234567890'
  const workspaceId = 'wrkspc_01abc'

  describe('validateAdminKey', () => {
    it('valid key returns orgId and orgName', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ id: 'org_123', type: 'organization', name: 'My Org' }),
      })
      const adapter = new AnthropicAdapter(adminKey, null)
      const result = await adapter.validateAdminKey()
      expect(result.valid).toBe(true)
      expect(result.orgId).toBe('org_123')
      expect(result.orgName).toBe('My Org')
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/organizations/me',
        expect.objectContaining({ headers: expect.objectContaining({ 'x-api-key': adminKey }) })
      )
    })

    it('401 returns valid: false with error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 })
      const adapter = new AnthropicAdapter(adminKey, null)
      const result = await adapter.validateAdminKey()
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Invalid admin key')
    })
  })

  describe('listActiveApiKeys', () => {
    it('returns only status=active keys', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () =>
          Promise.resolve({
            data: [
              { id: 'key_1', name: 'Key 1', status: 'active', workspace_id: workspaceId, type: 'api_key', created_at: '' },
              { id: 'key_2', name: 'Key 2', status: 'inactive', workspace_id: workspaceId, type: 'api_key', created_at: '' },
            ],
            has_more: false,
          }),
      })
      const adapter = new AnthropicAdapter(adminKey, workspaceId)
      const keys = await adapter.listActiveApiKeys()
      expect(keys).toHaveLength(1)
      expect(keys[0].id).toBe('key_1')
      expect(keys[0].status).toBe('active')
    })

    it('paginates when has_more=true', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () =>
            Promise.resolve({
              data: [{ id: 'key_1', name: 'K1', status: 'active', workspace_id: null, type: 'api_key', created_at: '' }],
              has_more: true,
              last_id: 'key_1',
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () =>
            Promise.resolve({
              data: [{ id: 'key_2', name: 'K2', status: 'active', workspace_id: null, type: 'api_key', created_at: '' }],
              has_more: false,
            }),
        })
      const adapter = new AnthropicAdapter(adminKey, null)
      const keys = await adapter.listActiveApiKeys()
      expect(keys).toHaveLength(2)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('kill', () => {
    it('calls POST for each active key with status:inactive', async () => {
      mockFetch
        .mockResolvedValueOnce(
          mockJsonResponse({
            data: [
              { id: 'key_1', name: 'K1', status: 'active', workspace_id: null, type: 'api_key', created_at: '' },
              { id: 'key_2', name: 'K2', status: 'active', workspace_id: null, type: 'api_key', created_at: '' },
            ],
            has_more: false,
          })
        )
        .mockResolvedValueOnce(mockJsonResponse({}))
        .mockResolvedValueOnce(mockJsonResponse({}))
      const adapter = new AnthropicAdapter(adminKey, null)
      const result = await adapter.kill()
      expect(result.success).toBe(true)
      expect(result.method).toBe('api_key_inactive')
      expect(result.hardBlocked).toBe(2)
      expect(result.effectiveCoverage).toBe(100)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/organizations/api_keys/key_1',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ status: 'inactive' }),
        })
      )
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/organizations/api_keys/key_2',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ status: 'inactive' }),
        })
      )
    })

    it('returns effectiveCoverage 100', async () => {
      mockFetch
        .mockResolvedValueOnce(
          mockJsonResponse({
            data: [{ id: 'key_1', name: 'K1', status: 'active', workspace_id: null, type: 'api_key', created_at: '' }],
            has_more: false,
          })
        )
        .mockResolvedValueOnce(mockJsonResponse({}))
      const adapter = new AnthropicAdapter(adminKey, null)
      const result = await adapter.kill()
      expect(result.effectiveCoverage).toBe(100)
    })
  })

  describe('restore', () => {
    it('calls POST status:active for each key in snapshot', async () => {
      const snapshot = {
        capturedAt: new Date().toISOString(),
        provider: 'ANTHROPIC',
        data: {
          provider: 'ANTHROPIC',
          capturedAt: new Date().toISOString(),
          workspaceId: null,
          apiKeys: [
            { id: 'key_1', name: 'K1', status: 'active' },
            { id: 'key_2', name: 'K2', status: 'active' },
          ],
        } as unknown as AnthropicSnapshot,
      }
      mockFetch.mockResolvedValue(mockJsonResponse({}))
      const adapter = new AnthropicAdapter(adminKey, null)
      const result = await adapter.restore(snapshot)
      expect(result.success).toBe(true)
      expect(result.method).toBe('api_key_active')
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/organizations/api_keys/key_1',
        expect.objectContaining({ body: JSON.stringify({ status: 'active' }) })
      )
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/organizations/api_keys/key_2',
        expect.objectContaining({ body: JSON.stringify({ status: 'active' }) })
      )
    })
  })

  describe('getSnapshot', () => {
    it('returns current active keys as snapshot', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          data: [
            { id: 'key_1', name: 'K1', status: 'active', workspace_id: null, type: 'api_key', created_at: '' },
          ],
          has_more: false,
        })
      )
      const adapter = new AnthropicAdapter(adminKey, null)
      const snapshot = await adapter.getSnapshot()
      expect(snapshot.provider).toBe('ANTHROPIC')
      expect(snapshot.capturedAt).toBeDefined()
      const data = snapshot.data as { apiKeys?: Array<{ id: string; name: string; status: string }> }
      expect(data.apiKeys).toHaveLength(1)
      expect(data.apiKeys?.[0].id).toBe('key_1')
      expect(data.apiKeys?.[0].status).toBe('active')
    })
  })

  describe('getBurnRate', () => {
    it('calculates cost from token counts correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () =>
          Promise.resolve({
            data: [
              {
                workspace_id: null,
                model: 'claude-sonnet-4-6',
                start_time: '',
                end_time: '',
                input_tokens: 1_000_000,
                output_tokens: 100_000,
                cache_creation_input_tokens: 0,
                cache_read_input_tokens: 0,
                requests: 10,
              },
            ],
            has_more: false,
          }),
      })
      const adapter = new AnthropicAdapter(adminKey, null)
      const { burnRatePerHour, windowMinutes } = await adapter.getBurnRate()
      expect(windowMinutes).toBe(15)
      // Sonnet: $3/M input, $15/M output → 1M input = $3, 100k output = $1.5 → total $4.5, over 0.25h = $18/hr
      expect(burnRatePerHour).toBeGreaterThan(0)
      expect(burnRatePerHour).toBeCloseTo(18, 0)
    })
  })

  describe('anthropicFetch retries and errors', () => {
    it('throws typed error on 401', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 401 })
      const adapter = new AnthropicAdapter(adminKey, null)
      const result = await adapter.validateAdminKey()
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Invalid admin key')
    })

    it('retries on 429 with backoff', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 429 })
        .mockResolvedValueOnce(mockJsonResponse({ id: 'org_1', name: 'Org', type: 'organization' }))
      const adapter = new AnthropicAdapter(adminKey, null)
      const result = await adapter.validateAdminKey()
      expect(result.valid).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })
})

describe('estimateCostFromTokens', () => {
  it('Sonnet pricing correct', () => {
    const cost = estimateCostFromTokens('claude-sonnet-4-6', 1_000_000, 1_000_000)
    expect(cost).toBe(3 + 15)
  })

  it('falls back to default for unknown model', () => {
    const cost = estimateCostFromTokens('unknown-model-x', 1_000_000, 0)
    expect(cost).toBe(3)
  })
})
