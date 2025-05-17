# Chatterbox

Chatterbox is a Node.js application designed for robust, secure log management and background job processing. It provides a web interface for viewing and managing logs, users, and applications, alongside a comprehensive API for programmatic log ingestion and administrative tasks. Built with TypeScript, it utilizes MikroORM for database interactions (MongoDB), Express for handling HTTP requests, Pug with Tailwind CSS for the web UI, HTMX for a dynamic user experience, and BullMQ (with Redis) for managing background queues (including email sending).

## Key Features

-   **Secure Log Ingestion (API):** Applications can send logs via a secure API endpoint (`POST /api/logs`), authenticated with unique API Secrets.
-   **Advanced Log Viewing & Management (Web UI):**
    -   Near real-time log display with updates powered by HTMX.
    -   Efficient pagination for browsing large volumes of logs.
    -   Powerful log searching and filtering (by level, custom key, date range).
    -   Expandable log entries to view detailed, decrypted log data.
-   **User Management:**
    -   User login via email, initiating an OTP flow for application access.
    -   OTP (One-Time Password) based authentication for accessing specific application contexts within the UI and for retrieving API secrets programmatically.
    -   Email-based OTPs sent using Mailgun (via BullMQ email queue) and Pug templates.
    -   (Potential for Welcome emails via `welcomeEmail.service.ts`).
-   **Application Management (Web UI & API):**
    -   Users can create, view, and manage multiple logging applications.
    -   Secure generation and retrieval of API Secrets for each application, involving OTP verification.
    -   Ability to revoke or disable application access.
-   **Background Job Processing:**
    -   Utilizes **BullMQ** with **Redis** for robust background queue management (e.g., for sending OTP and other emails via `email` and `default` queues).
    -   Includes **Bull Board** dashboard accessible at `/worker/admin` for monitoring queues and jobs.
-   **Robust Security:**
    -   API authentication using per-application API Secrets.
    -   Encryption of sensitive log data at rest, tied to the specific application.
    -   Session-based authentication for the web interface (`express-session` with `connect-mongo` store).
    -   Hashing of sensitive tokens and OTPs.
    -   CSRF protection and other standard web security practices are recommended.
-   **Comprehensive API:** A dedicated API for programmatic interaction, covering log ingestion, user authentication, application lifecycle management, and API secret retrieval.
-   **Dynamic Web Interface:** The `ViewController` leverages **Pug** for server-side templating, **Tailwind CSS** for styling, and **HTMX** to provide a responsive and interactive user experience without requiring a full-fledged frontend framework.
-   **Environment Configuration**: Managed using `dotenv`.

## Prerequisites

-   Node.js (v16 or higher recommended)
-   npm or yarn
-   MongoDB instance (v4.4 or higher recommended)
-   Redis instance
-   PostCSS CLI (for Tailwind CSS, if modifying styles: `npm install -g postcss-cli`)
-   Mailgun account (for sending OTP and other emails).

## Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd chatterbox
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    # or
    yarn install
    ```

3.  **Create a `.env` file** in the root directory and configure the following variables:
    ```dotenv
    # Application Port
    PORT=3005
    WORKER_PORT=3805 # Port for Bull Board or other worker-related services if separate

    # Database Configuration
    DB_NAME=chatterbox_db
    DB_URL=mongodb://localhost:27017 # Your MongoDB connection string

    # Redis Configuration (for BullMQ)
    REDIS_PORT=6379
    REDIS_HOSTNAME=localhost
    REDIS_USERNAME=default # Or your Redis username if ACLs are enabled
    REDIS_PASSWORD= # Your Redis password if set
    # Alternatively, provide a full Redis URL:
    # REDIS_URL=redis://your_user:your_password@your_host:your_port

    # Session Management
    SESSION_SECRET=your_very_strong_and_random_session_secret_here

    # Email Configuration (Mailgun)
    MAILGUN_API_KEY=your_mailgun_api_key
    MAILGUN_DOMAIN=your_mailgun_domain # e.g., mg.yourdomain.com
    MAILGUN_SENDER="Chatterbox <noreply@your_mailgun_domain.com>" # Sender email address

    # Base URL (Optional, but can be useful for generating absolute links if needed)
    # BASE_URL=http://localhost:3005
    ```

4.  **Initialize the database schema** (if using MikroORM migrations or schema tool):
    ```bash
    npx mikro-orm schema:update --run
    # or refer to your project's specific MikroORM scripts in package.json
    # The provided `npm run init-db` (if available) might handle this or seed data.
    ```

5.  **Build Tailwind CSS** (if not automatically handled by dev script for initial setup):
    ```bash
    npm run tailwind:css
    ```

## Running the Application

1.  **Start the development server:**
    ```bash
    npm run start:dev
    ```
    This script typically compiles Tailwind CSS, watches TypeScript files, and restarts the server on changes. The application will usually run on `http://localhost:3005` (or the `PORT` specified in your `.env` file).

