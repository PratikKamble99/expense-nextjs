import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const PAGE_SIZE = 50

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers })
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const scope = searchParams.get('scope')

  const isAdmin =
    !!process.env.ADMIN_EMAIL &&
    session.user.email === process.env.ADMIN_EMAIL

  if (scope === 'all' && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const where = scope === 'all' ? {} : { userId: session.user.id }

  const [logs, total] = await Promise.all([
    prisma.mcpCallLog.findMany({
      where,
      orderBy: { calledAt: 'desc' },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: scope === 'all'
        ? { user: { select: { email: true, name: true } } }
        : undefined,
    }),
    prisma.mcpCallLog.count({ where }),
  ])

  return NextResponse.json({ logs, total, page, pageSize: PAGE_SIZE, isAdmin })
}
