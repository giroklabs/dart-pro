import sqlite3
import sys
import os
import json

# 현재 파일이 있는 디렉토리를 기준으로 경로 계산
current_dir = os.path.dirname(os.path.abspath(__file__))
if "scratch" in current_dir:
    base_dir = os.path.dirname(current_dir)
else:
    base_dir = current_dir

# corps.json에서 기업코드 -> 기업명 매핑 정보 로드
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

# 오늘자(20260520) 정정공시 항목들을 동적으로 쿼리하여 업데이트
rows = conn.execute("SELECT rcept_no, report_nm, corp_code, raw_text FROM filings WHERE rcept_dt = '20260520' AND report_nm LIKE '%정정%'").fetchall()

if not rows:
    print("No matching records for today YYYYMMDD '20260520'. Trying fallback list...")
    target_rcepts = ['20260520000183', '20260520000186', '20260520000190']
    rows = []
    for r_no in target_rcepts:
        r = conn.execute("SELECT rcept_no, report_nm, corp_code, raw_text FROM filings WHERE rcept_no = ?", (r_no,)).fetchone()
        if r:
            rows.append(r)

for rcept_no, report_nm, corp_code, raw_text in rows:
    # corp_code로부터 corp_name 매핑 조회 (없으면 디폴트 빈값)
    corp_name = corps_map.get(corp_code, "")
    
    summary_text, top_ids_json = engine._build_summary(
        scored_sentences=[],
        report_nm=report_nm,
        metrics=[],
        corp_code=corp_code,
        corp_name=corp_name,
        raw_text=raw_text
    )
    
    conn.execute("INSERT OR REPLACE INTO summaries (rcept_no, summary_text, top_sentence_ids) VALUES (?, ?, ?)", (rcept_no, summary_text, top_ids_json))
    conn.commit()
    print(f"[{rcept_no}] {corp_name} - {report_nm} Rebuilt successfully!")
    print(f"Summary Text:\n{summary_text}\n")

engine.close()
conn.close()
