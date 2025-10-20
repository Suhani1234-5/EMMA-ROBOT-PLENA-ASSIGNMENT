// src/utils/Logger.ts

export enum LogLevel {
  ERROR = 'ERROR',
  WARN = 'WARN',
  INFO = 'INFO',
  DEBUG = 'DEBUG',
}

export class Logger {
  private logLevel: LogLevel;
  private readonly symbols = {
    error: '◆',
    warn: '▲',
    info: '●',
    debug: '◈',
    success: '★',
  };

  constructor(logLevel: LogLevel = LogLevel.INFO) {
    this.logLevel = logLevel;
  }

  private getTimestamp(): string {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
  }

  private formatOutput(level: string, symbol: string, message: string): string {
    return `[${this.getTimestamp()}] ${symbol} [${level}] ${message}`;
  }

  error(message: string, error?: any): void {
    console.error(this.formatOutput('ERR', this.symbols.error, message), error || '');
  }

  warn(message: string): void {
    console.warn(this.formatOutput('WRN', this.symbols.warn, message));
  }

  info(message: string): void {
    console.log(this.formatOutput('INF', this.symbols.info, message));
  }

  debug(message: string): void {
    if (this.logLevel === LogLevel.DEBUG) {
      console.log(this.formatOutput('DBG', this.symbols.debug, message));
    }
  }

  success(message: string): void {
    console.log(this.formatOutput('OK', this.symbols.success, message));
  }

  trace(message: string, data?: any): void {
    console.log(this.formatOutput('TRC', '◇', message), data || '');
  }
}

export const logger = new Logger(LogLevel.INFO);