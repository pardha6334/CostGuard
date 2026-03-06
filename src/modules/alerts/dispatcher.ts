// src/modules/alerts/dispatcher.ts
// CostGuard — Sends kill alerts via all configured channels in parallel
import { sendSlackAlert } from './slack'
import { sendEmailAlert } from './email'

export interface AlertPayload {
  type: 'kill' | 'warning' | 'restore'
  platform: string           // displayName
  provider: string           // e.g. "OPENAI"
  burnRate: number
  threshold: number
  projectedSaved: number
  triggerType: string
  user: {
    email: string
    slackWebhook?: string | null
    alertEmail?: boolean
    alertSlack?: boolean
  }
}

export interface AlertResult {
  slack: boolean | null   // null = not configured
  email: boolean | null   // null = not configured
}

export async function sendAlert(payload: AlertPayload): Promise<AlertResult> {
  const { user, platform, provider, burnRate, threshold, projectedSaved, triggerType } = payload
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://costguard.dev'

  const jobs: Promise<void>[] = []
  const result: AlertResult = { slack: null, email: null }

  // Slack — only if webhook configured and alerts enabled
  if (user.slackWebhook && user.alertSlack !== false) {
    jobs.push(
      sendSlackAlert({ webhookUrl: user.slackWebhook, platform, provider, burnRate, threshold, projectedSaved, triggerType, appUrl })
        .then(ok => { result.slack = ok })
        .catch(err => { console.error('Slack dispatch error:', err); result.slack = false })
    )
  }

  // Email — always send unless explicitly disabled
  if (user.alertEmail !== false) {
    jobs.push(
      sendEmailAlert({ to: user.email, platform, provider, burnRate, threshold, projectedSaved, triggerType })
        .then(ok => { result.email = ok })
        .catch(err => { console.error('Email dispatch error:', err); result.email = false })
    )
  }

  // Fire all channels in parallel — one failing never blocks the other
  await Promise.allSettled(jobs)

  return result
}
