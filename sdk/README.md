# @chatterbox/chatterbox-sdk

Client SDK for shipping your application's logs to a [Chatterbox](../README.md)
server. It authenticates with a per-app API secret, batches logs, and
transparently **queues + retries** anything that fails to send so no logs are
lost when the server is briefly unavailable.

There are two ways to use it:

1. **Direct client** — call `sendLog` / `sendLogs` yourself. Simplest.
2. **Pino transport** — drop-in structured logging via a Unix-socket forwarder,
   for apps already using [pino](https://getpino.io).

---

## Install

```bash
npm install @chatterbox/chatterbox-sdk
```

## Get credentials

Create an application on your Chatterbox server to obtain an API secret:

```bash
# 1. Register / identify the user
curl -X POST "$CHATTERBOX_API_URL/api/users/login" \
  -H "Content-Type: application/json" \
  -d '{ "email": "you@example.com" }'

# 2. Create an app — the response contains `apiSecret`
curl -X POST "$CHATTERBOX_API_URL/api/users/apps" \
  -H "Content-Type: application/json" \
  -d '{ "email": "you@example.com", "appName": "my-service" }'
```

Set these in your environment (see [`.env.example`](./.env.example)):

```
CHATTERBOX_API_URL=http://localhost:3005
CHATTERBOX_APP_NAME=my-service
CHATTERBOX_API_SECRET=chbxsk_..._ZEE
```

---

## 1. Direct client

```js
const { ChatterboxSDK } = require("@chatterbox/chatterbox-sdk");

const chatterbox = new ChatterboxSDK({
  appName: process.env.CHATTERBOX_APP_NAME,
  apiSecret: process.env.CHATTERBOX_API_SECRET,
});

// Required fields: level, name, key, time, appName. `data` is any JSON payload.
await chatterbox.sendLog({
  level: "info",
  name: "my-service",
  key: "USER_SIGNUP",
  time: Date.now(),
  data: { userId: 42, plan: "pro" },
  appName: "my-service",
});

// Bulk send
await chatterbox.sendLogs([ /* ...log objects... */ ]);

// Flush the retry queue and stop the timer before your process exits
await chatterbox.close();
```

A complete, runnable version is in [`example.js`](./example.js):

```bash
cp .env.example .env   # then fill in the values
node example.js
```

### API

| Method | Description |
| --- | --- |
| `new ChatterboxSDK({ appName, apiSecret, logFile?, retryDelayMS?, maxBulkLog? })` | Create a client. Starts a background retry timer. |
| `sendLog(log)` | Send one log. Returns `true`/`false`. Queues on failure. |
| `sendLogs(logs)` | Send an array of logs in one bulk request. |
| `close()` | Flush queued logs and stop the retry timer. Call on shutdown. |

Failed logs are persisted to `data/<logFile>` and retried every
`retryDelayMS` (default 10s), so a temporary outage never drops logs.

---

## 2. Pino transport (drop-in logging)

For apps that log with pino, start the forwarder once at boot and add the
transport target. Log lines are written to a local Unix socket and shipped to
Chatterbox in the background.

```js
const { pino } = require("pino");
const { startChatterboxServer } = require("@chatterbox/chatterbox-sdk");

// Start the forwarder (owns the socket + retry queue).
startChatterboxServer({
  appName: process.env.CHATTERBOX_APP_NAME,
  apiSecret: process.env.CHATTERBOX_API_SECRET,
});

const logger = pino({
  transport: {
    targets: [
      {
        target: "@chatterbox/chatterbox-sdk/chatterboxTransport.mjs",
        options: { appName: process.env.CHATTERBOX_APP_NAME },
      },
      // keep console output too
      { target: "pino-pretty" },
    ],
  },
});

logger.info({ userId: 42 }, "USER_SIGNUP");
```

> The transport is best-effort: if the forwarder socket isn't up yet it drops
> the line rather than crashing your app. Call `startChatterboxServer(...)`
> before creating the logger so the socket is ready.
