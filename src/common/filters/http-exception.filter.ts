import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ErrorResponse } from '../interfaces/response.interface';

/**
 * Custom exception filter that transforms all HTTP exceptions
 * to the standard error format: { status, success, errorCode, message }
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode: number;
    let message: string;
    let errorCode: string;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      // Handle different response types
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        errorCode = this.getErrorCode(statusCode);
      } else if (typeof exceptionResponse === 'object') {
        const responseObj = exceptionResponse as {
          message?: string | string[];
          error?: string;
          statusCode?: number;
        };

        // Handle array of messages (validation errors)
        if (Array.isArray(responseObj.message)) {
          message = responseObj.message.join(', ');
        } else {
          message =
            responseObj.message || responseObj.error || exception.message;
        }

        // Use custom error code if provided, otherwise derive from status
        errorCode =
          (responseObj as { errorCode?: string }).errorCode ||
          this.getErrorCode(statusCode);
      } else {
        message = exception.message;
        errorCode = this.getErrorCode(statusCode);
      }
    } else {
      // Handle unexpected errors
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      message =
        process.env.NODE_ENV === 'production'
          ? 'Internal server error'
          : exception instanceof Error
            ? exception.message
            : 'An unexpected error occurred';
      errorCode = 'INTERNAL_SERVER_ERROR';

      // Log unexpected errors
      this.logger.error(
        `Unexpected error: ${exception instanceof Error ? exception.stack : String(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    // Log the error (except for client errors in production)
    if (statusCode >= 500 || process.env.NODE_ENV !== 'production') {
      this.logger.error(
        `HTTP ${statusCode} ${request.method} ${request.url}: ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const errorResponse: ErrorResponse = {
      statusCode,
      success: false,
      errorCode,
      message,
    };

    response.status(statusCode).json(errorResponse);
  }

  /**
   * Derive error code from HTTP status code
   */
  private getErrorCode(statusCode: number): string {
    const errorCodeMap: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      405: 'METHOD_NOT_ALLOWED',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_SERVER_ERROR',
      502: 'BAD_GATEWAY',
      503: 'SERVICE_UNAVAILABLE',
      504: 'GATEWAY_TIMEOUT',
    };

    return errorCodeMap[statusCode] || 'UNKNOWN_ERROR';
  }
}
