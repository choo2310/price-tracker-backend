const winston = require("winston");
const path = require("path");
const fs = require("fs");

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;

    // Add stack trace for errors
    if (stack) {
      log += `\n${stack}`;
    }

    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      log += `\n${JSON.stringify(meta, null, 2)}`;
    }

    return log;
  })
);

// Custom format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create transports array
const transports = [
  // Console transport
  new winston.transports.Console({
    level: process.env.LOG_LEVEL || "info",
    format: consoleFormat,
    handleExceptions: true,
    handleRejections: true,
  }),
];

// Add file transport if enabled
if (process.env.LOG_TO_FILE === "true") {
  transports.push(
    // General log file
    new winston.transports.File({
      filename: path.join(logsDir, "app.log"),
      level: process.env.LOG_LEVEL || "info",
      format: fileFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      handleExceptions: true,
      handleRejections: true,
    }),

    // Error-only log file
    new winston.transports.File({
      filename: path.join(logsDir, "error.log"),
      level: "error",
      format: fileFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      handleExceptions: true,
      handleRejections: true,
    })
  );
}

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.metadata({ fillExcept: ["message", "level", "timestamp"] })
  ),
  transports,
  exitOnError: false,
  silent: process.env.NODE_ENV === "test",
});

// Enhanced logging methods
logger.logHttpRequest = (req, res, responseTime) => {
  const logData = {
    method: req.method,
    url: req.originalUrl || req.url,
    statusCode: res.statusCode,
    responseTime: `${responseTime}ms`,
    userAgent: req.get("User-Agent"),
    ip: req.ip || req.connection.remoteAddress,
    userId: req.headers["x-user-id"] || "anonymous",
  };

  if (res.statusCode >= 400) {
    logger.warn("HTTP Request", logData);
  } else {
    logger.http("HTTP Request", logData);
  }
};

logger.logError = (error, context = {}) => {
  const errorInfo = {
    name: error.name,
    message: error.message,
    stack: error.stack,
    ...context,
  };

  logger.error("Application Error", errorInfo);
};

logger.logWebSocketEvent = (event, data = {}) => {
  logger.debug("WebSocket Event", {
    event,
    timestamp: new Date().toISOString(),
    ...data,
  });
};

logger.logAlertEvent = (event, alertData = {}) => {
  logger.info("Alert Event", {
    event,
    alertId: alertData.id,
    symbol: alertData.symbol,
    targetPrice: alertData.target_value,
    direction: alertData.direction,
    timestamp: new Date().toISOString(),
  });
};

logger.logPriceUpdate = (symbol, price, volume) => {
  logger.debug("Price Update", {
    symbol,
    price,
    volume,
    timestamp: new Date().toISOString(),
  });
};

logger.logSystemEvent = (event, data = {}) => {
  logger.info("System Event", {
    event,
    timestamp: new Date().toISOString(),
    ...data,
  });
};

// Performance monitoring
logger.startTimer = (label) => {
  const start = process.hrtime.bigint();
  return {
    end: () => {
      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1000000; // Convert to milliseconds
      logger.debug("Performance Timer", {
        label,
        duration: `${duration.toFixed(2)}ms`,
      });
      return duration;
    },
  };
};

// Memory monitoring
logger.logMemoryUsage = () => {
  const memUsage = process.memoryUsage();
  logger.debug("Memory Usage", {
    rss: `${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`,
    heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
    heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
    external: `${(memUsage.external / 1024 / 1024).toFixed(2)} MB`,
  });
};

// Structured logging for different components
logger.supabase = {
  info: (message, data) => logger.info(`[Supabase] ${message}`, data),
  error: (message, data) => logger.error(`[Supabase] ${message}`, data),
  debug: (message, data) => logger.debug(`[Supabase] ${message}`, data),
};

logger.finnhub = {
  info: (message, data) => logger.info(`[Finnhub] ${message}`, data),
  error: (message, data) => logger.error(`[Finnhub] ${message}`, data),
  debug: (message, data) => logger.debug(`[Finnhub] ${message}`, data),
};

logger.discord = {
  info: (message, data) => logger.info(`[Discord] ${message}`, data),
  error: (message, data) => logger.error(`[Discord] ${message}`, data),
  debug: (message, data) => logger.debug(`[Discord] ${message}`, data),
};

logger.alerts = {
  info: (message, data) => logger.info(`[Alerts] ${message}`, data),
  error: (message, data) => logger.error(`[Alerts] ${message}`, data),
  debug: (message, data) => logger.debug(`[Alerts] ${message}`, data),
};

// Handle uncaught exceptions and unhandled rejections
process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception", {
    name: error.name,
    message: error.message,
    stack: error.stack,
  });

  // Give logger time to write the log
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection", {
    reason:
      reason instanceof Error
        ? {
            name: reason.name,
            message: reason.message,
            stack: reason.stack,
          }
        : reason,
    promise: promise.toString(),
  });
});

// Log startup information
logger.info("Logger initialized", {
  level: process.env.LOG_LEVEL || "info",
  environment: process.env.NODE_ENV || "development",
  fileLogging: process.env.LOG_TO_FILE === "true",
  transports: transports.map((t) => t.constructor.name),
});

/**
 * Configure Discord logging transport
 * @param {DiscordService} discordService - Discord service instance with debug webhook
 * @param {string} level - Minimum log level to send to Discord (default: 'warn')
 */
logger.configureDiscordLogging = (discordService, level = "warn") => {
  try {
    // Only add Discord transport if debug webhook is configured
    if (!discordService.debugWebhookUrl) {
      logger.info(
        "Discord debug logging not configured - DEBUG_DISCORD_WEBHOOK_URL not set"
      );
      return;
    }

    const DiscordTransport = require("./discordTransport");

    // Check if Discord transport already exists
    const existingDiscordTransport = logger.transports.find(
      (transport) => transport.name === "discord"
    );

    if (existingDiscordTransport) {
      logger.info("Discord transport already configured");
      return;
    }

    // Create and add Discord transport
    const discordTransport = new DiscordTransport({
      level: level,
      discordService: discordService,
      handleExceptions: true,
      handleRejections: true,
    });

    logger.add(discordTransport);

    logger.info("Discord logging transport configured", {
      level: level,
      debugWebhookConfigured: !!discordService.debugWebhookUrl,
    });
  } catch (error) {
    logger.error("Failed to configure Discord logging transport:", error);
  }
};

/**
 * Remove Discord logging transport
 */
logger.removeDiscordLogging = () => {
  try {
    const discordTransport = logger.transports.find(
      (transport) => transport.name === "discord"
    );

    if (discordTransport) {
      logger.remove(discordTransport);
      logger.info("Discord logging transport removed");
    }
  } catch (error) {
    logger.error("Failed to remove Discord logging transport:", error);
  }
};

/**
 * Test Discord logging
 * @param {string} level - Log level to test (default: 'info')
 * @param {string} message - Test message (default: 'Discord logging test')
 */
logger.testDiscordLogging = (
  level = "info",
  message = "Discord logging test"
) => {
  logger.log(level, message, {
    test: true,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
};

module.exports = logger;
