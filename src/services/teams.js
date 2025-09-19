const axios = require("axios");

class TeamsService {
  constructor(webhookUrl) {
    this.webhookUrl = webhookUrl;

    if (!this.webhookUrl) {
      throw new Error("Teams webhook URL is required");
    }

    // Rate limiting: Teams webhook allows 4 requests per second
    // We'll be more conservative with 2 requests per second
    this.rateLimit = {
      requests: 0,
      resetTime: Date.now() + 1000, // Reset every second
      maxRequests: 2,
    };
  }

  /**
   * Send alert notification to Microsoft Teams
   * @param {Object} notification - Alert notification data
   */
  async sendAlert(notification) {
    try {
      await this.checkRateLimit();

      const adaptiveCard = this.createAlertCard(notification);
      const payload = {
        type: "message",
        attachments: [
          {
            contentType: "application/vnd.microsoft.card.adaptive",
            content: adaptiveCard,
          },
        ],
      };

      await this.sendWebhook(payload);
      console.log(`Teams alert sent for ${notification.symbol}`);
    } catch (error) {
      console.error("Failed to send Teams alert:", error);
      throw error;
    }
  }

  /**
   * Create Microsoft Teams Adaptive Card for alert notification
   * @param {Object} notification - Notification data
   * @returns {Object} Adaptive Card object
   */
  createAlertCard(notification) {
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

    // Determine color and icon based on direction
    let color, icon, directionText;
    switch (direction) {
      case "above":
        color = "good"; // Green
        icon = "📈";
        directionText = "Above Target";
        break;
      case "below":
        color = "attention"; // Orange/Yellow
        icon = "📉";
        directionText = "Below Target";
        break;
      case "either":
        color = "accent"; // Blue
        icon = "🔄";
        const crossedDirection =
          currentPrice >= targetPrice ? "above" : "below";
        directionText = `Crossed Target (${crossedDirection})`;
        break;
      default:
        color = "default";
        icon = "🔔";
        directionText = "Alert Triggered";
    }

    // Create title based on direction
    const title = `${icon} Price Alert: ${symbol}`;
    const subtitle = directionText;

    // Build the adaptive card
    const card = {
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      type: "AdaptiveCard",
      version: "1.4",
      body: [
        {
          type: "Container",
          style: color,
          items: [
            {
              type: "TextBlock",
              text: title,
              weight: "Bolder",
              size: "Large",
              wrap: true,
            },
            {
              type: "TextBlock",
              text: subtitle,
              weight: "Lighter",
              size: "Medium",
              spacing: "None",
              wrap: true,
            },
          ],
        },
        {
          type: "FactSet",
          facts: [
            {
              title: "💰 Current Price:",
              value: `$${currentPrice.toFixed(2)}`,
            },
            {
              title: "🎯 Target Price:",
              value: `$${targetPrice.toFixed(2)}`,
            },
            {
              title: "📊 Direction:",
              value: direction.charAt(0).toUpperCase() + direction.slice(1),
            },
          ],
        },
      ],
    };

    // Add price change if available
    if (priceChange) {
      const changeEmoji = priceChange.change >= 0 ? "📈" : "📉";
      const changeText = `${changeEmoji} ${
        priceChange.change >= 0 ? "+" : ""
      }$${priceChange.change} (${priceChange.changePercent >= 0 ? "+" : ""}${
        priceChange.changePercent
      }%)`;

      card.body[1].facts.push({
        title: "📈 Price Change:",
        value: changeText,
      });
    }

    // Add volume if available
    if (volume) {
      card.body[1].facts.push({
        title: "📦 Volume:",
        value: volume.toLocaleString(),
      });
    }

    // Add alert type if specified
    if (alertType) {
      card.body[1].facts.push({
        title: "🔔 Alert Type:",
        value: alertType,
      });
    }

    // Add timestamp
    const formattedTime = new Date(timestamp).toLocaleString();
    card.body[1].facts.push({
      title: "⏰ Time:",
      value: formattedTime,
    });

    // Add notes if provided
    if (notes && notes.trim()) {
      card.body.push({
        type: "TextBlock",
        text: "📝 **Notes:**",
        weight: "Bolder",
        size: "Medium",
        spacing: "Medium",
      });
      card.body.push({
        type: "TextBlock",
        text: notes.length > 500 ? notes.substring(0, 500) + "..." : notes,
        wrap: true,
        spacing: "Small",
      });
    }

    // Add AI prompt if provided
    if (prompt && prompt.trim()) {
      card.body.push({
        type: "TextBlock",
        text: "🤖 **AI Context:**",
        weight: "Bolder",
        size: "Medium",
        spacing: "Medium",
      });
      card.body.push({
        type: "TextBlock",
        text: prompt.length > 300 ? prompt.substring(0, 300) + "..." : prompt,
        wrap: true,
        spacing: "Small",
        isSubtle: true,
      });
    }

    // Add footer
    card.body.push({
      type: "Container",
      spacing: "Medium",
      separator: true,
      items: [
        {
          type: "TextBlock",
          text: "Price Tracker Bot",
          size: "Small",
          weight: "Lighter",
          horizontalAlignment: "Center",
        },
      ],
    });

    return card;
  }

