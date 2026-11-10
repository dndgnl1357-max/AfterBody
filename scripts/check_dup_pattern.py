import json
from pathlib import Path

d1 = Path(r"C:\mediup\data\raw\process\page_0001.json")
d300 = Path(r"C:\mediup\data\raw\process\page_0300.json")
d2 = Path(r"C:\mediup\data\raw\process\page_0002.json")

def load_codes(p):
    d = json.load(open(p, encoding="utf-8"))
    items = d["body"]["items"]["item"]
    if isinstance(items, dict):
        items = [items]
    return [it["foodCd"] for it in items]

c1 = load_codes(d1)
c2 = load_codes(d2)
c300 = load_codes(d300)

print("page1 first5:", c1[:5])
print("page2 first5:", c2[:5])
print("page300 first5:", c300[:5])
print("page1 == page300?", c1 == c300)
print("overlap page1/page300:", len(set(c1) & set(c300)))
