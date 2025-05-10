# Chatterbox

This is a Node.js application built with TypeScript. It uses MikroORM for database management, Express for handling HTTP requests, and dotenv for environment variable management.

## Features

- **Database Management**: Powered by MikroORM with MongoDB support.
- **Session Management**: Uses `express-session` for handling user sessions.
- **Controllers**: Organized into `ViewController` and `APIController` for handling different types of requests.
- **Environment Configuration**: Managed using `dotenv`.

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- MongoDB instance

## Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd <repository-folder>
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a .env file in the root directory and configure the following variables:
   ```bash
   PORT=3005
   DB_NAME=<db-name>
   DB_URL=<your-mongodb-connection-string>
   ```
4. Initialize the database:
   ```bash
   npm run init-db
   ```
## Running the Application
Start the development server:
```bash
npm run dev
```

The application will run on `http://localhost:3005` by default.

## Project Structure
- **app/controllers**: Contains `ViewController` and `APIController` for handling routes and logic.
- **app/db**: Contains database initialization logic.
- **index.ts**: Entry point of the application.
- 
## Scripts
`npm run dev`: Start the development server.
`npm run build`: Compile TypeScript to JavaScript.
`npm start`: Start the production server.

## License
This project is licensed under the MIT License.
Feel free to customize this further based on your application's specific details.