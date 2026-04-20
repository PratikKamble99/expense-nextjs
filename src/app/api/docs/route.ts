import { NextRequest } from "next/server";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://your-app.vercel.app";

const spec = {
  openapi: "3.0.3",
  info: {
    title: "Luminescent Ledger API",
    version: "1.0.0",
    description:
      "Public REST API for Luminescent Ledger. Authenticate with an API key generated in the Developer portal.\n\n" +
      "**Base URL:** `" + BASE_URL + "/api/v1`\n\n" +
      "**Auth:** `Authorization: Bearer ll_your_api_key`\n\n" +
      "**Rate limit:** 200 requests / minute per key\n\n" +
      "**Webhook events:** `transaction.created`, `transaction.deleted`  \n" +
      "Payloads are signed with `X-Luminescent-Signature: sha256=<hmac>` using your endpoint secret.",
  },
  servers: [{ url: `${BASE_URL}/api/v1`, description: "Production" }],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "API Key",
        description: "Generate a key in the Developer portal (/developer)",
      },
    },
    schemas: {
      Transaction: {
        type: "object",
        properties: {
          id:            { type: "string" },
          type:          { type: "string", enum: ["INCOME", "EXPENSE", "TRANSFER", "INVESTMENT"] },
          transferType:  { type: "string", enum: ["BANK", "PERSON"], nullable: true },
          amount:        { type: "number" },
          currency:      { type: "string", example: "INR" },
          category:      { type: "string", nullable: true },
          description:   { type: "string", nullable: true },
          account:       { type: "string" },
          recipientName: { type: "string", nullable: true },
          createdAt:     { type: "string", format: "date-time" },
        },
      },
      Account: {
        type: "object",
        properties: {
          id:             { type: "string" },
          name:           { type: "string" },
          type:           { type: "string", nullable: true },
          balance:        { type: "number" },
          currency:       { type: "string" },
          bank:           { type: "string", nullable: true },
          isDefault:      { type: "boolean" },
          lastFourDigits: { type: "string", nullable: true },
          createdAt:      { type: "string", format: "date-time" },
        },
      },
      Error: {
        type: "object",
        properties: { error: { type: "string" } },
      },
    },
  },
  security: [{ ApiKeyAuth: [] }],
  paths: {
    "/transactions": {
      get: {
        summary: "List transactions",
        operationId: "listTransactions",
        parameters: [
          { in: "query", name: "page",     schema: { type: "integer", default: 1 } },
          { in: "query", name: "limit",    schema: { type: "integer", default: 50, maximum: 100 } },
          { in: "query", name: "type",     schema: { type: "string", enum: ["INCOME","EXPENSE","TRANSFER","INVESTMENT"] } },
          { in: "query", name: "category", schema: { type: "string" }, description: "Partial, case-insensitive match" },
          { in: "query", name: "from",     schema: { type: "string", format: "date" }, description: "YYYY-MM-DD" },
          { in: "query", name: "to",       schema: { type: "string", format: "date" }, description: "YYYY-MM-DD" },
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/Transaction" } },
                    meta: {
                      type: "object",
                      properties: {
                        page:       { type: "integer" },
                        limit:      { type: "integer" },
                        total:      { type: "integer" },
                        totalPages: { type: "integer" },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "429": { description: "Rate limit exceeded" },
        },
      },
      post: {
        summary: "Create a transaction",
        operationId: "createTransaction",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["fromAccountId", "type", "amount"],
                properties: {
                  fromAccountId: { type: "string" },
                  type:          { type: "string", enum: ["INCOME","EXPENSE","TRANSFER","INVESTMENT"] },
                  amount:        { type: "number", exclusiveMinimum: 0 },
                  description:   { type: "string" },
                  category:      { type: "string" },
                  toAccountId:   { type: "string", description: "Required for TRANSFER/BANK" },
                  transferType:  { type: "string", enum: ["BANK","PERSON"] },
                  recipientName: { type: "string" },
                  date:          { type: "string", format: "date-time" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { type: "object", properties: { data: { type: "object", properties: { id: { type: "string" } } } } } } } },
          "400": { description: "Validation error" },
          "401": { description: "Unauthorized" },
          "422": { description: "Business rule violation (e.g. insufficient funds)" },
        },
      },
    },
    "/accounts": {
      get: {
        summary: "List accounts",
        operationId: "listAccounts",
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Account" } } } } } },
          },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/summary": {
      get: {
        summary: "Monthly spending summary",
        operationId: "getMonthlySummary",
        parameters: [
          { in: "query", name: "month", schema: { type: "string", pattern: "^\\d{4}-\\d{2}$" }, description: "YYYY-MM (defaults to current month)" },
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        period:               { type: "string" },
                        totalBalance:         { type: "number" },
                        totalInvested:        { type: "number" },
                        income:               { type: "number" },
                        expenses:             { type: "number" },
                        transfers:            { type: "number" },
                        savings:              { type: "number" },
                        transactionCount:     { type: "integer" },
                        topExpenseCategories: { type: "array", items: { type: "object", properties: { category: { type: "string" }, total: { type: "number" } } } },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": { description: "Unauthorized" },
        },
      },
    },
  },
};

export async function GET(_req: NextRequest) {
  return Response.json(spec, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
