const axios = require("axios");
const logger = require("../utils/logger");

class DiscordService {
  constructor(webhookUrl) {
    this.webhookUrl = webhookUrl;

    if (!this.webhookUrl) {
      throw new Error("Discord webhook URL is required");
    }

    // Rate limiting: Discord allows 30 requests per minute per webhook
    this.rateLimit = {
      requests: 0,
      resetTime: Date.now() + 60000, // Reset every minute
    };
  }

  /**
   * Send alert notification to Discord
   * @param {Object} notification - Alert notification data
   */
  async sendAlert(notification) {
    try {
      await this.checkRateLimit();

      const embed = this.createAlertEmbed(notification);
      const payload = {
        embeds: [embed],
        username: "Price Alert Bot",
        avatar_url:
          "https://cdn.discordapp.com/attachments/placeholder/price-bot-avatar.png",
      };

      await this.sendWebhook(payload);
      logger.info(`Discord alert sent for ${notification.symbol}`);
    } catch (error) {
      logger.error("Failed to send Discord alert:", error);
      throw error;
    }
  }

  /**
   * Create Discord embed for alert notification
   * @param {Object} notification - Notification data
   * @returns {Object} Discord embed object
   */
  createAlertEmbed(notification) {
    const {
      symbol,
      currentPrice,
      targetPrice,
      direction,
      timestamp,
      priceChange,
      volume,
      alertType,
      notes,
      prompt,
    } = notification;

    // Determine color based on direction
    let color;
    switch (direction) {
      case "above":
        color = 0x00ff00; // Green
        break;
      case "below":
        color = 0xff0000; // Red
        break;
      case "either":
        color = 0xffa500; // Orange
        break;
      default:
        color = 0x808080; // Gray
    }

    // Format price change
    let priceChangeText = "";
    if (priceChange) {
      const changeEmoji = priceChange.change >= 0 ? "📈" : "📉";
      priceChangeText = `${changeEmoji} ${priceChange.change >= 0 ? "+" : ""}$${
        priceChange.change
      } (${priceChange.changePercent >= 0 ? "+" : ""}${
        priceChange.changePercent
      }%)`;
    }

    // Create title and description based on direction
    let directionEmoji, title, description;

    switch (direction) {
      case "above":
        directionEmoji = "⬆️";
        title = `${directionEmoji} Price Alert: ${symbol}`;
        description = `**${symbol}** has risen above your target price!`;
        break;
      case "below":
        directionEmoji = "⬇️";
        title = `${directionEmoji} Price Alert: ${symbol}`;
        description = `**${symbol}** has fallen below your target price!`;
        break;
      case "either":
        directionEmoji = "🔄";
        title = `${directionEmoji} Price Alert: ${symbol}`;
        const crossedDirection =
          currentPrice >= targetPrice ? "above" : "below";
        description = `**${symbol}** has crossed your target price (now ${crossedDirection} target)!`;
        break;
      default:
        directionEmoji = "🔔";
        title = `${directionEmoji} Price Alert: ${symbol}`;
        description = `**${symbol}** price alert triggered!`;
    }

    // Create fields
    const fields = [
      {
        name: "💰 Current Price",
        value: `$${currentPrice.toFixed(2)}`,
        inline: true,
      },
      {
        name: "🎯 Target Price",
        value: `$${targetPrice.toFixed(2)}`,
        inline: true,
      },
      {
        name: "📊 Direction",
        value: direction.charAt(0).toUpperCase() + direction.slice(1),
        inline: true,
      },
    ];

    // Add price change if available
    if (priceChangeText) {
      fields.push({
        name: "📈 Price Change",
        value: priceChangeText,
        inline: false,
      });
    }

    // Add volume if available
    if (volume) {
      fields.push({
        name: "📦 Volume",
        value: volume.toLocaleString(),
        inline: true,
      });
    }

    // Add alert type if specified
    if (alertType) {
      fields.push({
        name: "🔔 Alert Type",
        value: alertType,
        inline: true,
      });
    }

    // Add timestamp
    fields.push({
      name: "⏰ Time",
      value: `<t:${Math.floor(timestamp.getTime() / 1000)}:F>`,
      inline: false,
    });

    // Add notes if provided
    if (notes) {
      fields.push({
        name: "📝 Notes",
        value: notes.length > 1000 ? notes.substring(0, 1000) + "..." : notes,
        inline: false,
      });
    }

    // Add AI prompt if provided
    if (prompt) {
      fields.push({
        name: "🤖 AI Context",
        value: prompt.length > 500 ? prompt.substring(0, 500) + "..." : prompt,
        inline: false,
      });
    }

    return {
      title,
      description,
      color,
      fields,
      timestamp: timestamp.toISOString(),
      footer: {
        text: "Price Tracker Bot",
        icon_url:
          "https://cdn.discordapp.com/attachments/placeholder/footer-icon.png",
      },
      thumbnail: {
        url: this.getSymbolIcon(symbol),
      },
    };
  }

  /**
   * Get icon URL for a symbol (placeholder implementation)
   * @param {string} symbol - Asset symbol
   * @returns {string} Icon URL
   */
  getSymbolIcon(symbol) {
    // This is a placeholder - you could integrate with cryptocurrency icon APIs
    const iconMap = {
      BTC: "https://cryptoicons.org/api/icon/btc/64",
      ETH: "https://cryptoicons.org/api/icon/eth/64",
      ADA: "https://cryptoicons.org/api/icon/ada/64",
      SOL: "https://cryptoicons.org/api/icon/sol/64",
      AAPL: "https://logo.clearbit.com/apple.com",
      GOOGL: "https://logo.clearbit.com/google.com",
      MSFT: "https://logo.clearbit.com/microsoft.com",
      TSLA: "https://logo.clearbit.com/tesla.com",
    };

    return (
      iconMap[symbol] ||
      "https://via.placeholder.com/64x64/007acc/ffffff?text=" + symbol
    );
  }