2.  **Build for production:**
    ```bash
    npm run build
    ```
    This script compiles TypeScript and builds the production Tailwind CSS.

3.  **Start in production mode:**
    ```bash
    npm run start
    ```
    This starts the application using the pre-built files from the `dist` directory. Ensure you have run `npm run build` first.

## Workflow / How to Use

### Web Interface (UI)

1.  **User Login:**
    -   Navigate to the application's web interface (e.g., `http://localhost:3005`).
    -   Use the login page (`/login`) to enter your email. This registers/identifies you and prepares for app-specific OTP access.
2.  **Application Management:**
    -   After providing your email, you'll be presented with a list of your applications or an option to create a new one.
    -   **Create New App:** If you create a new application, it will be registered under your email.
    -   **Select Existing App:** When you select an existing application (or after creating a new one), an OTP will be sent to your registered email address.
3.  **OTP Verification (UI):**
    -   Enter the OTP received via email into the provided form.
    -   Successful verification grants you access to the selected application's log dashboard.
4.  **Viewing Logs & API Key (UI):**
    -   Browse, search, and filter your application's logs.
    -   You can view the (masked) API Secret for your application via a "View SecKey" or similar button, which may involve re-authentication or uses the current session.

### Programmatic API Secret Retrieval

1.  **Initiate Login:**
    -   `POST /api/users/login` with your `{ "email": "user@example.com" }`.
    -   Response will include a `loginToken` and `existingApps`. Store the `loginToken`.
2.  **Request OTP for an App:**
    -   `GET /api/users/apps?appName=YourRegisteredAppName&loginToken=your_login_token`
    -   This will trigger an OTP to be sent to `user@example.com`.
3.  **Submit OTP to Get API Secret:**
    -   Once you receive the OTP via email:
    -   `POST /api/users/otp` with `{ "email": "user@example.com", "otp": "123456", "appName": "YourRegisteredAppName" }`.
    -   Successful response will include the `apiSecret` for "YourRegisteredAppName". Securely store this `apiSecret`.

### Sending Logs (API)

-   Your external application will use the `appName` and the retrieved `apiSecret`.
-   Make `POST` requests to the `/api/logs` endpoint of Chatterbox, including the `apiSecret` for authentication (typically in `x-api-key` header) and `appName` in the log payload.

### Monitoring Background Jobs (Admin UI)
-   Navigate to `/worker/admin` to access the Bull Board dashboard and monitor background queues (e.g., email sending).

## API Documentation

The API allows for programmatic interaction with Chatterbox.

### Authentication

-   **Log Ingestion Endpoints** (e.g., `/api/logs`): Require an API Secret passed in an `x-api-key` header or as `apiSecret` in the request body.
-   **User & Application Management APIs**: Involve a multi-step process:
    1.  Email submission (`/api/users/login`) to get a `loginToken`.
    2.  Requesting OTP for a specific app (`/api/users/apps`) using the `loginToken`.
    3.  OTP submission (`/api/users/otp`) to complete an operation or retrieve an API secret.

