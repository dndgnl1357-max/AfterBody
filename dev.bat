@echo off
chcp 65001 >nul
rem 개발 모드: 코드 고치면 바로 반영 (Node.js 필요) - API 8000 + 화면 5173
cd /d %~dp0
start "AfterBody API" cmd /k python -m uvicorn api.main:app --port 8000 --reload
cd web
if not exist node_modules call npm install
start "AfterBody Web" cmd /k npm run dev
timeout /t 5 >nul
start http://localhost:5173
