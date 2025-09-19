const logger = require("../utils/logger");

class AlertManager {
  constructor(
    supabaseService,
    finnhubService,
    discordService,
    teamsService = null
  ) {
    this.supabaseService = supabaseService;
    this.finnhubService = finnhubService;
    this.discordService = discordService;
    this.teamsService = teamsService;
    this.activeAlerts = new Map(); // symbol -> array of alerts
    this.priceCache = new Map(); // symbol -> latest price
    this.isRunning = false;

    // Bind methods to preserve 'this' context
    this.handlePriceUpdate = this.handlePriceUpdate.bind(this);
  }

  /**
   * Start the alert monitoring system
   */
  async start() {
    try {
      logger.info("Starting Alert Manager...");

      // Load active alerts from database
      await this.loadActiveAlerts();

      // Subscribe to price updates for all symbols with active alerts
      await this.subscribeToActiveSymbols();

      // Set up periodic refresh of alerts
      this.setupPeriodicRefresh();

      this.isRunning = true;
      logger.info("Alert Manager started successfully");
    } catch (error) {
      logger.error("Failed to start Alert Manager:", error);
      throw error;
    }
  }

  /**
   * Stop the alert monitoring system
   */
  async stop() {
    try {
      logger.info("Stopping Alert Manager...");

      // Clear intervals
      if (this.refreshInterval) {
        clearInterval(this.refreshInterval);
      }

      // Unsubscribe from all symbols
      for (const symbol of this.activeAlerts.keys()) {
        this.finnhubService.removeCallback(symbol);
      }

      this.activeAlerts.clear();
      this.priceCache.clear();
      this.isRunning = false;

      logger.info("Alert Manager stopped");
    } catch (error) {
      logger.error("Error stopping Alert Manager:", error);
      throw error;
    }
  }

  /**
   * Load active alerts from database
   */
  async loadActiveAlerts() {
    try {
      const alerts = await this.supabaseService.getActiveAlerts();

      // Clear existing alerts
      this.activeAlerts.clear();

      // Group alerts by symbol
      for (const alert of alerts) {
        const symbol = alert.symbol.toUpperCase();

        if (!this.activeAlerts.has(symbol)) {
          this.activeAlerts.set(symbol, []);
        }

        this.activeAlerts.get(symbol).push(alert);
      }

      logger.info(
        `Loaded ${alerts.length} active alerts for ${this.activeAlerts.size} symbols`
      );
    } catch (error) {
      logger.error("Failed to load active alerts:", error);
      throw error;
    }
  }

  /**
   * Subscribe to price updates for all symbols with active alerts
   */
  async subscribeToActiveSymbols() {
    try {
      for (const symbol of this.activeAlerts.keys()) {
        this.finnhubService.onPriceUpdate(symbol, this.handlePriceUpdate);
        logger.debug(`Subscribed to price updates for ${symbol}`);
      }

      logger.info(`Subscribed to ${this.activeAlerts.size} symbols`);
    } catch (error) {
      logger.error("Failed to subscribe to symbols:", error);
      throw error;
    }
  }

  /**
   * Handle incoming price updates from Finnhub
   * @param {string} symbol - Symbol that was updated
   * @param {number} price - New price
   * @param {number} timestamp - Price timestamp
   * @param {number} volume - Trade volume
   */
  async handlePriceUpdate(symbol, price, timestamp, volume) {
    try {
      // Get previous price for comparison
      const previousData = this.priceCache.get(symbol);
      const previousPrice = previousData?.price;

      // Update price cache with previous price for "either" direction alerts
      this.priceCache.set(symbol, {
        price,
        previousPrice,
        timestamp,
        volume,
        updatedAt: new Date(),
      });

      // Check alerts for this symbol
      const symbolAlerts = this.activeAlerts.get(symbol);
      if (!symbolAlerts || symbolAlerts.length === 0) {
        return;
      }

      for (const alert of symbolAlerts) {
        await this.checkAlert(alert, price, timestamp);
      }
    } catch (error) {
      logger.error(`Error handling price update for ${symbol}:`, error);
    }
  }

