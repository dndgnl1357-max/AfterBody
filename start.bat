@echo off
chcp 65001 >nul
rem AfterBody 실행: http://localhost:8000 (창을 닫으면 종료)
cd /d %~dp0
if not exist data\runtime.db if not exist data\nutrition.db (
  echo 먼저 setup.bat 을 실행해 주세요.
  pause & exit /b 1
)
if not exist web\dist\index.html (
  echo 화면 파일이 없습니다. setup.bat 을 다시 실행해 주세요.
  pause & exit /b 1
)
start "" cmd /c "timeout /t 4 >nul & start http://localhost:8000"
python -m uvicorn api.main:app --port 8000
