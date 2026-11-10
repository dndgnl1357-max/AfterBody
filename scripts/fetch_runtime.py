"""실행 묶음(afterbody-runtime.zip)을 내려받아 저장소 루트에 푼다. Docker 빌드에서 사용.

사용: python scripts/fetch_runtime.py [URL]   (기본: GitHub Releases 최신본)
"""
import io
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_URL = "https://github.com/dndgnl1357-max/AfterBody/releases/latest/download/afterbody-runtime.zip"
REQUIRED = ["data/runtime.db", "models/risk_htn.joblib", "models/risk_dm.joblib", "models/risk_hchol.joblib",
            "web/dist/index.html"]


def main(url=DEFAULT_URL):
    print(f"내려받는 중: {url}")
    with urllib.request.urlopen(url, timeout=120) as r:
        data = r.read()
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        names = set(z.namelist())
        missing = [f for f in REQUIRED if f not in names]
        if missing:
            sys.exit(f"실행 묶음에 필요한 파일이 없습니다: {missing}")
        z.extractall(ROOT)
    print(f"완료: {len(names)}개 파일, {len(data) / 1e6:.1f} MB")


if __name__ == "__main__":
    main(*sys.argv[1:])
