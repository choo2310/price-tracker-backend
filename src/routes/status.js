const express = require("express");
const logger = require("../utils/logger");

function createStatusRouter(alertManager, finnhubService, discordService) {
  const router = express.Router();

  /**
   * GET /status
   * Get system status and health information
   */
  router.get("/", async (req, res) => {
    try {
      const status = {
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        alertManager: alertManager ? alertManager.getStatus() : null,
        services: {
          finnhub: {
            connected: finnhubService
              ? finnhubService.getConnectionStatus()
              : false,
            subscribedSymbols: finnhubService
              ? finnhubService.getSubscribedSymbols()
              : [],
          },
          discord: {
            configured: !!discordService,
          },
        },
      };

      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      logger.error("Error getting system status:", error);
      res.status(500).json({
        error: "Failed to get system status",
        message: error.message,
      });
    }
  });

  /**
   * GET /status/health
   * Simple health check endpoint
   */
  router.get("/health", (req, res) => {
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  /**
   * POST /status/refresh
   * Manually refresh alerts from database
   */
  router.post("/refresh", async (req, res) => {
    try {
      if (!alertManager) {
        return res.status(503).json({
          error: "Alert manager not available",
        });
      }

      await alertManager.refreshAlerts();

      res.json({
        success: true,
        message: "Alerts refreshed successfully",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Error refreshing alerts:", error);
      res.status(500).json({
        error: "Failed to refresh alerts",
        message: error.message,
      });
    }
  });

  /**
   * POST /status/test-discord
   * Test Discord webhook connectivity
   */
  router.post("/test-discord", async (req, res) => {
    try {
      if (!discordService) {
        return res.status(503).json({
          error: "Discord service not configured",
        });
      }

      const testSuccessful = await discordService.testWebhook();

      if (testSuccessful) {
        res.json({
          success: true,
          message: "Discord webhook test successful",
        });
      } else {
        res.status(500).json({
          error: "Discord webhook test failed",
        });
      }
    } catch (error) {
      logger.error("Error testing Discord webhook:", error);
      res.status(500).json({
        error: "Failed to test Discord webhook",
        message: error.message,
      });
    }
  });

  /**
   * GET /status/prices
   * Get current cached prices
   */
  router.get("/prices", (req, res) => {
    try {
      if (!alertManager) {
        return res.status(503).json({
          error: "Alert manager not available",
        });
      }

      const status = alertManager.getStatus();

      res.json({
        success: true,
        data: status.priceCache,
        count: Object.keys(status.priceCache).length,
      });
    } catch (error) {
      logger.error("Error getting cached prices:", error);
      res.status(500).json({
        error: "Failed to get cached prices",
        message: error.message,
      });
    }
  });

  /**
   * GET /status/metrics
   * Get detailed system metrics
   */
  router.get("/metrics", (req, res) => {
    try {
      const memUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();

      const metrics = {
        timestamp: new Date().toISOString(),
        uptime: {
          seconds: process.uptime(),
          formatted: formatUptime(process.uptime()),
        },
        memory: {
          rss: {
            bytes: memUsage.rss,
            mb: Math.round((memUsage.rss / 1024 / 1024) * 100) / 100,
          },
          heapTotal: {
            bytes: memUsage.heapTotal,
            mb: Math.round((memUsage.heapTotal / 1024 / 1024) * 100) / 100,
          },
          heapUsed: {
            bytes: memUsage.heapUsed,
            mb: Math.round((memUsage.heapUsed / 1024 / 1024) * 100) / 100,
          },
          external: {
            bytes: memUsage.external,
            mb: Math.round((memUsage.external / 1024 / 1024) * 100) / 100,
          },
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system,
        },
        node: {
          version: process.version,
          platform: process.platform,
          arch: process.arch,
        },
      };

      // Add alert manager metrics if available
      if (alertManager) {
        const alertStatus = alertManager.getStatus();
        metrics.alerts = {
          isRunning: alertStatus.isRunning,
          activeSymbols: alertStatus.activeSymbols.length,
          totalAlerts: alertStatus.totalAlerts,
          symbolsMonitored: alertStatus.activeSymbols,
        };
      }

      // Add service metrics
      metrics.services = {
        finnhub: {
          connected: finnhubService
            ? finnhubService.getConnectionStatus()
            : false,
          subscribedSymbolsCount: finnhubService
            ? finnhubService.getSubscribedSymbols().length
            : 0,
        },
        discord: {
          configured: !!discordService,
        },
      };

      res.json({
        success: true,
        data: metrics,
      });
    } catch (error) {
      logger.error("Error getting system metrics:", error);
      res.status(500).json({
        error: "Failed to get system metrics",
        message: error.message,
      });
    }
  });

  return router;
}

/**
 * Format uptime in human readable format
 * @param {number} uptimeSeconds - Uptime in seconds
 * @returns {string} Formatted uptime
 */
function formatUptime(uptimeSeconds) {
  const days = Math.floor(uptimeSeconds / 86400);
  const hours = Math.floor((uptimeSeconds % 86400) / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = Math.floor(uptimeSeconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0) parts.push(`${seconds}s`);

  return parts.join(" ") || "0s";
}

module.exports = createStatusRouter;
