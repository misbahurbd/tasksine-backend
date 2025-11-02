export interface Meta {
  page?: number;
  limit?: number;
  skip?: number;
  total?: number;
  [key: string]: unknown;
}

export interface SuccessResponse<T = unknown> {
  statusCode: number;
  success: true;
  message: string;
  data: T;
  meta?: Meta;
}

export interface ErrorResponse {
  statusCode: number;
  message: string;
  success: false;
  errorCode: string;
}

export type ApiResponse<T = unknown> = SuccessResponse<T> | ErrorResponse;
