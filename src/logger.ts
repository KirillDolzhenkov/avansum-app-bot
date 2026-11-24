type Level = 'info' | 'warn' | 'error';

function write(level: Level, message: string, details?: unknown): void {
  const time = new Date().toISOString();
  const line = `[${time}] ${level.toUpperCase()} ${message}`;
  const stream = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (details === undefined) {
    stream(line);
  } else {
    stream(line, details instanceof Error ? details : JSON.stringify(details));
  }
}

export const logger = {
  info: (message: string, details?: unknown) => write('info', message, details),
  warn: (message: string, details?: unknown) => write('warn', message, details),
  error: (message: string, details?: unknown) => write('error', message, details),
};
