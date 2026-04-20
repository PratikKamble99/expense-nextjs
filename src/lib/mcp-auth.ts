import { validateApiKey } from './api-auth'
import { prisma } from './prisma'

export interface McpAuthContext {
  userId: string
  apiKeyId: string
  sessionId: string
  clientName: string
  userName: string
  userEmail: string
}

export class McpAuthError extends Error {
  constructor(
    public code: 'MISSING_KEY' | 'INVALID_KEY' | 'USER_NOT_FOUND',
    message: string
  ) {
    super(message)
    this.name = 'McpAuthError'
  }
}

export async function resolveMcpAuth(
  authHeader: string | null,
  clientName: string = 'unknown',
  clientMeta?: Record<string, string>
): Promise<McpAuthContext> {
  if (!authHeader?.startsWith('Bearer ')) {
    throw new McpAuthError(
      'MISSING_KEY',
      'Authorization header required. Format: Bearer <your-api-key>. Generate a key at Settings → API Keys.'
    )
  }

  const result = await validateApiKey(authHeader)
  if (!result.ok) {
    throw new McpAuthError('INVALID_KEY', result.error)
  }

  const user = await prisma.user.findUnique({ where: { id: result.userId } })
  if (!user) {
    throw new McpAuthError('USER_NOT_FOUND', 'User account not found.')
  }

  const sessionId = `${result.keyId}_${clientName}`

  await Promise.all([
    prisma.mcpSession.upsert({
      where: { id: sessionId },
      update: {
        lastActiveAt: new Date(),
        ...(clientMeta !== undefined && { clientMeta }),
      },
      create: {
        id: sessionId,
        userId: result.userId,
        apiKeyId: result.keyId,
        clientName,
        ...(clientMeta !== undefined && { clientMeta }),
      },
    }),
    prisma.apiKey.update({
      where: { id: result.keyId },
      data: { usageCount: { increment: 1 } },
    }),
  ])

  return {
    userId: result.userId,
    apiKeyId: result.keyId,
    sessionId,
    clientName,
    userName: user.name ?? 'User',
    userEmail: user.email,
  }
}

export function detectClientName(headers: Headers): string {
  const ua = headers.get('user-agent') ?? ''
  const gptHeader = headers.get('openai-conversation-id')
  if (gptHeader || ua.toLowerCase().includes('chatgpt')) return 'chatgpt'
  if (ua.toLowerCase().includes('claude')) return 'claude'
  if (ua.toLowerCase().includes('cursor')) return 'cursor'
  return 'custom'
}
