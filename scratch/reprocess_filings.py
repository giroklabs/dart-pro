import sys
import os
import sqlite3
import json

sys.path.append(os.path.abspath("lean_engine"))

from core_engine import DartLeanEngine

DB_PATH = "lean_engine.db"
rcept_nos = ['20260519000004', '20260519000246']

# 1. DB에서 기존 분석 내역 삭제 (재처리를 유도하기 위해)
conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()
for rcept_no in rcept_nos:
    cur.execute("DELETE FROM summaries WHERE rcept_no = ?", (rcept_no,))
    cur.execute("DELETE FROM sentences WHERE rcept_no = ?", (rcept_no,))
conn.commit()
conn.close()

# 2. 엔진을 통해 재수집 및 요약본 빌드 수행
engine = DartLeanEngine()

for rcept_no in rcept_nos:
    cur = engine.conn.cursor()
    cur.execute("SELECT raw_text, report_nm, corp_code, rcept_dt FROM filings WHERE rcept_no = ?", (rcept_no,))
    row = cur.fetchone()
    if not row:
        print(f"No filing in DB for {rcept_no}. Fetching from DART...")
        # filings에도 없을 경우 DART API를 통해 처리 유도
        # 여기서는 run_pipeline 형태로 처리할 수도 있음
        continue
        
    raw_text, report_nm, corp_code, rcept_dt = row
    corp_name = "야나두" if rcept_no == '20260519000004' else "스트라드비젼"
    
    filing = {
        "rcept_no": rcept_no,
        "corp_code": corp_code,
        "report_nm": report_nm,
        "rcept_dt": rcept_dt,
        "corp_name": corp_name
    }
    
    sentences = engine.rule_engine.split_sentences(raw_text)
    scored_sentences = [
        {
            "order": i,
            "content": s,
            "score": engine.rule_engine.score_sentence(s, i, len(sentences))
        }
        for i, s in enumerate(sentences)
    ]
    
    summary_text, top_ids_json = engine._build_summary(
        scored_sentences=scored_sentences,
        report_nm=report_nm,
        metrics=[],
        corp_code=corp_code,
        corp_name=corp_name,
        raw_text=raw_text
    )
    
    engine._save_to_db(
        filing=filing,
        raw_text=raw_text,
        scored_sentences=scored_sentences,
        summary_text=summary_text,
        top_ids_json=top_ids_json,
        metrics=[]
    )
    
    print("="*60)
    print(f"[{corp_name}] 재처리 완료!")
    print(f"결과 요약본:")
    print(summary_text)
    print("="*60)

engine.close()
