import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { SuccessResponse, Meta } from '../interfaces/response.interface';
import { map, Observable } from 'rxjs';
import { Response } from 'express';

interface ResponseData {
  message?: string;
  data?: unknown;
  meta?: Meta;
}

@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, SuccessResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<SuccessResponse<T>> {
    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      map((data: T | ResponseData): SuccessResponse<T> => {
        if (
          data &&
          typeof data === 'object' &&
          ('message' in data || 'data' in data || 'meta' in data)
        ) {
          const responseData: ResponseData = data;
          return {
            statusCode: response.statusCode,
            success: true,
            message: responseData.message || 'Success',
            data: (responseData.data ?? data) as T,
            ...(responseData.meta && { meta: responseData.meta }),
          };
        }

        // Default: treat the whole response as data
        return {
          statusCode: response.statusCode,
          success: true,
          message: 'Success',
          data: data as T,
        };
      }),
    );
  }
}
