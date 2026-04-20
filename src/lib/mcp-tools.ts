import { prisma } from './prisma'
import { createTransaction, getUserSummary } from './transactions'
import type { Prisma, TransactionType, TransferType, InvestmentType } from '@prisma/client'
import type { McpAuthContext } from './mcp-auth'

// ─── Tool registry ────────────────────────────────────────────────────────────

export const TOOLS = [
  {
    name: 'get_accounts',
    description:
      'Get all bank accounts and current balances for the authenticated user. ' +
      'Always call this first before add_transaction to get valid account IDs.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_summary',
    description:
      'Get financial summary: total balance, this month income, expenses, ' +
      'savings rate, and total invested. Use to answer "how am I doing this month?"',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_transactions',
    description:
      'Get recent transactions with optional filters. Use to answer questions like ' +
      '"how much did I spend on food?" or "show my last transactions".',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max results 1-100, default 20' },
        type: {
          type: 'string',
          enum: ['INCOME', 'EXPENSE', 'TRANSFER_BANK', 'TRANSFER_PERSON', 'INVESTMENT'],
        },
        category: { type: 'string', description: 'Category filter e.g. food, transport' },
        fromDate: { type: 'string', description: 'Start date YYYY-MM-DD' },
        toDate: { type: 'string', description: 'End date YYYY-MM-DD' },
      },
      required: [],
    },
  },
  {
    name: 'add_transaction',
    description:
      'Add a financial transaction. ' +
      'INCOME = money received. ' +
      'EXPENSE = money spent (food, shopping, bills). ' +
      'TRANSFER_BANK = moving between YOUR OWN accounts (NOT an expense). ' +
      'TRANSFER_PERSON = sending to another person (IS an expense). ' +
      'INVESTMENT = stocks/MF/FD (not counted as expense). ' +
      'Always call get_accounts first to get valid account IDs. ' +
      'Always confirm details with user before calling this.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['INCOME', 'EXPENSE', 'TRANSFER_BANK', 'TRANSFER_PERSON', 'INVESTMENT'],
        },
        amount: { type: 'number', description: 'Amount as plain number e.g. 450' },
        fromAccountId: { type: 'string', description: 'Source account ID from get_accounts' },
        description: { type: 'string' },
        category: {
          type: 'string',
          description:
            'food | transport | utilities | rent | entertainment | health | shopping | education | salary | freelance | investment | transfer | other',
        },
        date: { type: 'string', description: 'YYYY-MM-DD, defaults to today' },
        notes: { type: 'string' },
        toAccountId: { type: 'string', description: 'Required for TRANSFER_BANK' },
        recipientName: { type: 'string', description: 'Required for TRANSFER_PERSON' },
        investmentName: { type: 'string', description: 'Required for INVESTMENT' },
        investmentType: {
          type: 'string',
          enum: ['STOCKS', 'MUTUAL_FUND', 'BONDS', 'REAL_ESTATE', 'CRYPTO', 'OTHER'],
        },
      },
      required: ['type', 'amount', 'fromAccountId'],
    },
  },
  {
    name: 'parse_receipt',
    description:
      'Extract transaction data from a receipt photo, UPI payment screenshot, ' +
      'PhonePe/GPay/Paytm confirmation, or bank SMS screenshot. ' +
      'Accepts image URL or base64 data URL. ' +
      'Call this when user shares an image, then confirm with user before add_transaction.',
    inputSchema: {
      type: 'object',
      properties: {
        image_url: {
          type: 'string',
          description: 'Public URL of the image starting with https://',
        },
        image_base64: {
          type: 'string',
          description: 'Base64 encoded image (without data: prefix)',
        },
        image_media_type: {
          type: 'string',
          enum: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
          description: 'Required when using image_base64',
        },
      },
      required: [],
    },
  },
] as const

// ─── Type helpers ─────────────────────────────────────────────────────────────

type McpTransactionType =
  | 'INCOME'
  | 'EXPENSE'
  | 'TRANSFER_BANK'
  | 'TRANSFER_PERSON'
  | 'INVESTMENT'

function toDbType(mcpType: McpTransactionType): {
  type: TransactionType
  transferType?: TransferType
} {
  if (mcpType === 'TRANSFER_BANK') return { type: 'TRANSFER', transferType: 'BANK' }
  if (mcpType === 'TRANSFER_PERSON') return { type: 'TRANSFER', transferType: 'PERSON' }
  return { type: mcpType as TransactionType }
}

