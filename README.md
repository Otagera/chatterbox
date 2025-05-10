# Chatterbox

Chatterbox is a Node.js application designed for robust and secure log management. It provides a web interface for viewing and managing logs, users, and applications, alongside a comprehensive API for programmatic log ingestion and administrative tasks. Built with TypeScript, it utilizes MikroORM for database interactions (MongoDB), Express for handling HTTP requests, and HTMX for a dynamic user experience in the web UI.

## Key Features

-   **Secure Log Ingestion (API):** Applications can send logs via a secure API endpoint (`POST /api/logs`), authenticated with unique API Secrets.
-   **Advanced Log Viewing & Management (Web UI):**
    -   Near real-time log display with updates powered by HTMX.
    -   Efficient pagination for Browse large volumes of logs.
    -   Powerful log searching and filtering (by level, custom key, date range).
    -   Expandable log entries to view detailed, decrypted log data.
-   **User Management:**
    -   User login via email.
    -   OTP (One-Time Password) based authentication for accessing specific application contexts within the UI.
-   **Application Management (Web UI & API):**
    -   Users can create, view, and manage multiple logging applications.
    -   Secure generation and retrieval of API Secrets for each application.
    -   Ability to revoke or disable application access.
-   **Robust Security:**
    -   API authentication using per-application API Secrets.
    -   Encryption of sensitive log data at rest, tied to the specific application.
    -   Session-based authentication for the web interface (`express-session`).
    -   CSRF protection and other standard web security practices are recommended (though not explicitly detailed in provided code snippets).
-   **Comprehensive API:** A dedicated API for programmatic interaction, covering log ingestion, user authentication, and application lifecycle management.
-   **Dynamic Web Interface:** The `ViewController` leverages HTMX to provide a responsive and interactive user experience without requiring a full-fledged frontend framework.
-   **Environment Configuration**: Managed using `dotenv`.

## Prerequisites

-   Node.js (v16 or higher recommended)
-   npm or yarn
-   MongoDB instance (v4.4 or higher recommended)

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

    # Database Configuration
    DB_NAME=chatterbox_db
    DB_URL=mongodb://localhost:27017 # Your MongoDB connection string

    # Session Management
    SESSION_SECRET=your_very_strong_and_random_session_secret_here

    # OTP & Email Configuration (Example - adjust based on your setup)
    # If sending OTPs via email:
    # EMAIL_HOST=smtp.example.com
    # EMAIL_PORT=587
    # EMAIL_USER=your_email_user
    # EMAIL_PASS=your_email_password
    # EMAIL_FROM="Chatterbox <noreply@example.com>"
    # If using a shared secret for OTP generation (less common for email OTPs directly):
    # OTP_SHARED_SECRET=your_strong_otp_shared_secret

    # Base URL (Optional, but can be useful for generating absolute links if needed)
    # BASE_URL=http://localhost:3005
    ```

4.  **Initialize the database schema** (if using MikroORM migrations or schema tool):
    ```bash
    npx mikro-orm schema:update --run
    # or refer to your project's specific MikroORM scripts in package.json
    # The provided `npm run init-db` might handle this or seed data.
    ```
    If `npm run init-db` is for seeding or a specific setup, ensure schema is created.

## Running the Application

1.  **Start the development server:**
    ```bash
    npm run dev
    ```
    The application will typically run on `http://localhost:3005` (or the `PORT` specified in your `.env` file).

2.  **Build for production:**
    ```bash
    npm run build
    ```

3.  **Start in production mode:**
    ```bash
    npm run start
    ```

## Workflow / How to Use

1.  **User Registration/Login (UI):**
    -   Navigate to the application's web interface (e.g., `http://localhost:3005`).
    -   Use the login page (`/login`) to enter your email. This initiates the OTP process.
2.  **Application Creation (UI):**
    -   Once logged in and your email is verified (implicitly via the login token process), you can navigate to a section to manage your applications.
    -   Create a new application, giving it a unique name.
    -   The system will generate an `appName` and an `apiSecret` for this application. Securely store the `apiSecret`.
3.  **Sending Logs (API):**
    -   Your external application (the one you want to collect logs from) will use the generated `appName` and `apiSecret`.
    -   It will make `POST` requests to the `/api/logs` endpoint of Chatterbox, including the `apiSecret` for authentication and `appName` in the log payload.
4.  **Viewing Logs (UI):**
    -   Return to the Chatterbox web interface.
    -   Select the application for which you want to view logs.
    -   If required for the specific app context, you might undergo an OTP verification.
    -   Browse, search, and filter your application's logs.

## API Documentation

The API allows for programmatic interaction with Chatterbox.

### Authentication

-   **Log Ingestion Endpoints** (e.g., `/api/logs`): Require an API Secret. This should typically be passed in an `x-api-key` header or as `apiSecret` in the request body (as supported by the `authMiddleware`).
-   **User & Application Management APIs**: Often involve a two-step process:
    1.  Initiate with email to get a `loginToken` (e.g., `/api/users/login`).
    2.  Use the `loginToken` along with an OTP to perform actions or gain further access (e.g., `/api/users/otp`).

### Key API Endpoints

#### Log Ingestion

-   **`POST /api/logs`**: Submit a single log entry.
    -   **Authentication**: `x-api-key: YOUR_APP_API_SECRET` (header) or `apiSecret` in the log payload's root if `authMiddleware` checks body.
    -   **Body Example**:
        ```json
        {
          "log": {
            "level": "info",
            "name": "UserLoginAttempt",
            "context": { "userId": "123", "ip": "192.168.1.100" },
            "time": "2025-05-10T20:00:00.000Z", // ISO 8601 Date string or Unix timestamp
            "data": { "customField": "sensitive data here, will be encrypted" }, // Can also be a string
            "key": "AUTH_EVENT", // A general category for the log
            "appName": "YourRegisteredAppName"
            // "apiSecret": "YOUR_APP_API_SECRET" // If passing secret in body
          }
        }
        ```
    -   **Success Response (`200 OK`)**:
        ```json
        {
          "success": true,
          "message": "Logged succesfully"
        }
        ```
