'use client'

import { useEffect, useState } from 'react'
import { MobileMenuButton } from '@/components/MobileMenuButton'

const APP_URL =
  typeof window !== 'undefined'
    ? window.location.origin
    : process.env.NEXT_PUBLIC_APP_URL ?? ''

type McpSession = {
  id: string
  clientName: string
  createdAt: string
  lastActiveAt: string
  apiKeyId: string
}

type McpCallLog = {
  id: string
  tool: string
  result: string
  inputSummary: string | null
  durationMs: number | null
  calledAt: string
  sessionId: string | null
}

type McpCallLogWithUser = McpCallLog & {
  user?: { email: string; name: string | null }
}

type LogsResponse = {
  logs: McpCallLogWithUser[]
  total: number
  page: number
  pageSize: number
  isAdmin: boolean
}

type ToolStat = {
  tool: string
  _count: { tool: number }
}

const CLIENT_ICON: Record<string, string> = {
  chatgpt: '🤖',
  claude: '🔷',
  cursor: '⬡',
  custom: '🔌',
  unknown: '🔌',
}

function formatRelative(date: string): string {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-IN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

type Tab = 'chatgpt' | 'claude' | 'api'

export default function McpSettingsPage() {
  const [sessions, setSessions] = useState<McpSession[]>([])
  const [logs, setLogs] = useState<McpCallLogWithUser[]>([])
  const [stats, setStats] = useState<ToolStat[]>([])
  const [totalCalls, setTotalCalls] = useState(0)
  const [activeTab, setActiveTab] = useState<Tab>('chatgpt')
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)
  const [logsPage, setLogsPage] = useState(1)
  const [logsTotal, setLogsTotal] = useState(0)
  const [logsPageSize, setLogsPageSize] = useState(50)
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsScope, setLogsScope] = useState<'mine' | 'all'>('mine')
  const [isAdmin, setIsAdmin] = useState(false)

  const manifestUrl = `${APP_URL}/api/mcp/manifest`
  const totalPages = Math.ceil(logsTotal / logsPageSize)

  useEffect(() => {
    Promise.all([
      fetch('/api/mcp/sessions').then((r) => r.json()),
      fetch('/api/mcp/logs?page=1').then((r) => r.json()),
    ]).then(([sessData, logsData]: [{ sessions?: McpSession[]; stats?: ToolStat[]; totalCalls?: number }, LogsResponse]) => {
      setSessions(sessData.sessions ?? [])
      setStats(sessData.stats ?? [])
      setTotalCalls(sessData.totalCalls ?? 0)
      setLogs(logsData.logs ?? [])
      setLogsTotal(logsData.total ?? 0)
      setLogsPageSize(logsData.pageSize ?? 50)
      setIsAdmin(logsData.isAdmin ?? false)
      setLoading(false)
    })
  }, [])

  const goToLogsPage = async (page: number, scope = logsScope) => {
    setLogsLoading(true)
    const params = new URLSearchParams({ page: String(page) })
    if (scope === 'all') params.set('scope', 'all')
    const data: LogsResponse = await fetch(`/api/mcp/logs?${params}`).then((r) => r.json())
    setLogs(data.logs ?? [])
    setLogsTotal(data.total ?? 0)
    setLogsPage(page)
    setLogsLoading(false)
  }

  const switchScope = (scope: 'mine' | 'all') => {
    setLogsScope(scope)
    goToLogsPage(1, scope)
  }

  const handleRevoke = async (sessionId: string) => {
    await fetch('/api/mcp/sessions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    })
    setSessions((prev) => prev.filter((s) => s.id !== sessionId))
  }

  const copyManifestUrl = () => {
    navigator.clipboard.writeText(manifestUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const mostUsedTool = stats[0]?.tool ?? '—'
  const mostUsedClient =
    sessions.length > 0
      ? sessions.reduce<Record<string, number>>((acc, s) => {
          acc[s.clientName] = (acc[s.clientName] ?? 0) + 1
          return acc
        }, {})
      : {}
  const topClient =
    Object.entries(mostUsedClient).sort(([, a], [, b]) => b - a)[0]?.[0] ?? '—'

  const txAddedViaAI = logs.filter((l) => l.tool === 'add_transaction' && l.result === 'success').length

  return (
    <div className="flex flex-col min-h-screen bg-surface">
      <header className="flex items-center gap-4 px-6 py-4 border-b border-line-subtle/10 shrink-0">
        <MobileMenuButton />
        <div>
          <h1 className="text-xl font-bold text-on-surface">AI Connections</h1>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Connect ChatGPT and Claude Desktop to your expense tracker
          </p>
        </div>
      </header>

      <main className="flex-1 p-6 space-y-6 max-w-4xl">
        {/* Active connections */}
        <section>
          <h2 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-3">
            Active Connections
          </h2>
          <div className="space-y-2">
            {loading ? (
              <div className="bg-surface-container-low border border-line-subtle/10 rounded-xl p-4 text-on-surface-variant text-sm">
                Loading…
              </div>
            ) : sessions.length === 0 ? (
              <div className="bg-surface-container-low border border-line-subtle/10 rounded-xl p-6 text-center">
                <p className="text-on-surface-variant text-sm">No active connections yet.</p>
                <p className="text-on-surface-variant/60 text-xs mt-1">
                  Follow the steps below to connect ChatGPT or Claude Desktop.
                </p>
              </div>
            ) : (
              sessions.map((s) => (
                <div
                  key={s.id}
                  className="bg-surface-container-low border border-line-subtle/10 rounded-xl px-4 py-3 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{CLIENT_ICON[s.clientName] ?? '🔌'}</span>
                    <div>
                      <p className="text-sm font-medium text-on-surface capitalize">
                        {s.clientName}
                      </p>
                      <p className="text-xs text-on-surface-variant">
                        Connected {formatDate(s.createdAt)} · Last active {formatRelative(s.lastActiveAt)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRevoke(s.id)}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-400/10"
                  >
                    Revoke
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Stats */}
        {totalCalls > 0 && (
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Total AI calls', value: totalCalls.toString() },
              { label: 'Transactions added via AI', value: txAddedViaAI.toString() },
              { label: 'Most used tool', value: mostUsedTool.replace('_', ' ') },
              { label: 'Most used client', value: topClient },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="bg-surface-container-low border border-line-subtle/10 rounded-xl p-4"
              >
                <p className="text-xs text-on-surface-variant">{label}</p>
                <p className="text-lg font-semibold text-on-surface mt-1 capitalize">{value}</p>
              </div>
            ))}
          </section>
        )}

        {/* How to connect */}
        <section>
          <h2 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-3">
            How to Connect
          </h2>
          <div className="bg-surface-container-low border border-line-subtle/10 rounded-xl overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-line-subtle/10">
              {(['chatgpt', 'claude', 'api'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-5 py-3 text-sm font-medium transition-colors ${
                    activeTab === tab
                      ? 'text-primary border-b-2 border-primary'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {tab === 'chatgpt' ? 'ChatGPT' : tab === 'claude' ? 'Claude Desktop' : 'API'}
                </button>
              ))}
            </div>

            <div className="p-5 space-y-4">
              {activeTab === 'chatgpt' && (
                <>
                  <Step n={1} title="Generate an API Key">
                    Go to{' '}
                    <a href="/settings" className="text-primary underline underline-offset-2">
                      Settings → API Keys
                    </a>{' '}
                    and click <strong className="text-on-surface">Generate New Key</strong>. Copy
                    it — shown only once.
                  </Step>
                  <Step n={2} title="Add Custom Action in ChatGPT">
                    <p className="text-on-surface-variant text-sm">
                      Go to <span className="text-on-surface">ChatGPT → Explore GPTs → Create → Configure → Add Action</span>
                    </p>
                    <p className="text-on-surface-variant text-sm mt-2">Paste this manifest URL:</p>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="flex-1 bg-surface-container-high text-primary text-xs px-3 py-2 rounded-lg font-mono break-all">
                        {manifestUrl}
                      </code>
                      <button
                        onClick={copyManifestUrl}
                        className="shrink-0 text-xs text-on-surface-variant hover:text-on-surface bg-surface-container-high px-3 py-2 rounded-lg transition-colors"
                      >
                        {copied ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                    <p className="text-on-surface-variant text-sm mt-2">
                      In Authentication, select <strong className="text-on-surface">API Key → Bearer</strong> → paste your key.
                    </p>
                  </Step>
                  <Step n={3} title="Test it">
                    <p className="text-on-surface-variant text-sm">
                      In ChatGPT, try: <code className="bg-surface-container-high text-primary text-xs px-2 py-0.5 rounded">"What's my account balance?"</code>
                    </p>
                    <p className="text-on-surface-variant text-sm mt-1">
                      Or: <code className="bg-surface-container-high text-primary text-xs px-2 py-0.5 rounded">"Add ₹450 food expense from my HDFC account"</code>
                    </p>
                  </Step>
                </>
              )}

              {activeTab === 'claude' && (
                <>
                  <Step n={1} title="Generate an API Key">
                    Go to{' '}
                    <a href="/settings" className="text-primary underline underline-offset-2">
                      Settings → API Keys
                    </a>{' '}
                    and create a new key.
                  </Step>
                  <Step n={2} title="Edit claude_desktop_config.json">
                    <p className="text-on-surface-variant text-sm">
                      Open{' '}
                      <code className="bg-surface-container-high text-primary text-xs px-2 py-0.5 rounded">
                        ~/Library/Application Support/Claude/claude_desktop_config.json
                      </code>
                    </p>
                    <pre className="bg-surface-container-high text-green-400 text-xs p-3 rounded-lg mt-2 overflow-x-auto font-mono leading-relaxed">
                      {JSON.stringify(
                        {
                          mcpServers: {
                            'expense-tracker': {
                              command: 'npx',
                              args: ['-y', 'mcp-remote', `${APP_URL}/api/mcp/sse`],
                              env: { API_KEY: 'your-key-here' },
                            },
                          },
                        },
                        null,
                        2
                      )}
                    </pre>
                  </Step>
                  <Step n={3} title="Restart Claude Desktop">
                    <p className="text-on-surface-variant text-sm">
                      Restart the app. You should see the expense tracker tools in the tool list.
                    </p>
                  </Step>
                </>
              )}

              {activeTab === 'api' && (
                <div className="space-y-3">
                  <p className="text-on-surface-variant text-sm">
                    Call the MCP endpoint directly from any HTTP client.
                  </p>
                  <div>
                    <p className="text-xs text-on-surface-variant mb-1">Endpoint</p>
                    <code className="block bg-surface-container-high text-primary text-xs px-3 py-2 rounded-lg font-mono">
                      POST {APP_URL}/api/mcp
                    </code>
                  </div>
                  <div>
                    <p className="text-xs text-on-surface-variant mb-1">Example request</p>
                    <pre className="bg-surface-container-high text-green-400 text-xs p-3 rounded-lg overflow-x-auto font-mono leading-relaxed">
                      {`curl -X POST ${APP_URL}/api/mcp \\
  -H "Authorization: Bearer ll_your-key" \\
  -H "Content-Type: application/json" \\
  -d '{"tool":"get_summary","arguments":{}}'`}
                    </pre>
                  </div>
                  <div>
                    <a
                      href="/api/mcp/connect"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary underline underline-offset-2"
                    >
                      Open full connection guide ↗
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Activity log */}
        {(logs.length > 0 || logsTotal > 0) && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider">
                Activity Log
              </h2>
              <div className="flex items-center gap-3">
                {isAdmin && (
                  <div className="flex items-center gap-1 bg-surface-container-low border border-line-subtle/10 rounded-lg p-0.5">
                    {(['mine', 'all'] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => switchScope(s)}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                          logsScope === s
                            ? 'bg-primary/15 text-primary'
                            : 'text-on-surface-variant hover:text-on-surface'
                        }`}
                      >
                        {s === 'mine' ? 'My Logs' : 'All Users'}
                      </button>
                    ))}
                  </div>
                )}
                <span className="text-xs text-on-surface-variant">
                  {logsTotal} total call{logsTotal !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
            <div className="bg-surface-container-low border border-line-subtle/10 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line-subtle/10 text-on-surface-variant text-xs">
                    <th className="text-left px-4 py-3 font-medium">Time</th>
                    <th className="text-left px-4 py-3 font-medium">Tool</th>
                    {logsScope === 'all' && (
                      <th className="text-left px-4 py-3 font-medium hidden md:table-cell">User</th>
                    )}
                    <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Input</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-right px-4 py-3 font-medium hidden md:table-cell">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {logsLoading ? (
                    <tr>
                      <td colSpan={logsScope === 'all' ? 6 : 5} className="px-4 py-6 text-center text-on-surface-variant text-xs">
                        Loading…
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr
                        key={log.id}
                        className="border-b border-line-subtle/10 last:border-0 hover:bg-surface-container-high/50 transition-colors"
                      >
                        <td className="px-4 py-3 text-on-surface-variant text-xs whitespace-nowrap">
                          {formatDate(log.calledAt)}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-on-surface">
                          {log.tool}
                        </td>
                        {logsScope === 'all' && (
                          <td className="px-4 py-3 text-on-surface-variant text-xs hidden md:table-cell max-w-[160px] truncate">
                            {log.user?.email ?? '—'}
                          </td>
                        )}
                        <td className="px-4 py-3 text-on-surface-variant text-xs hidden md:table-cell max-w-[200px] truncate">
                          {log.inputSummary ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-xs font-medium ${
                              log.result === 'success' ? 'text-green-400' : 'text-red-400'
                            }`}
                          >
                            {log.result === 'success' ? '✓ success' : '✗ error'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-on-surface-variant text-xs text-right hidden md:table-cell">
                          {log.durationMs != null ? `${log.durationMs}ms` : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-line-subtle/10">
                  <span className="text-xs text-on-surface-variant">
                    Page {logsPage} of {totalPages}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => goToLogsPage(1)}
                      disabled={logsPage === 1 || logsLoading}
                      className="px-2 py-1 text-xs rounded-lg text-on-surface-variant hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      «
                    </button>
                    <button
                      onClick={() => goToLogsPage(logsPage - 1)}
                      disabled={logsPage === 1 || logsLoading}
                      className="px-2 py-1 text-xs rounded-lg text-on-surface-variant hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      ‹ Prev
                    </button>
                    <button
                      onClick={() => goToLogsPage(logsPage + 1)}
                      disabled={logsPage === totalPages || logsLoading}
                      className="px-2 py-1 text-xs rounded-lg text-on-surface-variant hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      Next ›
                    </button>
                    <button
                      onClick={() => goToLogsPage(totalPages)}
                      disabled={logsPage === totalPages || logsLoading}
                      className="px-2 py-1 text-xs rounded-lg text-on-surface-variant hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      »
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
        {n}
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-on-surface mb-1">{title}</p>
        <div>{children}</div>
      </div>
    </div>
  )
}
