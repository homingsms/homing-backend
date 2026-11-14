import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { STATUS_CODES } from 'node:http';
import type { Request, Response } from 'express';
import { ERROR_CODES, type ErrorCode } from '@/common/http/error-codes';

export interface ErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
  timestamp: string;
  path: string;
  code?: ErrorCode;
}

function readMessage(response: unknown, fallback: string): string | string[] {
  if (typeof response === 'string') {
    return response;
  }
  if (typeof response === 'object' && response !== null && 'message' in response) {
    const message: unknown = response.message;
    if (typeof message === 'string') {
      return message;
    }
    if (Array.isArray(message) && message.every((item): item is string => typeof item === 'string')) {
      return message;
    }
  }
  return fallback;
}

function readCode(response: unknown): ErrorCode | undefined {
  if (typeof response !== 'object' || response === null || !('code' in response)) {
    return undefined;
  }
  const code: unknown = response.code;
  return ERROR_CODES.find((known) => known === code);
}

function readHttpStatus(exception: unknown): number | null {
  if (typeof exception !== 'object' || exception === null) {
    return null;
  }
  const status: unknown = 'status' in exception ? exception.status : undefined;
  return typeof status === 'number' && status >= 400 && status < 500 ? status : null;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const path = request.originalUrl.split('?')[0] ?? request.originalUrl;

    let statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let code: ErrorCode | undefined;
    const clientStatus = readHttpStatus(exception);

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      message = readMessage(exception.getResponse(), exception.message);
      code = readCode(exception.getResponse());
    } else if (clientStatus !== null) {
      statusCode = clientStatus;
      message = STATUS_CODES[clientStatus] ?? 'Bad request';
    }

    if (statusCode >= 500) {
      const detail = exception instanceof Error ? (exception.stack ?? exception.message) : String(exception);
      this.logger.error(`${request.method} ${path} failed: ${detail}`);
    }

    const body: ErrorBody = {
      statusCode,
      message,
      error: STATUS_CODES[statusCode] ?? 'Error',
      timestamp: new Date().toISOString(),
      path,
      ...(code ? { code } : {}),
    };
    if (!response.headersSent) {
      response.status(statusCode).json(body);
    }
  }
}
