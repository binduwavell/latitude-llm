# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Essential Commands
- `pnpm install` - Install dependencies
- `pnpm catchup` - Full setup: install, build packages, and run migrations
- `pnpm dev` - Start development servers
- `pnpm build` - Build all packages
- `pnpm test` - Run tests across all packages
- `pnpm lint` - Run ESLint across all packages
- `pnpm tc` - Run TypeScript compiler checks
- `pnpm prettier` - Format code with Prettier
- `pnpm console` - Start interactive REPL with database access

### Database Operations (from packages/core)
- `pnpm db:generate` - Generate migrations after model changes
- `pnpm db:migrate` - Run migrations
- `pnpm db:studio` - Open Drizzle Studio on port 3003
- `pnpm db:drop` - Drop database

### Testing
- `pnpm test` - Run all tests
- `pnpm test:watch` - Run tests in watch mode
- Individual package tests: `pnpm test --filter web` or `pnpm test --filter core`

### Development Environment

There are two ways to run the development environment:

#### Option 1: Full Containerized Setup (Recommended for Production-like Environment)

**Prerequisites:**
- Create external Docker network: `docker network create web`
- Copy `.env.example` to `.env` and configure as needed

**Commands:**
```bash
docker compose --profile development --profile local -f docker-compose.local.yml up -d
```

**Access Points:**
- **Web Application**: `http://app.latitude.localhost`
- **API Gateway**: `http://gateway.latitude.localhost`
- **WebSocket Service**: `http://ws.latitude.localhost`
- **Traefik Dashboard**: `http://traefik.latitude.localhost`
- **Email Testing (Mailpit)**: `http://localhost:8025` (via workers service)

#### Option 2: Hybrid Development Setup (Recommended for Active Development)

**Prerequisites:**
- `pnpm install` - Install dependencies
- `pnpm catchup` - Build packages and run migrations

**Using Tmuxinator (Recommended):**
```bash
tmuxinator start
```

**Manual Setup:**
```bash
# Terminal 1: Start infrastructure services
docker compose up db redis mailpit

# Terminal 2: Start all applications
pnpm dev --filter='./apps/*'

# Terminal 3: Start packages in development mode
pnpm dev --filter='./packages/*'

# Terminal 4: Start workers (from apps/web directory)
cd apps/web && pnpm workers:watch

# Terminal 5: Database studio (optional)
cd packages/core && pnpm db:studio
```

**Access Points:**
- **Web Application**: `http://localhost:3000`
- **Database Studio**: `http://localhost:3003`
- **Email Testing (Mailpit)**: `http://localhost:8025`

## Architecture Overview

