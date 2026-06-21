import sys
import os
import sqlite3
import json
sys.path.append("/Users/greego/Desktop/dart pro/lean_engine")
from core_engine import DartLeanEngine

engine = DartLeanEngine()
engine._is_already_processed = lambda rcept_no: False

targets = [
    {"rcept_no": "20260521000502", "report_nm": "LG전자 - [발행조건확정]증권신고서(채무증권)", "corp_code": "00401731", "corp_name": "LG전자"},
    {"rcept_no": "20260521000704", "report_nm": "미래에셋증권 - 증권발행실적보고서", "corp_code": "00111722", "corp_name": "미래에셋증권"},
    {"rcept_no": "20260521900924", "report_nm": "성우전자 - 불성실공시법인지정예고              (공시번복)", "corp_code": "00364306", "corp_name": "성우전자"},
    {"rcept_no": "20260521800728", "report_nm": "한국전력공사 - 임시주주총회결과              ", "corp_code": "00159193", "corp_name": "한국전력공사"},
    {"rcept_no": "20260521900948", "report_nm": "푸드나무 - 대표이사변경", "corp_code": "01259311", "corp_name": "푸드나무"},
    {"rcept_no": "20260521901047", "report_nm": "캐리 - 파산신청기각", "corp_code": "00863038", "corp_name": "캐리"},
    {"rcept_no": "20260521900977", "report_nm": "주권매매거래정지해제              (액면병합 주권 변경상장)", "corp_code": "01389445", "corp_name": "링크드"}
]

filings = []
for t in targets:
    filings.append({
        "rcept_no": t["rcept_no"],
        "corp_code": t["corp_code"],
        "corp_name": t["corp_name"],
        "report_nm": t["report_nm"],
        "rcept_dt": "20260521"
    })

print("=== START RUNNING PIPELINE FOR TARGETS ===")
engine._fetch_filing_list = lambda corp_code, bgn_de, end_de: filings

try:
    engine.run_pipeline(corp_code=None, bgn_de="20260521", end_de="20260521")
    print("=== PIPELINE RUN FINISHED ===")
finally:
    engine.close()

conn = sqlite3.connect("lean_engine.db")
cursor = conn.cursor()
cursor.execute("""
    SELECT s.rcept_no, f.report_nm, s.summary_text 
    FROM summaries s
    JOIN filings f ON s.rcept_no = f.rcept_no
    WHERE s.rcept_no IN ('20260521000502', '20260521000704', '20260521900924', '20260521800728', '20260521900948', '20260521901047', '20260521900977')
""")

print("\n=== VERIFICATION RESULTS ===")
for r in cursor.fetchall():
    print(f"[{r[0]}] {r[1]}")
    print(f"Summary:\n{r[2]}")
    print("=" * 50)
conn.close()
