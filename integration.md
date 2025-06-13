This guide provides advice and instructions on how to effectively integrate and use the `ChatterboxSDK` to send logs from your Node.js application to your Chatterbox instance. The SDK is designed for resilience, offering features like log queuing and retries, and works best when coupled with a standard logging library.

**Core Advice:** For most applications, the recommended approach is to integrate the `ChatterboxSDK` as a custom stream/transport within a comprehensive logging library like Pino. This allows you to leverage your existing logging practices while benefiting from the SDK's features for reliable delivery to Chatterbox. The `example.js` file you provided serves as an excellent blueprint for this integration.

## 1. Prerequisites

Before integrating the SDK, ensure you have the following from your Chatterbox instance:

* **`appName`**: The unique name of your application registered in Chatterbox.
* **`apiSecret`**: The API Secret generated for your application by Chatterbox. This is essential for authenticating log submissions.
* **Chatterbox Server URL**: The base URL where your Chatterbox instance is running (e.g., `http://localhost:3005`). This is where the SDK will send logs.

You can obtain the `appName` and `apiSecret` by:
    * Using the Chatterbox web UI to create/manage your application.
    * Using the Chatterbox API programmatically (refer to the "Programmatic API Secret Retrieval" section in the main project README).

## 2. Installation / Setup

1.  **Integrate SDK Code**:
    * Ensure the `index.js` file (containing the `ChatterboxSDK` class) is accessible within your project. You might place it in a `lib/` directory or, for broader use, publish it as a private npm package.

2.  **Install Dependencies**:
    * The SDK itself relies on standard Node.js modules (`fs`, `crypto`, `stream`) and `dotenv`.
    * For the recommended integration with Pino (as seen in `example.js`), ensure these are installed:
        ```bash
        npm install pino pino-pretty pino-http colorette luxon dotenv
        # or
        yarn add pino pino-pretty pino-http colorette luxon dotenv
        ```

## 3. SDK Initialization

Initialize the `ChatterboxSDK` early in your application's lifecycle. Always use environment variables for sensitive information like the `apiSecret` and for configurations that might change between environments.

```javascript
// your-application-setup.js
require('dotenv').config();

const ChatterboxSDK = require('./path/to/your/sdk/index.js'); // Adjust path

const chatterboxOptions = {
    apiSecret: process.env.CHATTERBOX_API_SECRET,
    appName: process.env.CHATTERBOX_APP_NAME,
    apiUrl: process.env.CHATTERBOX_API_URL || 'http://localhost:3005', // SDK uses its own default if this is not set
    // Optional configurations:
    // logFile: process.env.CHATTERBOX_LOG_FILE || 'chatterboxLogQueue.json',
    // retryDelayMS: parseInt(process.env.CHATTERBOX_RETRY_DELAY_MS, 10) || 10000,
    // maxBulkLog: parseInt(process.env.CHATTERBOX_MAX_BULK_LOG, 10) || 10
};

if (!chatterboxOptions.apiSecret || !chatterboxOptions.appName) {
    console.error("FATAL: CHATTERBOX_API_SECRET and CHATTERBOX_APP_NAME must be set in environment variables.");
    process.exit(1); // Critical configuration missing
}

const chatterbox = new ChatterboxSDK(chatterboxOptions);

console.log('Chatterbox SDK Initialized for app:', chatterboxOptions.appName);

// Export 'chatterbox' instance if needed by other modules (e.g., your logger setup)
module.exports = { chatterbox /*, ... other exports */ };
```

**Corresponding `.env` file:**
```env
CHATTERBOX_API_SECRET=your_actual_api_secret_here
CHATTERBOX_APP_NAME=your_registered_app_name_here
CHATTERBOX_API_URL=[http://your-chatterbox-instance.com](http://your-chatterbox-instance.com) # Your actual Chatterbox server URL
# Optional
# CHATTERBOX_LOG_FILE=customLogQueue.json
# CHATTERBOX_RETRY_DELAY_MS=15000
# CHATTERBOX_MAX_BULK_LOG=20
```

## 4. Choosing Your Logging Strategy

### a) Integrating with a Logging Library (Highly Recommended)

This is the most robust and flexible method for application-wide logging. The `ChatterboxSDK` provides a `getCustomStream()` method that can be used as a destination for logging libraries like Pino.

**Key Steps (referencing `example.js` structure):**

1.  **Initialize `ChatterboxSDK`** (as shown in section 3).
2.  **Create a Logger Wrapper** (like `PinoLogger` in `example.js`): This class will encapsulate your Pino setup.
3.  **Configure Pino Streams**:
    * Use Pino's `multistream` to direct logs to multiple destinations:
        * The `chatterbox.getCustomStream()` for sending logs to Chatterbox.
        * Optionally, `pino-pretty` for formatted console output during development.
    ```javascript
    // Inside your PinoLogger or logging setup module
    // const { chatterbox } = require('./your-application-setup'); // Assuming chatterbox is exported
    // const { multistream } = require('pino');
    // const pinoPretty = require('pino-pretty');

    function _getLogDestination(pinoConfig, chatterboxInstance) { // Pass chatterboxInstance
        const streams = [
            {
                level: pinoConfig.level || 'trace', // Minimum level to send to Chatterbox
                stream: chatterboxInstance.getCustomStream()
            }
        ];

        if (pinoConfig.enableConsoleLogs) {
            streams.push({
                level: pinoConfig.level || 'trace',
                stream: pinoPretty({ /* ... pino-pretty options ... */ })
            });
        }
        return multistream(streams);
    }
    ```
