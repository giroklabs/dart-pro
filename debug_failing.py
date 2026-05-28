import sys
import os
import sqlite3

# 현재 파일의 디렉토리를 기준으로 경로 추가
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(os.path.join(current_dir, "lean_engine"))

from core_engine import DartLeanEngine

# DB 연결 (상대 경로로 자동 매핑)
db_path = os.path.join(current_dir, "lean_engine.db")
conn = sqlite3.connect(db_path)
cur = conn.cursor()

# 푸른기술 및 한화리츠 오늘자(또는 최근) rcept_no 조회
cur.execute("SELECT rcept_no, report_nm, summary_text FROM summaries JOIN filings USING (rcept_no) WHERE report_nm LIKE '%푸른기술%' OR report_nm LIKE '%한화리츠%' OR report_nm LIKE '%단일판매%'")
rows = cur.fetchall()
print("=== DB 조회 결과 ===")
for r in rows:
    print(r)
    # 문장들 조회
    cur.execute("SELECT sent_order, content, score FROM sentences WHERE rcept_no = ? ORDER BY sent_order LIMIT 20", (r[0],))
    sents = cur.fetchall()
    print("--- 문장 샘플 (최대 20개) ---")
    for s in sents:
        print(s)
    print("=" * 60)

conn.close()
