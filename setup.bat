@echo off
chcp 65001 >nul
rem AfterBody 설치 (처음 한 번): 파이썬 패키지 + 실행 데이터(DB·모델·화면) 풀기
cd /d %~dp0
where python >nul 2>nul
if errorlevel 1 (
  echo [!] Python 이 없습니다. https://www.python.org/downloads/ 에서 3.11 이상 설치
  echo     설치 첫 화면에서 "Add python.exe to PATH" 를 꼭 체크하세요.
  pause & exit /b 1
)
echo [1/2] 파이썬 패키지 설치 중...
python -m pip install -r requirements.txt
if errorlevel 1 ( echo [!] 패키지 설치 실패 & pause & exit /b 1 )
echo [2/2] 실행 데이터 풀기...
if not exist runtime\afterbody-runtime.zip ( echo [!] runtime\afterbody-runtime.zip 이 없습니다. 저장소를 다시 받아 주세요 & pause & exit /b 1 )
tar -xf runtime\afterbody-runtime.zip
if errorlevel 1 ( echo [!] 압축 풀기 실패 & pause & exit /b 1 )
echo.
echo 설치 완료! 이제 start.bat 을 더블클릭하세요.
pause
