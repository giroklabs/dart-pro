import sys
import os

sys.path.append(os.path.abspath("lean_engine"))

from core_engine import DartLeanEngine

engine = DartLeanEngine()
rcept_nos = ['20260520800004', '20260520900719', '20260521900977']

for rcept_no in rcept_nos:
    cur = engine.conn.cursor()
    cur.execute("SELECT raw_text, report_nm, corp_code FROM filings WHERE rcept_no = ?", (rcept_no,))
    row = cur.fetchone()
    if not row:
        print(f"No filing found for {rcept_no}")
        continue
        
    raw_text, report_nm, corp_code = row
    if rcept_no == '20260520800004':
        corp_name = "DL이앤씨"
    elif rcept_no == '20260520900719':
        corp_name = "공구우먼"
    else:
        corp_name = "링크드"
    
    summary, _ = engine._build_summary(
        scored_sentences=[],
        report_nm=report_nm,
        metrics=[],
        corp_code=corp_code,
        corp_name=corp_name,
        raw_text=raw_text
    )
    
    print("="*60)
    print(f"[{corp_name}] 공시번호: {rcept_no}")
    print(f"빌드된 요약본:")
    print(summary)
    print("="*60)

engine.close()
