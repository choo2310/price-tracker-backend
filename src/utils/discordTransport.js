const { Transform } = require("stream");
const winston = require("winston");

/**
 * Custom Winston transport for sending log messages to Discord
 */
class DiscordTransport extends winston.Transport {
  constructor(options = {}) {
    super(options);

    this.name = "discord";
    this.discordService = options.discordService;
    this.level = options.level || "error";
    this.silent = options.silent || false;

    if (!this.discordService) {
      throw new Error(
        "DiscordService instance is required for DiscordTransport"
      );
    }
  }

  /**
   * Write log message to Discord
   * @param {Object} info - Log info object
   * @param {Function} callback - Callback function
   */
  log(info, callback) {
    // Don't send if transport is silent
    if (this.silent) {
      callback(null, true);
      return;
    }

    setImmediate(() => {
      this.emit("logged", info);
    });

    // Send log message to Discord (async, don't wait)
    this._sendToDiscord(info)
      .then(() => {
        callback(null, true);
      })
      .catch((error) => {
        // Don't fail the log operation if Discord fails
        console.error("Failed to send log to Discord:", error.message);
        callback(null, true);
      });
  }

  /**
   * Send log message to Discord service
   * @param {Object} info - Log info object
   * @private
   */
  async _sendToDiscord(info) {
    try {
      const { level, message, timestamp, stack, ...metadata } = info;

      // Prepare metadata, excluding sensitive information
      const sanitizedMetadata = this._sanitizeMetadata(metadata);

      // Add stack trace to metadata if present
      if (stack) {
        sanitizedMetadata.stack = stack;
      }

      // Add timestamp to metadata
      if (timestamp) {
        sanitizedMetadata.timestamp = timestamp;
      }

      await this.discordService.sendLogMessage(
        level,
        message,
        sanitizedMetadata
      );
    } catch (error) {
      // Don't throw errors from Discord transport to avoid infinite loops
      console.error("Discord transport error:", error.message);
    }
  }

  /**
   * Sanitize metadata to remove sensitive information
   * @param {Object} metadata - Original metadata
   * @returns {Object} Sanitized metadata
   * @private
   */
  _sanitizeMetadata(metadata) {
    const sensitiveKeys = [
      "password",
      "token",
      "secret",
      "key",
      "authorization",
      "cookie",
      "session",
    ];

    const sanitized = {};

    for (const [key, value] of Object.entries(metadata)) {
      // Skip sensitive keys
      if (
        sensitiveKeys.some((sensitiveKey) =>
          key.toLowerCase().includes(sensitiveKey)
        )
      ) {
        sanitized[key] = "[REDACTED]";
        continue;
      }

      // Handle nested objects
      if (value && typeof value === "object" && !Array.isArray(value)) {
        sanitized[key] = this._sanitizeMetadata(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Close the transport
   * @param {Function} callback - Callback function
   */
  close(callback) {
    if (callback) {
      callback();
    }
  }
}

module.exports = DiscordTransport;