function toMcpType(type: TransactionType, transferType: TransferType | null): string {
  if (type === 'TRANSFER') {
    return transferType === 'BANK' ? 'TRANSFER_BANK' : 'TRANSFER_PERSON'
  }
  return type
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: McpAuthContext
): Promise<unknown> {
  switch (toolName) {
    case 'get_accounts': {
      const accounts = await prisma.bankAccount.findMany({
        where: { userId: ctx.userId },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      })
      const totalBalance = accounts.reduce((s, a) => s + a.balance.toNumber(), 0)
      return {
        accounts: accounts.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          balance: a.balance.toNumber(),
          balanceFormatted: `₹${a.balance.toNumber().toLocaleString('en-IN')}`,
          currency: a.currency,
          isDefault: a.isDefault,
        })),
        totalBalance,
        totalBalanceFormatted: `₹${totalBalance.toLocaleString('en-IN')}`,
        tip: 'Use the id field as fromAccountId or toAccountId in add_transaction',
      }
    }

    case 'get_summary': {
      const summary = await getUserSummary(ctx.userId)
      const savingsRate =
        summary.monthlyIncome > 0
          ? (
              ((summary.monthlyIncome - summary.monthlyExpense) / summary.monthlyIncome) *
              100
            ).toFixed(1)
          : '0'
      return {
        totalBalance: summary.totalBalance,
        totalInvested: summary.totalInvested,
        monthlyIncome: summary.monthlyIncome,
        monthlyExpense: summary.monthlyExpense,
        monthlySavings: summary.monthlyIncome - summary.monthlyExpense,
        savingsRate: `${savingsRate}%`,
        user: { name: ctx.userName, email: ctx.userEmail },
      }
    }

    case 'get_transactions': {
      const limit = Math.min(Number(args.limit ?? 20), 100)
      const where: Prisma.TransactionWhereInput = { userId: ctx.userId }

      if (args.type) {
        const mcpType = args.type as McpTransactionType
        if (mcpType === 'TRANSFER_BANK') {
          where.type = 'TRANSFER'
          where.transferType = 'BANK'
        } else if (mcpType === 'TRANSFER_PERSON') {
          where.type = 'TRANSFER'
          where.transferType = 'PERSON'
        } else {
          where.type = mcpType as TransactionType
        }
      }

      if (args.category) {
        where.category = { contains: args.category as string, mode: 'insensitive' }
      }

      if (args.fromDate ?? args.toDate) {
        where.createdAt = {
          ...(args.fromDate ? { gte: new Date(args.fromDate as string) } : {}),
          ...(args.toDate ? { lte: new Date(args.toDate as string) } : {}),
        }
      }

      const transactions = await prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          fromAccount: { select: { name: true } },
          toAccount: { select: { name: true } },
        },
      })

      const total = transactions.reduce((s, t) => s + t.amount.toNumber(), 0)

      return {
        transactions: transactions.map((t) => ({
          id: t.id,
          type: toMcpType(t.type, t.transferType),
          amount: t.amount.toNumber(),
          amountFormatted: `₹${t.amount.toNumber().toLocaleString('en-IN')}`,
          description: t.description,
          category: t.category,
          date: t.createdAt.toISOString().split('T')[0],
          fromAccount: t.fromAccount?.name,
          toAccount: t.toAccount?.name ?? null,
          recipientName: t.recipientName ?? null,
        })),
        count: transactions.length,
        totalAmount: total,
        totalAmountFormatted: `₹${total.toLocaleString('en-IN')}`,
      }
    }

    case 'add_transaction': {
      if (!args.fromAccountId) throw new Error('fromAccountId is required')

      const fromAccount = await prisma.bankAccount.findFirst({
        where: { id: args.fromAccountId as string, userId: ctx.userId },
      })
      if (!fromAccount) {
        throw new Error('Account not found or does not belong to your account')
      }

      if (args.toAccountId) {
        const toAccount = await prisma.bankAccount.findFirst({
          where: { id: args.toAccountId as string, userId: ctx.userId },
        })
        if (!toAccount) {
          throw new Error('Destination account not found or does not belong to your account')
        }
      }

      const mcpType = args.type as McpTransactionType
      const { type: dbType, transferType } = toDbType(mcpType)

      const tx = await createTransaction({
        userId: ctx.userId,
        type: dbType,
        transferType,
        amount: Number(args.amount),
        description: args.description as string | undefined,
        category: args.category as string | undefined,
        date: args.date ? new Date(args.date as string) : undefined,
        fromAccountId: args.fromAccountId as string,
        toAccountId: args.toAccountId as string | undefined,
        recipientName: args.recipientName as string | undefined,
        investmentName: args.investmentName as string | undefined,
        investmentType: args.investmentType
          ? (args.investmentType as string).toUpperCase()
          : undefined,
      })

      const messages: Record<string, string> = {
        INCOME: `✅ Income of ₹${Number(args.amount).toLocaleString('en-IN')} added`,
        EXPENSE: `✅ Expense of ₹${Number(args.amount).toLocaleString('en-IN')} recorded`,
        TRANSFER_BANK: `✅ Transfer of ₹${Number(args.amount).toLocaleString('en-IN')} recorded (not counted as expense)`,
        TRANSFER_PERSON: `✅ ₹${Number(args.amount).toLocaleString('en-IN')} sent to ${args.recipientName ?? 'recipient'} (added as expense)`,
        INVESTMENT: `✅ ₹${Number(args.amount).toLocaleString('en-IN')} invested in ${args.investmentName ?? 'investment'}`,
      }

      return {
        success: true,
        transactionId: tx.id,
        message: messages[mcpType] ?? '✅ Transaction added',
        addedBy: ctx.userName,
        via: ctx.clientName,
      }
    }

    case 'parse_receipt': {
      const anthropicKey = process.env.ANTHROPIC_API_KEY
      if (!anthropicKey) throw new Error('Image parsing not configured on this server')

      const { default: Anthropic } = await import('@anthropic-ai/sdk')
      const client = new Anthropic({ apiKey: anthropicKey })

      type ImageSource =
        | { type: 'url'; url: string }
        | { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; data: string }

      let imageSource: ImageSource

      if (args.image_url) {
        imageSource = { type: 'url', url: args.image_url as string }
      } else if (args.image_base64) {
        imageSource = {
          type: 'base64',
          media_type: (args.image_media_type as 'image/jpeg') ?? 'image/jpeg',
          data: args.image_base64 as string,
        }
      } else {
        throw new Error('Provide either image_url or image_base64')
      }

      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: imageSource },
              {
                type: 'text',
                text: `You are parsing a receipt or payment screenshot for an Indian expense tracker.

Analyze this image. It could be a receipt, UPI payment (PhonePe/GPay/Paytm),
bank SMS screenshot, or payment confirmation.

Respond ONLY with JSON, no other text:
{
  "amount": <number or null>,
  "date": "<YYYY-MM-DD or null>",
  "merchant": "<name or null>",
  "description": "<brief description or null>",
  "category": "<food|transport|utilities|rent|entertainment|health|shopping|education|other>",
  "type": "<EXPENSE or INCOME>",
  "confidence": <0.0-1.0>,
  "notes": "<any extra context from image>"
}

Rules:
- amount: plain number only, no ₹ symbol
- INCOME if money was received, EXPENSE if money was paid/sent
- UPI: look for Amount Paid/Received, ₹ symbol
- SMS: "debited"→EXPENSE, "credited"→INCOME
- confidence: 0.9+=very clear, 0.5-0.9=readable, <0.5=unclear`,
              },
            ],
          },
        ],
      })

      const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
      const cleaned = text.replace(/```json\n?|\n?```/g, '').trim()

      let data: {
        amount: number | null
        date: string | null
        merchant: string | null
        description: string | null
        category: string
        type: string
        confidence: number
        notes: string
      }
      try {
        data = JSON.parse(cleaned)
      } catch {
        throw new Error('Failed to parse image response')
      }

      if (data.confidence < 0.3) {
        return {
          success: false,
          message: 'Could not read this image clearly. Please share a clearer photo.',
        }
      }

      return {
        success: true,
        confidence: data.confidence,
        extracted: {
          amount: data.amount,
          date: data.date ?? new Date().toISOString().split('T')[0],
          merchant: data.merchant,
          description: data.description,
          category: data.category,
          type: data.type,
          notes: data.notes,
        },
        nextStep: 'Call get_accounts to get account IDs, then call add_transaction to save this',
        confirmationMessage:
          `Found: ${data.merchant ?? 'Unknown'} · ₹${data.amount} · ${data.type} · ${data.category}. ` +
          `Confidence: ${Math.round(data.confidence * 100)}%. Shall I add this transaction?`,
      }
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`)
  }
}
