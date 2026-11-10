# AfterBody 웹 서비스 이미지 — 엔진 + API + 화면을 한 컨테이너에서 제공
# 실행 데이터(DB·모델·화면)는 GitHub Releases 의 afterbody-runtime.zip 에서 빌드 시 내려받는다.
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    LOKY_MAX_CPU_COUNT=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY engine ./engine
COPY api ./api
COPY scripts/fetch_runtime.py ./scripts/fetch_runtime.py

ARG RUNTIME_URL=https://github.com/dndgnl1357-max/AfterBody/releases/latest/download/afterbody-runtime.zip
RUN python scripts/fetch_runtime.py "$RUNTIME_URL"

# 서버에는 아무것도 저장하지 않음 (사용자 입력·사진 미보관)
RUN useradd --create-home app && chown -R app /app
USER app

EXPOSE 8000
CMD ["sh", "-c", "uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
