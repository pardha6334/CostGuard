// src/modules/alerts/slack.ts
// CostGuard — Slack webhook alert sender (Block Kit format)
export interface SlackAlertPayload {
  webhookUrl: string
  platform: string
  provider: string
  burnRate: number
  threshold: number
  projectedSaved: number
  triggerType: string
  appUrl: string
  error?: string
}

export async function sendSlackAlert(payload: SlackAlertPayload): Promise<boolean> {
  const { webhookUrl, platform, provider, burnRate, threshold, projectedSaved, triggerType, error } = payload
  const appUrl = payload.appUrl || process.env.NEXT_PUBLIC_APP_URL || 'https://costguard.dev'
  const isKillFailed = triggerType === 'KILL_FAILED'

  const body = {
    text: isKillFailed ? `❌ CostGuard Kill FAILED — ${platform}` : `⚡ CostGuard Kill Switch Triggered — ${platform}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: isKillFailed ? '❌ Kill FAILED' : '⚡ Kill Switch Triggered', emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Platform*\n${provider} · ${platform}` },
          { type: 'mrkdwn', text: `*Trigger*\n${triggerType.replace(/_/g, ' ')}` },
          ...(error ? [{ type: 'mrkdwn' as const, text: `*Error*\n${error}` }] : []),
          { type: 'mrkdwn', text: `*Burn Rate*\n$${burnRate.toFixed(2)}/hr` },
          { type: 'mrkdwn', text: `*Threshold*\n$${threshold.toFixed(2)}/hr` },
          { type: 'mrkdwn', text: `*Projected Saved (24h)*\n$${projectedSaved.toFixed(0)}` },
          { type: 'mrkdwn', text: `*Time*\n${new Date().toLocaleString('en-US', { timeZone: 'UTC' })} UTC` },
        ],
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '↺ Restore Service', emoji: true },
            style: 'primary',
            url: `${appUrl}/incidents`,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'View Dashboard', emoji: true },
            url: appUrl,
          },
        ],
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: 'CostGuard automatically killed this platform. Restore manually after fixing root cause.' },
        ],
      },
    ],
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return res.ok
  } catch (err) {
    console.error('Slack alert failed:', err)
    return false
  }
}
