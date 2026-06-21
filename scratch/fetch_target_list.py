import sys
import os
sys.path.append("/Users/greego/Desktop/dart pro/lean_engine")
from core_engine import DartLeanEngine

engine = DartLeanEngine()
filings = engine._fetch_filing_list(None, "20260521", "20260521")

print(f"Total filings fetched from DART: {len(filings)}")
targets = []
for f in filings:
    corp_name = f.get("corp_name", "")
    report_nm = f.get("report_nm", "")
    rcept_no = f.get("rcept_no", "")
    if "LG전자" in corp_name or "미래에셋" in corp_name or "LG" in corp_name:
        targets.append(f)
        print(f"Found: [{rcept_no}] {corp_name} - {report_nm} (corp_code: {f.get('corp_code')})")

engine.close()
