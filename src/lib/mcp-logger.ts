import * as Sentry from '@sentry/nextjs'
import { prisma } from './prisma'
import { logger } from './logger'

interface LogMcpCallOpts {
  userId: string
  sessionId?: string
  tool: string
  inputSummary?: string
  result: 'success' | 'error'
  errorMsg?: string
  durationMs?: number
  userEmail?: string
  client?: string
}

interface LogMcpAuthOpts {
  event: 'mcp_auth_success' | 'mcp_auth_error'
  code?: string
  client: string
  userEmail?: string
  userId?: string
  ip?: string
  errorMsg?: string
}

export function logMcpCall(opts: LogMcpCallOpts): void {
  const isError = opts.result === 'error'

  logger[isError ? 'error' : 'info']({
    event: 'mcp_call',
    tool: opts.tool,
    result: opts.result,
    userId: opts.userId,
    ...(opts.userEmail && { userEmail: opts.userEmail }),
    ...(opts.client && { client: opts.client }),
    ...(opts.sessionId && { sessionId: opts.sessionId }),
    ...(opts.inputSummary && { inputSummary: opts.inputSummary }),
    ...(opts.durationMs !== undefined && { durationMs: opts.durationMs }),
    ...(opts.errorMsg && { errorMsg: opts.errorMsg }),
  })

  // Sentry: breadcrumb for every call; captureEvent only on errors
  Sentry.addBreadcrumb({
    category: 'mcp',
    message: `${opts.tool} → ${opts.result}`,
    level: isError ? 'error' : 'info',
    data: {
      tool: opts.tool,
      inputSummary: opts.inputSummary,
      durationMs: opts.durationMs,
      client: opts.client,
    },
  })

  if (isError) {
    Sentry.captureEvent({
      message: `MCP tool error: ${opts.tool}`,
      level: 'error',
      tags: { tool: opts.tool, client: opts.client ?? 'unknown' },
      user: opts.userId ? { id: opts.userId, email: opts.userEmail } : undefined,
      extra: {
        errorMsg: opts.errorMsg,
        inputSummary: opts.inputSummary,
        durationMs: opts.durationMs,
        sessionId: opts.sessionId,
      },
    })
  }

  // DB — fire-and-forget
  prisma.mcpCallLog.create({
    data: {
      userId: opts.userId,
      sessionId: opts.sessionId,
      tool: opts.tool,
      inputSummary: opts.inputSummary,
      result: opts.result,
      errorMsg: opts.errorMsg,
      durationMs: opts.durationMs,
    },
  }).catch((err: unknown) => {
    logger.error({ event: 'mcp_db_log_error', error: String(err) })
    Sentry.captureException(err, { tags: { source: 'mcp_db_log' } })
  })
}

export function logMcpAuthEvent(opts: LogMcpAuthOpts): void {
  const isError = opts.event === 'mcp_auth_error'
  logger[isError ? 'warn' : 'info']({
    event: opts.event,
    client: opts.client,
    ...(opts.code && { code: opts.code }),
    ...(opts.userEmail && { userEmail: opts.userEmail }),
    ...(opts.userId && { userId: opts.userId }),
    ...(opts.ip && { ip: opts.ip }),
    ...(opts.errorMsg && { errorMsg: opts.errorMsg }),
  })

  if (isError) {
    Sentry.captureEvent({
      message: `MCP auth error: ${opts.code ?? 'unknown'}`,
      level: 'warning',
      tags: { client: opts.client, code: opts.code ?? 'unknown' },
      extra: { errorMsg: opts.errorMsg, ip: opts.ip },
    })
  }
}

export function summarizeInput(tool: string, args: Record<string, unknown>): string {
  switch (tool) {
    case 'add_transaction':
      return `${args.type} ₹${args.amount} ${args.category ?? ''}`.trim()
    case 'get_transactions':
      return `last ${args.limit ?? 20} ${args.type ?? 'all'} ${args.category ?? ''}`.trim()
    case 'parse_receipt':
      return `image:${String(args.image_url ?? '').startsWith('http') ? 'url' : 'base64'}`
    default:
      return tool
  }
}
