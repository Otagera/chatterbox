# @chatterbox/chatterbox-sdk

Ship your app's logs to a [Chatterbox](https://github.com/Otagera/chatterbox)
server. Authenticates with a per-app API secret, batches sends, and
**queues + retries on disk** so nothing is lost while the server is down.

---

## 1. Install

The SDK lives in the `sdk/` folder of the Chatterbox repo and is published to a
dedicated `sdk-dist` branch (npm can't install from a subdirectory, so CI mirrors
it there). Install straight from GitHub — no registry, no auth:

```bash
npm i github:Otagera/chatterbox#sdk-dist
```

Pin a version instead of tracking latest:

```bash
npm i github:Otagera/chatterbox#sdk-v1.1.0
```

## 2. Get credentials

On your Chatterbox server, create an app to get an API secret:

```bash
# 1. register / identify yourself
curl -X POST "$CHATTERBOX_API_URL/api/users/login" \
  -H "Content-Type: application/json" \
  -d '{ "email": "you@example.com" }'

# 2. create the app — the response contains `apiSecret`
curl -X POST "$CHATTERBOX_API_URL/api/users/apps" \
  -H "Content-Type: application/json" \
  -d '{ "email": "you@example.com", "appName": "my-service" }'
```

## 3. Send logs

```js
const { ChatterboxSDK } = require("@chatterbox/chatterbox-sdk");

const chatterbox = new ChatterboxSDK({
  apiUrl: "https://logs.example.com",   // your Chatterbox server
  appName: "my-service",
  apiSecret: process.env.CHATTERBOX_API_SECRET,
});

await chatterbox.sendLog({
  level: "info",                 // info | warn | error | debug | trace | fatal
  name: "my-service",
  key: "USER_SIGNUP",            // short event key
  time: Date.now(),
  appName: "my-service",
  data: { userId: 42, plan: "pro" },   // any JSON — encrypted at rest
});

// on shutdown: flush the retry queue and stop the timer
await chatterbox.close();
```

That's the whole thing. A complete runnable version is in
[`example.js`](./example.js).

---

## API

| Method | Description |
| --- | --- |
| `new ChatterboxSDK(options)` | Create a client. Starts a background retry timer. |
| `sendLog(log)` | Send one log. Returns `true`/`false`; queues on failure. |
| `sendLogs(logs)` | Send an array in one bulk request. |
| `close()` | Flush the queue and stop the timer. Call on shutdown. |

### Options

| Option | Required | Default | Notes |
| --- | --- | --- | --- |
| `apiUrl` | ✅ | `CHATTERBOX_API_URL` env | Base URL of your server. Throws if missing. |
| `appName` | ✅ | — | Must match the app you created. |
| `apiSecret` | ✅ | — | From `POST /api/users/apps`. |
| `dataDir` | — | `<cwd>/.chatterbox` | Where the retry queue is persisted. |
| `logFile` | — | `logQueue.json` | Retry queue file name. |
| `retryDelayMS` | — | `10000` | How often queued logs are retried. |
| `maxBulkLog` | — | `10` | Batch size when flushing the queue. |

### Log shape

Required: `level`, `name`, `key`, `time`, `appName`. Optional: `data`
(encrypted at rest), `traceId`, `context`, and — for HTTP logs — `request`,
`response`, `timeTaken`.

> Add `.chatterbox/` to your `.gitignore`; that's where failed logs are parked.

---

## Pino transport (optional)

If your app already uses [pino](https://getpino.io), you can forward logs
automatically. A local forwarder owns a Unix socket and ships batches in the
background. `pino` is an optional peer dependency — install it yourself.

```js
const { pino } = require("pino");
const { startChatterboxServer } = require("@chatterbox/chatterbox-sdk");

// Start the forwarder BEFORE creating the logger so the socket is ready.
startChatterboxServer({
  apiUrl: "https://logs.example.com",
  appName: "my-service",
  apiSecret: process.env.CHATTERBOX_API_SECRET,
});

const logger = pino({
  transport: {
    targets: [
      {
        target: "@chatterbox/chatterbox-sdk/chatterboxTransport.mjs",
        options: { appName: "my-service" },   // must match the forwarder
        },
      { target: "pino-pretty" },              // keep console output
    ],
  },
});

logger.info({ userId: 42 }, "USER_SIGNUP");
```

The socket path is derived from `appName`
(`<tmp>/chatterbox-<app-name>.sock`), so multiple apps on one host don't
collide. Override with the `socketPath` option or `CHATTERBOX_SOCKET_PATH`.

The transport is **best-effort**: if the forwarder isn't up it drops the line
rather than crashing your app.

---

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `needs your Chatterbox server URL` | Pass `apiUrl` or set `CHATTERBOX_API_URL`. |
| `Application: X not found` | `appName` doesn't match, or the secret belongs to another app. |
| `401 / Invalid API key format` | `apiSecret` is wrong or truncated — regenerate it. |
| Logs queue but never send | Server unreachable. Check `apiUrl`; queued logs retry automatically. |
| `Could not connect to the Chatterbox logging server` | Transport mode only — call `startChatterboxServer(...)` first, with the same `appName`. |
