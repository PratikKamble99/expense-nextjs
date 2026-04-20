import { NextResponse } from 'next/server'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://your-app.vercel.app'

export async function GET() {
  const spec = {
    openapi: '3.1.0',
    info: {
      title: 'Expense Tracker',
      description:
        'Add and query personal financial transactions. Track income, expenses, investments and bank transfers.',
      version: '1.0.0',
    },
    servers: [{ url: APP_URL }],
    paths: {
      '/api/mcp': {
        post: {
          operationId: 'callTool',
          summary: 'Execute an expense tracker tool',
          description:
            'Call any available tool. Always call get_accounts before add_transaction. ' +
            'For image receipts: call parse_receipt first, confirm with user, then add_transaction.',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['tool'],
                  properties: {
                    tool: {
                      type: 'string',
                      enum: [
                        'get_accounts',
                        'get_summary',
                        'get_transactions',
                        'add_transaction',
                        'parse_receipt',
                      ],
                      description: 'Name of the tool to execute',
                    },
                    arguments: {
                      type: 'object',
                      description: 'Tool-specific arguments',
                    },
                  },
                },
                examples: {
                  addExpense: {
                    summary: 'Add an expense',
                    value: {
                      tool: 'add_transaction',
                      arguments: {
                        type: 'EXPENSE',
                        amount: 450,
                        fromAccountId: 'account-id-from-get-accounts',
                        description: 'Lunch at Subway',
                        category: 'food',
                      },
                    },
                  },
                  parseReceipt: {
                    summary: 'Parse a receipt image',
                    value: {
                      tool: 'parse_receipt',
                      arguments: {
                        image_url: 'https://example.com/receipt.jpg',
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Tool executed successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      result: { type: 'object', description: 'Tool response data' },
                    },
                  },
                },
              },
            },
            '401': {
              description: 'Invalid or missing API key',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      error: { type: 'string' },
                      code: {
                        type: 'string',
                        enum: ['MISSING_KEY', 'INVALID_KEY'],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'API Key',
          description: 'Generate your API key at Settings → API Keys',
        },
      },
    },
  }

  return NextResponse.json(spec, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  })
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}
