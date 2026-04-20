import { NextRequest, NextResponse } from 'next/server'
import { resolveMcpAuth, detectClientName, McpAuthError } from '@/lib/mcp-auth'
import { executeTool, TOOLS } from '@/lib/mcp-tools'
import { logMcpCall, summarizeInput } from '@/lib/mcp-logger'

export async function POST(req: NextRequest) {
  const startTime = Date.now()
  let ctx: Awaited<ReturnType<typeof resolveMcpAuth>> | null = null
  let toolName = 'unknown'

  try {
    const clientName = detectClientName(req.headers)
    const clientMeta: Record<string, string> = {
      userAgent: req.headers.get('user-agent') ?? '',
      ip: req.headers.get('x-forwarded-for') ?? '',
      conversationId: req.headers.get('openai-conversation-id') ?? '',
    }

    ctx = await resolveMcpAuth(req.headers.get('authorization'), clientName, clientMeta)

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON', code: 'INVALID_BODY' }, { status: 400 })
    }

    const bodyObj = body as Record<string, unknown>
    toolName = (bodyObj.tool ?? bodyObj.name ?? '') as string
    const args = (bodyObj.arguments ?? bodyObj.params ?? {}) as Record<string, unknown>

    if (!toolName) {
      return NextResponse.json({ error: 'Missing tool name', code: 'MISSING_TOOL' }, { status: 400 })
    }

    const result = await executeTool(toolName, args, ctx)

    logMcpCall({
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      tool: toolName,
      inputSummary: summarizeInput(toolName, args),
      result: 'success',
      durationMs: Date.now() - startTime,
    })

    return NextResponse.json({ result })
  } catch (error: unknown) {
    const err = error as Error

    if (ctx) {
      logMcpCall({
        userId: ctx.userId,
        sessionId: ctx.sessionId,
        tool: toolName,
        result: 'error',
        errorMsg: err.message,
        durationMs: Date.now() - startTime,
      })
    }

    if (error instanceof McpAuthError) {
      const status = error.code === 'USER_NOT_FOUND' ? 403 : 401
      return NextResponse.json({ error: err.message, code: error.code }, { status })
    }

    console.error('[MCP Error]', err)
    return NextResponse.json(
      { error: err.message ?? 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    name: 'Expense Tracker MCP',
    version: '1.0.0',
    tools: TOOLS,
  })
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}
