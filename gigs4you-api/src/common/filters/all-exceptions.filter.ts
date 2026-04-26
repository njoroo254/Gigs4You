import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { summarizeDependencyFailure } from '../errors/dependency-failure';

type RequestUser = {
  userId?: string;
  role?: string;
  orgId?: string;
};

type RequestWithMeta = Request & {
  id?: string;
  user?: RequestUser;
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithMeta>();

    const requestId = String(request?.headers?.['x-request-id'] || request?.id || randomUUID());
    if (response?.setHeader) {
      response.setHeader('X-Request-Id', requestId);
    }

    const method = request?.method || 'UNKNOWN';
    const path = request?.originalUrl || request?.url || 'unknown';
    const route = request?.route?.path || 'unknown';
    const user = request?.user;

    // Report non-HTTP errors to Sentry with user context.
    try {
      const Sentry = require('@sentry/node');
      if (user) {
        Sentry.setUser({ id: user.userId, role: user.role, orgId: user.orgId });
      }
      if (!(exception instanceof require('@nestjs/common').HttpException) ||
          (exception as any).getStatus?.() >= 500) {
        Sentry.captureException(exception);
      }
    } catch (_) {
      // Never let Sentry crash the app.
    }

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let details: Record<string, any> | undefined;
    let stack: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resp = exception.getResponse();
      message = typeof resp === 'string' ? resp : (resp as any).message || message;
      details = typeof resp === 'object' ? resp as Record<string, any> : undefined;
      stack = (exception as any).stack;
    } else if (exception instanceof Error) {
      message = exception.message;
      stack = exception.stack;
    }

    const inferredDependency = summarizeDependencyFailure(exception);
    const hasExplicitDependency = Boolean(details?.dependency?.service);
    const hasImplicitDependency = Boolean(inferredDependency.code || inferredDependency.upstreamStatus);

    if (!hasExplicitDependency && hasImplicitDependency && status === HttpStatus.INTERNAL_SERVER_ERROR) {
      status = HttpStatus.SERVICE_UNAVAILABLE;
      message = inferredDependency.message || message;
      details = {
        ...(details || {}),
        error: 'DependencyFailure',
        dependency: {
          service: 'Unknown dependency',
          operation: `${method} ${path}`,
          code: inferredDependency.code,
          retryable: inferredDependency.retryable,
          upstreamStatus: inferredDependency.upstreamStatus,
        },
        cause: inferredDependency.message,
      };
    }

    const dependencyMeta = details?.dependency;
    const userContext = user
      ? `user=${user.userId || 'unknown'} role=${user.role || 'unknown'} org=${user.orgId || 'none'}`
      : 'user=anonymous';

    if (dependencyMeta?.service) {
      const dependencyLog = [
        `[${requestId}] Dependency failure`,
        `${method} ${path}`,
        `route=${route}`,
        `service=${dependencyMeta.service}`,
        `operation=${dependencyMeta.operation || 'unknown'}`,
        dependencyMeta.target ? `target=${dependencyMeta.target}` : null,
        dependencyMeta.code ? `code=${dependencyMeta.code}` : null,
        dependencyMeta.upstreamStatus ? `upstreamStatus=${dependencyMeta.upstreamStatus}` : null,
        userContext,
      ].filter(Boolean).join(' | ');
      this.logger.error(dependencyLog, stack);
    } else if (status >= 500) {
      const genericLog = [
        `[${requestId}] Request failure`,
        `${method} ${path}`,
        `route=${route}`,
        `status=${status}`,
        userContext,
        `message=${message}`,
      ].join(' | ');
      this.logger.error(genericLog, stack);
    }

    response.status(status).json({
      statusCode: status,
      message,
      ...(details && typeof details === 'object' ? details : {}),
      requestId,
      method,
      timestamp: new Date().toISOString(),
      path,
    });
  }
}