### Key API Endpoints

#### Log Ingestion

-   **`POST /api/logs`**: Submit a single log entry.
    -   **Authentication**: `x-api-key: YOUR_APP_API_SECRET` (header) or `apiSecret` in payload.
    -   **Body Example**:
        ```json
        {
          "log": {
            "level": "info",
            "name": "UserLoginAttempt",
            "context": { "userId": "123", "ip": "192.168.1.100" },
            "time": "2025-05-10T20:00:00.000Z",
            "data": { "customField": "sensitive data here, will be encrypted" },
            "key": "AUTH_EVENT",
            "appName": "YourRegisteredAppName"
          }
        }
        ```
    -   **Success Response (`200 OK`)**: `{ "success": true, "message": "Logged succesfully" }`
-   **`POST /api/logs/bulk`**: Submit multiple log entries.
    -   **Body Example**: `{ "logs": [ /* array of log objects */ ] }`

#### User & Application Management

-   **`POST /api/users/login`**: Initiate user login process.
    -   **Body**: `{ "email": "user@example.com" }`
    -   **Success Response (`201 CREATED`)**:
        ```json
        {
          "success": true,
          "message": "User: user@example.com OTP sent successfully", // Note: OTP is sent on next step typically
          "loginToken": "a_temporary_login_token_for_otp_step",
          "existingApps": [ { "appName": "App1" }, { "appName": "App2" } ]
        }
        ```
-   **`GET /api/users/apps`**: Triggers an OTP send for a specific application, required to proceed with operations like getting an API secret.
    -   **Query Parameters**: `appName=YourRegisteredAppName`, `loginToken=your_login_token`
    -   **Success Response (`201 CREATED`)**:
        ```json
        {
          "success": true,
          "message": "OTP for Application: YourRegisteredAppName has been sent"
        }
        ```
-   **`POST /api/users/otp`**: Verify OTP to complete login for an app context and retrieve the API secret.
    -   **Body**: `{ "email": "user@example.com", "otp": "123456", "appName": "YourRegisteredAppName" }`
    -   **Success Response (`200 OK`)**:
        ```json
        {
          "success": true,
          "message": "OTP success...",
          "apiSecret": "the_api_secret_for_the_specified_app"
        }
        ```
-   **`POST /api/users/apps`**: Create a new application programmatically. Requires prior user identification (e.g., valid `loginToken` or session if adapted).
    -   **Body**: `{ "email": "user@example.com", "appName": "NewWebApp", "expiresIn": 31536000 }`
    -   **Success Response (`201 CREATED`)**:
        ```json
        {
          "success": true,
          "message": "Application: NewWebApp has been successfully created & authorized",
          "apiSecret": "newly_generated_api_secret"
        }
        ```
-   **`POST /api/apps/authorize`**: Authorizes an application and returns an API secret. This might be used for re-authorization or specific admin flows. Requires appropriate authentication.
    -   **Body**: `{ "email": "user@example.com", "appName": "YourRegisteredAppName" }`
    -   **Success Response (`201 CREATED`)**:
        ```json
        {
          "success": true,
          "message": "Application: YourRegisteredAppName has been successfully authorized",
          "apiSecret": "api_secret_for_the_app"
        }
        ```
-   **`POST /api/apps/verify`**: Verify the validity of an API secret.
    -   **Body**: `{ "appName": "YourRegisteredAppName", "apiSecret": "secret_to_verify" }`
    -   **Success Response (`200 OK`)**: `{ "success": true, "message": "API secret is valid" }`
-   **`POST /api/apps/revoke`**: Revoke (disable) an application's API key.
    -   **Body**: `{ "appName": "YourRegisteredAppName" }` (Requires authentication to prove ownership/authority).
    -   **Success Response (`200 OK`)**: `{ "success": true, "message": "Application: YourRegisteredAppName has been revoked" }`

*(Note: API details depend on specific controller implementations and authentication strategies for management endpoints.)*

## Project Structure

