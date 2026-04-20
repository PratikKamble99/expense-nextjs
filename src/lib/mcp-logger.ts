import { prisma } from './prisma'

interface LogMcpCallOpts {
  userId: string
  sessionId?: string
  tool: string
  inputSummary?: string
  result: 'success' | 'error'
  errorMsg?: string
  durationMs?: number
}

export function logMcpCall(opts: LogMcpCallOpts): void {
  prisma.mcpCallLog.create({ data: opts }).catch(console.error)
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
