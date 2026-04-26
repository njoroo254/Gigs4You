# Gigs4You AI Service

Claude-powered AI layer for the Gigs4You platform with live PostgreSQL + Redis integration.

## Quick Start

1. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your Anthropic API key and database settings
   ```

3. **Start the service:**
   ```bash
   python start.py
   ```

The service will be available at `http://localhost:8001`

## Docker Setup

```bash
# Build and run with Docker Compose
docker compose up -d --build gigs4you-ai-service

# Check logs
docker compose logs gigs4you-ai-service

# Check health
curl http://localhost:8001/health
```

## API Endpoints

- `GET /` - Service info
- `GET /health` - Health check
- `POST /chat/assist` - Conversational AI with tool use
- `POST /matching/job-worker` - AI-powered job-to-worker matching
- `POST /recommendations/personalize` - Personalized recommendations
- `GET /analytics/user-insights` - Platform analytics with AI insights

## Environment Variables

### Required
- `ANTHROPIC_API_KEY` - Your Anthropic Claude API key

### Database (choose one method)
- `DATABASE_URL` - Full PostgreSQL connection URL
- Or individual: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`

### Optional
- `REDIS_HOST` - Redis host (default: localhost)
- `REDIS_PORT` - Redis port (default: 6379)
- `PORT` - Service port (default: 8001)

## Troubleshooting

### Import Errors
If you get import errors, run the test script:
```bash
python test_imports.py
```

### Database Connection Issues
- Ensure PostgreSQL is running on port 5432
- Check database credentials in `.env`
- Verify the `gigs4you` database exists

### Redis Connection Issues
- Ensure Redis is running on port 6379
- The service will work without Redis but caching will be disabled

### Anthropic API Issues
- Verify your `ANTHROPIC_API_KEY` is valid
- Check your Anthropic account has credits
- The service will start but AI features will be limited

### Docker Issues
- Ensure Docker Desktop is running
- Check container logs: `docker compose logs`
- Rebuild if needed: `docker compose up -d --build`

## Architecture

- **FastAPI** - Web framework
- **Anthropic Claude** - AI engine for chat and matching
- **PostgreSQL** - Live platform data
- **Redis** - Caching and session storage
- **AsyncPG** - Async PostgreSQL client

## Development

The service includes 160+ tools for comprehensive platform interaction:
- Job search and management
- Worker discovery and matching
- Platform analytics
- User management
- Task coordination
- Wallet and payments

All tools use live database queries for real-time data access.