  /**
   * Check if an alert should be triggered
   * @param {Object} alert - Alert to check
   * @param {number} currentPrice - Current price
   * @param {number} timestamp - Price timestamp
   */
  async checkAlert(alert, currentPrice, timestamp) {
    try {
      const { id, symbol, target_value, direction, last_triggered_at } = alert;

      // Check if alert conditions are met
      const shouldTrigger = this.shouldTriggerAlert(alert, currentPrice);

      if (!shouldTrigger) {
        return;
      }

      // Check cooldown period (prevent spam)
      if (last_triggered_at) {
        const lastTriggered = new Date(last_triggered_at);
        const cooldownPeriod = 5 * 60 * 1000; // 5 minutes
        const timeSinceLastTrigger = Date.now() - lastTriggered.getTime();

        if (timeSinceLastTrigger < cooldownPeriod) {
          logger.debug(`Alert ${id} is in cooldown period`);
          return;
        }
      }

      logger.info(
        `Alert triggered: ${symbol} ${direction} $${target_value} (current: $${currentPrice})`
      );

      // Send notification
      await this.sendAlertNotification(alert, currentPrice, timestamp);

      // Update last triggered timestamp
      await this.supabaseService.updateAlertLastTriggered(id);

      // Update local cache
      alert.last_triggered_at = new Date().toISOString();
    } catch (error) {
      logger.error(`Error checking alert ${alert.id}:`, error);
    }
  }

  /**
   * Determine if an alert should trigger based on current price
   * @param {Object} alert - Alert configuration
   * @param {number} currentPrice - Current price
   * @returns {boolean} Whether alert should trigger
   */
  shouldTriggerAlert(alert, currentPrice) {
    const { target_value, direction } = alert;

    switch (direction) {
      case "above":
        return currentPrice >= target_value;
      case "below":
        return currentPrice <= target_value;
      case "either":
        // For "either" direction, we need to track if we've crossed the target
        // This requires checking if we've moved from one side to the other
        return this.checkEitherDirection(alert, currentPrice);
      default:
        logger.warn(`Unknown alert direction: ${direction}`);
        return false;
    }
  }

  /**
   * Check if an "either" direction alert should trigger
   * @param {Object} alert - Alert configuration
   * @param {number} currentPrice - Current price
   * @returns {boolean} Whether alert should trigger
   */
  checkEitherDirection(alert, currentPrice) {
    const { target_value, symbol, id } = alert;
    const cached = this.priceCache.get(symbol);

    // If no previous price data, don't trigger yet
    if (!cached || cached.previousPrice === undefined) {
      return false;
    }

    const previousPrice = cached.previousPrice;

    // Check if we've crossed the target value in either direction
    const previousAboveTarget = previousPrice >= target_value;
    const currentAboveTarget = currentPrice >= target_value;

    // Alert triggers when we cross the target value from either side
    const hasCrossed = previousAboveTarget !== currentAboveTarget;

    if (hasCrossed) {
      logger.debug(
        `Either direction alert ${id}: crossed target ${target_value} (${previousPrice} -> ${currentPrice})`
      );
    }

    return hasCrossed;
  }

  /**
   * Send alert notification via Discord and Teams
   * @param {Object} alert - Alert that was triggered
   * @param {number} currentPrice - Current price
   * @param {number} timestamp - Price timestamp
   */
  async sendAlertNotification(alert, currentPrice, timestamp) {
    try {
      const {
        symbol,
        target_value,
        direction,
        alert_type,
        notes,
        prompt,
        user_id,
      } = alert;

      const priceData = this.priceCache.get(symbol);
      const priceChange = this.calculatePriceChange(symbol, currentPrice);

      const notification = {
        alert,
        currentPrice,
        targetPrice: target_value,
        direction,
        symbol,
        timestamp: new Date(timestamp),
        priceChange,
        volume: priceData?.volume,
        alertType: alert_type,
        notes,
        prompt,
        userId: user_id,
      };

      // Send notifications to all configured services
      const notificationPromises = [];

      // Always send to Discord (required service)
      notificationPromises.push(
        this.discordService.sendAlert(notification).catch((error) => {
          logger.error(`Failed to send Discord alert for ${symbol}:`, error);
        })
      );

      // Send to Teams if service is available
      if (this.teamsService) {
        notificationPromises.push(
          this.teamsService.sendAlert(notification).catch((error) => {
            logger.error(`Failed to send Teams alert for ${symbol}:`, error);
          })
        );
      }

      // Wait for all notifications to complete
      await Promise.allSettled(notificationPromises);

      logger.info(`Alert notification sent for ${symbol}`, {
        services: {
          discord: true,
          teams: !!this.teamsService,
        },
      });
    } catch (error) {
      logger.error(`Failed to send alert notification:`, error);
    }
  }

