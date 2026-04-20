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
      '/api/mcp/get_accounts': {
        post: {
          operationId: 'getAccounts',
          summary: 'List all bank accounts',
          description:
            'Get all bank accounts and current balances. Always call this first before add_transaction to get valid account IDs.',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: false,
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          responses: {
            '200': {
              description: 'List of accounts with balances',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      result: {
                        type: 'object',
                        properties: {
                          accounts: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                id: { type: 'string' },
                                name: { type: 'string' },
                                type: { type: 'string' },
                                balance: { type: 'number' },
                                balanceFormatted: { type: 'string' },
                                currency: { type: 'string' },
                                isDefault: { type: 'boolean' },
                              },
                            },
                          },
                          totalBalance: { type: 'number' },
                          totalBalanceFormatted: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },

      '/api/mcp/get_summary': {
        post: {
          operationId: 'getSummary',
          summary: 'Get monthly financial summary',
          description:
            'Get financial summary: total balance, this month income, expenses, savings rate, and total invested.',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: false,
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          responses: {
            '200': {
              description: 'Financial summary for the current month',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      result: {
                        type: 'object',
                        properties: {
                          totalBalance: { type: 'number' },
                          totalInvested: { type: 'number' },
                          monthlyIncome: { type: 'number' },
                          monthlyExpense: { type: 'number' },
                          monthlySavings: { type: 'number' },
                          savingsRate: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },

      '/api/mcp/get_transactions': {
        post: {
          operationId: 'getTransactions',
          summary: 'Fetch recent transactions with optional filters',
          description:
            'Get recent transactions. Use to answer "how much did I spend on food?" or "show my last transactions".',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    limit: { type: 'number', description: 'Max results 1-100, default 20' },
                    type: {
                      type: 'string',
                      enum: ['INCOME', 'EXPENSE', 'TRANSFER_BANK', 'TRANSFER_PERSON', 'INVESTMENT'],
                    },
                    category: {
                      type: 'string',
                      description: 'Category filter e.g. food, transport',
                    },
                    fromDate: { type: 'string', description: 'Start date YYYY-MM-DD' },
                    toDate: { type: 'string', description: 'End date YYYY-MM-DD' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'List of matching transactions',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      result: {
                        type: 'object',
                        properties: {
                          transactions: { type: 'array', items: { type: 'object' } },
                          count: { type: 'number' },
                          totalAmount: { type: 'number' },
                          totalAmountFormatted: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },

      '/api/mcp/add_transaction': {
        post: {
          operationId: 'addTransaction',
          summary: 'Add a financial transaction',
          description:
            'Record a transaction. INCOME = money received. EXPENSE = money spent. ' +
            'TRANSFER_BANK = moving between your own accounts (not an expense). ' +
            'TRANSFER_PERSON = sending to another person (is an expense). ' +
            'INVESTMENT = stocks/MF/FD. ' +
            'Always call getAccounts first. Always confirm details with user before calling.',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['type', 'amount', 'fromAccountId'],
                  properties: {
                    type: {
                      type: 'string',
                      enum: ['INCOME', 'EXPENSE', 'TRANSFER_BANK', 'TRANSFER_PERSON', 'INVESTMENT'],
                    },
                    amount: { type: 'number', description: 'Amount as plain number e.g. 450' },
                    fromAccountId: {
                      type: 'string',
                      description: 'Source account ID from getAccounts',
                    },
                    description: { type: 'string' },
                    category: {
                      type: 'string',
                      description:
                        'food | transport | utilities | rent | entertainment | health | shopping | education | salary | freelance | investment | transfer | other',
                    },
                    date: { type: 'string', description: 'YYYY-MM-DD, defaults to today' },
                    notes: { type: 'string' },
                    toAccountId: {
                      type: 'string',
                      description: 'Required for TRANSFER_BANK — destination account ID',
                    },
                    recipientName: {
                      type: 'string',
                      description: 'Required for TRANSFER_PERSON',
                    },
                    investmentName: {
                      type: 'string',
                      description: 'Required for INVESTMENT',
                    },
                    investmentType: {
                      type: 'string',
                      enum: ['STOCKS', 'MUTUAL_FUND', 'BONDS', 'REAL_ESTATE', 'CRYPTO', 'OTHER'],
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Transaction added successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      result: {
                        type: 'object',
                        properties: {
                          success: { type: 'boolean' },
                          transactionId: { type: 'string' },
                          message: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },

      '/api/mcp/parse_receipt': {
        post: {
          operationId: 'parseReceipt',
          summary: 'Extract transaction data from a receipt image',
          description:
            'Parse a receipt photo, UPI payment screenshot, PhonePe/GPay/Paytm confirmation, or bank SMS. ' +
            'Call this when the user shares an image, then confirm with user before calling addTransaction.',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    image_url: {
                      type: 'string',
                      description: 'Public HTTPS URL of the image',
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
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Extracted receipt data',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      result: {
                        type: 'object',
                        properties: {
                          success: { type: 'boolean' },
                          confidence: { type: 'number' },
                          extracted: { type: 'object' },
                          confirmationMessage: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
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
      responses: {
        Unauthorized: {
          description: 'Invalid or missing API key',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  error: { type: 'string' },
                  code: { type: 'string', enum: ['MISSING_KEY', 'INVALID_KEY'] },
                },
              },
            },
          },
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
