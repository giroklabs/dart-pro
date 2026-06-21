import sqlite3
import sys
import os
import json

current_dir = os.path.dirname(os.path.abspath(__file__))
if "scratch" in current_dir:
    base_dir = os.path.dirname(current_dir)
else:
    base_dir = current_dir

# corps.json 매핑 로드
corps_map = {}
corps_json_path = os.path.join(base_dir, "corps.json")
if os.path.exists(corps_json_path):
    try:
        with open(corps_json_path, 'r', encoding='utf-8') as f:
            corps_map = json.load(f)
    except Exception as e:
        print(f"Failed to load corps.json: {e}")

sys.path.append(os.path.join(base_dir, "lean_engine"))
from core_engine import DartLeanEngine

engine = DartLeanEngine()
db_path = os.path.join(base_dir, "lean_engine.db")
print(f"Connecting to database: {db_path}")
conn = sqlite3.connect(db_path)

cursor = conn.cursor()
cursor.execute("""
    SELECT rcept_no, report_nm, corp_code, rcept_dt, raw_text 
    FROM filings 
    WHERE rcept_dt IN ('20260520', '20260521', '20260522') 
      AND (report_nm LIKE '%전환청구%' OR report_nm LIKE '%소송등의판결%')
""")
rows = cursor.fetchall()
print(f"재처리 대상 건수: {len(rows)}건")

reprocessed_count = 0
for rcept_no, report_nm, corp_code, rcept_dt, raw_text in rows:
    corp_name = corps_map.get(corp_code, "")
    
    # 기존 DB 레코드 삭제
    cur = engine.conn.cursor()
    cur.execute("DELETE FROM sentences WHERE rcept_no = ?", (rcept_no,))
    cur.execute("DELETE FROM summaries WHERE rcept_no = ?", (rcept_no,))
    engine.conn.commit()

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
    
    reprocessed_count += 1
    print(f"[{rcept_no}] {corp_name} - {report_nm} 재처리 성공!")
    print(f"Summary Text:\n{summary_text}\n" + "-"*50)

print(f"총 {reprocessed_count}건 재처리 및 저장 완료.")
engine.close()
conn.close()
