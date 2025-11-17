// Logger utility for Frontend (adapted from Supabase Edge Functions)
// 환경 변수 기반 로그 레벨 관리
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

class Logger {
  level: LogLevel;
  isDevelopment: boolean;
  functionName: string;

  constructor(functionName: string) {
    this.functionName = functionName;
    // 브라우저 환경에서는 process.env 또는 환경변수 확인
    this.isDevelopment = typeof process !== 'undefined'
      ? process.env.NODE_ENV !== 'production'
      : true;

    // 환경변수로 로그 레벨 설정 (기본값: 프로덕션은 WARN, 개발은 INFO)
    const envLevel = typeof process !== 'undefined'
      ? process.env.LOG_LEVEL?.toUpperCase()
      : undefined;

    if (envLevel && LogLevel[envLevel as keyof typeof LogLevel] !== undefined) {
      this.level = LogLevel[envLevel as keyof typeof LogLevel];
    } else {
      this.level = this.isDevelopment ? LogLevel.INFO : LogLevel.WARN;
    }
  }

  shouldLog(level: LogLevel): boolean {
    return level <= this.level;
  }

  formatMessage(level: string, message: string, context?: any): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';
    return `[${timestamp}] [${this.functionName}] [${level}] ${message}${contextStr}`;
  }

  sanitizeData(data: any): any {
    if (!data) return data;

    // 민감한 정보 마스킹
    const sensitiveKeys = [
      'access_token',
      'band_access_token',
      'api_key',
      'apiKey',
      'password',
      'secret',
      'authorization',
      'token'
    ];

    if (typeof data === 'object') {
      const sanitized = Array.isArray(data) ? [...data] : { ...data };

      for (const key in sanitized) {
        const lowerKey = key.toLowerCase();
        if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
          sanitized[key] = '[REDACTED]';
        } else if (typeof sanitized[key] === 'object') {
          sanitized[key] = this.sanitizeData(sanitized[key]);
        }
      }

      return sanitized;
    }

    return data;
  }

  error(message: string, error?: any, context?: any) {
    if (this.shouldLog(LogLevel.ERROR)) {
      const sanitizedContext = this.sanitizeData(context);
      const errorInfo = error ? {
        message: error.message || error,
        stack: this.isDevelopment ? error.stack : undefined
      } : undefined;

      console.error(
        this.formatMessage('ERROR', message, sanitizedContext),
        errorInfo ? '\n' + JSON.stringify(errorInfo, null, 2) : ''
      );
    }
  }

  warn(message: string, context?: any) {
    if (this.shouldLog(LogLevel.WARN)) {
      const sanitizedContext = this.sanitizeData(context);
      console.warn(this.formatMessage('WARN', message, sanitizedContext));
    }
  }

  info(message: string, context?: any) {
    if (this.shouldLog(LogLevel.INFO)) {
      const sanitizedContext = this.sanitizeData(context);
      console.log(this.formatMessage('INFO', message, sanitizedContext));
    }
  }

  debug(message: string, data?: any, context?: any) {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const sanitizedContext = this.sanitizeData(context);
      const sanitizedData = this.sanitizeData(data);
      console.log(
        this.formatMessage('DEBUG', message, sanitizedContext),
        sanitizedData ? '\n' + JSON.stringify(sanitizedData, null, 2) : ''
      );
    }
  }

  // 성능 측정용 로거
  time(label: string) {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.time(`[${this.functionName}] ${label}`);
    }
  }

  timeEnd(label: string) {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.timeEnd(`[${this.functionName}] ${label}`);
    }
  }
}

// Export factory function
export function createLogger(functionName: string): Logger {
  return new Logger(functionName);
}

// Export default logger for backward compatibility
export const logger = new Logger('default');
