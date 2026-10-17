export class AppError extends Error {
  constructor(statusCode, message, code = 'INTERNAL_SERVER_ERROR') {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function notFoundHandler(request, _response, next) {
  next(new AppError(404, `Route not found: ${request.method} ${request.originalUrl}`, 'ROUTE_NOT_FOUND'));
}

export function errorHandler(error, request, response, _next) {
  const isValidationError = error?.name === 'ZodError';
  const isUploadLimit = ['LIMIT_FILE_SIZE', 'LIMIT_UNEXPECTED_FILE', 'LIMIT_FIELD_COUNT', 'LIMIT_PART_COUNT', 'LIMIT_FIELD_SIZE'].includes(error?.code);
  const isMalformedBody = error?.type === 'entity.parse.failed';
  const isCastError = error?.name === 'CastError';
  const isDuplicateError = error?.code === 11000;
  const statusCode = error instanceof AppError ? error.statusCode : isValidationError || isUploadLimit || isCastError || isMalformedBody ? 400 : isDuplicateError ? 409 : error?.statusCode ?? 500;
  const message = error instanceof AppError || isValidationError || isUploadLimit || isCastError || isMalformedBody || isDuplicateError || error?.statusCode ? error.message : 'An unexpected error occurred.';
  const code = error instanceof AppError ? error.code : isValidationError ? 'VALIDATION_ERROR' : isUploadLimit ? 'INVALID_UPLOAD' : isCastError ? 'INVALID_IDENTIFIER' : isMalformedBody ? 'MALFORMED_REQUEST' : isDuplicateError ? 'RESOURCE_CONFLICT' : error?.code ?? 'INTERNAL_SERVER_ERROR';

  request.log.error({ error: { name: error?.name, code: error?.code, message: error?.message }, statusCode, code }, 'Request failed');
  response.status(statusCode).json({
    error: {
      code,
      message: statusCode >= 500 ? 'An unexpected error occurred.' : message
    },
    meta: { requestId: request.id }
  });
}
