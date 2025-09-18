const { createClient } = require("@supabase/supabase-js");
const logger = require("../utils/logger");

class SupabaseService {
  constructor() {
    this.supabaseUrl = process.env.SUPABASE_URL;
    this.supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!this.supabaseUrl || !this.supabaseAnonKey) {
      throw new Error(
        "Missing Supabase configuration. Please check SUPABASE_URL and SUPABASE_ANON_KEY environment variables."
      );
    }

    this.supabase = createClient(this.supabaseUrl, this.supabaseAnonKey);
    logger.info("Supabase client initialized");
  }

  /**
   * Get all active alerts
   * @returns {Promise<Array>} Array of active alerts
   */
  async getActiveAlerts() {
    try {
      const { data, error } = await this.supabase
        .from("price_alerts")
        .select("*")
        .eq("enabled", true)
        .order("created_at", { ascending: false });

      if (error) {
        logger.error("Error fetching active alerts:", error);
        throw error;
      }

      return data || [];
    } catch (error) {
      logger.error("Failed to get active alerts:", error);
      throw error;
    }
  }

  /**
   * Get alerts for a specific symbol
   * @param {string} symbol - Asset symbol
   * @returns {Promise<Array>} Array of alerts for the symbol
   */
  async getAlertsBySymbol(symbol) {
    try {
      const { data, error } = await this.supabase
        .from("price_alerts")
        .select("*")
        .eq("symbol", symbol.toUpperCase())
        .eq("enabled", true);

      if (error) {
        logger.error(`Error fetching alerts for symbol ${symbol}:`, error);
        throw error;
      }

      return data || [];
    } catch (error) {
      logger.error(`Failed to get alerts for symbol ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Update alert's last triggered timestamp
   * @param {string} alertId - Alert ID
   * @returns {Promise<void>}
   */
  async updateAlertLastTriggered(alertId) {
    try {
      const { error } = await this.supabase
        .from("price_alerts")
        .update({
          last_triggered_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", alertId);

      if (error) {
        logger.error(`Error updating alert ${alertId} last triggered:`, error);
        throw error;
      }

      logger.info(`Alert ${alertId} last triggered timestamp updated`);
    } catch (error) {
      logger.error(`Failed to update alert ${alertId} last triggered:`, error);
      throw error;
    }
  }

  /**
   * Create a new alert
   * @param {Object} alertData - Alert data
   * @returns {Promise<Object>} Created alert
   */
  async createAlert(alertData) {
    try {
      const { data, error } = await this.supabase
        .from("price_alerts")
        .insert([
          {
            ...alertData,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (error) {
        logger.error("Error creating alert:", error);
        throw error;
      }

      logger.info(`Alert created with ID: ${data.id}`);
      return data;
    } catch (error) {
      logger.error("Failed to create alert:", error);
      throw error;
    }
  }

  /**
   * Update an existing alert
   * @param {string} alertId - Alert ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object>} Updated alert
   */
  async updateAlert(alertId, updateData) {
    try {
      const { data, error } = await this.supabase
        .from("price_alerts")
        .update({
          ...updateData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", alertId)
        .select()
        .single();

      if (error) {
        logger.error(`Error updating alert ${alertId}:`, error);
        throw error;
      }

      logger.info(`Alert ${alertId} updated successfully`);
      return data;
    } catch (error) {
      logger.error(`Failed to update alert ${alertId}:`, error);
      throw error;
    }
  }

  /**
   * Delete an alert
   * @param {string} alertId - Alert ID
   * @returns {Promise<void>}
   */
  async deleteAlert(alertId) {
    try {
      const { error } = await this.supabase
        .from("price_alerts")
        .delete()
        .eq("id", alertId);

      if (error) {
        logger.error(`Error deleting alert ${alertId}:`, error);
        throw error;
      }

      logger.info(`Alert ${alertId} deleted successfully`);
    } catch (error) {
      logger.error(`Failed to delete alert ${alertId}:`, error);
      throw error;
    }
  }

  /**
   * Get alerts for a specific user
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Array of user's alerts
   */
  async getUserAlerts(userId) {
    try {
      const { data, error } = await this.supabase
        .from("price_alerts")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        logger.error(`Error fetching alerts for user ${userId}:`, error);
        throw error;
      }

      return data || [];
    } catch (error) {
      logger.error(`Failed to get alerts for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get unique symbols from all active alerts
   * @returns {Promise<Array<string>>} Array of unique symbols
   */
  async getActiveSymbols() {
    try {
      const { data, error } = await this.supabase
        .from("price_alerts")
        .select("symbol")
        .eq("enabled", true);

      if (error) {
        logger.error("Error fetching active symbols:", error);
        throw error;
      }

      // Extract unique symbols
      const symbols = [
        ...new Set(data.map((alert) => alert.symbol.toUpperCase())),
      ];
      return symbols;
    } catch (error) {
      logger.error("Failed to get active symbols:", error);
      throw error;
    }
  }
}

module.exports = SupabaseService;
