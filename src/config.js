const path = require("path");

// Load environment variables
require("dotenv").config();

/**
 * Application configuration
 */
const config = {
  // Server settings
  server: {
    port: parseInt(process.env.PORT, 10) || 3000,
    nodeEnv: process.env.NODE_ENV || "development",
    isDevelopment: process.env.NODE_ENV === "development",
    isProduction: process.env.NODE_ENV === "production",
  },

  // Supabase configuration
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    required: true,
  },

  // Finnhub API configuration
  finnhub: {
    apiKey: process.env.FINNHUB_API_KEY,
    wsUrl: "wss://ws.finnhub.io",
    required: true,
  },

  // Discord webhook configuration
  discord: {
    webhookUrl: process.env.DISCORD_WEBHOOK_URL,
    debugWebhookUrl: process.env.DEBUG_DISCORD_WEBHOOK_URL,
    required: true,
  },

  // Webhook configuration
  webhooks: {
    supabaseSecret: process.env.SUPABASE_WEBHOOK_SECRET,
    verifySignature: process.env.VERIFY_WEBHOOK_SIGNATURE !== "false",
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || "info",
    // Valid levels: error, warn, info, http, verbose, debug, silly
    format: process.env.LOG_FORMAT || "combined",
    // Valid formats: combined, common, dev, short, tiny
    file: {
      enabled: process.env.LOG_TO_FILE === "true",
      filename: process.env.LOG_FILENAME || "logs/app.log",
      maxSize: process.env.LOG_MAX_SIZE || "10m",
      maxFiles: parseInt(process.env.LOG_MAX_FILES, 10) || 5,
    },
  },

  // Rate limiting configuration
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
    message: "Too many requests from this IP, please try again later.",
    standardHeaders: true,
    legacyHeaders: false,
  },

  // CORS configuration
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-user-id"],
    credentials: true,
  },

  // Security configuration
  security: {
    helmet: {
      enabled: process.env.HELMET_ENABLED !== "false",
    },
  },

  // Alert system configuration
  alerts: {
    cooldownMinutes: parseInt(process.env.ALERT_COOLDOWN_MINUTES, 10) || 5,
    refreshIntervalMs:
      parseInt(process.env.ALERT_REFRESH_INTERVAL_MS, 10) || 5 * 60 * 1000, // 5 minutes
  },

  // WebSocket configuration
  websocket: {
    reconnectAttempts: parseInt(process.env.WS_RECONNECT_ATTEMPTS, 10) || 5,
    reconnectDelayMs: parseInt(process.env.WS_RECONNECT_DELAY_MS, 10) || 5000,
    pingIntervalMs: parseInt(process.env.WS_PING_INTERVAL_MS, 10) || 30000, // 30 seconds
  },

  // Database configuration
  database: {
    connectionPoolSize: parseInt(process.env.DB_CONNECTION_POOL_SIZE, 10) || 10,
    timeoutMs: parseInt(process.env.DB_TIMEOUT_MS, 10) || 30000,
  },
};

/**
 * Validate required configuration
 */
function validateConfig() {
  const errors = [];

  // Check required Supabase configuration
  if (config.supabase.required) {
    if (!config.supabase.url) {
      errors.push("SUPABASE_URL is required");
    }
    if (!config.supabase.anonKey) {
      errors.push("SUPABASE_ANON_KEY is required");
    }
  }

  // Check required Finnhub configuration
  if (config.finnhub.required) {
    if (!config.finnhub.apiKey) {
      errors.push("FINNHUB_API_KEY is required");
    }
  }

  // Check required Discord configuration
  if (config.discord.required) {
    if (!config.discord.webhookUrl) {
      errors.push("DISCORD_WEBHOOK_URL is required");
    }
  }

  // Validate port
  if (
    isNaN(config.server.port) ||
    config.server.port < 1 ||
    config.server.port > 65535
  ) {
    errors.push("PORT must be a valid port number (1-65535)");
  }

  // Validate log level
  const validLogLevels = [
    "error",
    "warn",
    "info",
    "http",
    "verbose",
    "debug",
    "silly",
  ];
  if (!validLogLevels.includes(config.logging.level)) {
    errors.push(`LOG_LEVEL must be one of: ${validLogLevels.join(", ")}`);
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join("\n")}`);
  }
}

/**
 * Get configuration for specific environment
 */
function getEnvironmentConfig() {
  const envConfig = { ...config };

  // Development-specific overrides
  if (envConfig.server.isDevelopment) {
    envConfig.logging.level = "debug";
    envConfig.security.helmet.enabled = false;
  }

  // Production-specific overrides
  if (envConfig.server.isProduction) {
    envConfig.logging.level = "warn";
    envConfig.cors.origin = process.env.CORS_ORIGIN; // Don't allow wildcard in production
  }

  return envConfig;
}

/**
 * Print configuration summary (without sensitive data)
 */
function printConfigSummary() {
  const summary = {
    environment: config.server.nodeEnv,
    port: config.server.port,
    logLevel: config.logging.level,
    services: {
      supabase: !!config.supabase.url,
      finnhub: !!config.finnhub.apiKey,
      discord: !!config.discord.webhookUrl,
    },
    security: {
      helmet: config.security.helmet.enabled,
      rateLimit: `${config.rateLimit.maxRequests} requests per ${
        config.rateLimit.windowMs / 1000
      }s`,
    },
  };

  console.log("Configuration Summary:");
  console.log(JSON.stringify(summary, null, 2));
}

// Validate configuration on load
try {
  validateConfig();
} catch (error) {
  console.error("Configuration Error:", error.message);
  process.exit(1);
}

module.exports = {
  ...getEnvironmentConfig(),
  validate: validateConfig,
  printSummary: printConfigSummary,
};
