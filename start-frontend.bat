@echo off
REM Start frontend development server (Windows)

echo Starting Shadow Puppet Frontend...
cd frontend
call npm install
call npm run dev
