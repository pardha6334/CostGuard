# Anthropic Adapter — CostGuard

The Anthropic adapter monitors spend per workspace and implements a kill switch by deactivating all API keys in the workspace. Coverage is **100%** (no exceptions like OpenAI’s ft:* models).

## Kill Mechanism

| Aspect | Detail |
|--------|--------|
| **Method** | API key status → `inactive` |
| **Endpoint** | `POST /v1/organizations/api_keys/{api_key_id}` |
| **Body** | `{ "status": "inactive" }` |
| **Coverage** | 100% — all keys in the selected workspace |
| **Propagation** | ~instant (auth DB lookup, no CDN cache) |
| **In-flight requests** | Complete; only **new** requests are blocked |
| **Restore** | `POST { "status": "active" }` per key from snapshot |

## API Endpoints Used

| Purpose | Method | URL |
|---------|--------|-----|
| Validate admin key | GET | `https://api.anthropic.com/v1/organizations/me` |
| List workspaces | GET | `https://api.anthropic.com/v1/organizations/workspaces` |
| List API keys | GET | `https://api.anthropic.com/v1/organizations/api_keys?status=active&workspace_id=...` |
| Cost report | GET | `https://api.anthropic.com/v1/organizations/cost_report?starting_at=...&ending_at=...&group_by[]=workspace_id` |
| Usage report (burn rate) | GET | `https://api.anthropic.com/v1/organizations/usage_report/messages?starting_at=...&ending_at=...&bucket_width=1m&group_by[]=model` |
| Set key status (kill/restore) | POST | `https://api.anthropic.com/v1/organizations/api_keys/{api_key_id}` |

All requests use:

- **Headers:** `anthropic-version: 2023-06-01`, `x-api-key: <admin key>`, `content-type: application/json`
- **Auth:** `x-api-key` with an Admin key (not `Authorization: Bearer`)

## Difference from OpenAI Adapter

| | OpenAI | Anthropic |
|---|--------|-----------|
| **Kill mechanism** | Set rate limits to 0 req/min per model | Set all API keys in workspace to `inactive` |
| **Scope** | Project (rate limits) | Workspace (keys) |
| **Coverage** | ~92.4% (ft:* and some models excluded) | 100% |
| **Snapshot** | Original rate limits per model | List of active key IDs (and names) |
| **Restore** | PATCH each model back to snapshot values | POST `status: active` for each key |
| **Propagation** | Instant (0 req/min) | Instant (key status) |

## Admin Key Requirements

- **Format:** Must start with `sk-ant-admin-` (Admin key).
- **Regular API keys** (`sk-ant-api-...`) are **rejected** — they cannot list workspaces, list keys, or change key status.
- Only org admins can create Admin keys in the Anthropic console.
- One Admin key can manage the entire org and all workspaces.

**Where to get an Admin key:**  
[console.anthropic.com](https://console.anthropic.com) → Settings → API Keys → Create Admin Key.

## Coverage: 100%

Unlike the OpenAI adapter (93.5% due to ft:* and similar limits), the Anthropic adapter achieves **100%** API access lockdown by deactivating every key in the workspace. There are no exceptions and no app-level workarounds.

## Connect Flow

1. User enters Admin key → validated via `GET /v1/organizations/me`.
2. Workspaces are listed → `GET /v1/organizations/workspaces` (archived skipped).
3. User selects a workspace → platform is created with `workspaceId` and `workspaceName`.
4. Credentials stored: encrypted `{ adminKey }`; `workspaceId` and `workspaceName` on the Platform record.

## Token Pricing (Burn Rate)

Burn rate is derived from the usage report and a per-model token price table (e.g. Claude Sonnet, Opus, Haiku). See `ANTHROPIC_PRICES` and `estimateCostFromTokens()` in `src/modules/adapters/anthropic.adapter.ts`.
