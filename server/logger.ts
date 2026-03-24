import pino from 'pino';

const usePrettyTransport =
  process.env.NODE_ENV !== 'production' &&
  process.env.RTP_BUNDLED_API !== 'true';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  ...(usePrettyTransport && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, ignore: 'pid,hostname' },
    },
  }),
});