  /**
   * Calculate price change percentage
   * @param {string} symbol - Symbol
   * @param {number} currentPrice - Current price
   * @returns {Object|null} Price change data
   */
  calculatePriceChange(symbol, currentPrice) {
    // This is a simple implementation - in production you might want to
    // track historical prices or use a more sophisticated method
    const cached = this.priceCache.get(symbol);
    if (!cached || !cached.previousPrice) {
      return null;
    }

    const previousPrice = cached.previousPrice;
    const change = currentPrice - previousPrice;
    const changePercent = (change / previousPrice) * 100;

    return {
      change: parseFloat(change.toFixed(2)),
      changePercent: parseFloat(changePercent.toFixed(2)),
      previousPrice,
    };
  }

  /**
   * Add a new alert to monitoring
   * @param {Object} alert - New alert to monitor
   */
  addAlert(alert) {
    try {
      const symbol = alert.symbol.toUpperCase();

      if (!this.activeAlerts.has(symbol)) {
        this.activeAlerts.set(symbol, []);
        // Subscribe to price updates for this new symbol
        this.finnhubService.onPriceUpdate(symbol, this.handlePriceUpdate);
        logger.info(`Started monitoring new symbol: ${symbol}`);
      }

      this.activeAlerts.get(symbol).push(alert);
      logger.info(`Added alert ${alert.id} for ${symbol}`);
    } catch (error) {
      logger.error(`Error adding alert ${alert.id}:`, error);
    }
  }

  /**
   * Remove an alert from monitoring
   * @param {string} alertId - Alert ID to remove
   */
  removeAlert(alertId) {
    try {
      for (const [symbol, alerts] of this.activeAlerts.entries()) {
        const alertIndex = alerts.findIndex((alert) => alert.id === alertId);

        if (alertIndex !== -1) {
          alerts.splice(alertIndex, 1);
          logger.info(`Removed alert ${alertId} for ${symbol}`);

          // If no more alerts for this symbol, unsubscribe
          if (alerts.length === 0) {
            this.activeAlerts.delete(symbol);
            this.finnhubService.removeCallback(symbol);
            this.priceCache.delete(symbol);
            logger.info(`Stopped monitoring symbol: ${symbol}`);
          }

          return;
        }
      }

      logger.warn(`Alert ${alertId} not found for removal`);
    } catch (error) {
      logger.error(`Error removing alert ${alertId}:`, error);
    }
  }

  /**
   * Setup periodic refresh of alerts from database
   */
  setupPeriodicRefresh() {
    // Refresh alerts every 5 minutes
    this.refreshInterval = setInterval(async () => {
      try {
        logger.debug("Refreshing alerts from database...");
        await this.loadActiveAlerts();
        await this.subscribeToActiveSymbols();
      } catch (error) {
        logger.error("Error during periodic refresh:", error);
      }
    }, 5 * 60 * 1000); // 5 minutes
  }

  /**
   * Get current status and statistics
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      activeSymbols: Array.from(this.activeAlerts.keys()),
      totalAlerts: Array.from(this.activeAlerts.values()).reduce(
        (sum, alerts) => sum + alerts.length,
        0
      ),
      priceCache: Object.fromEntries(
        Array.from(this.priceCache.entries()).map(([symbol, data]) => [
          symbol,
          {
            price: data.price,
            updatedAt: data.updatedAt,
            volume: data.volume,
          },
        ])
      ),
      finnhubConnectionStatus: this.finnhubService.getConnectionStatus(),
    };
  }

  /**
   * Force refresh alerts from database
   */
  async refreshAlerts() {
    try {
      logger.info("Manually refreshing alerts...");
      await this.loadActiveAlerts();
      await this.subscribeToActiveSymbols();
      logger.info("Alert refresh completed");
    } catch (error) {
      logger.error("Error during manual refresh:", error);
      throw error;
    }
  }
}

module.exports = AlertManager;