  /**
   * Send a test notification
   * @param {string} symbol - Test symbol
   * @returns {Promise<void>}
   */
  async sendTestAlert(symbol = "BTC") {
    try {
      const testNotification = {
        symbol,
        currentPrice: 45000.0,
        targetPrice: 44000.0,
        direction: "above",
        timestamp: new Date(),
        priceChange: {
          change: 1000.0,
          changePercent: 2.27,
          previousPrice: 44000.0,
        },
        volume: 1234567,
        alertType: "test",
        notes: "This is a test alert to verify Discord integration",
        prompt: "Test alert for system verification",
      };

      await this.sendAlert(testNotification);
      logger.info("Test Discord alert sent successfully");
    } catch (error) {
      logger.error("Failed to send test Discord alert:", error);
      throw error;
    }
  }

  /**
   * Send system status notification
   * @param {Object} status - System status data
   */
  async sendStatusNotification(status) {
    try {
      await this.checkRateLimit();

      const embed = {
        title: "🤖 Price Tracker Status",
        description: "System status update",
        color: status.isRunning ? 0x00ff00 : 0xff0000,
        fields: [
          {
            name: "🔄 Status",
            value: status.isRunning ? "✅ Running" : "❌ Stopped",
            inline: true,
          },
          {
            name: "📊 Active Symbols",
            value: status.activeSymbols.length.toString(),
            inline: true,
          },
          {
            name: "🔔 Total Alerts",
            value: status.totalAlerts.toString(),
            inline: true,
          },
          {
            name: "🌐 Finnhub Connection",
            value: status.finnhubConnectionStatus
              ? "✅ Connected"
              : "❌ Disconnected",
            inline: true,
          },
        ],
        timestamp: new Date().toISOString(),
        footer: {
          text: "Price Tracker Bot Status",
        },
      };

      const payload = {
        embeds: [embed],
        username: "Price Alert Bot",
        avatar_url:
          "https://cdn.discordapp.com/attachments/placeholder/price-bot-avatar.png",
      };

      await this.sendWebhook(payload);
      logger.info("Discord status notification sent");
    } catch (error) {
      logger.error("Failed to send Discord status notification:", error);
      throw error;
    }
  }

  /**
   * Send error notification
   * @param {Error} error - Error to report
   * @param {string} context - Error context
   */
  async sendErrorNotification(error, context = "Unknown") {
    try {
      await this.checkRateLimit();

      const embed = {
        title: "🚨 System Error",
        description: `An error occurred in the price tracking system`,
        color: 0xff0000,
        fields: [
          {
            name: "📍 Context",
            value: context,
            inline: false,
          },
          {
            name: "❌ Error Message",
            value:
              error.message.length > 1000
                ? error.message.substring(0, 1000) + "..."
                : error.message,
            inline: false,
          },
          {
            name: "⏰ Time",
            value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
            inline: true,
          },
        ],
        timestamp: new Date().toISOString(),
        footer: {
          text: "Price Tracker Bot Error Reporter",
        },
      };

      const payload = {
        embeds: [embed],
        username: "Price Alert Bot",
        avatar_url:
          "https://cdn.discordapp.com/attachments/placeholder/price-bot-avatar.png",
      };

      await this.sendWebhook(payload);
      logger.info("Discord error notification sent");
    } catch (notificationError) {
      logger.error(
        "Failed to send Discord error notification:",
        notificationError
      );
      // Don't throw here to avoid recursive error notifications
    }
  }

  /**
   * Send webhook request to Discord
   * @param {Object} payload - Webhook payload
   */
  async sendWebhook(payload) {
    try {
      const response = await axios.post(this.webhookUrl, payload, {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 10000, // 10 second timeout
      });

      this.updateRateLimit();

      if (response.status !== 204) {
        throw new Error(`Discord webhook returned status ${response.status}`);
      }
    } catch (error) {
      if (error.response) {
        logger.error(
          `Discord webhook error: ${error.response.status} - ${error.response.data}`
        );
      } else if (error.request) {
        logger.error("Discord webhook request failed - no response received");
      } else {
        logger.error(`Discord webhook error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Check rate limit before sending
   */
  async checkRateLimit() {
    const now = Date.now();

    // Reset rate limit counter if a minute has passed
    if (now >= this.rateLimit.resetTime) {
      this.rateLimit.requests = 0;
      this.rateLimit.resetTime = now + 60000;
    }

    // Check if we're at the rate limit
    if (this.rateLimit.requests >= 30) {
      const waitTime = this.rateLimit.resetTime - now;
      logger.warn(
        `Rate limit reached. Waiting ${waitTime}ms before sending Discord message`
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));

      // Reset after waiting
      this.rateLimit.requests = 0;
      this.rateLimit.resetTime = Date.now() + 60000;
    }
  }

  /**
   * Update rate limit counter
   */
  updateRateLimit() {
    this.rateLimit.requests++;
  }

  /**
   * Test webhook connectivity
   * @returns {Promise<boolean>} Whether webhook is accessible
   */
  async testWebhook() {
    try {
      const testPayload = {
        content: "🧪 Discord webhook test - connection successful!",
        username: "Price Alert Bot Test",
        embeds: [
          {
            title: "✅ Webhook Test",
            description:
              "This is a test message to verify Discord webhook connectivity.",
            color: 0x00ff00,
            timestamp: new Date().toISOString(),
          },
        ],
      };

      await this.sendWebhook(testPayload);
      return true;
    } catch (error) {
      logger.error("Discord webhook test failed:", error);
      return false;
    }
  }
}

module.exports = DiscordService;
