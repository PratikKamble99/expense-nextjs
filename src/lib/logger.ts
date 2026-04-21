import pino from 'pino'
import path from 'path'

const isDev = process.env.NODE_ENV === 'development'
const logToFile = process.env.LOG_TO_FILE === 'true'
const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD — fixed at server start

const targets: pino.TransportTargetOptions[] = []

if (isDev) {
  targets.push({
    target: 'pino-pretty',
    level: 'debug',
    options: {
      colorize: true,
      translateTime: 'SYS:HH:MM:ss',
      ignore: 'pid,hostname',
      messageKey: 'event',
    },
  })
} else {
  // Production/Vercel: structured JSON to stdout
  targets.push({
    target: 'pino/file',
    level: 'info',
    options: { destination: 1 }, // fd 1 = stdout
  })
}

if (logToFile) {
  targets.push({
    target: 'pino/file',
    level: 'info',
    options: {
      destination: path.join(process.cwd(), 'logs', `mcp-${today}.log`),
      mkdir: true,
    },
  })
}

export const logger = pino(
  { level: 'debug', base: null, timestamp: pino.stdTimeFunctions.isoTime },
  pino.transport({ targets })
)
