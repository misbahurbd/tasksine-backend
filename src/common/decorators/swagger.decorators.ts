import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiExtraModels,
  ApiFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';

/**
 * Standard Swagger decorator for GET operations returning data
 */
export const ApiGetOperation = <ResponseDto extends Type<unknown>>(
  summary: string,
  description?: string,
  responseType?: ResponseDto,
) => {
  const decorators = [
    ApiOperation({
      summary,
      description,
    }),
  ];

  if (responseType) {
    decorators.push(
      ApiExtraModels(responseType),
      ApiOkResponse({
        description: 'Successfully retrieved data',
        schema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              example: 'Operation successful',
            },
            data: {
              $ref: getSchemaPath(responseType),
            },
          },
        },
      }),
    );
  } else {
    decorators.push(
      ApiOkResponse({
        description: 'Operation successful',
      }),
    );
  }

  return applyDecorators(...decorators);
};

/**
 * Standard Swagger decorator for POST operations creating resources
 */
export const ApiPostOperation = <ResponseDto extends Type<unknown>>(
  summary: string,
  description?: string,
  responseType?: ResponseDto,
) => {
  const decorators = [
    ApiOperation({
      summary,
      description,
    }),
  ];

  if (responseType) {
    decorators.push(
      ApiExtraModels(responseType),
      ApiCreatedResponse({
        description: 'Resource created successfully',
        schema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              example: 'Resource created successfully',
            },
            data: {
              $ref: getSchemaPath(responseType),
            },
          },
        },
      }),
    );
  } else {
    decorators.push(
      ApiCreatedResponse({
        description: 'Resource created successfully',
      }),
    );
  }

  return applyDecorators(...decorators);
};

/**
 * Standard Swagger decorator for PUT/PATCH operations
 */
export const ApiUpdateOperation = <ResponseDto extends Type<unknown>>(
  summary: string,
  description?: string,
  responseType?: ResponseDto,
) => {
  const decorators = [
    ApiOperation({
      summary,
      description,
    }),
  ];

  if (responseType) {
    decorators.push(
      ApiExtraModels(responseType),
      ApiOkResponse({
        description: 'Resource updated successfully',
        schema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              example: 'Resource updated successfully',
            },
            data: {
              $ref: getSchemaPath(responseType),
            },
          },
        },
      }),
    );
  } else {
    decorators.push(
      ApiOkResponse({
        description: 'Resource updated successfully',
      }),
    );
  }

  return applyDecorators(...decorators);
};

/**
 * Standard Swagger decorator for DELETE operations
 */
export const ApiDeleteOperation = (summary: string, description?: string) => {
  return applyDecorators(
    ApiOperation({
      summary,
      description,
    }),
    ApiOkResponse({
      description: 'Resource deleted successfully',
      schema: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            example: 'Resource deleted successfully',
          },
        },
      },
    }),
  );
};

/**
 * Swagger decorator for OAuth initiation endpoints
 */
export const ApiOAuthInit = (provider: 'google' | 'github') => {
  const providerName = provider === 'google' ? 'Google' : 'GitHub';
  const callbackUrl = `/auth/${provider}/callback`;

  return applyDecorators(
    ApiOperation({
      summary: `Initiate ${providerName} OAuth authentication`,
      description: `Redirects user to ${providerName} OAuth consent screen. After authentication, user will be redirected to ${callbackUrl}`,
    }),
    ApiFoundResponse({
      description: `Redirects to ${providerName} OAuth consent screen`,
    }),
  );
};

/**
 * Swagger decorator for OAuth callback endpoints
 */
export const ApiOAuthCallback = (provider: 'google' | 'github') => {
  const providerName = provider === 'google' ? 'Google' : 'GitHub';

  return applyDecorators(
    ApiOperation({
      summary: `${providerName} OAuth callback endpoint`,
      description: `Handles the OAuth callback from ${providerName}. On success, redirects to dashboard. On failure, redirects to login page with error query parameter.`,
    }),
    ApiFoundResponse({
      description: 'Successful authentication - redirects to dashboard',
    }),
    ApiResponse({
      status: 302,
      description: `Redirects to frontend. Possible redirects: /dashboard (success), /auth/login?error=oauth_failed&provider=${provider} (OAuth failure), /auth/login?error=user_not_found&provider=${provider} (user not found), /auth/login?error=session_failed&provider=${provider} (session creation failed)`,
    }),
  );
};