4.  **Configure Pino Options**:
    * Set `base` options in Pino to automatically include `appName` in every log object. This is crucial if your Chatterbox API expects `appName` within the log payload.
    * Define `messageKey` (e.g., `'key'` as in `example.js` or `'msg'`) and `errorKey`.
    * Use `formatters` if needed to shape the log level or other fields.
    ```javascript
    // Inside your PinoLogger's _getPinoOptions() or equivalent
    function _getPinoOptions(config) { // config here is your PinoLogger's internal config
        return {
            name: config.appName, // Or a different identifier for Pino itself
            level: config.level || 'info',
            base: { // Automatically add these fields to all logs
                appName: config.appName, // This ensures appName is in the log payload
                // pid: undefined, // Example: remove default Pino fields if not needed
                // hostname: undefined,
            },
            formatters: {
                level(label) { return { level: label }; },
                // Add other formatters as needed
            },
            messageKey: config.messageKey || 'msg', // 'key' was used in example.js
            errorKey: 'error',
            // timestamp: pino.stdTimeFunctions.isoTime, // Example for ISO timestamps
        };
    }
    ```
5.  **Instantiate and Use Your Logger**:
    ```javascript
    // const logger = new PinoLogger({ appName: chatterboxOptions.appName, ... });
    logger.info({ customData: "some value", userId: "456" }, "User_Login_Success");
    logger.error(new Error("Database connection failed"), "DB_Connection_Error");
    ```

### b) Direct Sending (For Specific Use Cases)

Using `chatterbox.sendLog(logData)` or `chatterbox.sendLogs(arrayOfLogData)` directly is suitable for:
* Sending isolated, individual log events outside your main application logging flow.
* Simple scripts where a full logging library setup is overkill.

```javascript
// Ensure chatterbox is initialized as per section 3
const directLog = {
    level: "warn",
    name: "ManualTrigger", // Or your chosen messageKey
    context: { detail: "Manual system check" },
    time: new Date().toISOString(),
    data: { status: "OK" },
    key: "MANUAL_CHECK_EVENT", // Or your chosen messageKey
    appName: chatterboxOptions.appName // CRITICAL: Always include appName
};

chatterbox.sendLog(directLog)
    .then(success => console.log(success ? "Direct log sent." : "Direct log queued."))
    .catch(err => console.error("Direct log error:", err));
```
**Note on Direct Sending**: The `logData` object must conform to the structure expected by the Chatterbox API (`/api/logs`), especially including `appName`. The SDK wraps this in `{ log: logData }` before sending.

## 5. Development and Testing Workflow

1.  **Local Development**:
    * When developing locally, use `pino-pretty` or a similar formatter for console output alongside the Chatterbox stream. This gives you immediate visibility.
    * Ensure your local Chatterbox server instance is running and accessible.
2.  **Verify Integration**:
    * After sending test logs, check the Chatterbox web UI for your application to see if the logs appear.
    * Monitor the console output of your application (where the SDK is running). The SDK prints messages about successful sends, queuing attempts, and errors.
3.  **Test Queuing**:
    * Temporarily stop your Chatterbox server.
    * Send some logs from your application. The SDK should queue them (check the `logFile`).
    * Restart the Chatterbox server. The SDK should then process the queue and send the stored logs.

## 6. Understanding SDK Mechanics (Queuing & Retries)

* **Immediate Send Attempt**: When a log is processed (either via the stream or direct methods), the SDK first attempts to send it to the Chatterbox API immediately.
* **Queuing on Failure**: If the HTTP request fails (e.g., network error, Chatterbox server down), the log data is written to a local file queue (defined by `logFile` option, default `logQueue.json`).
* **Retry Mechanism**: A background timer (`setInterval`) in the SDK periodically checks this queue. If logs are present, it attempts to resend them in batches (up to `MAX_BULK_LOG`).
* **Persistence**: This ensures log data isn't lost during temporary connectivity issues or server downtime.

## 7. Key Considerations

* **API Secret Security**: Your `CHATTERBOX_API_SECRET` is highly sensitive. **Never** hardcode it. Always use environment variables and ensure your `.env` file is in `.gitignore`.
* **`appName`**: This field is critical. It must be consistent between your SDK configuration, the `appName` field within your log objects (if your API requires it in the payload), and the application registered in Chatterbox.
* **Log Structure for Chatterbox API**:
    * The Chatterbox API endpoint (`/api/logs`) expects logs in a specific JSON format. When using Pino, configure its `base` fields, `messageKey`, `formatters`, and how you structure your log calls (e.g., `logger.info({ custom_fields... }, "message")`) to align with what the API's `spec` (Zod schema on the server) expects.
    * Essential fields typically are: `level`, `name` (or your `messageKey`), `time`, `data` (or `context`), `key`, and `appName`.
* **Error Monitoring (SDK Internal)**: The SDK logs its own operational messages (sends, queues, errors) to the console. Monitor these for insights into its behavior.
* **File Permissions**: Ensure your application process has read/write permissions for the `LOG_FILE` path if you rely on the queuing feature.
* **Chatterbox Server URL**: Verify that `CHATTERBOX_API_URL` (from SDK options or environment variable) correctly points to your running Chatterbox instance, including the correct protocol (http/https) and port.
* **Asynchronous Nature**: Logging, especially when involving network requests and queuing, is asynchronous. Design your application accordingly.

By following this advice, particularly the integration with a logging library like Pino, you can establish a robust, reliable, and maintainable logging pipeline from your applications to your Chatterbox system.
