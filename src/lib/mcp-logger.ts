import fs from 'fs'
import path from 'path'
import { prisma } from './prisma'

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

// ── File logger (only when LOG_TO_FILE=true) ──────────────────────────────────

const FILE_LOG_ENABLED = process.env.LOG_TO_FILE === 'true'

function getLogFilePath(): string {
  const date = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  return path.join(process.cwd(), 'logs', `mcp-${date}.log`)
}

function writeToFile(line: string): void {
  try {
    const filePath = getLogFilePath()
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.appendFileSync(filePath, line + '\n', 'utf8')
  } catch {
    // never let file I/O crash a request
  }
}

// ── Emit: stdout (Vercel) + optional file ────────────────────────────────────

function emit(payload: Record<string, unknown>): void {
  const line = JSON.stringify({ ...payload, ts: new Date().toISOString() })
  console.log(line)
  if (FILE_LOG_ENABLED) writeToFile(line)
}

// ── Public API ────────────────────────────────────────────────────────────────

export function logMcpCall(opts: LogMcpCallOpts): void {
  emit({
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
    console.error(JSON.stringify({ event: 'mcp_db_log_error', error: String(err), ts: new Date().toISOString() }))
  })
}

export function logMcpAuthEvent(opts: LogMcpAuthOpts): void {
  emit({
    event: opts.event,
    client: opts.client,
    ...(opts.code && { code: opts.code }),
    ...(opts.userEmail && { userEmail: opts.userEmail }),
    ...(opts.userId && { userId: opts.userId }),
    ...(opts.ip && { ip: opts.ip }),
    ...(opts.errorMsg && { errorMsg: opts.errorMsg }),
  })
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
