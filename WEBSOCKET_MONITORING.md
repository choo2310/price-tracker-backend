# WebSocket Monitoring Guide

This guide explains the different ways you can monitor the Finnhub WebSocket connection in your price tracker backend.

## 🚀 Quick Start

1. **Start your server:**
   ```bash
   npm run dev
   ```

2. **Open the HTML monitor** (easiest option):
   - Open `websocket-monitor.html` in your browser
   - Click "Start Monitoring" to see real-time WebSocket activity
   - View connection status, subscribed symbols, and live messages

## 📊 Monitoring Options

### 1. HTML Dashboard (Recommended)
The `websocket-monitor.html` file provides a real-time dashboard with:
- ✅ Connection status indicator
- 📈 Message statistics
- 🔄 Live message stream
- 📊 System uptime and status

**Usage:**
```bash
# Open in browser
open websocket-monitor.html
# Or just double-click the file
```

### 2. REST API Endpoints

#### Get WebSocket Status
```bash
curl http://localhost:3000/api/status/websocket
```
**Response:**
```json
{
  "success": true,
  "data": {
    "connected": true,
    "subscribedSymbols": ["BTC", "ETH"],
    "reconnectAttempts": 0,
    "lastMessageTime": "2025-09-19T10:30:45.123Z",
    "messageCount": 1547,
    "recentMessages": [...]
  }
}
```

#### Get System Status
```bash
curl http://localhost:3000/api/status
```

#### Get Cached Prices
```bash
curl http://localhost:3000/api/status/prices
```

### 3. Server-Sent Events (Real-time)
Stream live WebSocket events:
```bash
curl -N http://localhost:3000/api/status/websocket/stream
```

### 4. Log Output
Set debug logging to see detailed WebSocket activity:
```bash
# In your .env file
LOG_LEVEL=debug

# Then check logs
tail -f logs/app.log
```

## 🔧 Debug Configuration

### Enable Debug Logging
Add to your `.env`:
```env
LOG_LEVEL=debug
LOG_TO_FILE=true
```

### WebSocket Debug Messages
The system logs:
- ✅ Connection events
- 📨 Message received (with count)
- 🔄 Reconnection attempts  
- ⚠️ Errors and warnings
- 📊 Price updates per symbol

### Example Debug Output
```
[DEBUG] WebSocket Event: { event: 'message_received', type: 'trade', dataCount: 3 }
[DEBUG] Price update: BTC = $43,250.50 (volume: 1.23456)
[INFO] Alert triggered: BTC above $43,000 (current: $43,250.50)
```

## 🚨 Troubleshooting

### WebSocket Not Connecting
1. **Check API key:**
   ```bash
   curl "https://finnhub.io/api/v1/quote?symbol=AAPL&token=YOUR_API_KEY"
   ```

2. **Verify environment:**
   ```bash
   curl http://localhost:3000/api/status
   ```

3. **Check logs:**
   ```bash
   tail -f logs/error.log
   ```

### No Price Updates
1. **Check subscribed symbols:**
   ```bash
   curl http://localhost:3000/api/status/websocket
   ```

2. **Verify alerts exist:**
   ```bash
   curl -H "x-user-id: your-uuid" http://localhost:3000/api/alerts
   ```

3. **Test with a popular symbol:**
   ```bash
   curl -X POST http://localhost:3000/api/alerts \
     -H "Content-Type: application/json" \
     -H "x-user-id: your-uuid" \
     -d '{"symbol":"AAPL","target_value":150,"direction":"above","enabled":true}'
   ```

### Monitor Performance
```bash
# Memory usage
curl http://localhost:3000/api/status/metrics

# Message statistics  
curl http://localhost:3000/api/status/websocket
```

## 📱 Real-time Monitoring Commands

### Watch Connection Status
```bash
watch -n 5 'curl -s http://localhost:3000/api/status/websocket | jq .data.connected'
```

### Monitor Message Count
```bash
watch -n 2 'curl -s http://localhost:3000/api/status/websocket | jq .data.messageCount'
```

### Track Price Updates
```bash
watch -n 3 'curl -s http://localhost:3000/api/status/prices | jq .'
```

## 🎯 What to Monitor

### ✅ Health Indicators
- `connected: true` - WebSocket is connected
- `messageCount` increasing - Receiving data
- `lastMessageTime` recent - Active connection
- `reconnectAttempts: 0` - Stable connection

### ⚠️ Warning Signs
- `connected: false` - Connection lost
- `messageCount` not increasing - No data flow
- High `reconnectAttempts` - Unstable connection
- Old `lastMessageTime` - Stale connection

### 🚨 Critical Issues
- Repeated connection failures
- No messages for >5 minutes
- Error logs with WebSocket failures
- Memory usage constantly increasing

## 💡 Pro Tips

1. **Use the HTML monitor** for visual real-time monitoring
2. **Set up alerts** for critical symbols to verify the system works
3. **Monitor during market hours** when trading is active
4. **Check logs regularly** for any error patterns
5. **Test reconnection** by temporarily blocking internet

## 🔗 Useful URLs

- Health Check: http://localhost:3000/health
- System Status: http://localhost:3000/api/status  
- WebSocket Status: http://localhost:3000/api/status/websocket
- Real-time Stream: http://localhost:3000/api/status/websocket/stream
- HTML Monitor: file://path/to/websocket-monitor.html

Remember to replace `localhost:3000` with your actual server URL if different!