### Monorepo Structure
- **apps/**: Main applications
  - `web/` - Next.js 15 web application with React 19
  - `gateway/` - HonoJS API gateway
  - `workers/` - Background job processing
  - `websockets/` - Real-time WebSocket service
  - `console/` - Interactive REPL for database operations

- **packages/**: Shared libraries
  - `core/` - Core business logic, database models, and services
  - `web-ui/` - Shared UI components and design system
  - `compiler/` - PromptL language compiler
  - `constants/` - Shared constants and configurations
  - `env/` - Environment configuration management
  - `cli/` - Command-line interface tools
  - `sdks/` - TypeScript and Python SDKs

### Key Technologies
- **Frontend**: React 19, Next.js 15 (App Router), Tailwind CSS, Shadcn UI
- **Backend**: Node.js 22+, TypeScript, HonoJS, Drizzle ORM
- **Database**: PostgreSQL with Drizzle ORM
- **Queue/Cache**: Redis with BullMQ
- **Package Management**: pnpm with Turborepo
- **Testing**: Vitest
- **Containerization**: Docker with Docker Compose
- **Reverse Proxy**: Traefik (for containerized setup)

## Development Patterns

### Database Management
- **Never** write migrations by hand
- Modify models in `packages/core/src/schema/models/`
- Run `pnpm db:generate` to create migrations
- Run `pnpm db:migrate` to apply migrations
- Use Transaction abstraction for all write operations
- Services return Result abstraction for error handling

### Web Application (apps/web)
- **State Management**: Custom stores in `src/stores/`
- **Server Actions**: Use `useLatitudeAction` hook for write operations
- **Forms**: Use `useFormAction` (no react-hook-form)
- **UI Components**: Prefer components from `@latitude-data/web-ui`
- **Routing**: Next.js App Router with RSC where possible

### Core Services (packages/core)
- **Functional approach**: Each service is a pure function
- **Write operations**: Own service file, optional `db` parameter
- **Error handling**: Return Result abstraction
- **Transactions**: Use Transaction abstraction for consistency
- **Parameters**: Update/delete services receive model instances, not IDs

### Code Style
- **TypeScript**: Strict mode, prefer types over interfaces
- **Naming**: Descriptive names, event handlers prefixed with "handle"
- **Components**: Named exports, logical structure (exports, subcomponents, helpers, types)
- **No console.logs**: Unless explicitly requested
- **Comments**: Write only essential comments

### Testing
- **Framework**: Vitest with factories
- **Integration tests**: Minimal mocking
- **Structure**: Follow existing patterns in test files
- **Database**: Use test database with `pnpm db:migrate:test`

## Platform Features

### Core Components
- **Prompt Manager**: Version-controlled prompt development with PromptL
- **AI Gateway**: Deploy prompts as API endpoints
- **Evaluations**: LLM-as-judge, programmatic rules, human review
- **Datasets**: Test data management and batch evaluation
- **Logs & Observability**: Automatic interaction tracking
- **Integrations**: MCP servers, webhooks, triggers

### PromptL Language
- Custom DSL for prompts with variables, conditionals, loops
- Compiler in `packages/compiler/`
- Supports tool calls, chains, and advanced prompt patterns

### Authentication & Multi-tenancy
- Workspace-based organization
- User invitations and role management
- OAuth and magic link authentication

## Development Workflow

### Getting Started
1. `git clone` repository
2. `pnpm install` to install dependencies
3. Copy `.env.example` to `.env` if needed
4. Choose development setup (containerized or hybrid)
5. For containerized: `docker network create web` then run Docker Compose
6. For hybrid: `pnpm catchup` then use Tmuxinator or manual setup

### Making Changes
1. **Database changes**: Modify models → `pnpm db:generate` → `pnpm db:migrate`
2. **Code changes**: Follow TypeScript strict mode and existing patterns
3. **Testing**: Write tests following existing patterns
4. **Linting**: Run `pnpm lint` and `pnpm tc` before committing

### Package Dependencies
- Build shared packages first: `pnpm build --filter='./packages/**'`
- Dependencies flow: constants → env → core → web-ui → apps
- Use workspace references (e.g., `@latitude-data/core`)

## Environment Variables

Key variables for development:
- `APP_DOMAIN=latitude.localhost` - Base domain for Traefik routing
- `APP_URL=http://app.latitude.localhost` - Web application URL
- `DATABASE_URL=postgresql://latitude:secret@db:5432/latitude_production`
- `TRAEFIK_HOST=traefik.latitude.localhost` - Traefik dashboard URL
- `CACHE_HOST/PORT/PASSWORD` - Redis configuration
- `QUEUE_HOST/PORT/PASSWORD` - Redis queue configuration
- `GATEWAY_HOSTNAME/PORT` - API gateway configuration
- `NEXT_PUBLIC_POSTHOG_KEY` - Analytics (optional)
- `DISABLE_EMAIL_AUTHENTICATION` - Skip email verification

## Common Issues

- **Build failures**: Ensure shared packages are built first
- **Database errors**: Check migrations are applied
- **Type errors**: Run `pnpm tc` to check TypeScript
- **Test failures**: Ensure test database is migrated
- **Performance**: Use React Server Components, minimize client state
- **Traefik routing**: Ensure external `web` network exists for containerized setup
- **Domain resolution**: Add `*.latitude.localhost` entries to `/etc/hosts` if needed