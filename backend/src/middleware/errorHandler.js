// src/middleware/errorHandler.js
// Centralised Express error handler.
// All controllers call next(err) to reach here.
// Consistent JSON response: { error: { message, code } }

export function errorHandler(err, req, res, next) {
  // Determine safe status code
  const status = err.statusCode || err.status || 500;

  // In production, never expose internal error details
  const isDev = process.env.NODE_ENV !== 'production';

  const responseBody = {
    error: {
      message: err.message || 'An unexpected server error occurred.',
      code: err.code || 'INTERNAL_SERVER_ERROR',
    },
  };

  // Append stack trace only in development
  if (isDev && err.stack) {
    responseBody.error.stack = err.stack;
  }

  // Log to server console
  console.error(`[${new Date().toISOString()}] ${status} — ${err.message}`);
  if (isDev && err.stack) console.error(err.stack);

  res.status(status).json(responseBody);
}

// 404 handler — call this AFTER all routes are mounted
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      message: `Route not found: ${req.method} ${req.originalUrl}`,
      code: 'ROUTE_NOT_FOUND',
    },
  });
}

// Helper: create a structured HTTP error to throw inside controllers
export function createError(message, statusCode = 500, code = 'INTERNAL_SERVER_ERROR') {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}
