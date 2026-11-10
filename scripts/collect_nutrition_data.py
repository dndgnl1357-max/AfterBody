"""
MediUp - 식품의약품안전처 공공데이터 영양성분 3종 API 수집 스크립트

수집 대상:
  - tn_pubr_public_nutri_material_info_api (원재료성 식품, dataCd=R)
  - tn_pubr_public_nutri_process_info_api  (가공식품, dataCd=P)
  - tn_pubr_public_nutri_food_info_api     (음식/외식, dataCd=D)

동작:
  1. 각 API를 numOfRows=1000 단위로 페이지네이션하며 전량 수집
  2. 원본 응답은 data/raw/<source>/page_%04d.json 으로 백업 저장
  3. 세 데이터셋을 통합 스키마로 data/nutrition.db (SQLite) 의 nutrition_items 테이블에 적재
     - dataCd 컬럼(D/P/R)으로 출처 구분
     - foodCd 가 전역 고유키 (D.../P.../R... 접두)
"""

import json
import os
import sqlite3
import time
import urllib.parse
import urllib.request
from pathlib import Path

BASE_DIR = Path(r"C:\mediup\data")
RAW_DIR = BASE_DIR / "raw"
DB_PATH = BASE_DIR / "nutrition.db"

def _load_service_key():
    """공공데이터포털 인증키: 환경변수 DATA_GO_KR_SERVICE_KEY 또는 저장소 루트 .env (git 제외)"""
    key = os.environ.get("DATA_GO_KR_SERVICE_KEY")
    env = Path(__file__).resolve().parent.parent / ".env"
    if not key and env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if line.startswith("DATA_GO_KR_SERVICE_KEY="):
                key = line.split("=", 1)[1].strip()
    if not key:
        raise SystemExit("DATA_GO_KR_SERVICE_KEY 가 없습니다. .env 파일 또는 환경변수에 설정하세요.")
    return key


SERVICE_KEY = _load_service_key()
NUM_OF_ROWS = 1000
REQUEST_DELAY_SEC = 0.5
# 연속 호출 중 서버가 이전 페이지를 재전송(캐시/스로틀링 추정)하는 경우가 있어,
# 새로 받은 페이지의 foodCd가 이미 수집한 항목과 이 비율 이상 겹치면 오염된 응답으로 보고 재시도한다.
DUPLICATE_OVERLAP_THRESHOLD = 0.3
STALE_RETRY_WAIT_SEC = 5
STALE_MAX_RETRIES = 8

SOURCES = [
    {
        "name": "material",
        "data_cd": "R",
        "url": "https://api.data.go.kr/openapi/tn_pubr_public_nutri_material_info_api",
    },
    {
        "name": "process",
        "data_cd": "P",
        "url": "https://api.data.go.kr/openapi/tn_pubr_public_nutri_process_info_api",
    },
    {
        "name": "food",
        "data_cd": "D",
        "url": "https://api.data.go.kr/openapi/tn_pubr_public_nutri_food_info_api",
    },
]

# 3개 API 응답 필드의 합집합 (없는 필드는 NULL로 저장)
COLUMNS = [
    "foodCd", "foodNm", "dataCd", "typeNm",
    "foodOriginCd", "foodOriginNm",
    "foodLv3Cd", "foodLv3Nm", "foodLv4Cd", "foodLv4Nm",
    "foodLv5Cd", "foodLv5Nm", "foodLv6Cd", "foodLv6Nm", "foodLv7Cd", "foodLv7Nm",
    "nutConSrtrQua", "enerc", "water", "prot", "fatce", "ash", "chocdf", "sugar",
    "fibtg", "ca", "fe", "p", "k", "nat",
    "vitaRae", "retol", "cartb", "thia", "ribf", "nia", "vitc", "vitd", "chole",
    "fasat", "fatrn", "refuse",
    "srcCd", "srcNm",
    "servSize", "foodSize", "restNm",
    "itemMnftrRptNo", "mfrNm", "imptNm", "distNm", "imptYn",
    "cooCd", "cooNm", "foodCooRgnNm", "prdCollCapMon",
    "dataProdCd", "dataProdNm",
    "crtYmd", "crtrYmd", "insttCode", "insttNm",
]


def build_url(base_url: str, page_no: int) -> str:
    query = f"serviceKey={SERVICE_KEY}&pageNo={page_no}&numOfRows={NUM_OF_ROWS}&type=json"
    return f"{base_url}?{query}"


def fetch_page(base_url: str, page_no: int, max_retries: int = 5) -> dict:
    url = build_url(base_url, page_no)
    last_err = None
    for attempt in range(1, max_retries + 1):
        try:
            with urllib.request.urlopen(url, timeout=30) as resp:
                raw = resp.read().decode("utf-8")
            return json.loads(raw)
        except (urllib.error.URLError, TimeoutError) as e:
            last_err = e
            wait = min(2 ** attempt, 30)
            print(f"  네트워크 오류 (시도 {attempt}/{max_retries}): {e} -> {wait}초 후 재시도", flush=True)
            time.sleep(wait)
    raise last_err


