# Metro Industrial CRM - Backend API

Backend REST API for Metro Industrial CRM built with Node.js, Express, TypeScript, PostgreSQL, and Prisma ORM.

---

## 🛠️ Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: PostgreSQL
- **ORM**: Prisma ORM
- **API Documentation**: Swagger / OpenAPI (`swagger-ui-express`)
- **Security & Utilities**: Helmet, CORS, dotenv

---

## 📁 Project Structure

```text
metro-industrial-crm-backend/
├── prisma/
│   └── schema.prisma         # Prisma schema and datasource definition
├── src/
│   ├── config/
│   │   ├── database.ts       # Prisma Client instance & connection verifier
│   │   ├── env.ts            # Typed environment variables
│   │   └── swagger.ts        # OpenAPI / Swagger UI configuration
│   ├── middleware/
│   │   └── error.middleware.ts # 404 & global error handling
│   ├── modules/
│   │   └── health/
│   │       ├── health.controller.ts # Health check controller (API & DB status)
│   │       └── health.routes.ts     # Health module route definitions
│   ├── routes/
│   │   └── index.ts          # Central v1 route aggregator (/api/v1)
│   ├── app.ts                # Express app setup & middleware stack
│   └── server.ts             # Application entrypoint & HTTP server
├── tests/                    # Unit and integration tests
├── .env.example              # Environment variables template
├── package.json              # Project dependencies and npm scripts
├── tsconfig.json             # TypeScript compiler configuration
└── README.md                 # Project documentation
```

---

## ⚙️ Environment Setup

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Configure the required environment variables in `.env`:
   ```env
   # Server Configuration
   PORT=5000
   NODE_ENV=development

   # Database Configuration (PostgreSQL with Prisma)
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/metro_crm?schema=public"
   ```

---

## 🗄️ Database Setup

1. Ensure a PostgreSQL instance is running and accessible using the `DATABASE_URL` specified in your `.env` file.
2. Generate the Prisma Client:
   ```bash
   npm run prisma:generate
   ```
3. Run migrations to sync the schema (when migrations are added):
   ```bash
   npm run prisma:migrate
   ```

---

## 🚀 Running the Project

### 1. Install Dependencies
```bash
npm install
```

### 2. Run in Development Mode
```bash
npm run dev
```

### 3. Build for Production
```bash
npm run build
```

### 4. Run Production Build
```bash
npm start
```

---

## 🐳 Docker Deployment

To build and run both the backend and PostgreSQL database using Docker Compose:

```bash
# Start all services with build in detached mode
docker compose up --build -d

# View service logs
docker compose logs -f

# Stop all services
docker compose down
```

---

## 🌐 API Endpoints & Documentation

- **Base URL**: `http://localhost:5000/api/v1`
- **Health Check API**: [http://localhost:5000/api/v1/health](http://localhost:5000/api/v1/health)
  - Method: `GET`
  - Response:
    ```json
    {
      "success": true,
      "message": "Metro CRM API is running",
      "database": "connected"
    }
    ```
- **Interactive Swagger Documentation**: [http://localhost:5000/api/docs](http://localhost:5000/api/docs)
