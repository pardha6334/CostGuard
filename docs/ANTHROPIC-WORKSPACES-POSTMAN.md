# Anthropic Workspaces API — Postman / cURL

Use this to verify the workspaces endpoint works without the UI.

## Endpoint

**Method:** `GET`  
**URL (local):**  
`http://localhost:3000/api/connect/anthropic/workspaces?adminKey=YOUR_ADMIN_KEY`

**URL (Vercel):**  
`https://YOUR_VERCEL_APP.vercel.app/api/connect/anthropic/workspaces?adminKey=YOUR_ADMIN_KEY`

Replace `YOUR_ADMIN_KEY` with your Anthropic **Admin** API key (must start with `sk-ant-admin-`).

---

## Postman

1. **Method:** GET  
2. **URL:** `http://localhost:3000/api/connect/anthropic/workspaces`  
3. **Params** (Query Params):
   - Key: `adminKey`  
   - Value: `sk-ant-admin01-...` (your full Admin key)

No headers required. Send the request.

---

## cURL (copy-paste)

```bash
# Replace the key with your real Admin key
curl -s "http://localhost:3000/api/connect/anthropic/workspaces?adminKey=sk-ant-admin01-YOUR_KEY_HERE"
```

---

## Expected responses

**200 OK** — workspaces listed or fallback:

```json
{
  "workspaces": [
    { "id": "wrkspc_xxx", "name": "My Workspace", "display_color": "#666666" }
  ],
  "list_error": null
}
```

Or when API returns no workspaces / error (fallback):

```json
{
  "workspaces": [
    { "id": "__org__", "name": "Default (entire organization)", "display_color": "#666666" }
  ],
  "list_error": "No workspaces returned by API."
}
```

**400** — invalid or missing key:

```json
{ "error": "Missing adminKey query parameter" }
```

```json
{ "error": "Admin key must start with sk-ant-admin-" }
```

```json
{ "error": "This is a regular API key, not an Admin key. Get your Admin key from console.anthropic.com → Settings → API Keys → Create Admin Key" }
```

```json
{ "error": "Invalid admin key" }
```

---

## Where to see logs

- **Local:** Terminal where `npm run dev` is running. Look for `[CONNECT:ANTHROPIC:WORKSPACES]` and `[ANTHROPIC:WORKSPACES]` / `[ANTHROPIC:FETCH]`.
- **Vercel:** Vercel Dashboard → Project → Logs (runtime logs).

If the API is never called from the UI, no server logs will appear. Use Postman/cURL to confirm the API itself works; then fix the UI triggers (onBlur, “Load workspaces” button, or dropdown focus).
