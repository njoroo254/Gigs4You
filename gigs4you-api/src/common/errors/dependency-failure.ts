import { HttpStatus, ServiceUnavailableException } from '@nestjs/common';

export interface DependencyFailureSummary {
  code?: string;
  message: string;
  retryable: boolean;
  upstreamStatus?: number;
}

export interface DependencyFailureMetadata extends DependencyFailureSummary {
  service: string;
  operation: string;
  target?: string;
}

const RETRYABLE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNABORTED',
  'EAI_AGAIN',
  'ENOTFOUND',
]);

function firstDefined<T>(...values: T[]): T | undefined {
  return values.find((value) => value !== undefined && value !== null);
}

function asRecord(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object'
    ? value as Record<string, any>
    : null;
}

function pickNestedError(error: unknown): Record<string, any> | null {
  const current = asRecord(error);
  if (!current) return null;

  const aggregateFirst = Array.isArray(current.errors)
    ? asRecord(current.errors[0])
    : null;

  return aggregateFirst
    || asRecord(current.cause)
    || current;
}

export function summarizeDependencyFailure(error: unknown): DependencyFailureSummary {
  const current = asRecord(error);
  const nested = pickNestedError(error);
  const response = asRecord(firstDefined(current?.response, nested?.response));
  const responseData = asRecord(response?.data);

  const code = firstDefined<string>(
    current?.code,
    nested?.code,
    responseData?.code,
    responseData?.errorCode,
  );
  const upstreamStatus = firstDefined<number>(
    response?.status,
    responseData?.statusCode,
  );
  const message = firstDefined<string>(
    responseData?.message,
    responseData?.errorMessage,
    current?.message,
    nested?.message,
    'Dependency request failed',
  ) || 'Dependency request failed';

  const retryable = RETRYABLE_CODES.has(String(code || '').toUpperCase())
    || (typeof upstreamStatus === 'number' && (upstreamStatus >= 500 || upstreamStatus === 429));

  return {
    code,
    message,
    retryable,
    upstreamStatus,
  };
}

export function createDependencyFailure(
  service: string,
  operation: string,
  target: string | undefined,
  error: unknown,
  fallbackMessage?: string,
): ServiceUnavailableException {
  const summary = summarizeDependencyFailure(error);
  return new ServiceUnavailableException({
    statusCode: HttpStatus.SERVICE_UNAVAILABLE,
    message: fallbackMessage || `${service} is currently unavailable`,
    error: 'DependencyFailure',
    dependency: {
      service,
      operation,
      target,
      code: summary.code,
      retryable: summary.retryable,
      upstreamStatus: summary.upstreamStatus,
    },
    cause: summary.message,
  });
}
