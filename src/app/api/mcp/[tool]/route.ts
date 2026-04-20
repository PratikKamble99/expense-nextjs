import { NextRequest, NextResponse } from 'next/server'
import { resolveMcpAuth, detectClientName, McpAuthError } from '@/lib/mcp-auth'
import { executeTool } from '@/lib/mcp-tools'
import { logMcpCall, summarizeInput } from '@/lib/mcp-logger'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tool: string }> }
) {
  const { tool: toolName } = await params
  const startTime = Date.now()
  let ctx: Awaited<ReturnType<typeof resolveMcpAuth>> | null = null

  try {
    const clientName = detectClientName(req.headers)
    const clientMeta: Record<string, string> = {
      userAgent: req.headers.get('user-agent') ?? '',
      ip: req.headers.get('x-forwarded-for') ?? '',
      conversationId: req.headers.get('openai-conversation-id') ?? '',
    }

    ctx = await resolveMcpAuth(req.headers.get('authorization'), clientName, clientMeta)

    let args: Record<string, unknown> = {}
    try {
      const body = await req.json()
      if (body && typeof body === 'object') args = body as Record<string, unknown>
    } catch {
      // no-args tools (get_accounts, get_summary) send empty bodies
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

    return NextResponse.json({ result }, {
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
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
      return NextResponse.json(
        { error: err.message, code: error.code },
        { status, headers: { 'Access-Control-Allow-Origin': '*' } }
      )
    }

    console.error('[MCP Tool Error]', toolName, err)
    return NextResponse.json(
      { error: err.message ?? 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
    )
  }
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}
