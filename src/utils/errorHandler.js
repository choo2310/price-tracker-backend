const logger = require("./logger");

/**
 * Global error handler middleware for Express
 * @param {Error} error - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function globalErrorHandler(error, req, res, next) {
  // Log the error
  logger.logError(error, {
    method: req.method,
    url: req.originalUrl || req.url,
    userAgent: req.get("User-Agent"),
    ip: req.ip || req.connection.remoteAddress,
    userId: req.headers["x-user-id"] || "anonymous",
    body: req.method !== "GET" ? req.body : undefined,
  });

  // Determine error status code
  const statusCode = error.statusCode || error.status || 500;

  // Determine if error details should be exposed
  const isProduction = process.env.NODE_ENV === "production";
  const shouldExposeDetails = !isProduction || statusCode < 500;

  // Build error response
  const errorResponse = {
    error: true,
    status: statusCode,
    message: shouldExposeDetails ? error.message : "Internal server error",
    timestamp: new Date().toISOString(),
    path: req.originalUrl || req.url,
  };

  // Add error details in development
  if (!isProduction) {
    errorResponse.stack = error.stack;
    errorResponse.details = error.details || {};
  }

  // Add request ID if available
  if (req.id) {
    errorResponse.requestId = req.id;
  }

  res.status(statusCode).json(errorResponse);
}

/**
 * 404 Not Found handler
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function notFoundHandler(req, res) {
  const error = {
    error: true,
    status: 404,
    message: "Route not found",
    timestamp: new Date().toISOString(),
    path: req.originalUrl || req.url,
    method: req.method,
  };

  logger.warn("Route not found", {
    method: req.method,
    url: req.originalUrl || req.url,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get("User-Agent"),
  });

  res.status(404).json(error);
}

/**
 * Async error wrapper for route handlers
 * @param {Function} fn - Async route handler
 * @returns {Function} Wrapped handler
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Validation error handler
 * @param {Array} errors - Validation errors
 * @returns {Error} Formatted validation error
 */
function createValidationError(errors) {
  const error = new Error("Validation failed");
  error.statusCode = 400;
  error.name = "ValidationError";
  error.details = errors;
  return error;
}

/**
 * Create custom application error
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code
 * @param {Object} details - Additional error details
 * @returns {Error} Custom error
 */
function createError(message, statusCode = 500, details = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

/**
 * Database error handler
 * @param {Error} error - Database error
 * @returns {Error} Formatted database error
 */
function handleDatabaseError(error) {
  logger.error("Database error:", error);

  // Handle specific database errors
  if (error.code === "23505") {
    // Unique constraint violation
    return createError("Resource already exists", 409, {
      code: error.code,
      constraint: error.constraint,
    });
  }

  if (error.code === "23503") {
    // Foreign key constraint violation
    return createError("Referenced resource does not exist", 400, {
      code: error.code,
      constraint: error.constraint,
    });
  }

  if (error.code === "23502") {
    // Not null violation
    return createError("Required field is missing", 400, {
      code: error.code,
      column: error.column,
    });
  }

  // Generic database error
  return createError("Database operation failed", 500, {
    code: error.code,
    message: error.message,
  });
}

/**
 * WebSocket error handler
 * @param {Error} error - WebSocket error
 * @param {Object} ws - WebSocket instance
 */
function handleWebSocketError(error, ws) {
  logger.error("WebSocket error:", error);

  // Try to send error message to client if connection is open
  if (ws && ws.readyState === 1) {
    // OPEN
    try {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "WebSocket error occurred",
          timestamp: new Date().toISOString(),
        })
      );
    } catch (sendError) {
      logger.error("Failed to send WebSocket error message:", sendError);
    }
  }
}

/**
 * Rate limit error handler
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleRateLimit(req, res) {
  const error = {
    error: true,
    status: 429,
    message: "Too many requests",
    timestamp: new Date().toISOString(),
    retryAfter: Math.ceil(req.rateLimit.resetTime / 1000),
  };

  logger.warn("Rate limit exceeded", {
    ip: req.ip,
    userAgent: req.get("User-Agent"),
    path: req.path,
    resetTime: new Date(req.rateLimit.resetTime),
  });

  res.status(429).json(error);
}

/**
 * Graceful shutdown handler
 * @param {string} signal - Shutdown signal
 * @param {Function} cleanup - Cleanup function
 */
function setupGracefulShutdown(cleanup) {
  const signals = ["SIGTERM", "SIGINT", "SIGUSR2"];

  signals.forEach((signal) => {
    process.on(signal, async () => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);

      try {
        if (cleanup && typeof cleanup === "function") {
          await cleanup();
        }

        logger.info("Graceful shutdown completed");
        process.exit(0);
      } catch (error) {
        logger.error("Error during graceful shutdown:", error);
        process.exit(1);
      }
    });
  });

  // Handle uncaught exceptions
  process.on("uncaughtException", (error) => {
    logger.error("Uncaught Exception - shutting down:", error);
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on("unhandledRejection", (reason, promise) => {
    logger.error("Unhandled Rejection - shutting down:", {
      reason,
      promise: promise.toString(),
    });
    process.exit(1);
  });
}

/**
 * Service health checker
 * @param {Object} services - Services to check
 * @returns {Object} Health status
 */
async function checkServiceHealth(services = {}) {
  const health = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    services: {},
    uptime: process.uptime(),
  };

  try {
    // Check each service
    for (const [name, service] of Object.entries(services)) {
      try {
        if (service && typeof service.getConnectionStatus === "function") {
          health.services[name] = {
            status: service.getConnectionStatus() ? "healthy" : "unhealthy",
            connected: service.getConnectionStatus(),
          };
        } else if (service && typeof service.isHealthy === "function") {
          const isHealthy = await service.isHealthy();
          health.services[name] = {
            status: isHealthy ? "healthy" : "unhealthy",
          };
        } else {
          health.services[name] = {
            status: "unknown",
          };
        }
      } catch (error) {
        health.services[name] = {
          status: "unhealthy",
          error: error.message,
        };
      }
    }

    // Determine overall health
    const unhealthyServices = Object.values(health.services).filter(
      (service) => service.status === "unhealthy"
    );

    if (unhealthyServices.length > 0) {
      health.status = "degraded";
    }
  } catch (error) {
    logger.error("Error checking service health:", error);
    health.status = "unhealthy";
    health.error = error.message;
  }

  return health;
}

/**
 * Request timeout handler
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Function} Middleware function
 */
function requestTimeout(timeout = 30000) {
  return (req, res, next) => {
    const timer = setTimeout(() => {
      const error = createError("Request timeout", 408);
      next(error);
    }, timeout);

    res.on("finish", () => {
      clearTimeout(timer);
    });

    next();
  };
}

module.exports = {
  globalErrorHandler,
  notFoundHandler,
  asyncHandler,
  createValidationError,
  createError,
  handleDatabaseError,
  handleWebSocketError,
  handleRateLimit,
  setupGracefulShutdown,
  checkServiceHealth,
  requestTimeout,
};