-   **`POST /api/logs/bulk`**: Submit multiple log entries in an array.
    -   **Body Example**: `{ "logs": [ /* array of log objects similar to above */ ] }`

#### User & Application Management

-   **`POST /api/users/login`**: Initiate user login process.
    -   **Body**: `{ "email": "user@example.com" }`
    -   **Success Response (`201 CREATED`)**:
        ```json
        {
          "success": true,
          "message": "User: user@example.com OTP sent successfully",
          "loginToken": "a_temporary_login_token_for_otp_step",
          "existingApps": [ { "appName": "App1" }, { "appName": "App2" } ]
        }
        ```
-   **`POST /api/users/otp`**: Verify OTP to complete login for an app context or an operation, and potentially retrieve an API secret.
    -   **Body**: `{ "email": "user@example.com", "otp": "123456", "appName": "YourRegisteredAppName" }` (Ensure `loginToken` is implicitly handled or passed if required by the service).
    -   **Success Response (`200 OK`)**:
        ```json
        {
          "success": true,
          "message": "OTP success...",
          "apiSecret": "the_api_secret_for_the_specified_app"
        }
        ```
-   **`POST /api/users/apps`**: Create a new application programmatically.
    -   **Body**: `{ "email": "user@example.com", "appName": "NewWebApp", "expiresIn": 31536000 }` (Requires prior authentication/valid session or token proving user identity).
    -   **Success Response (`201 CREATED`)**:
        ```json
        {
          "success": true,
          "message": "Application: NewWebApp has been successfully created & authorized",
          "apiSecret": "newly_generated_api_secret"
        }
        ```
-   **`GET /api/users/apps?appName=YourRegisteredAppName&loginToken=...`**: Request OTP for logging into an existing application context.
    -   **Success Response (`201 CREATED`)**:
        ```json
        {
          "success": true,
          "message": "OTP for Application: YourRegisteredAppName has been sent"
        }
        ```
-   **`POST /api/apps/verify`**: Verify the validity of an API secret.
    -   **Body**: `{ "appName": "YourRegisteredAppName", "apiSecret": "secret_to_verify" }`
    -   **Success Response (`200 OK`)**: `{ "success": true, "message": "API secret is valid" }`
-   **`POST /api/apps/revoke`**: Revoke (disable) an application's API key.
    -   **Body**: `{ "appName": "YourRegisteredAppName" }` (Requires authentication to prove ownership/authority).
    -   **Success Response (`200 OK`)**: `{ "success": true, "message": "Application: YourRegisteredAppName has been revoked" }`

*(Note: Some API details regarding token handling for user/app management might require further clarification from the implementation of `authorizeService` and `OTPService`.)*

## Project Structure

-   **`app/`**: Core application logic.
    -   **`controllers/`**: Handles HTTP requests and responses.
        -   `api.controller.ts`: Endpoints for programmatic access (JSON-based).
        -   `view.controller.ts`: Endpoints for the web interface (HTML-based, uses EJS/other templates and HTMX).
        -   `services.ts`: Contains shared business logic for controllers (e.g., OTP generation/validation, login services, app authorization).
    -   **`db/`**: Database connection, schema, and entity definitions.
        -   `index.ts`: Main database setup and MikroORM initialization.
        -   `entities/`: MikroORM entity classes (e.g., `AppKey.ts`, `Log.ts`, `User.ts`).
    -   **`middlewares/`**: Custom Express middleware functions (e.g., `auth.middleware.ts` for API key and session validation).
    -   **`utils/`**: Utility functions and helpers (e.g., `security.util.ts` for encryption/hashing, `validate.util.ts` for Zod validation, `error.util.ts` for custom errors).
    -   **`interfaces/`**: TypeScript interface definitions (e.g., `ILog.ts`).
-   **`views/`**: Template files (e.g., EJS, Pug, Handlebars) used by `view.controller.ts`.
    -   **`assets/`**: Static assets like SVGs, CSS stylesheets, client-side JavaScript.
-   **`index.ts`**: Main entry point of the application. Initializes Express, sets up middleware, and starts the server.
-   **`.env`**: Environment variable configuration file.
-   **`mikro-orm.config.ts`**: Configuration for MikroORM.
-   **`package.json`**: Project dependencies and scripts.
-   **`tsconfig.json`**: TypeScript compiler options.

## Technology Stack

-   **Backend Framework:** Node.js, Express.js
-   **Language:** TypeScript
-   **Database ORM:** MikroORM (with MongoDB driver)
-   **Database:** MongoDB
-   **Web Interface Templating:** EJS (or specify if different, e.g., Pug, Handlebars)
-   **Dynamic UI Enhancements:** HTMX
-   **Authentication & Session:** `express-session`, Custom API Key/Secret logic, OTP generation
-   **Data Validation:** Zod
-   **Security Utilities:** `bcrypt` (likely for hashing tokens/passwords if any), custom encryption logic for log data.
-   **Environment Management:** `dotenv`

## Scripts

-   `npm run start`: Start the production server from the compiled JavaScript code.
-   `npm run build`: Compile TypeScript code to JavaScript (typically to a `dist` folder).
-   `npm run start:dev`: Start the development server with hot-reloading (e.g., using `tsc-watch`).
-   `npm run start:prod`: Build and start the development server with hot-reloading (e.g., using `tsc`).
-   `npm run init-db`: Custom script for database initialization/seeding (if defined).

## License

This project is licensed under the MIT License.