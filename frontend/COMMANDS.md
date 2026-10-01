# Frontend Commands and Operational Guide

All commands in this guide are intended to be executed from the `frontend/` directory:
`d:\StreamingRoom\frontend`

---

## 1. Environment Configuration

Copy the example environment configuration to create your active `.env` file:

On Windows (PowerShell):
```powershell
Copy-Item .env.example .env
```

On Linux or macOS:
```bash
cp .env.example .env
```

Configure backend API and WebSocket endpoints in `.env`:
```env
VITE_API_BASE_URL="http://localhost:8000/api/v1"
VITE_WS_BASE_URL="ws://localhost:8000/ws/rooms"
```

---

## 2. Dependency Installation

Install all required frontend dependencies (React 18, Vite, Hls.js, Dash.js, Lucide-React, TypeScript):

```bash
npm install
```

To audit installed packages:
```bash
npm audit
```

---

## 3. Running the Development Server

Start the local Vite development server with Hot Module Replacement (HMR):

```bash
npm run dev
```

By default, the application is accessible at:
`http://localhost:5173`

To expose the development server to your local network (e.g. for testing on phones/tablets):
```bash
npm run dev -- --host
```

---

## 4. Building for Production

Compile TypeScript, bundle CSS, optimize JavaScript assets, and generate the production distribution folder (`dist/`):

```bash
npm run build
```

This executes:
1. `tsc -b`: Type-checks the entire TypeScript codebase.
2. `vite build`: Tree-shakes, minimizes, and generates chunked production assets.

---

## 5. Previewing the Production Build

Serve the compiled production distribution locally to verify production performance:

```bash
npm run preview
```

By default, the preview server will launch at:
`http://localhost:4173`