def init_db(conn: sqlite3.Connection):
    cols_sql = ", ".join(f'"{c}" TEXT' for c in COLUMNS)
    conn.execute(f'''
        CREATE TABLE IF NOT EXISTS nutrition_items (
            "foodCd" TEXT PRIMARY KEY,
            {", ".join(f'"{c}" TEXT' for c in COLUMNS if c != "foodCd")}
        )
    ''')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_foodNm ON nutrition_items("foodNm")')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_dataCd ON nutrition_items("dataCd")')
    conn.commit()


def upsert_items(conn: sqlite3.Connection, items: list):
    placeholders = ", ".join("?" for _ in COLUMNS)
    col_names = ", ".join(f'"{c}"' for c in COLUMNS)
    sql = f'INSERT OR REPLACE INTO nutrition_items ({col_names}) VALUES ({placeholders})'
    rows = [tuple(item.get(c) for c in COLUMNS) for item in items]
    conn.executemany(sql, rows)
    conn.commit()


def collect_source(source: dict, conn: sqlite3.Connection):
    name = source["name"]
    url = source["url"]
    out_dir = RAW_DIR / name
    out_dir.mkdir(parents=True, exist_ok=True)

    # 이미 받아둔 페이지가 있으면 그 다음 페이지부터 이어서 수집 (재시작 시 중복 다운로드 방지)
    existing_pages = sorted(out_dir.glob("page_*.json"))
    page_no = len(existing_pages) + 1
    total_count = None
    seen_food_cds = set()

    if existing_pages:
        for p in existing_pages:
            data = json.loads(p.read_text(encoding="utf-8"))
            items = data.get("body", {}).get("items", {}).get("item") or []
            if isinstance(items, dict):
                items = [items]
            upsert_items(conn, items)
            seen_food_cds.update(it["foodCd"] for it in items)
            total_count = data.get("body", {}).get("totalCount", total_count)
        print(f"[{name}] 기존 {len(existing_pages)}페이지 재적재 완료 (고유 {len(seen_food_cds)}건), page {page_no}부터 이어서 수집", flush=True)

    while True:
        stale_retries = 0
        while True:
            data = fetch_page(url, page_no)
            header = data.get("header", {})
            if header.get("resultCode") != "00":
                break

            body = data.get("body") or {}
            items_wrap = body.get("items")
            items = (items_wrap or {}).get("item")
            if items and isinstance(items, dict):
                items = [items]

            if not items:
                break

            # 서버가 이전 페이지 응답을 재전송하는 경우(캐시/스로틀링 추정) 감지 후 재시도
            new_codes = [it["foodCd"] for it in items]
            overlap = sum(1 for c in new_codes if c in seen_food_cds) / len(new_codes)
            if overlap > DUPLICATE_OVERLAP_THRESHOLD and stale_retries < STALE_MAX_RETRIES:
                stale_retries += 1
                print(f"[{name}] page {page_no} 응답이 이전 데이터와 {overlap:.0%} 중복됨 "
                      f"(재시도 {stale_retries}/{STALE_MAX_RETRIES}) -> {STALE_RETRY_WAIT_SEC}초 대기", flush=True)
                time.sleep(STALE_RETRY_WAIT_SEC)
                continue
            break

        header = data.get("header", {})
        if header.get("resultCode") != "00":
            print(f"[{name}] page {page_no} 오류: {header}", flush=True)
            break

        body = data.get("body") or {}
        if total_count is None:
            total_count = body.get("totalCount", 0)
            print(f"[{name}] 전체 {total_count}건 수집 시작", flush=True)

        items_wrap = body.get("items")
        if not items_wrap:
            break
        items = items_wrap.get("item")
        if not items:
            break
        if isinstance(items, dict):
            items = [items]

        (out_dir / f"page_{page_no:04d}.json").write_text(
            json.dumps(data, ensure_ascii=False), encoding="utf-8"
        )

        upsert_items(conn, items)
        seen_food_cds.update(it["foodCd"] for it in items)
        print(f"[{name}] page {page_no} 수집 완료 (고유 {len(seen_food_cds)}/{total_count})", flush=True)

        if len(seen_food_cds) >= total_count or page_no * NUM_OF_ROWS >= total_count + NUM_OF_ROWS:
            break
        page_no += 1
        time.sleep(REQUEST_DELAY_SEC)

    print(f"[{name}] 완료: 고유 {len(seen_food_cds)}건 수집\n", flush=True)


def main():
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    init_db(conn)

    for source in SOURCES:
        collect_source(source, conn)

    total = conn.execute("SELECT COUNT(*) FROM nutrition_items").fetchone()[0]
    by_source = conn.execute(
        'SELECT "dataCd", COUNT(*) FROM nutrition_items GROUP BY "dataCd"'
    ).fetchall()
    print(f"DB 저장 완료: {DB_PATH}")
    print(f"총 레코드 수: {total}")
    for data_cd, cnt in by_source:
        print(f"  dataCd={data_cd}: {cnt}건")

    conn.close()


if __name__ == "__main__":
    main()
