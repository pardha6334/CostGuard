// src/modules/alerts/email.ts
// CostGuard — Resend email alert sender
import { Resend } from 'resend'

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY
  if (!key || typeof key !== 'string') return null
  return new Resend(key)
}

export interface EmailAlertPayload {
  to: string
  platform: string
  provider: string
  burnRate: number
  threshold: number
  projectedSaved: number
  triggerType: string
}

export async function sendEmailAlert(payload: EmailAlertPayload): Promise<boolean> {
  const { to, platform, provider, burnRate, threshold, projectedSaved, triggerType } = payload
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://costguard.dev'
  const from = process.env.RESEND_FROM_EMAIL || 'alerts@costguard.dev'

  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<title>CostGuard Alert</title>
</head>
<body style="margin:0;padding:0;background:#03030A;font-family:'Courier New',monospace;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">

    <!-- Header -->
    <div style="background:#FF1A2E;border-radius:8px 8px 0 0;padding:20px 24px;display:flex;align-items:center;gap:12px;">
      <span style="font-size:24px;">⚡</span>
      <div>
        <div style="color:white;font-size:18px;font-weight:800;letter-spacing:1px;font-family:sans-serif;">KILL SWITCH TRIGGERED</div>
        <div style="color:rgba(255,255,255,0.8);font-size:12px;font-family:monospace;">${new Date().toISOString()}</div>
      </div>
    </div>

    <!-- Body -->
    <div style="background:#111122;border:1px solid #1C1C38;border-top:none;border-radius:0 0 8px 8px;padding:24px;">

      <!-- Platform badge -->
      <div style="background:#14142A;border:1px solid #252545;border-radius:6px;padding:14px 18px;margin-bottom:20px;">
        <div style="color:#5A5A88;font-size:10px;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;">Platform</div>
        <div style="color:#E0E0FF;font-size:18px;font-weight:700;font-family:sans-serif;">${provider} · ${platform}</div>
        <div style="color:#5A5A88;font-size:11px;margin-top:2px;">Trigger: ${triggerType.replace(/_/g, ' ')}</div>
      </div>

      <!-- Metrics grid -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr>
          <td style="background:#14142A;border:1px solid #1C1C38;border-radius:6px;padding:14px;width:50%;vertical-align:top;">
            <div style="color:#5A5A88;font-size:10px;letter-spacing:1px;margin-bottom:4px;">BURN RATE</div>
            <div style="color:#FF1A2E;font-size:24px;font-weight:800;font-family:sans-serif;">$${burnRate.toFixed(2)}<span style="font-size:12px;color:#5A5A88;">/hr</span></div>
            <div style="color:#5A5A88;font-size:10px;">Limit: $${threshold.toFixed(0)}/hr</div>
          </td>
          <td style="width:12px;"></td>
          <td style="background:#14142A;border:1px solid #1C1C38;border-radius:6px;padding:14px;width:50%;vertical-align:top;">
            <div style="color:#5A5A88;font-size:10px;letter-spacing:1px;margin-bottom:4px;">PROJECTED SAVED</div>
            <div style="color:#00FF6A;font-size:24px;font-weight:800;font-family:sans-serif;">$${projectedSaved.toFixed(0)}</div>
            <div style="color:#5A5A88;font-size:10px;">if not killed (24h)</div>
          </td>
        </tr>
      </table>

      <!-- Warning -->
      <div style="background:rgba(255,184,0,0.06);border:1px solid rgba(255,184,0,0.2);border-radius:6px;padding:12px 16px;margin-bottom:20px;">
        <div style="color:#FFB800;font-size:12px;font-family:monospace;">
          ▲ Service is now halted. Fix the root cause before restoring.
        </div>
      </div>

      <!-- CTA buttons -->
      <div style="display:flex;gap:10px;">
        <a href="${appUrl}/incidents" style="flex:1;background:linear-gradient(135deg,#CC0F20,#FF1A2E);color:white;text-decoration:none;padding:12px 20px;border-radius:6px;font-size:13px;font-weight:700;font-family:sans-serif;letter-spacing:1px;text-align:center;display:block;">↺ RESTORE SERVICE</a>
        <a href="${appUrl}" style="flex:1;background:#14142A;color:#E0E0FF;border:1px solid #252545;text-decoration:none;padding:12px 20px;border-radius:6px;font-size:13px;font-weight:600;font-family:sans-serif;text-align:center;display:block;">View Dashboard</a>
      </div>

    </div>

    <!-- Footer -->
    <div style="text-align:center;padding:20px 0 0;color:#3A3A60;font-size:11px;font-family:monospace;">
      CostGuard · Real-time cost protection · <a href="${appUrl}/settings" style="color:#5A5A88;">Manage alerts</a>
    </div>

  </div>
</body>
</html>`

  const resend = getResend()
  if (!resend) return false
  try {
    const { error } = await resend.emails.send({
      from,
      to,
      subject: `⚡ Kill switch triggered — ${provider} · ${platform} ($${burnRate.toFixed(0)}/hr)`,
      html,
    })
    if (error) { console.error('Resend error:', error); return false }
    return true
  } catch (err) {
    console.error('Email alert failed:', err)
    return false
  }
}
