/**
 * @typedef {Object} Alert
 * @property {string} id - UUID of the alert
 * @property {string} user_id - UUID of the user
 * @property {string|null} n8n_workflow_id - N8N workflow ID if applicable
 * @property {Date} created_at - Creation timestamp
 * @property {Date} updated_at - Last update timestamp
 * @property {string} symbol - Asset symbol (e.g., "BTC")
 * @property {string} alert_type - Custom alert type
 * @property {number} target_value - Price threshold
 * @property {'above'|'below'|'either'} direction - Alert direction
 * @property {boolean} enabled - Whether alert is active
 * @property {Date|null} last_triggered_at - Last trigger timestamp
 * @property {string|null} notes - User notes
 * @property {string|null} prompt - AI prompt for enhanced alerts
 */

/**
 * @typedef {Object} FinnhubMessage
 * @property {string} type - Message type
 * @property {Array<FinnhubTrade>} data - Trade data
 */

/**
 * @typedef {Object} FinnhubTrade
 * @property {string} s - Symbol
 * @property {number} p - Price
 * @property {number} t - Timestamp
 * @property {number} v - Volume
 */

/**
 * @typedef {Object} DiscordWebhookPayload
 * @property {string} content - Message content
 * @property {Array<DiscordEmbed>} embeds - Rich embeds
 */

/**
 * @typedef {Object} DiscordEmbed
 * @property {string} title - Embed title
 * @property {string} description - Embed description
 * @property {number} color - Embed color
 * @property {Array<DiscordField>} fields - Embed fields
 * @property {Date} timestamp - Embed timestamp
 */

/**
 * @typedef {Object} DiscordField
 * @property {string} name - Field name
 * @property {string} value - Field value
 * @property {boolean} inline - Whether field is inline
 */

module.exports = {};
