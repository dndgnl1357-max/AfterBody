@echo off
chcp 65001 >nul
rem AfterBody 실행: API 서버(8000) + 화면(5173)을 띄우고 브라우저를 엽니다.
cd /d %~dp0
start "AfterBody API" cmd /k python -m uvicorn api.main:app --port 8000
cd web
if not exist node_modules call npm install
start "AfterBody Web" cmd /k npm run dev
timeout /t 5 >nul
start http://localhost:5173
