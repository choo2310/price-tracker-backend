# Supabase Webhook Setup Guide

This guide explains how to set up Supabase webhooks to keep your price tracker backend synchronized with database changes.

## 🎯 Why Use Webhooks?

When users update alerts through your frontend (or directly in Supabase), your backend needs to know about these changes to:
- Start monitoring new alerts immediately
- Stop monitoring deleted alerts
- Update monitoring for modified alerts
- Ensure real-time synchronization

## 🔧 Setup Steps

### 1. Configure Environment Variables

Add to your `.env` file:
```env
# Generate a random secret for webhook security
SUPABASE_WEBHOOK_SECRET=your-super-secret-webhook-key-here

# Enable signature verification (recommended)
VERIFY_WEBHOOK_SIGNATURE=true
```

**Generate a secure secret:**
```bash
# Option 1: Using openssl
openssl rand -hex 32

# Option 2: Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Option 3: Online generator
# Visit: https://www.uuidgenerator.net/
```

### 2. Set Up Supabase Webhook

#### Via Supabase Dashboard:

1. **Go to your Supabase project dashboard**
2. **Navigate to Database → Webhooks**
3. **Click "Create a new hook"**
4. **Configure the webhook:**

```
Name: Price Tracker Alerts Sync
Table: alerts
Events: Insert, Update, Delete
Type: HTTP Request
HTTP Method: POST
URL: https://your-domain.com/api/alerts/webhook
HTTP Headers:
  Content-Type: application/json
  x-supabase-signature: [Enable signature]
Secret: your-super-secret-webhook-key-here
```

#### Via SQL (Alternative):

```sql
-- Create the webhook function
CREATE OR REPLACE FUNCTION notify_alerts_webhook()
RETURNS trigger AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://your-domain.com/api/alerts/webhook',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-supabase-signature', 'your-signature-here'
    ),
    body := jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'record', row_to_json(NEW),
      'old_record', row_to_json(OLD)
    )
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create triggers for all operations
CREATE TRIGGER alerts_webhook_insert
  AFTER INSERT ON alerts
  FOR EACH ROW EXECUTE FUNCTION notify_alerts_webhook();

CREATE TRIGGER alerts_webhook_update
  AFTER UPDATE ON alerts
  FOR EACH ROW EXECUTE FUNCTION notify_alerts_webhook();

CREATE TRIGGER alerts_webhook_delete
  AFTER DELETE ON alerts
  FOR EACH ROW EXECUTE FUNCTION notify_alerts_webhook();
```

### 3. Test the Webhook

#### Test Webhook Endpoint:
```bash
curl -X POST http://localhost:3000/api/alerts/webhook \
  -H "Content-Type: application/json" \
  -H "x-supabase-signature: sha256=test" \
  -d '{
    "type": "INSERT",
    "table": "alerts",
    "record": {
      "id": "test-id",
      "symbol": "BTC",
      "target_value": 50000,
      "direction": "above",
      "enabled": true
    }
  }'
```

#### Test Database Changes:
```sql
-- Insert a test alert (should trigger webhook)
INSERT INTO alerts (user_id, symbol, target_value, direction, enabled, alert_type)
VALUES (auth.uid(), 'TEST', 100, 'above', true, 'test');

-- Update the alert (should trigger webhook)
UPDATE alerts SET target_value = 200 WHERE symbol = 'TEST';

-- Delete the alert (should trigger webhook)
DELETE FROM alerts WHERE symbol = 'TEST';
```

## 📊 Webhook Payload Format

Your backend will receive webhooks in this format:

### INSERT Event:
```json
{
  "type": "INSERT",
  "table": "alerts",
  "record": {
    "id": "uuid-here",
    "user_id": "user-uuid",
    "symbol": "BTC",
    "target_value": 50000,
    "direction": "above",
    "enabled": true,
    "alert_type": "price_threshold",
    "created_at": "2025-09-19T10:30:00Z",
    "updated_at": "2025-09-19T10:30:00Z"
  },
  "old_record": null
}
```

