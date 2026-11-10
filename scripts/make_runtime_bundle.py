"""
다른 PC 배포용 실행 묶음 만들기 → dist/afterbody-runtime.zip

담는 것: data/runtime.db (엔진이 쓰는 테이블·컬럼만, 국민건강영양조사 개인자료 제외)
         models/*.joblib (학습된 위험 모델 — 계수만 있고 개인자료 없음)
         web/dist/ (빌드된 화면 → Node.js 없이 Python 서버가 바로 제공)

사용:  cd web && npm run build && cd ..  →  python scripts/make_runtime_bundle.py
결과 zip 을 커밋·푸시하면 Render 가 자동 재배포하고, setup.bat 도 이 파일을 쓴다.
"""
import sqlite3
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "nutrition.db"
DST = ROOT / "data" / "runtime.db"
OUT = ROOT / "runtime" / "afterbody-runtime.zip"   # 저장소에 포함 (Render·setup.bat 이 사용)

FOOD_COLS = ["foodCd", "foodNm", "dataCd", "foodLv3Nm", "foodLv4Cd", "foodLv4Nm", "nutConSrtrQua",
             "foodSize", "servSize", "enerc", "chocdf", "sugar", "prot", "fatce", "nat"]
TABLES = ["food_group_stats", "food_alias", "ref_alcohol", "ref_exercise", "ref_gi", "ref_gi_food",
          "ref_kdri_adult", "ref_kdri_pa", "ref_effects"]


def build_db():
    DST.unlink(missing_ok=True)
    con = sqlite3.connect(DST)
    con.execute("ATTACH DATABASE ? AS src", (str(SRC),))
    # 엔진은 건강기능식품(F)을 쓰지 않음
    con.execute(f"CREATE TABLE food_nutrition AS SELECT {', '.join(FOOD_COLS)} FROM src.food_nutrition "
                "WHERE dataCd IN ('D','R','P')")
    for t in TABLES:
        con.execute(f"CREATE TABLE {t} AS SELECT * FROM src.{t}")
    con.execute("CREATE INDEX ix_fn_lv4 ON food_nutrition(dataCd, foodLv4Cd)")
    con.execute("CREATE INDEX ix_fn_lv4nm ON food_nutrition(foodLv4Nm)")
    con.execute("CREATE INDEX ix_fgs_nm ON food_group_stats(foodLv4Nm)")
    con.execute("CREATE INDEX ix_alias ON food_alias(alias)")
    con.execute("CREATE INDEX ix_gi ON ref_gi_food(foodCd)")
    con.commit()
    con.execute("DETACH DATABASE src")
    con.execute("VACUUM")
    con.close()
    print(f"[runtime.db] {DST.stat().st_size / 1e6:.1f} MB")


def build_zip():
    web = ROOT / "web" / "dist"
    if not (web / "index.html").exists():
        sys.exit("web/dist 가 없습니다 → cd web && npm run build 먼저 실행")
    models = sorted((ROOT / "models").glob("risk_*.joblib"))
    if len(models) < 3:
        sys.exit("models/risk_*.joblib 가 없습니다 → python scripts/train_risk_models.py 먼저 실행")
    OUT.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        z.write(DST, "data/runtime.db")
        for m in models:
            z.write(m, f"models/{m.name}")
        for f in web.rglob("*"):
            if f.is_file():
                z.write(f, f"web/dist/{f.relative_to(web).as_posix()}")
    print(f"[zip] {OUT} {OUT.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    build_db()
    build_zip()
