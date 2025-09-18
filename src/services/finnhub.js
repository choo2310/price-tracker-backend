const WebSocket = require("ws");
const logger = require("../utils/logger");

class FinnhubWebSocketService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 5000; // 5 seconds
    this.subscribedSymbols = new Set();
    this.isConnected = false;
    this.priceCallbacks = new Map(); // symbol -> callback function

    if (!this.apiKey) {
      throw new Error("Finnhub API key is required");
    }
  }

  /**
   * Connect to Finnhub WebSocket
   * @returns {Promise<void>}
   */
  connect() {
    return new Promise((resolve, reject) => {
      try {
        const wsUrl = `wss://ws.finnhub.io?token=${this.apiKey}`;
        this.ws = new WebSocket(wsUrl);

        this.ws.on("open", () => {
          logger.info("Connected to Finnhub WebSocket");
          this.isConnected = true;
          this.reconnectAttempts = 0;

          // Resubscribe to symbols if reconnecting
          if (this.subscribedSymbols.size > 0) {
            logger.info(
              `Resubscribing to ${this.subscribedSymbols.size} symbols`
            );
            for (const symbol of this.subscribedSymbols) {
              this.subscribeToSymbol(symbol);
            }
          }

          resolve();
        });

        this.ws.on("message", (data) => {
          try {
            const message = JSON.parse(data);
            this.handleMessage(message);
          } catch (error) {
            logger.error("Error parsing WebSocket message:", error);
          }
        });

        this.ws.on("error", (error) => {
          logger.error("Finnhub WebSocket error:", error);
          this.isConnected = false;
          if (this.reconnectAttempts === 0) {
            reject(error);
          }
        });

        this.ws.on("close", (code, reason) => {
          logger.warn(`Finnhub WebSocket closed: ${code} - ${reason}`);
          this.isConnected = false;
          this.scheduleReconnect();
        });
      } catch (error) {
        logger.error("Failed to create WebSocket connection:", error);
        reject(error);
      }
    });
  }

  /**
   * Handle incoming WebSocket messages
   * @param {Object} message - WebSocket message
   */
  handleMessage(message) {
    if (
      message.type === "trade" &&
      message.data &&
      Array.isArray(message.data)
    ) {
      for (const trade of message.data) {
        const { s: symbol, p: price, t: timestamp, v: volume } = trade;

        if (symbol && price !== undefined) {
          logger.debug(
            `Price update: ${symbol} = $${price} (volume: ${volume})`
          );

          // Call registered callbacks for this symbol
          const callback = this.priceCallbacks.get(symbol);
          if (callback) {
            try {
              callback(symbol, price, timestamp, volume);
            } catch (error) {
              logger.error(`Error in price callback for ${symbol}:`, error);
            }
          }
        }
      }
    } else if (message.type === "ping") {
      // Respond to ping with pong
      this.send({ type: "pong" });
    }
  }

  /**
   * Subscribe to a symbol for real-time price updates
   * @param {string} symbol - Symbol to subscribe to
   */
  subscribeToSymbol(symbol) {
    if (!this.isConnected) {
      logger.warn(`Cannot subscribe to ${symbol}: WebSocket not connected`);
      return;
    }

    const formattedSymbol = symbol.toUpperCase();

    if (this.subscribedSymbols.has(formattedSymbol)) {
      logger.debug(`Already subscribed to ${formattedSymbol}`);
      return;
    }

    const subscribeMessage = {
      type: "subscribe",
      symbol: formattedSymbol,
    };

    this.send(subscribeMessage);
    this.subscribedSymbols.add(formattedSymbol);
    logger.info(`Subscribed to ${formattedSymbol}`);
  }

  /**
   * Unsubscribe from a symbol
   * @param {string} symbol - Symbol to unsubscribe from
   */
  unsubscribeFromSymbol(symbol) {
    if (!this.isConnected) {
      logger.warn(`Cannot unsubscribe from ${symbol}: WebSocket not connected`);
      return;
    }

    const formattedSymbol = symbol.toUpperCase();

    if (!this.subscribedSymbols.has(formattedSymbol)) {
      logger.debug(`Not subscribed to ${formattedSymbol}`);
      return;
    }

    const unsubscribeMessage = {
      type: "unsubscribe",
      symbol: formattedSymbol,
    };

    this.send(unsubscribeMessage);
    this.subscribedSymbols.delete(formattedSymbol);
    this.priceCallbacks.delete(formattedSymbol);
    logger.info(`Unsubscribed from ${formattedSymbol}`);
  }

  /**
   * Register a callback for price updates on a symbol
   * @param {string} symbol - Symbol to monitor
   * @param {Function} callback - Callback function (symbol, price, timestamp, volume) => void
   */
  onPriceUpdate(symbol, callback) {
    const formattedSymbol = symbol.toUpperCase();
    this.priceCallbacks.set(formattedSymbol, callback);

    // Subscribe to the symbol if not already subscribed
    if (!this.subscribedSymbols.has(formattedSymbol)) {
      this.subscribeToSymbol(formattedSymbol);
    }
  }

  /**
   * Remove price update callback for a symbol
   * @param {string} symbol - Symbol to stop monitoring
   */
  removeCallback(symbol) {
    const formattedSymbol = symbol.toUpperCase();
    this.priceCallbacks.delete(formattedSymbol);

    // Unsubscribe if no callback exists
    this.unsubscribeFromSymbol(formattedSymbol);
  }

  /**
   * Send a message through the WebSocket
   * @param {Object} message - Message to send
   */
  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      logger.warn("Cannot send message: WebSocket not open");
    }
  }

  /**
   * Schedule a reconnection attempt
   */
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error("Max reconnection attempts reached. Giving up.");
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts; // Exponential backoff

    logger.info(
      `Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
    );

    setTimeout(() => {
      this.connect().catch((error) => {
        logger.error("Reconnection attempt failed:", error);
      });
    }, delay);
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect() {
    if (this.ws) {
      logger.info("Disconnecting from Finnhub WebSocket");
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
      this.subscribedSymbols.clear();
      this.priceCallbacks.clear();
    }
  }

  /**
   * Get connection status
   * @returns {boolean} Connection status
   */
  getConnectionStatus() {
    return this.isConnected;
  }

  /**
   * Get list of subscribed symbols
   * @returns {Array<string>} Array of subscribed symbols
   */
  getSubscribedSymbols() {
    return Array.from(this.subscribedSymbols);
  }
}

module.exports = FinnhubWebSocketService;
