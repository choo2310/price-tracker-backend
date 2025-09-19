const express = require("express");
const logger = require("../utils/logger");
const {
  webhookVerification,
  captureRawBody,
  webhookRateLimit,
} = require("../utils/webhooks");
const config = require("../config");

function createAlertsRouter(supabaseService, alertManager) {
  const router = express.Router();

  /**
   * GET /alerts
   * Get all alerts for a user
   */
  router.get("/", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"];

      if (!userId) {
        return res.status(400).json({
          error: "Missing user ID header (x-user-id)",
        });
      }

      const alerts = await supabaseService.getUserAlerts(userId);

      res.json({
        success: true,
        data: alerts,
        count: alerts.length,
      });
    } catch (error) {
      logger.error("Error fetching user alerts:", error);
      res.status(500).json({
        error: "Failed to fetch alerts",
        message: error.message,
      });
    }
  });

  /**
   * POST /alerts
   * Create a new alert
   */
  router.post("/", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"];

      if (!userId) {
        return res.status(400).json({
          error: "Missing user ID header (x-user-id)",
        });
      }

      const {
        symbol,
        alert_type,
        target_value,
        direction = "above",
        enabled = true,
        notes,
        prompt,
        n8n_workflow_id,
      } = req.body;

      // Validate required fields
      if (!symbol || !alert_type || target_value === undefined) {
        return res.status(400).json({
          error: "Missing required fields: symbol, alert_type, target_value",
        });
      }

      // Validate target_value is a number
      if (typeof target_value !== "number" || target_value <= 0) {
        return res.status(400).json({
          error: "target_value must be a positive number",
        });
      }

      // Validate direction
      if (!["above", "below"].includes(direction)) {
        return res.status(400).json({
          error: 'direction must be either "above" or "below"',
        });
      }

      const alertData = {
        user_id: userId,
        symbol: symbol.toUpperCase(),
        alert_type,
        target_value,
        direction,
        enabled,
        notes,
        prompt,
        n8n_workflow_id,
      };

      const newAlert = await supabaseService.createAlert(alertData);

      // Add to alert manager if enabled
      if (enabled && alertManager) {
        alertManager.addAlert(newAlert);
      }

      res.status(201).json({
        success: true,
        data: newAlert,
      });
    } catch (error) {
      logger.error("Error creating alert:", error);
      res.status(500).json({
        error: "Failed to create alert",
        message: error.message,
      });
    }
  });

  /**
   * PUT /alerts/:id
   * Update an existing alert
   */
  router.put("/:id", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"];
      const alertId = req.params.id;

      if (!userId) {
        return res.status(400).json({
          error: "Missing user ID header (x-user-id)",
        });
      }

      const {
        symbol,
        alert_type,
        target_value,
        direction,
        enabled,
        notes,
        prompt,
        n8n_workflow_id,
      } = req.body;

      // Build update object with only provided fields
      const updateData = {};
      if (symbol !== undefined) updateData.symbol = symbol.toUpperCase();
      if (alert_type !== undefined) updateData.alert_type = alert_type;
      if (target_value !== undefined) {
        if (typeof target_value !== "number" || target_value <= 0) {
          return res.status(400).json({
            error: "target_value must be a positive number",
          });
        }
        updateData.target_value = target_value;
      }
      if (direction !== undefined) {
        if (!["above", "below"].includes(direction)) {
          return res.status(400).json({
            error: 'direction must be either "above" or "below"',
          });
        }
        updateData.direction = direction;
      }
      if (enabled !== undefined) updateData.enabled = enabled;
      if (notes !== undefined) updateData.notes = notes;
      if (prompt !== undefined) updateData.prompt = prompt;
      if (n8n_workflow_id !== undefined)
        updateData.n8n_workflow_id = n8n_workflow_id;

      // Check if alert exists and belongs to user
      const existingAlerts = await supabaseService.getUserAlerts(userId);
      const existingAlert = existingAlerts.find(
        (alert) => alert.id === alertId
      );

      if (!existingAlert) {
        return res.status(404).json({
          error: "Alert not found or does not belong to user",
        });
      }

      const updatedAlert = await supabaseService.updateAlert(
        alertId,
        updateData
      );

      // Update alert manager
      if (alertManager) {
        if (enabled === false) {
          alertManager.removeAlert(alertId);
        } else if (enabled === true) {
          alertManager.addAlert(updatedAlert);
        }
        // If other fields changed, refresh alerts
        await alertManager.refreshAlerts();
      }

      res.json({
        success: true,
        data: updatedAlert,
      });
    } catch (error) {
      logger.error("Error updating alert:", error);
      res.status(500).json({
        error: "Failed to update alert",
        message: error.message,
      });
    }
  });

  /**
   * DELETE /alerts/:id
   * Delete an alert
   */
  router.delete("/:id", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"];
      const alertId = req.params.id;

      if (!userId) {
        return res.status(400).json({
          error: "Missing user ID header (x-user-id)",
        });
      }

      // Check if alert exists and belongs to user
      const existingAlerts = await supabaseService.getUserAlerts(userId);
      const existingAlert = existingAlerts.find(
        (alert) => alert.id === alertId
      );

      if (!existingAlert) {
        return res.status(404).json({
          error: "Alert not found or does not belong to user",
        });
      }

      await supabaseService.deleteAlert(alertId);

      // Remove from alert manager
      if (alertManager) {
        alertManager.removeAlert(alertId);
      }

      res.json({
        success: true,
        message: "Alert deleted successfully",
      });
    } catch (error) {
      logger.error("Error deleting alert:", error);
      res.status(500).json({
        error: "Failed to delete alert",
        message: error.message,
      });
    }
  });

  /**
   * GET /alerts/symbols
   * Get list of unique symbols from user's alerts
   */
  router.get("/symbols", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"];

      if (!userId) {
        return res.status(400).json({
          error: "Missing user ID header (x-user-id)",
        });
      }

      const alerts = await supabaseService.getUserAlerts(userId);
      const symbols = [...new Set(alerts.map((alert) => alert.symbol))];

      res.json({
        success: true,
        data: symbols,
        count: symbols.length,
      });
    } catch (error) {
      logger.error("Error fetching user symbols:", error);
      res.status(500).json({
        error: "Failed to fetch symbols",
        message: error.message,
      });
    }
  });

  /**
   * POST /alerts/:id/test
   * Test an alert (simulate trigger)
   */
  router.post("/:id/test", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"];
      const alertId = req.params.id;

      if (!userId) {
        return res.status(400).json({
          error: "Missing user ID header (x-user-id)",
        });
      }

      // Check if alert exists and belongs to user
      const existingAlerts = await supabaseService.getUserAlerts(userId);
      const alert = existingAlerts.find((alert) => alert.id === alertId);

      if (!alert) {
        return res.status(404).json({
          error: "Alert not found or does not belong to user",
        });
      }

      // Simulate alert trigger with current price as target + small offset
      const testPrice =
        alert.direction === "above"
          ? alert.target_value + 1
          : alert.target_value - 1;

      // Create test notification
      const testNotification = {
        alert,
        currentPrice: testPrice,
        targetPrice: alert.target_value,
        direction: alert.direction,
        symbol: alert.symbol,
        timestamp: new Date(),
        priceChange: null,
        volume: 123456,
        alertType: alert.alert_type + " (TEST)",
        notes: alert.notes,
        prompt: alert.prompt,
        userId: alert.user_id,
      };

      // Send test notification if Discord service is available
      if (alertManager && alertManager.discordService) {
        await alertManager.discordService.sendAlert(testNotification);
      }

      res.json({
        success: true,
        message: "Test alert sent successfully",
        testData: {
          symbol: alert.symbol,
          testPrice,
          targetPrice: alert.target_value,
          direction: alert.direction,
        },
      });
    } catch (error) {
      logger.error("Error sending test alert:", error);
      res.status(500).json({
        error: "Failed to send test alert",
        message: error.message,
      });
    }
  });

  /**
   * POST /alerts/webhook
   * Handle Supabase webhooks for alert changes
   */
  router.post(
    "/webhook",
    webhookRateLimit(50, 60000), // 50 requests per minute
    captureRawBody,
    webhookVerification(config.webhooks.supabaseSecret),
    async (req, res) => {
      try {
        const { type, table, record, old_record } = req.body;

        // Verify this is for the alerts table
        if (table !== "alerts") {
          return res.status(400).json({
            error: "Webhook not for alerts table",
          });
        }

        logger.info(`Received webhook: ${type} for alert`, {
          type,
          alertId: record?.id || old_record?.id,
          symbol: record?.symbol || old_record?.symbol,
        });

        // Handle different webhook types
        switch (type) {
          case "INSERT":
            await handleAlertInsert(record, alertManager);
            break;
          case "UPDATE":
            await handleAlertUpdate(record, old_record, alertManager);
            break;
          case "DELETE":
            await handleAlertDelete(old_record, alertManager);
            break;
          default:
            logger.warn(`Unknown webhook type: ${type}`);
        }

        // Optionally refresh all alerts to ensure consistency
        if (alertManager) {
          await alertManager.refreshAlerts();
          logger.info("Alert manager refreshed after webhook");
        }

        res.json({
          success: true,
          message: `Webhook ${type} processed successfully`,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error("Error processing webhook:", error);
        res.status(500).json({
          error: "Failed to process webhook",
          message: error.message,
        });
      }
    }
  );

  return router;
}

/**
 * Handle alert insert webhook
 */
async function handleAlertInsert(record, alertManager) {
  if (!record || !alertManager) return;

  logger.info(`New alert created: ${record.id} for ${record.symbol}`);

  // Add the new alert to monitoring if it's enabled
  if (record.enabled) {
    alertManager.addAlert(record);
    logger.info(`Added alert ${record.id} to monitoring`);
  }
}

/**
 * Handle alert update webhook
 */
async function handleAlertUpdate(record, oldRecord, alertManager) {
  if (!record || !alertManager) return;

  logger.info(`Alert updated: ${record.id} for ${record.symbol}`);

  // Remove old alert from monitoring
  if (oldRecord) {
    alertManager.removeAlert(oldRecord.id);
  }

  // Add updated alert to monitoring if it's enabled
  if (record.enabled) {
    alertManager.addAlert(record);
    logger.info(`Updated alert ${record.id} in monitoring`);
  }
}

/**
 * Handle alert delete webhook
 */
async function handleAlertDelete(oldRecord, alertManager) {
  if (!oldRecord || !alertManager) return;

  logger.info(`Alert deleted: ${oldRecord.id} for ${oldRecord.symbol}`);

  // Remove alert from monitoring
  alertManager.removeAlert(oldRecord.id);
  logger.info(`Removed alert ${oldRecord.id} from monitoring`);
}

module.exports = createAlertsRouter;
