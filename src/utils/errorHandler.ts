/**
 * Централізований обробник помилок
 * Забезпечує консистентне логування та обробку помилок по всьому додатку
 */

export interface ErrorContext {
  errorInfo?: React.ErrorInfo;
  componentStack?: string;
  context?: string;
  userId?: string;
  budgetId?: string;
  [key: string]: unknown;
}

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ErrorReport {
  error: Error;
  severity: ErrorSeverity;
  context: ErrorContext;
  timestamp: string;
  userAgent: string;
  url: string;
}

/**
 * Визначає серйозність помилки на основі типу помилки
 */
function determineSeverity(error: Error): ErrorSeverity {
  const errorMessage = error.message.toLowerCase();
  const errorName = error.name.toLowerCase();

  // Критичні помилки
  if (
    errorName.includes('chunk') ||
    errorMessage.includes('loading chunk') ||
    errorMessage.includes('network error') ||
    errorMessage.includes('failed to fetch')
  ) {
    return 'critical';
  }

  // Високі помилки
  if (
    errorName.includes('type') ||
    errorName.includes('reference') ||
    errorMessage.includes('undefined') ||
    errorMessage.includes('null')
  ) {
    return 'high';
  }

  // Середні помилки
  if (
    errorName.includes('validation') ||
    errorMessage.includes('invalid') ||
    errorMessage.includes('unauthorized')
  ) {
    return 'medium';
  }

  // Низькі помилки (за замовчуванням)
  return 'low';
}

/**
 * Форматує помилку для логування
 */
function formatError(error: Error, context: ErrorContext): ErrorReport {
  return {
    error,
    severity: determineSeverity(error),
    context,
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    url: window.location.href
  };
}

/**
 * Логує помилку в консоль з детальною інформацією
 */
function logError(report: ErrorReport) {
  const { error, severity, context, timestamp } = report;

  const logMessage = `[${severity.toUpperCase()}] ${error.name}: ${error.message}`;
  const logData = {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack
    },
    context,
    timestamp,
    severity
  };

  // Використовуємо різні рівні логування залежно від серйозності
  switch (severity) {
    case 'critical':
    case 'high':
      console.error(logMessage, logData);
      break;
    case 'medium':
      console.warn(logMessage, logData);
      break;
    case 'low':
      console.info(logMessage, logData);
      break;
  }
}

/**
 * Зберігає помилку в localStorage для подальшого аналізу
 * (корисно для збору помилок в продакшені)
 */
function saveErrorToStorage(report: ErrorReport) {
  try {
    const errorsKey = 'app_errors';
    const maxErrors = 50; // Зберігаємо максимум 50 останніх помилок

    const existingErrors = localStorage.getItem(errorsKey);
    const errors: ErrorReport[] = existingErrors ? JSON.parse(existingErrors) : [];

    // Додаємо нову помилку на початок масиву
    errors.unshift(report);

    // Обмежуємо кількість збережених помилок
    if (errors.length > maxErrors) {
      errors.splice(maxErrors);
    }

    localStorage.setItem(errorsKey, JSON.stringify(errors));
  } catch (storageError) {
    // Якщо не вдалося зберегти в localStorage, просто логуємо
    console.warn('Не вдалося зберегти помилку в localStorage:', storageError);
  }
}

/**
 * Відправляє помилку на сервер моніторингу (якщо налаштовано)
 * Можна інтегрувати з Sentry, LogRocket тощо
 */
function sendToMonitoring(report: ErrorReport) {
  // TODO: Інтегрувати з сервісом моніторингу (Sentry, LogRocket)
  // Приклад для Sentry:
  // if (window.Sentry) {
  //   window.Sentry.captureException(report.error, {
  //     contexts: { custom: report.context },
  //     level: report.severity
  //   });
  // }

  // Поки що просто логуємо, що помилка була б відправлена
  if (report.severity === 'critical' || report.severity === 'high') {
    console.info('Помилка високого рівня (була б відправлена на моніторинг):', report);
  }
}

/**
 * Головна функція для обробки помилок
 * Використовується по всьому додатку для консистентного логування
 * 
 * @param error - Об'єкт помилки
 * @param context - Додатковий контекст помилки (компонент, дія тощо)
 */
export function handleError(error: Error, context: ErrorContext = {}) {
  // Переконуємося, що це справді Error об'єкт
  const errorObj = error instanceof Error 
    ? error 
    : new Error(String(error));

  const report = formatError(errorObj, context);

  // Логуємо помилку
  logError(report);

  // Зберігаємо помилку для подальшого аналізу
  saveErrorToStorage(report);

  // Відправляємо на моніторинг (якщо налаштовано)
  sendToMonitoring(report);
}

/**
 * Обробка помилок з async функцій
 * Обгортає async функцію в try-catch з автоматичним логуванням
 * 
 * @param fn - Async функція для виконання
 * @param context - Контекст для логування помилок
 * @returns Результат виконання функції або null при помилці
 */
export async function handleAsyncError<T>(
  fn: () => Promise<T>,
  context: ErrorContext = {}
): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    handleError(
      error instanceof Error ? error : new Error(String(error)),
      context
    );
    return null;
  }
}

/**
 * Створює обробник помилок для конкретного контексту
 * Корисно для створення спеціалізованих обробників для різних частин додатку
 * 
 * @param baseContext - Базовий контекст для всіх помилок
 * @returns Функція handleError з попередньо заповненим контекстом
 */
export function createErrorHandler(baseContext: ErrorContext) {
  return (error: Error, additionalContext: ErrorContext = {}) => {
    handleError(error, {
      ...baseContext,
      ...additionalContext
    });
  };
}

/**
 * Отримує збережені помилки з localStorage
 * Корисно для дебагу та аналізу помилок
 */
export function getStoredErrors(): ErrorReport[] {
  try {
    const errorsKey = 'app_errors';
    const errors = localStorage.getItem(errorsKey);
    return errors ? JSON.parse(errors) : [];
  } catch {
    return [];
  }
}

/**
 * Очищає збережені помилки з localStorage
 */
export function clearStoredErrors(): void {
  try {
    localStorage.removeItem('app_errors');
  } catch {
    // Ігноруємо помилки при очищенні
  }
}





