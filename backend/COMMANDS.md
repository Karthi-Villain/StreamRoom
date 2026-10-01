# Backend Commands and Operational Guide

All commands in this guide are intended to be executed from the `backend/` directory:
`d:\StreamingRoom\backend`

---

## 1. Environment Setup

### Create Python Virtual Environment (Optional but Recommended)

On Windows (PowerShell):
```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

On Windows (Command Prompt):
```cmd
python -m venv venv
venv\Scripts\activate.bat
```

On Linux or macOS (Bash/Zsh):
```bash
python3 -m venv venv
source venv/bin/activate
```

---

## 2. Dependency Installation

Install all required packages (FastAPI, Uvicorn, SQLAlchemy, Argon2-cffi, WebSockets, HTTPX, BeautifulSoup4, Pytest, Python-dotenv):

```bash
pip install -r requirements.txt
```

Verify installed packages:
```bash
pip list
```

---

## 3. Environment Configuration

Copy the example environment configuration to create your active `.env` file:

On Windows (PowerShell):
```powershell
Copy-Item .env.example .env
```

On Linux/macOS:
```bash
cp .env.example .env
```

### Database Switching
To use SQLite (Default):
```env
DATABASE_URL="sqlite:///./streamroom.db"
```

To use PostgreSQL:
```env
DATABASE_URL="postgresql://username:password@localhost:5432/streamroom_db"
```

To use MySQL:
```env
DATABASE_URL="mysql+pymysql://username:password@localhost:3306/streamroom_db"
```

---

## 4. Running the Development Server

### Option A: Using the Runner Script
```bash
python run.py
```

### Option B: Using Direct Uvicorn CLI
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Once running, access:
- Interactive Swagger API Documentation: `http://localhost:8000/docs`
- Redoc API Documentation: `http://localhost:8000/redoc`
- System Health Check: `http://localhost:8000/health`

---

## 5. Running Automated Tests

Run the complete test suite:
```bash
pytest -v
```

Run tests with standard output printing enabled:
```bash
pytest -v -s
```

Run a specific test file:
```bash
pytest tests/test_api.py -v
```

---

## 6. Running Production Server

To run the application with multi-worker concurrency in a production environment:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4 --proxy-headers
```
