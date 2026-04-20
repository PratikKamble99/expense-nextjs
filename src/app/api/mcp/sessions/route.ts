import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers })
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [sessions, stats, totalCalls] = await Promise.all([
    prisma.mcpSession.findMany({
      where: { userId: session.user.id },
      orderBy: { lastActiveAt: 'desc' },
    }),
    prisma.mcpCallLog.groupBy({
      by: ['tool'],
      where: { userId: session.user.id },
      _count: { tool: true },
      orderBy: { _count: { tool: 'desc' } },
    }),
    prisma.mcpCallLog.count({ where: { userId: session.user.id } }),
  ])

  return NextResponse.json({ sessions, stats, totalCalls })
}

export async function DELETE(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers })
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { sessionId } = body as { sessionId: string }
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
  }

  await prisma.mcpSession.deleteMany({
    where: { id: sessionId, userId: session.user.id },
  })

  return NextResponse.json({ success: true })
}
