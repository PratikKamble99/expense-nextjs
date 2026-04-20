import { NextRequest, NextResponse } from 'next/server'
import { resolveMcpAuth, detectClientName, McpAuthError } from '@/lib/mcp-auth'
import { executeTool, TOOLS } from '@/lib/mcp-tools'
import { logMcpCall, summarizeInput } from '@/lib/mcp-logger'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? ''

// GET /api/mcp/sse — Claude Desktop opens this SSE stream
export async function GET(req: NextRequest) {
  const apiKey =
    req.nextUrl.searchParams.get('api_key') ?? req.headers.get('authorization')

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `event: endpoint\ndata: ${JSON.stringify({
            uri: `${APP_URL}/api/mcp/sse`,
          })}\n\n`
        )
      )
      controller.enqueue(
        encoder.encode(
          `event: tools\ndata: ${JSON.stringify({ tools: TOOLS })}\n\n`
        )
      )
    },
  })

  // Suppress unused variable warning — apiKey may be used for future auth checks
  void apiKey

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

// POST /api/mcp/sse — JSON-RPC 2.0 message handler
export async function POST(req: NextRequest) {
  try {
    const clientName = detectClientName(req.headers)
    const authHeader =
      req.headers.get('authorization') ??
      `Bearer ${req.nextUrl.searchParams.get('api_key') ?? ''}`

    const ctx = await resolveMcpAuth(authHeader, clientName)

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json(
        { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
        { status: 400 }
      )
    }

    const { id, method, params } = body as {
      id: unknown
      method: string
      params: Record<string, unknown>
    }

    if (method === 'tools/list') {
      return NextResponse.json({ jsonrpc: '2.0', id, result: { tools: TOOLS } })
    }

    if (method === 'initialize') {
      return NextResponse.json({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'expense-tracker', version: '1.0.0' },
        },
      })
    }

    if (method === 'tools/call') {
      const toolName = (params?.name ?? '') as string
      const args = (params?.arguments ?? {}) as Record<string, unknown>
      const startTime = Date.now()

      try {
        const result = await executeTool(toolName, args, ctx)
        logMcpCall({
          userId: ctx.userId,
          sessionId: ctx.sessionId,
          tool: toolName,
          inputSummary: summarizeInput(toolName, args),
          result: 'success',
          durationMs: Date.now() - startTime,
        })
        return NextResponse.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          },
        })
      } catch (err: unknown) {
        const e = err as Error
        logMcpCall({
          userId: ctx.userId,
          sessionId: ctx.sessionId,
          tool: toolName,
          result: 'error',
          errorMsg: e.message,
          durationMs: Date.now() - startTime,
        })
        return NextResponse.json({
          jsonrpc: '2.0',
          id,
          error: { code: -32000, message: e.message },
        })
      }
    }

    return NextResponse.json({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    })
  } catch (err: unknown) {
    const e = err as Error
    if (err instanceof McpAuthError) {
      return NextResponse.json(
        { jsonrpc: '2.0', id: null, error: { code: 401, message: e.message } },
        { status: 401 }
      )
    }
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32603, message: e.message } },
      { status: 500 }
    )
  }
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