  /**
   * Send webhook to Teams
   * @param {Object} payload - Teams webhook payload
   */
  async sendWebhook(payload) {
    try {
      const response = await axios.post(this.webhookUrl, payload, {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 10000,
      });

      // Teams webhook returns 200 on success
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      this.updateRateLimit();
    } catch (error) {
      if (error.response) {
        console.error(
          `Teams webhook error: ${error.response.status} - ${error.response.statusText}`
        );
        if (error.response.data) {
          console.error("Teams webhook response:", error.response.data);
        }
      } else if (error.request) {
        console.error("Teams webhook request failed - no response received");
      } else {
        console.error(`Teams webhook error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Send test notification to Teams
   * @param {Object} testData - Optional test data
   */
  async sendTestAlert(testData = {}) {
    try {
      const notification = {
        symbol: testData.symbol || "AAPL",
        currentPrice: testData.currentPrice || 175.25,
        targetPrice: testData.targetPrice || 175.0,
        direction: testData.direction || "above",
        timestamp: new Date(),
        priceChange: testData.priceChange || {
          change: 2.45,
          changePercent: 1.42,
        },
        volume: testData.volume || 1234567,
        alertType: "Test Alert",
        notes: "This is a test notification from the Price Tracker Bot",
        ...testData,
      };

      await this.sendAlert(notification);
      console.log("Test Teams alert sent successfully");
      return true;
    } catch (error) {
      console.error("Failed to send test Teams alert:", error);
      return false;
    }
  }

  /**
   * Send status notification to Teams
   * @param {Object} status - Status information
   */
  async sendStatusNotification(status) {
    try {
      await this.checkRateLimit();

      const card = this.createStatusCard(status);
      const payload = {
        type: "message",
        attachments: [
          {
            contentType: "application/vnd.microsoft.card.adaptive",
            content: card,
          },
        ],
      };

      await this.sendWebhook(payload);
      console.log("Teams status notification sent");
    } catch (error) {
      console.error("Failed to send Teams status notification:", error);
      // Don't throw here to avoid recursive error notifications
    }
  }

  /**
   * Create status card for Teams
   * @param {Object} status - Status information
   * @returns {Object} Adaptive Card object
   */
  createStatusCard(status) {
    const { type, message, details, timestamp } = status;

    let color, icon;
    switch (type) {
      case "startup":
        color = "good";
        icon = "🚀";
        break;
      case "error":
        color = "attention";
        icon = "🚨";
        break;
      case "warning":
        color = "warning";
        icon = "⚠️";
        break;
      default:
        color = "accent";
        icon = "ℹ️";
    }

    const card = {
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      type: "AdaptiveCard",
      version: "1.4",
      body: [
        {
          type: "Container",
          style: color,
          items: [
            {
              type: "TextBlock",
              text: `${icon} ${
                type.charAt(0).toUpperCase() + type.slice(1)
              } Notification`,
              weight: "Bolder",
              size: "Medium",
              wrap: true,
            },
          ],
        },
        {
          type: "TextBlock",
          text: message,
          wrap: true,
          spacing: "Medium",
        },
      ],
    };

    // Add details if provided
    if (details && Object.keys(details).length > 0) {
      const facts = Object.entries(details).map(([key, value]) => ({
        title: `${key}:`,
        value:
          typeof value === "object" ? JSON.stringify(value) : String(value),
      }));

      card.body.push({
        type: "FactSet",
        facts: facts,
        spacing: "Medium",
      });
    }

    // Add timestamp
    if (timestamp) {
      card.body.push({
        type: "TextBlock",
        text: `⏰ ${new Date(timestamp).toLocaleString()}`,
        size: "Small",
        isSubtle: true,
        spacing: "Medium",
      });
    }

    return card;
  }

  /**
   * Check rate limit before sending
   */
  async checkRateLimit() {
    const now = Date.now();

    // Reset rate limit counter if a second has passed
    if (now >= this.rateLimit.resetTime) {
      this.rateLimit.requests = 0;
      this.rateLimit.resetTime = now + 1000;
    }

    // Check if we're at the rate limit
    if (this.rateLimit.requests >= this.rateLimit.maxRequests) {
      const waitTime = this.rateLimit.resetTime - now;
      console.warn(
        `Teams rate limit reached. Waiting ${waitTime}ms before sending message`
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));

      // Reset after waiting
      this.rateLimit.requests = 0;
      this.rateLimit.resetTime = Date.now() + 1000;
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
      const testCard = {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        type: "AdaptiveCard",
        version: "1.4",
        body: [
          {
            type: "Container",
            style: "good",
            items: [
              {
                type: "TextBlock",
                text: "🧪 Teams Webhook Test",
                weight: "Bolder",
                size: "Medium",
              },
            ],
          },
          {
            type: "TextBlock",
            text: "This is a test message to verify Teams webhook connectivity.",
            wrap: true,
            spacing: "Medium",
          },
          {
            type: "TextBlock",
            text: `⏰ ${new Date().toLocaleString()}`,
            size: "Small",
            isSubtle: true,
            spacing: "Medium",
          },
        ],
      };

      const testPayload = {
        type: "message",
        attachments: [
          {
            contentType: "application/vnd.microsoft.card.adaptive",
            content: testCard,
          },
        ],
      };

      await this.sendWebhook(testPayload);
      return true;
    } catch (error) {
      console.error("Teams webhook test failed:", error);
      return false;
    }
  }
}

module.exports = TeamsService;
