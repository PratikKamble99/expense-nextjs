import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers })
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const logs = await prisma.mcpCallLog.findMany({
    where: { userId: session.user.id },
    orderBy: { calledAt: 'desc' },
    take: 50,
  })

  return NextResponse.json({ logs })
}
