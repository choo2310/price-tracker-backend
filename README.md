# Price Tracker Backend

A real-time price tracking and alerting system built with Node.js that monitors cryptocurrency and stock prices using the Finnhub API and sends notifications via Discord webhooks when price targets are reached.

## Features

- 🔄 Real-time price monitoring via Finnhub WebSocket API
- 🎯 Customizable price alerts with above/below thresholds
- 🤖 AI-enhanced alert notifications with context
- 💬 Discord webhook integration for notifications
- 🗄️ Supabase database integration for alert storage
- 📊 REST API for alert management
- 🛡️ Comprehensive error handling and logging
- 🔒 Security middleware and rate limiting
- 📈 System monitoring and health checks

## Quick Start

### Prerequisites

- Node.js 16+ 
- Supabase account and project
- Finnhub API key (free tier available)
- Discord server with webhook configured

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd price-tracker-backend
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your actual values
```

4. Start the development server:
```bash
npm run dev
```

The server will start on `http://localhost:3000` (or your configured PORT).

## Configuration

Copy `.env.example` to `.env` and configure the following variables:

### Required Configuration

```env
# Supabase
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key

# Finnhub API
FINNHUB_API_KEY=your-finnhub-api-key

# Discord Webhook
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/your-webhook-url
```

### Optional Configuration

```env
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## Database Schema

Your Supabase database should have an `alerts` table with the following schema:

```sql
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid(),
  n8n_workflow_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  symbol VARCHAR NOT NULL,
  alert_type TEXT NOT NULL,
  target_value NUMERIC NOT NULL,
  direction direction_enum NOT NULL DEFAULT 'above',
  enabled BOOLEAN NOT NULL DEFAULT false,
  last_triggered_at TIMESTAMPTZ,
  notes TEXT,
  prompt TEXT
);

-- Create enum for direction
CREATE TYPE direction_enum AS ENUM ('above', 'below');
```

## API Endpoints

### Alerts Management

- `GET /api/alerts` - Get user's alerts
- `POST /api/alerts` - Create new alert
- `PUT /api/alerts/:id` - Update alert
- `DELETE /api/alerts/:id` - Delete alert
- `GET /api/alerts/symbols` - Get user's tracked symbols
- `POST /api/alerts/:id/test` - Test alert notification

### System Status

- `GET /health` - Health check
- `GET /api/status` - Detailed system status
- `GET /api/status/metrics` - System metrics
- `GET /api/status/prices` - Current cached prices
- `POST /api/status/refresh` - Refresh alerts from database
- `POST /api/status/test-discord` - Test Discord webhook

### Request Headers

All alert endpoints require a user ID header:
```
x-user-id: your-user-uuid
```

## Example API Usage

### Create an Alert

```bash
curl -X POST http://localhost:3000/api/alerts \\
  -H "Content-Type: application/json" \\
  -H "x-user-id: your-user-uuid" \\
  -d '{
    "symbol": "BTC",
    "alert_type": "price_threshold",
    "target_value": 45000,
    "direction": "above",
    "enabled": true,
    "notes": "Bitcoin target price alert",
    "prompt": "Alert me when Bitcoin reaches $45,000"
  }'
```

### Direction Options

The `direction` field supports three values:

- **`"above"`** - Alert triggers when price rises above the target value
- **`"below"`** - Alert triggers when price falls below the target value  
- **`"either"`** - Alert triggers when price crosses the target value in either direction (crossing from above to below or below to above)

### Get System Status

```bash
curl http://localhost:3000/api/status
```

## Discord Notifications

When alerts are triggered, rich Discord notifications are sent containing:

- 📊 Current vs target price
- 📈 Price change information
- 📦 Trading volume
- ⏰ Timestamp
- 📝 User notes and AI prompts
- 🎨 Color-coded embeds based on direction

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Express API   │    │  Alert Manager   │    │ Finnhub WebSocket│
│                 │    │                  │    │                 │
│ • REST endpoints│◄──►│ • Price monitoring│◄──►│ • Real-time data│
│ • Rate limiting │    │ • Alert checking │    │ • Auto-reconnect│
│ • Error handling│    │ • Notifications  │    │ • Symbol mgmt   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       
         ▼                       ▼                       
┌─────────────────┐    ┌──────────────────┐              
│   Supabase DB   │    │ Discord Webhook  │              
│                 │    │                  │              
│ • Alert storage │    │ • Rich embeds    │              
│ • User data     │    │ • Rate limiting  │              
│ • CRUD ops      │    │ • Error handling │              
└─────────────────┘    └──────────────────┘              
```

## Monitoring & Observability

### Logging

The application uses Winston for structured logging with multiple levels:
- `error` - Error conditions
- `warn` - Warning conditions  
- `info` - General information
- `debug` - Debug information

Logs include contextual information like user IDs, symbols, and request details.

### Health Checks

- `GET /health` - Basic health check
- `GET /api/status` - Detailed system status including:
  - Service connection status
  - Memory usage
  - Active alerts count
  - WebSocket connection status

### Metrics

System metrics are available at `GET /api/status/metrics` including:
- Memory usage (RSS, heap)
- CPU usage
- Uptime
- Alert statistics

## Error Handling

The application includes comprehensive error handling:

- Global Express error middleware
- Database error handling with specific error codes
- WebSocket connection management with auto-reconnect
- Rate limiting protection
- Graceful shutdown handling
- Request timeouts

## Development

### Scripts

```bash
npm start          # Start production server
npm run dev        # Start development server with auto-reload
npm test           # Run tests (when implemented)
```

### Project Structure

```
src/
├── index.js              # Application entry point
├── config.js             # Configuration management
├── types/               
│   └── index.js          # Type definitions
├── services/            
│   ├── supabase.js       # Database service
│   ├── finnhub.js        # WebSocket price service
│   ├── discord.js        # Notification service
│   └── alertManager.js   # Alert monitoring logic
├── routes/              
│   ├── alerts.js         # Alert CRUD endpoints
│   └── status.js         # System status endpoints
└── utils/               
    ├── logger.js         # Logging utility
    └── errorHandler.js   # Error handling utilities
```

## Security Considerations

- Rate limiting on API endpoints
- Helmet.js security headers
- Request timeout protection
- Input validation
- Environment variable validation
- Secure error message handling

## Performance

- Connection pooling for database
- WebSocket connection management
- Memory usage monitoring
- Efficient alert checking algorithms
- Response caching where appropriate

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the ISC License.

## Support

For support and questions:
- Create an issue in the GitHub repository
- Check the logs for detailed error information
- Use the `/api/status` endpoint for system diagnostics