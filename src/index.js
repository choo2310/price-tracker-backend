const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

// Import configuration and utilities
const config = require("./config");
const logger = require("./utils/logger");
const {
  globalErrorHandler,
  notFoundHandler,
  asyncHandler,
  setupGracefulShutdown,
  checkServiceHealth,
  requestTimeout,
} = require("./utils/errorHandler");

// Import services
const SupabaseService = require("./services/supabase");
const FinnhubWebSocketService = require("./services/finnhub");
const DiscordService = require("./services/discord");
const AlertManager = require("./services/alertManager");

// Import routes
const createAlertsRouter = require("./routes/alerts");
const createStatusRouter = require("./routes/status");

class PriceTrackerApp {
  constructor() {
    this.app = express();
    this.server = null;
    this.services = {};
    this.isShuttingDown = false;
  }

  /**
   * Initialize all services
   */
  async initializeServices() {
    try {
      logger.info("Initializing services...");

      // Initialize Supabase service
      logger.info("Connecting to Supabase...");
      this.services.supabase = new SupabaseService();

      // Initialize Discord service
      logger.info("Initializing Discord service...");
      this.services.discord = new DiscordService(
        config.discord.webhookUrl,
        config.discord.debugWebhookUrl
      );

      // Test Discord webhook
      const discordHealthy = await this.services.discord.testWebhook();
      if (!discordHealthy) {
        logger.warn("Discord webhook test failed - notifications may not work");
      }

      // Configure Discord logging if debug webhook is available
      if (config.discord.debugWebhookUrl) {
        logger.info("Configuring Discord debug logging...");
        logger.configureDiscordLogging(this.services.discord, "warn");

        // Send a test message to verify Discord logging
        logger.info("Discord logging configured successfully", {
          debugWebhookConfigured: true,
          testMessage: true,
        });
      } else {
        logger.info(
          "Discord debug logging not configured - DEBUG_DISCORD_WEBHOOK_URL not set"
        );
      }

      // Initialize Finnhub WebSocket service
      logger.info("Connecting to Finnhub WebSocket...");
      this.services.finnhub = new FinnhubWebSocketService(
        config.finnhub.apiKey
      );
      await this.services.finnhub.connect();

      // Initialize Alert Manager
      logger.info("Starting Alert Manager...");
      this.services.alertManager = new AlertManager(
        this.services.supabase,
        this.services.finnhub,
        this.services.discord
      );
      await this.services.alertManager.start();

      logger.info("All services initialized successfully");
    } catch (error) {
      logger.error("Failed to initialize services:", error);
      throw error;
    }
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    // Security middleware
    if (config.security.helmet.enabled) {
      this.app.use(helmet());
    }

    // CORS middleware
    this.app.use(cors(config.cors));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.maxRequests,
      message: {
        error: config.rateLimit.message,
        timestamp: new Date().toISOString(),
      },
      standardHeaders: config.rateLimit.standardHeaders,
      legacyHeaders: config.rateLimit.legacyHeaders,
    });
    this.app.use("/api/", limiter);

    // Request timeout
    this.app.use(requestTimeout(30000)); // 30 seconds

    // Body parsing middleware
    this.app.use(express.json({ limit: "10mb" }));
    this.app.use(express.urlencoded({ extended: true, limit: "10mb" }));

    // Request logging middleware
    this.app.use((req, res, next) => {
      const start = Date.now();

      res.on("finish", () => {
        const duration = Date.now() - start;
        logger.logHttpRequest(req, res, duration);
      });

      next();
    });

    // Health check endpoint (before authentication)
    this.app.get("/health", (req, res) => {
      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || "1.0.0",
      });
    });

    logger.info("Middleware setup completed");
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    // API base path
    const apiRouter = express.Router();

    // Mount route handlers
    apiRouter.use(
      "/alerts",
      createAlertsRouter(this.services.supabase, this.services.alertManager)
    );

    apiRouter.use(
      "/status",
      createStatusRouter(
        this.services.alertManager,
        this.services.finnhub,
        this.services.discord
      )
    );

    // API info endpoint
    apiRouter.get("/", (req, res) => {
      res.json({
        name: "Price Tracker API",
        version: process.env.npm_package_version || "1.0.0",
        description: "Real-time price tracking and alerting system",
        environment: config.server.nodeEnv,
        timestamp: new Date().toISOString(),
        endpoints: {
          health: "/health",
          alerts: "/api/alerts",
          status: "/api/status",
        },
        documentation: "https://github.com/your-repo/price-tracker-backend",
      });
    });

    // Mount API router
    this.app.use("/api", apiRouter);

    logger.info("Routes setup completed");
  }

  /**
   * Setup error handling
   */
  setupErrorHandling() {
    // 404 handler
    this.app.use(notFoundHandler);

    // Global error handler
    this.app.use(globalErrorHandler);

    logger.info("Error handling setup completed");
  }

  /**
   * Setup graceful shutdown
   */
  setupGracefulShutdown() {
    setupGracefulShutdown(async () => {
      if (this.isShuttingDown) {
        logger.warn("Shutdown already in progress");
        return;
      }

      this.isShuttingDown = true;
      logger.info("Starting graceful shutdown...");

      try {
        // Stop accepting new connections
        if (this.server) {
          await new Promise((resolve) => {
            this.server.close(resolve);
          });
          logger.info("HTTP server closed");
        }

        // Stop alert manager
        if (this.services.alertManager) {
          await this.services.alertManager.stop();
          logger.info("Alert manager stopped");
        }

        // Disconnect from Finnhub
        if (this.services.finnhub) {
          this.services.finnhub.disconnect();
          logger.info("Finnhub WebSocket disconnected");
        }

        // Send shutdown notification to Discord
        if (this.services.discord) {
          try {
            await this.services.discord.sendStatusNotification({
              isRunning: false,
              activeSymbols: [],
              totalAlerts: 0,
              finnhubConnectionStatus: false,
            });
          } catch (error) {
            logger.warn(
              "Failed to send shutdown notification to Discord:",
              error
            );
          }
        }

        logger.info("Graceful shutdown completed successfully");
      } catch (error) {
        logger.error("Error during graceful shutdown:", error);
        throw error;
      }
    });
  }

  /**
   * Start the application
   */
  async start() {
    try {
      logger.info("Starting Price Tracker Backend...");

      // Print configuration summary
      config.printSummary();

      // Initialize services
      await this.initializeServices();

      // Setup Express application
      this.setupMiddleware();
      this.setupRoutes();
      this.setupErrorHandling();
      this.setupGracefulShutdown();

      // Start HTTP server
      this.server = this.app.listen(config.server.port, () => {
        logger.info(`Server started on port ${config.server.port}`);
        logger.info(`Environment: ${config.server.nodeEnv}`);
        logger.info(
          `API available at: http://localhost:${config.server.port}/api`
        );
        logger.info(
          `Health check: http://localhost:${config.server.port}/health`
        );
      });

      // Server error handling
      this.server.on("error", (error) => {
        if (error.code === "EADDRINUSE") {
          logger.error(`Port ${config.server.port} is already in use`);
        } else {
          logger.error("Server error:", error);
        }
        process.exit(1);
      });

      // Send startup notification to Discord
      try {
        const status = await checkServiceHealth(this.services);
        await this.services.discord.sendStatusNotification({
          isRunning: true,
          activeSymbols: this.services.alertManager.getStatus().activeSymbols,
          totalAlerts: this.services.alertManager.getStatus().totalAlerts,
          finnhubConnectionStatus: this.services.finnhub.getConnectionStatus(),
        });
      } catch (error) {
        logger.warn("Failed to send startup notification to Discord:", error);
      }

      logger.info("Price Tracker Backend started successfully! 🚀");
    } catch (error) {
      logger.error("Failed to start application:", error);
      process.exit(1);
    }
  }

  /**
   * Get application instance for testing
   */
  getApp() {
    return this.app;
  }

  /**
   * Get services for testing
   */
  getServices() {
    return this.services;
  }
}

// Create and start application if this file is run directly
if (require.main === module) {
  const app = new PriceTrackerApp();
  app.start().catch((error) => {
    logger.error("Application startup failed:", error);
    process.exit(1);
  });
}

module.exports = PriceTrackerApp;
