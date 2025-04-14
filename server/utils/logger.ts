type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogOptions {
  level?: LogLevel;
  context?: string;
  data?: any;
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development';
  private isVerbose = process.env.LOG_LEVEL === 'verbose' || this.isDevelopment;

  private formatMessage(level: LogLevel, message: string, context?: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? `[${context}]` : '';
    const levelEmoji = {
      debug: '🔍',
      info: 'ℹ️',
      warn: '⚠️',
      error: '❌'
    };

    let logLine = `${levelEmoji[level]} ${timestamp} ${contextStr} ${message}`;
    
    if (data && Object.keys(data).length > 0) {
      logLine += `\n   Data: ${JSON.stringify(data, null, 2)}`;
    }

    return logLine;
  }

  private shouldLog(level: LogLevel): boolean {
    if (!this.isDevelopment && level === 'debug') {
      return false;
    }
    return true;
  }

  debug(message: string, options?: LogOptions) {
    if (!this.shouldLog('debug')) return;
    if (this.isVerbose) {
      console.debug(this.formatMessage('debug', message, options?.context, options?.data));
    }
  }

  info(message: string, options?: LogOptions) {
    if (!this.shouldLog('info')) return;
    console.log(this.formatMessage('info', message, options?.context, options?.data));
  }

  warn(message: string, options?: LogOptions) {
    if (!this.shouldLog('warn')) return;
    console.warn(this.formatMessage('warn', message, options?.context, options?.data));
  }

  error(message: string, error?: Error | any, options?: LogOptions) {
    if (!this.shouldLog('error')) return;
    const errorData = error instanceof Error 
      ? { message: error.message, stack: error.stack, ...options?.data }
      : { error, ...options?.data };
    console.error(this.formatMessage('error', message, options?.context, errorData));
  }

  // Convenience methods for common scenarios
  db(message: string, data?: any) {
    this.debug(message, { context: 'Database', data });
  }

  api(message: string, data?: any) {
    this.info(message, { context: 'API', data });
  }

  firebase(message: string, data?: any) {
    this.debug(message, { context: 'Firebase', data });
  }

  payment(message: string, data?: any) {
    this.info(message, { context: 'Payment', data });
  }

  ai(message: string, data?: any) {
    this.debug(message, { context: 'AI', data });
  }
}

export const logger = new Logger();

