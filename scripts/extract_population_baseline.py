"""
MediUp - 질병관리청 국민건강통계(KNHANES) 2024 핵심지표 추출

각 지표 파일은 "1.지표명" 시트에 연도별(1998~2024) 추이 표를 담고 있으며,
구조가 다음과 같이 공통적이다:
  - '구 분' 헤더 행에 3칸 단위로 연도 라벨('98, '01, ..., '24)이 반복
  - 하위 헤더 행에 n / 분율(표준오차) 반복
  - 데이터 행: [L1구분(성별 등), L2구분(연령/지역/소득 등), n, 분율, 표준오차] * 연도수
  - L1은 병합 셀이라 그룹의 첫 행에만 값이 채워짐 (그 아래는 forward-fill 필요)

이 스크립트는 각 대상 시트에서 가장 최근 연도(2024) 블록만 뽑아
population_baseline 테이블(SQLite)에 적재한다. 개인 데이터가 아닌
'전국 평균 기준선' 참고용 데이터임.
"""

import re
import sqlite3
from pathlib import Path

import openpyxl

BASE_DIR = Path(r"C:\mediup")
XLSX_DIR = BASE_DIR / "2024국민건강통계(ver.엑셀)"
DB_PATH = BASE_DIR / "data" / "nutrition.db"

# (파일명, 시트명, 지표명)
TARGETS = [
    ("01. 흡연.xlsx", "1.현재흡연", "현재흡연율"),
    ("02. 음주.xlsx", "1.연간음주", "연간음주율"),
    ("02. 음주.xlsx", "4.고위험음주", "고위험음주율"),
    ("03. 신체활동.xlsx", "2.유산소신체활동", "유산소신체활동실천율"),
    ("15. 비만.xlsx", "1.비만(BMI)", "비만유병률(BMI기준)"),
    ("16. 고혈압.xlsx", "1.고혈압", "고혈압유병률"),
    ("17. 당뇨병.xlsx", "1.당뇨병", "당뇨병유병률"),
    ("18. 이상지질혈증.xlsx", "1.고콜레스테롤혈증", "고콜레스테롤혈증유병률"),
    ("18. 이상지질혈증.xlsx", "6.고중성지방혈증", "고중성지방혈증유병률"),
]

YEAR_PATTERN = re.compile(r"’?'?(\d{2})")


def parse_year_label(label: str) -> int:
    m = YEAR_PATTERN.search(str(label))
    if not m:
        return None
    yy = int(m.group(1))
    return 2000 + yy if yy < 50 else 1900 + yy


def find_header_row(rows):
    for i, row in enumerate(rows):
        if row and any(cell == "구 분" for cell in row if cell):
            return i
    raise ValueError("헤더 행('구 분')을 찾지 못함")


def latest_year_block(header_row):
    blocks = []
    for col_idx, cell in enumerate(header_row):
        if cell is None:
            continue
        year = parse_year_label(cell)
        if year is not None and str(cell).strip().startswith(("’", "'")):
            blocks.append((year, col_idx))
    if not blocks:
        raise ValueError("연도 블록을 찾지 못함")
    blocks.sort(key=lambda x: x[0])
    return blocks[-1]  # (year, n_col) ; rate_col = n_col+1


def extract_sheet(path: Path, sheet_name: str, indicator: str):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[sheet_name]
    rows = list(ws.iter_rows(values_only=True))
    header_idx = find_header_row(rows)
    year, n_col = latest_year_block(rows[header_idx])
    rate_col = n_col + 1

    results = []
    l1_current = None
    for row in rows[header_idx + 2:]:
        if row is None or len(row) <= rate_col:
            continue
        l1_cell = row[1] if len(row) > 1 else None
        l2_cell = row[2] if len(row) > 2 else None
        if l1_cell:
            l1_current = str(l1_cell).strip()
        rate_val = row[rate_col]
        n_val = row[n_col]
        if l2_cell is None or rate_val is None:
            continue
        try:
            rate = float(str(rate_val).replace(",", ""))
        except ValueError:
            continue
        results.append({
            "indicator": indicator,
            "category_l1": l1_current,
            "category_l2": str(l2_cell).strip(),
            "year": year,
            "rate_percent": rate,
            "n": n_val,
            "source_file": path.name,
            "sheet": sheet_name,
        })
    return results


def init_db(conn: sqlite3.Connection):
    conn.execute("""
        CREATE TABLE IF NOT EXISTS population_baseline (
            indicator TEXT,
            category_l1 TEXT,
            category_l2 TEXT,
            year INTEGER,
            rate_percent REAL,
            n TEXT,
            source_file TEXT,
            sheet TEXT
        )
    """)
    conn.execute("DELETE FROM population_baseline")
    conn.commit()


def main():
    conn = sqlite3.connect(DB_PATH)
    init_db(conn)

    total = 0
    for filename, sheet_name, indicator in TARGETS:
        path = XLSX_DIR / filename
        try:
            rows = extract_sheet(path, sheet_name, indicator)
        except Exception as e:
            print(f"[실패] {filename} / {sheet_name}: {e}")
            continue

        conn.executemany(
            """INSERT INTO population_baseline
               (indicator, category_l1, category_l2, year, rate_percent, n, source_file, sheet)
               VALUES (:indicator, :category_l1, :category_l2, :year, :rate_percent, :n, :source_file, :sheet)""",
            rows,
        )
        conn.commit()
        total += len(rows)
        print(f"[완료] {indicator} ({filename}/{sheet_name}): {len(rows)}건")

    print(f"\n총 {total}건 population_baseline 테이블에 저장 완료")

    print("\n--- 전체(19세이상) 기준 핵심 지표 요약 ---")
    for row in conn.execute("""
        SELECT indicator, category_l1, category_l2, year, rate_percent
        FROM population_baseline
        WHERE category_l1 = '전체' AND category_l2 LIKE '%19세이상%' AND category_l2 NOT LIKE '%표준화%'
        ORDER BY indicator
    """):
        print(row)

    conn.close()


if __name__ == "__main__":
    main()
