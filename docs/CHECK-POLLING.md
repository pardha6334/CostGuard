# How to check if polling is running

The poll endpoint is **`/api/cron/poll`**. It only **runs** when it receives a **POST** request (from QStash in production or from you locally with a secret header).

---

## Why you saw "HTTP ERROR 405"

Opening `https://your-app.vercel.app/api/cron/poll` in the **browser** sends a **GET** request. This route is designed to accept only **POST** (so random visitors can’t trigger a poll). The server responds with **405 Method Not Allowed** for GET.

So 405 in the browser is **expected**, not a bug. Polling is triggered by **POST** (e.g. from QStash or from your own script).

---

## 1. Check that the endpoint is there (browser)

After the latest deploy you can open in the browser:

**`https://your-app.vercel.app/api/cron/poll`**

- You should get **200** and a JSON message like:  
  `"Cron poll endpoint. Use POST to run a poll (QStash or x-cron-secret)."`  
  That confirms the route is deployed and reachable. Polling still only runs when something **POST**s to it.

---

## 2. Check if polling is actually being called

### Production (QStash)

1. **Upstash dashboard**  
   Go to [console.upstash.com](https://console.upstash.com) → **QStash** → **Schedules** (or **Logs**).  
   Confirm you have a schedule that **POST**s to  
   `https://your-app.vercel.app/api/cron/poll`  
   (e.g. every minute). Check the **logs** for that schedule: successful runs show 200; 401 usually means signature/env issue.

2. **Vercel logs**  
   Vercel Dashboard → your project → **Logs** (or **Deployments** → select deployment → **Functions**).  
   Filter by `/api/cron/poll`. When QStash triggers the cron you should see **POST** requests and 200 responses (or 401 if signature verification fails).

If the schedule exists and logs show **POST** → **200**, polling **is** running.

### Local (manual POST)

From a terminal (replace with your local URL and `CRON_SECRET` from `.env.local`):

**PowerShell (Windows):**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/cron/poll" -Method POST -Headers @{ "x-cron-secret" = "YOUR_CRON_SECRET" }
```

**Or with curl.exe (if installed):**
```powershell
curl.exe -X POST http://localhost:3000/api/cron/poll -H "x-cron-secret: YOUR_CRON_SECRET"
```

**Bash / Git Bash:**
```bash
curl -X POST http://localhost:3000/api/cron/poll -H "x-cron-secret: YOUR_CRON_SECRET"
```

- **200** with body like `{"ok":true,"polled":3,"killed":0,"errors":[]}` → poll ran.  
- **401** → wrong or missing `x-cron-secret`.

---

## 3. Trigger a poll in production (manual test)

Production expects a **QStash-signed** POST. You can’t trigger a real poll from the browser or a simple `curl` without that signature. So:

- **Easiest:** Rely on the **QStash schedule** and confirm in **QStash logs** and **Vercel logs** that POSTs to `/api/cron/poll` are 200.
- **Optional:** In QStash you can often “Run now” or “Test” the schedule once to trigger a single POST and then check Vercel logs.

---

## 4. Checklist

| Check | What to do |
|-------|------------|
| Endpoint exists | Open `https://your-app.vercel.app/api/cron/poll` in browser → expect 200 and the “Use POST…” message. |
| Production polling | QStash schedule points to that URL; QStash + Vercel logs show POST requests and 200. |
| Local polling | `curl -X POST .../api/cron/poll -H "x-cron-secret: YOUR_CRON_SECRET"` → 200 and `polled` in JSON. |

If the schedule is missing or wrong, add/update it in the Upstash QStash dashboard so it POSTs to your production URL every minute (or your desired interval).
