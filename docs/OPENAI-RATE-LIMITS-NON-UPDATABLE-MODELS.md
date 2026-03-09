# Why Some OpenAI Models’ Rate Limits Can’t Be Updated (Kill/Restore Skips)

When CostGuard runs **Kill** (or **Restore**), it updates project rate limits via the [OpenAI Rate Limits API](https://developers.openai.com/api/reference/resources/organization/subresources/projects/subresources/rate_limits/). Some models are **skipped** because the API does not allow updating their limits. This doc explains why and links to references.

---

## Live API Test Results — 2026-03-09

| Finding | Result |
|---------|--------|
| max_requests_per_1_minute: 0 | ✅ Accepted — instant hard block |
| Propagation delay at 0 | ✅ None — instant enforcement |
| Rerouting when blocked | ✅ None — clean 429 returned |
| ft:* set to 0 | ❌ rate_limit_not_updatable |
| *-shared set to 0 | ❌ rate_limit_not_updatable |
| *-shared callable via API | ❌ No — ChatGPT internal only |
| Project archive reversible | ❌ Permanent — DO NOT USE |
| Key disable/enable API | ❌ Does not exist |
| Project budget hard stop | ❌ Soft limit only — requests continue |
| sora-2, sora-2-pro | ✅ Fixed with requests-only body (no max_tokens_per_1_minute) |

**Kill coverage summary:**

- 116/170 hard blocked (0 req/min) = 68.2%
- +25 not-enabled (zero risk) = +14.7%
- +16 shared (not your API spend) = +9.4%
- **Effective coverage of real spend = 92.4%**
- Real gap: ft:*(11) with schema fix for sora = 7.6%

---

## 1. Fine-tuned models (`ft:*`)

**Behavior:** We skip any model whose name starts with `ft:` (e.g. `ft:gpt-4o-2024-05-13`, `ft:gpt-3.5-turbo-0125`).

**Why they can’t be updated:**

- Fine-tuned models use rate limits **managed by OpenAI**, not editable per project via the same self-service API as base models.
- If you try to PATCH their rate limit, the API returns **`rate_limit_not_updatable`**.
- Community reports and support guidance say there is **no self-service way** to change fine-tuned model limits; users are directed to contact [support@openai.com](mailto:support@openai.com).

**References:**

- [Rate Limit Issue With Fine-Tuned Model](https://community.openai.com/t/rate-limit-issue-with-fine-tuned-model/15573) — 429s on fine-tuned models; workarounds and support.
- [Rate limit discrepancies across fine-tuned models](https://community.openai.com/t/rate-limit-discrepancies-across-fine-tuned-models/1238011) — Fine-tuned models get default limits (e.g. 250k TPM, 3k RPM) that don’t match base-model tier behavior; no API/dashboard way to adjust.
- [Developer-enforced API rate limits not working properly for fine-tuned models](https://community.openai.com/t/developer-enforced-api-rate-limits-not-working-properly-for-fine-tuned-models/1371786) — Related behavior/bugs for fine-tuned model limits.

---

## 2. Shared-tier models (`*-shared`, `*-alpha-shared`)

**Behavior:** We skip models whose name ends with `-shared` or `-alpha-shared` (e.g. `gpt-4o-2024-05-13-shared`, `gpt-4o-mini-2024-07-18-alpha-shared`).

**Why they can’t be updated:**

- These are **shared capacity** / ChatGPT shared-tier entries. Limits are set at the organization/shared level, not per project.
- The rate limits API returns **`rate_limit_not_updatable`** when you try to update them.
- Official docs describe [shared rate limits](https://developers.openai.com/api/docs/guides/rate-limits) (“Some model families have shared rate limits”) but do not document project-level edits for these entries — in practice the update API rejects them.

**References:**

- [Rate limits | OpenAI API](https://developers.openai.com/api/docs/guides/rate-limits) — “Some model families have shared rate limits … all calls to any model in the given ‘shared limit’ list will count towards that [shared] limit.”
- [Update Rate Limit](https://developers.openai.com/api/reference/resources/organization/subresources/projects/subresources/rate_limits/methods/update_rate_limit) — API allows updating project rate limits; shared-tier models still return `rate_limit_not_updatable` when you try.

---

## 3. Models not enabled for your org (`rate_limit_does_not_exist_for_org_and_model`)

**Behavior:** We treat this API error as “skipped” (not a failure).

**Why:**

- The project/org doesn’t have that model enabled, so there is **no project-level rate limit row** to update. The API returns **`rate_limit_does_not_exist_for_org_and_model`**.
- Skipping is correct: there’s nothing to kill/restore for that model for this org.

**References:**

- Same [Update Rate Limit](https://developers.openai.com/api/reference/resources/organization/subresources/projects/subresources/rate_limits/methods/update_rate_limit) endpoint; error is returned when the rate limit resource doesn’t exist for that org/model.

---

## 4. Different rate limit schema (`invalid_rate_limit_type`)

**Behavior:** We treat this API error as “skipped”.

**Why:**

- Some models use **different limit types**. For example:
  - **Video models** (e.g. `sora-2`, `sora-2-pro`) do **not** support `max_tokens_per_1_minute`; they use other dimensions (e.g. images/video per minute). Sending `max_tokens_per_1_minute` in the PATCH body causes **`invalid_rate_limit_type`**.
  - Image/audio models may only support `max_images_per_1_minute` or `max_audio_megabytes_per_1_minute`, not token-based limits.
- The [Update Rate Limit](https://developers.openai.com/api/reference/resources/organization/subresources/projects/subresources/rate_limits/methods/update_rate_limit) reference states that body parameters are “only relevant for certain models”; sending a parameter that doesn’t apply to that model yields this error.
- We don’t currently send model-specific bodies (e.g. only images for image models), so we skip these and avoid false “real errors.”

**References:**

- [Update Rate Limit — Body parameters](https://developers.openai.com/api/reference/resources/organization/subresources/projects/subresources/rate_limits/methods/update_rate_limit): `max_images_per_1_minute`, `max_audio_megabytes_per_1_minute`, etc. “Only relevant for certain models.”
- [Bug Report: Loss of Dynamic Rate Limit Update for GPT-Image Models](https://community.openai.com/t/bug-report-loss-of-dynamic-rate-limit-update-for-gpt-image-models-via-api/1366667) — Example of model-specific limit types and API behavior.

---

## Summary

| Reason we skip | Model / situation | API behavior | What to do |
|----------------|-------------------|-------------|------------|
| Fine-tuned     | `ft:*`            | `rate_limit_not_updatable` | Limits set by OpenAI; contact support to change. |
| Shared-tier    | `*-shared`, `*-alpha-shared` | `rate_limit_not_updatable` | Org/shared limits; not editable per project. |
| Not enabled    | Model not in org  | `rate_limit_does_not_exist_for_org_and_model` | No limit to update; skip is correct. |
| Wrong schema   | e.g. video/image/audio models | `invalid_rate_limit_type` | Different limit types; we’d need model-specific PATCH bodies to update. |

CostGuard intentionally skips these so that Kill/Restore only updates models that the API allows, and so expected API restrictions are not reported as failures. For fine-tuned or shared-tier limits, the only supported path is [OpenAI support](https://help.openai.com/en/?q=contact) or [support@openai.com](mailto:support@openai.com).

---

## Blast radius of non-updatable models (kill switch impact)

### 1. Which model IDs fall into each non-updatable category?

Exact model IDs depend on the live `GET /organization/projects/{project_id}/rate_limits` response (paginated). CostGuard classifies as follows:

| Category | Criteria | Example model IDs (from typical API response) |
|----------|----------|-----------------------------------------------|
| **ft:\*** (fine-tuned) | `model.startsWith('ft:')` — filtered out before PATCH | `ft:gpt-4o-2024-05-13`, `ft:gpt-3.5-turbo-0125`, `ft:gpt-4o-mini-2024-07-18`, `ft:babbage-002`, `ft:davinci-002`, `ft:gpt-4.1`, `ft:gpt-4.1-mini`, etc. |
| **\*-shared / \*-alpha-shared** | `model.endsWith('-shared')` or `model.endsWith('-alpha-shared')` — filtered out before PATCH | `gpt-4o-2024-05-13-shared`, `gpt-4o-mini-2024-07-18-shared`, `gpt-4o-mini-2024-07-18-alpha-shared`, `gpt-4.1-2025-04-14-shared`, `gpt-4.1-nano-2025-04-14-shared`, `gpt-4o-2024-08-06-alpha-shared`, etc. |
| **invalid_rate_limit_type** | We send PATCH; API returns this error (different rate-limit schema) | `sora-2`, `sora-2-pro` (video; no `max_tokens_per_1_minute`). Others may include image/audio-only models. |
| **rate_limit_does_not_exist_for_org_and_model** | We send PATCH; API returns this error (model not enabled for org) | Any model your org does not have enabled; IDs vary by org. |

In a run with **170 total** rate limits, **145 killable** (attempted), **25 non-updatable skipped** at fetch time = the 25 are the union of **ft:\*** and **\*-shared** / **\*-alpha-shared** from that response. The **29 skipped** during kill (when using per-model kill) are models we attempted to PATCH but the API returned one of: `rate_limit_not_updatable`, `rate_limit_does_not_exist_for_org_and_model`, or `invalid_rate_limit_type`.

### 2. Runaway spend from a fine-tuned model (e.g. ft:gpt-4o-mini-2024-07-18)

**Yes.** If runaway spend is coming from `ft:gpt-4o-mini-2024-07-18`, the current **rate limit kill cannot touch it**. We never send a PATCH for that model (it is excluded by the `ft:*` filter). CostGuard will throttle all updatable models (e.g. base `gpt-4o-mini`, `gpt-4o`), but the ft: model will continue to accept requests at full rate until you use **project archive** (if available) or **app-level kill** (your app blocks ft: requests when kill is active).

### 3. Killability score (from a representative run: 170 total, 116 throttled, 29 skipped, 25 pre-filtered)

- **68% of OpenAI models can be rate-limit killed** (116/170 successfully throttled).
- **32% require project archive (or app-level block) to kill** (25 pre-filtered + 29 API skip = 54 models that cannot be rate-limit updated).

So: *"68% of OpenAI models can be rate-limit killed, 32% require project archive to kill."* (Project archive blocks the entire project regardless of model type.)

---

## Why fine-tuned (ft:) limits can’t be updated (official / community)

- **Managed by OpenAI:** Fine-tuned model rate limits are set and managed by OpenAI at the org/tier level. They are not exposed as editable per project like base models ([Rate limits guide](https://developers.openai.com/api/docs/guides/rate-limits)).
- **Same API, different behavior:** The same [Update Rate Limit](https://developers.openai.com/api/reference/resources/organization/subresources/projects/subresources/rate_limits/methods/update_rate_limit) endpoint that works for `gpt-4o-mini`, `gpt-4o`, etc. returns **`rate_limit_not_updatable`** for `ft:*` — by design, not a bug.
- **Reasons cited:** Infrastructure load, fair access, and abuse prevention; ft models often run on shared/managed capacity.
- **No documented API workaround:** There is no separate API or dashboard control to “update” ft model inference rate limits. Community and help articles direct users to contact support or request exceptions.

**References:** [Rate Limit Issue With Fine-Tuned Model](https://community.openai.com/t/rate-limit-issue-with-fine-tuned-model/15573), [Rate limit discrepancies across fine-tuned models](https://community.openai.com/t/rate-limit-discrepancies-across-fine-tuned-models/1238011), [How do I get more tokens or increase my monthly usage limits?](https://help.openai.com/en/articles/6643435-how-do-i-get-more-tokens-or-increase-my-monthly-usage-limits), [Finetuning rate-limit lift?](https://community.openai.com/t/finetuning-rate-limit-lift/708633).

---

## Workarounds (what you can do)

### 1. Contact OpenAI support (only way to change ft limits on OpenAI’s side)

- **Support:** [Help Center → Contact](https://help.openai.com/en/?q=contact) or [support@openai.com](mailto:support@openai.com). Request a higher rate limit or exception for your fine-tuned model(s). There is no API or UI to change ft limits yourself.
- **Request an exception (some limits):** On the [Usage / Limits page](https://platform.openai.com/account/limits) (or [rate-limits](https://platform.openai.com/account/rate-limits)) there is sometimes a **“Request an exception”** option. It may apply to certain limit types (e.g. concurrent fine-tuning jobs); for inference rate limits on ft models, support is still the authoritative path.

### 2. Higher usage tier (may help, but ft often lags)

- As your spend increases, OpenAI can move you to a higher [usage tier](https://developers.openai.com/api/docs/guides/rate-limits), which increases rate limits for **most** models.
- Community reports: fine-tuned models often stay at default limits (e.g. 250k TPM, 3k RPM) even after tier upgrades; base models get the boost first. So tier alone is not a reliable “workaround” for ft limits.

### 3. Application-level “kill” for ft models (recommended when using CostGuard)

Because we **cannot** change ft model rate limits via the API, CostGuard’s Kill only throttles **updatable** models (e.g. `gpt-4o-mini`, `gpt-4o`). To still “kill” usage of an **ft:** model when over limit:

- **In your own application** (the app that calls the OpenAI API):
  - When CostGuard has tripped (e.g. circuit breaker OPEN or you get a webhook/alert), **stop or throttle requests to the ft: model**:
    - Option A: Return 503 or “over budget” from your API when the kill is active and the request would use an `ft:*` model.
    - Option B: Queue or delay ft: requests until the circuit is CLOSED or HALF_OPEN and you’ve restored.
  - Use CostGuard’s dashboard, API, or webhooks to know when the kill is active so your app can enforce the block.

This way you effectively “update” the limit from your side: the ft: model is still capable of high throughput on OpenAI, but **your app** refuses or delays those calls when over limit. CostGuard cannot do this inside the OpenAI platform; it has to be implemented in the service that issues the requests.

---

## How to achieve app-level kill (concrete steps)

**What it is:** Your application (the one that calls the OpenAI API) checks whether CostGuard has triggered a kill for your platform. When kill is active, your app **blocks or queues** requests that would use an `ft:*` model (e.g. return 503 or "over budget") instead of sending them to OpenAI. OpenAI's rate limit for the ft model is unchanged; you simply stop issuing ft requests from your side.

### Step 1: Know when kill is active

CostGuard stores circuit breaker state per platform. When the circuit is **OPEN**, kill is active (we've throttled updatable models; ft models are still usable by OpenAI, so your app must block them).

- **Option A — Poll CostGuard API (recommended):** Your backend calls CostGuard's list endpoint with the same auth your dashboard uses (e.g. Supabase session or a service key). From the response you can see which platform is "killed."
  - **Endpoint:** `GET /api/platforms` (or your CostGuard base URL + `/api/platforms`).
  - **Auth:** Same as the CostGuard dashboard (e.g. `Authorization: Bearer <Supabase session token>` or your app's server-side auth to CostGuard).
  - **Response:** Each platform has `id`, `displayName`, `provider`, and **`breakerState`**: `'CLOSED'` | `'OPEN'` | `'HALF_OPEN'`.
  - **Kill active:** For the platform that backs your OpenAI project, `breakerState === 'OPEN'`.

- **Option B — Webhook (if you add one):** CostGuard could send a webhook when kill is triggered and when restore completes. Your app would set a local flag (e.g. `killActive = true`) and clear it on restore. Today the codebase has alert webhooks (e.g. Resend/Slack); a dedicated "kill active" webhook could be added later for app-level kill.

### Step 2: Before calling OpenAI with an ft: model, check and block

In the code path where you call the Chat Completions (or other) API with a model name:

1. If the requested model starts with `ft:` (e.g. `ft:gpt-4o-2024-05-13`):
2. Call CostGuard (or use a cached value, see below) to see if the platform's `breakerState === 'OPEN'`.
3. If OPEN, **do not** call OpenAI for that ft model: return 503, or a clear "over budget / temporarily disabled" response, or enqueue the request for later.
4. If CLOSED or HALF_OPEN, proceed as usual.

**Caching:** To avoid calling CostGuard on every request, cache the "kill active" result (e.g. per platform id) for 30–60 seconds and refresh in the background or on a timer.

### Example (pseudo-code, Node/TypeScript)

```ts
// In your app that calls OpenAI (e.g. API route or backend service)

const COSTGUARD_API = 'https://your-costguard.vercel.app'; // or env

async function isKillActive(platformId: string, authToken: string): Promise<boolean> {
  const res = await fetch(`${COSTGUARD_API}/api/platforms`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) return false;
  const { platforms } = await res.json();
  const platform = platforms?.find((p: { id: string }) => p.id === platformId);
  return platform?.breakerState === 'OPEN';
}

// Before calling OpenAI for a completion:
if (model.startsWith('ft:')) {
  const killActive = await isKillActive(YOUR_COSTGUARD_PLATFORM_ID, costGuardAuthToken);
  if (killActive) {
    return res.status(503).json({
      error: 'over_budget',
      message: 'Usage limit reached; fine-tuned model temporarily disabled. Try again later or use a base model.',
    });
  }
}
// … proceed with OpenAI API call
```

Use your actual CostGuard base URL, platform id (the one that represents your OpenAI project in CostGuard), and auth (e.g. Supabase session or a dedicated API token if you add one). This gives you **app-level kill** for ft models: when CostGuard has tripped, your app stops sending ft requests instead of relying on OpenAI to throttle them (which it won't for ft).
