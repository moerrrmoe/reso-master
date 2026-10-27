# Reso

A Telegram userbot that listens for incoming video messages, downloads them, encodes them to multiple resolutions (720p / 480p), and sends the encoded files back to the original sender.

## Features

- 🔐 **Secret-key auth** — only users who send `/start <key>` are served  
- 📥 **Download queue** — incoming videos are queued and downloaded sequentially  
- 🎞️ **Encode worker** — encodes each video to 720p and 480p using ffmpeg  
- 📤 **Send worker** — delivers encoded files back to the sender and cleans up disk  
- 🗄️ **SQLite + Prisma** — lightweight persistent queue and job state  

## Project Structure

```
reso-master/
├── bot.js                   # Entry point — starts bot, download & send workers
├── worker.js                # Entry point — runs encode queue
├── handlers/
│   ├── auth.handler.js      # /start command + authorization check
│   └── video.handler.js     # Video message routing
├── services/
│   ├── download.service.js  # Download queue logic
│   ├── encode.service.js    # ffmpeg encoding queue
│   └── send.service.js      # Encoded-video delivery & cleanup
├── utils/
│   ├── telegram.utils.js    # teleproto helpers
│   └── file.utils.js        # File system helpers
├── src/
│   ├── prisma.js            # Prisma client singleton
│   ├── auth/auth.js         # Telegram client authentication
│   └── client/client.js     # Telegram client instance
└── prisma/
    └── schema.prisma        # Database schema
```

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd reso-master
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:

| Variable | Description |
|---|---|
| `API_ID` | Telegram API ID from [my.telegram.org](https://my.telegram.org/apps) |
| `API_HASH` | Telegram API hash from [my.telegram.org](https://my.telegram.org/apps) |
| `SECRET_KEY` | Passphrase users must supply with `/start` |
| `SESSION_PATH` | Path to store session files (default: `bot_session`) |
| `DATABASE_URL` | SQLite database path (default: `file:./prisma/dev.db`) |
| `DOWNLOAD_VIDEOS_PATH` | Where raw downloads are stored (default: `downloads`) |
| `ENCODED_VIDEOS_PATH` | Where encoded videos are stored (default: `encode_output`) |

### 3. Set up the database

```bash
npx prisma db push
```

### 4. Run

In **two separate terminals**:

```bash
# Terminal 1 — Telegram bot (download + send)
node bot

# Terminal 2 — Encode worker
node worker
```

## Authorization

Send `/start <SECRET_KEY>` to the bot via Telegram. Your chat ID will be stored and you will be served from that point forward. Unauthorized senders are ignored.

## Requirements

- Node.js ≥ 18  
- A Telegram **user account** (not a bot token) — API ID & hash required  