### UPDATE Event:
```json
{
  "type": "UPDATE",
  "table": "alerts",
  "record": {
    "id": "uuid-here",
    "target_value": 55000,
    "updated_at": "2025-09-19T10:35:00Z"
    // ... other fields
  },
  "old_record": {
    "id": "uuid-here",
    "target_value": 50000,
    "updated_at": "2025-09-19T10:30:00Z"
    // ... other fields
  }
}
```

### DELETE Event:
```json
{
  "type": "DELETE",
  "table": "alerts",
  "record": null,
  "old_record": {
    "id": "uuid-here",
    "symbol": "BTC",
    // ... all fields from deleted record
  }
}
```

## 🔒 Security Features

### Signature Verification
- Uses HMAC-SHA256 to verify webhook authenticity
- Prevents replay attacks and unauthorized requests
- Configurable via environment variable

### Rate Limiting
- Limits to 50 webhook requests per minute per IP
- Prevents abuse and spam
- Automatically cleans up old entries

### Input Validation
- Validates webhook payload structure
- Ensures webhook is for the `alerts` table
- Logs all webhook events for debugging

## 🚨 Troubleshooting

### Webhook Not Received
1. **Check your server URL:**
   ```bash
   curl -I https://your-domain.com/api/alerts/webhook
   ```

2. **Verify Supabase webhook configuration:**
   - Correct URL endpoint
   - Proper HTTP method (POST)
   - Valid headers

3. **Check server logs:**
   ```bash
   tail -f logs/app.log | grep webhook
   ```

### Signature Verification Fails
1. **Verify secret matches:**
   - Same secret in `.env` and Supabase
   - No extra spaces or characters

2. **Check header format:**
   - Should be `x-supabase-signature: sha256=<hash>`
   - Case-sensitive header name

3. **Temporarily disable verification:**
   ```env
   VERIFY_WEBHOOK_SIGNATURE=false
   ```

### Webhook Processing Errors
1. **Check alert manager status:**
   ```bash
   curl http://localhost:3000/api/status
   ```

2. **Monitor webhook logs:**
   ```bash
   tail -f logs/app.log | grep "webhook\|alert"
   ```

3. **Test manual refresh:**
   ```bash
   curl -X POST http://localhost:3000/api/status/refresh
   ```

## 📈 Monitoring Webhooks

### View Webhook Logs:
```bash
# Filter webhook-related logs
tail -f logs/app.log | grep webhook

# Monitor alert changes
tail -f logs/app.log | grep "alert.*webhook"
```

### Check Webhook Status:
```bash
# System status (includes alert manager)
curl http://localhost:3000/api/status

# Current alerts being monitored
curl http://localhost:3000/api/status/websocket
```

### Webhook Metrics:
Your logs will show:
- ✅ Webhook received and processed
- 🔄 Alert manager refreshed
- ➕ New alerts added to monitoring
- ✏️ Alerts updated in monitoring  
- ➖ Alerts removed from monitoring

## 🎯 Best Practices

1. **Use HTTPS in production** for webhook URLs
2. **Keep webhook secret secure** and rotate regularly
3. **Monitor webhook logs** for errors or unusual activity
4. **Test webhooks** after any Supabase schema changes
5. **Implement retry logic** in your frontend for failed operations
6. **Use webhook signatures** to verify authenticity
7. **Rate limit webhooks** to prevent abuse

## 🔗 Webhook Endpoint

Once configured, your webhook endpoint will be:
```
POST https://your-domain.com/api/alerts/webhook
```

The backend will automatically:
- ✅ Verify webhook signatures
- 🔄 Update alert monitoring in real-time
- 📊 Log all webhook events
- 🛡️ Rate limit webhook requests
- ⚡ Refresh the alert manager cache

This ensures your backend stays perfectly synchronized with database changes!