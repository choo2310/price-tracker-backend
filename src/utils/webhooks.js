const crypto = require("crypto");
const logger = require("./logger");

/**
 * Verify Supabase webhook signature
 * @param {string} payload - Raw request body
 * @param {string} signature - Signature from header
 * @param {string} secret - Webhook secret
 * @returns {boolean} Whether signature is valid
 */
function verifySupabaseWebhook(payload, signature, secret) {
  if (!secret) {
    logger.warn("No webhook secret configured - skipping verification");
    return true;
  }

  if (!signature) {
    logger.error("No signature provided in webhook request");
    return false;
  }

  try {
    // Supabase sends signature in format: sha256=<hash>
    const expectedSignature = `sha256=${crypto
      .createHmac("sha256", secret)
      .update(payload, "utf8")
      .digest("hex")}`;

    // Use crypto.timingSafeEqual to prevent timing attacks
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (signatureBuffer.length !== expectedBuffer.length) {
      logger.error("Webhook signature length mismatch");
      return false;
    }

    const isValid = crypto.timingSafeEqual(signatureBuffer, expectedBuffer);

    if (!isValid) {
      logger.error("Webhook signature verification failed");
    }

    return isValid;
  } catch (error) {
    logger.error("Error verifying webhook signature:", error);
    return false;
  }
}

/**
 * Middleware to verify webhook signatures
 * @param {string} secret - Webhook secret
 * @returns {Function} Express middleware
 */
function webhookVerification(secret) {
  return (req, res, next) => {
    // Skip verification if disabled or no secret
    if (!secret || process.env.VERIFY_WEBHOOK_SIGNATURE === "false") {
      return next();
    }

    const signature =
      req.headers["x-webhook-signature"] || req.headers["x-supabase-signature"];

    if (!signature) {
      logger.error("Missing webhook signature header");
      return res.status(401).json({
        error: "Missing webhook signature",
      });
    }

    // Get raw body for signature verification
    const rawBody = req.rawBody || JSON.stringify(req.body);

    if (!verifySupabaseWebhook(rawBody, signature, secret)) {
      return res.status(401).json({
        error: "Invalid webhook signature",
      });
    }

    next();
  };
}

/**
 * Middleware to capture raw body for webhook verification
 */
function captureRawBody(req, res, next) {
  let data = "";
  req.setEncoding("utf8");

  req.on("data", (chunk) => {
    data += chunk;
  });

  req.on("end", () => {
    req.rawBody = data;
    req.body = JSON.parse(data);
    next();
  });
}

/**
 * Rate limiter specifically for webhooks
 * @param {number} maxRequests - Max requests per window
 * @param {number} windowMs - Window size in milliseconds
 * @returns {Function} Express middleware
 */
function webhookRateLimit(maxRequests = 100, windowMs = 60000) {
  const requests = new Map();

  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean old entries
    for (const [key, timestamps] of requests.entries()) {
      const validTimestamps = timestamps.filter((time) => time > windowStart);
      if (validTimestamps.length === 0) {
        requests.delete(key);
      } else {
        requests.set(key, validTimestamps);
      }
    }

    // Check current IP
    const ipRequests = requests.get(ip) || [];
    const recentRequests = ipRequests.filter((time) => time > windowStart);

    if (recentRequests.length >= maxRequests) {
      logger.warn(`Webhook rate limit exceeded for IP: ${ip}`);
      return res.status(429).json({
        error: "Too many webhook requests",
      });
    }

    // Add current request
    recentRequests.push(now);
    requests.set(ip, recentRequests);

    next();
  };
}

module.exports = {
  verifySupabaseWebhook,
  webhookVerification,
  captureRawBody,
  webhookRateLimit,
};
