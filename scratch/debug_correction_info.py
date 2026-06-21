import sys
import os
import sqlite3

sys.path.append(os.path.abspath("lean_engine"))

from core_engine import DartLeanEngine

engine = DartLeanEngine()
rcept_nos = ['20260519000004', '20260519000246']

for rcept_no in rcept_nos:
    cur = engine.conn.cursor()
    cur.execute("SELECT raw_text, report_nm FROM filings WHERE rcept_no = ?", (rcept_no,))
    raw_text, report_nm = cur.fetchone()
    
    corr_item, corr_reason = engine._extract_correction_info(raw_text)
    
    print(f"[{report_nm}]")
    print(f"corr_item: {corr_item}")
    print(f"corr_reason: {corr_reason}")
    print("-" * 40)
    
    # 처음 30줄 출력하여 테이블 구조 확인
    lines = [l.strip() for l in raw_text.split('\n') if l.strip()]
    print("\n".join(lines[:30]))
    print("=" * 60)

engine.close()