-   **`app/`**: Core application logic.
    -   **`config/`**: Configuration files (e.g., `db.ts`, `config.ts`, `constants.ts`).
    -   **`controllers/`**: Handles HTTP requests and responses.
        -   `api.controller.ts`: JSON-based API endpoints.
        -   `view.controller.ts`: HTML-based web interface using Pug and HTMX.
        -   `services.ts`: Shared business logic for controllers.
    -   **`db/`**: MikroORM entity definitions (e.g., `AppKey.ts`, `Log.ts`, `User.ts`, `OTP.ts`). (Note: `db.ts` initializes ORM, entities are typically in `app/entities/`)
    -   **`entities/`**: MikroORM entity classes (e.g., `AppKey.ts`, `Log.ts`, `User.ts`, `OTP.ts`, `BaseEntity.ts`).
    -   **`middlewares/`**: Custom Express middleware (e.g., `auth.middleware.ts`).
    -   **`queue/`**: BullMQ queue services and worker handlers.
    -   **`services/`**: (If distinct from `app/controllers/services.ts`) Contains business logic.
        -   `email/` (example location): Contains email sending logic like `otpEmail.service.ts`, `sendEmail.handler.ts`.
    -   **`utils/`**: Utility functions (e.g., `security.util.ts`, `validate.util.ts`).
    -   **`interfaces/`**: TypeScript interface definitions.
-   **`views/`**: Pug template files.
    -   **`assets/`**: Static assets (e.g., SVGs).
    -   **`email/`**: Pug templates for emails (e.g., `otp.ejs`, `welcome.ejs`).
    -   **`js/`**: Client-side JavaScript (if any beyond HTMX).
    -   **`styles/`**:
        -   `tailwind.css`: Input file for Tailwind CSS.
        -   `style.css`: Output CSS file generated by PostCSS.
-   **`index.ts`**: Main application entry point (typically at the root or `src/`).
-   **`mikro-orm.config.ts`**: Root configuration for MikroORM.
-   **`.env`**: Environment variable configuration.
-   **`package.json`**: Project dependencies and scripts.
-   **`postcss.config.js`** (likely): Configuration for PostCSS (for Tailwind CSS).
-   **`tailwind.config.js`** (likely): Configuration for Tailwind CSS.
-   **`tsconfig.json`**: TypeScript compiler options.

## Technology Stack

-   **Backend Framework:** Node.js, Express.js
-   **Language:** TypeScript
-   **Database ORM:** MikroORM (with MongoDB driver)
-   **Database:** MongoDB
-   **Web Interface Templating:** Pug
-   **CSS Framework:** Tailwind CSS (via PostCSS)
-   **Dynamic UI Enhancements:** HTMX
-   **Background Queues:** BullMQ
-   **Queue Datastore:** Redis
-   **Queue Monitoring:** Bull Board
-   **Email Sending:** Nodemailer with Mailgun (`nodemailer-mailgun-transport`)
-   **Authentication & Session:** `express-session` with `connect-mongo` store, Custom API Key/Secret logic, OTP generation & email verification.
-   **Data Validation:** Zod
-   **Security Utilities:** Hashing functions for tokens/OTPs, custom encryption for log data.
-   **Environment Management:** `dotenv`

## Scripts (from `package.json`)

-   `npm run start`: Starts the production server (requires prior build: `node dist/index.js`).
-   `npm run build`: Compiles TypeScript and builds Tailwind CSS for production (`npm run tailwind:css && tsc`).
-   `npm run start:dev`: Starts the development server with Tailwind CSS compilation, TypeScript watching, and auto-restart on changes (`npm run tailwind:css && tsc-watch --onSuccess "node dist/index.js"`).
-   `npm run start:prod`: Builds and starts the application (`tsc && node dist/index.js`). Similar to `npm run build && npm run start`.
-   `npm run tailwind:css`: Compiles Tailwind CSS using PostCSS (`postcss views/styles/tailwind.css -o views/styles/style.css`).

## License

This project is licensed under the MIT License.
