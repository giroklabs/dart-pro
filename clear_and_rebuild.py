import sqlite3
import sys
sys.path.append("/Users/greego/Desktop/dart pro/lean_engine")
from core_engine import DartLeanEngine

db_path = "/Users/greego/Desktop/dart pro/lean_engine.db"
conn = sqlite3.connect(db_path)
cur = conn.cursor()

# 오염된 공시 목록 조회
cur.execute("SELECT rcept_no, report_nm FROM filings WHERE raw_text LIKE '%파일이 존재하지 않습니다%' OR LENGTH(TRIM(raw_text)) < 15")
corrupted = cur.fetchall()

print(f"=== 오염된 공시 데이터 삭제 대상: {len(corrupted)}건 ===")
for c in corrupted:
    print(f"삭제 예정: {c}")
    rcept_no = c[0]
    # 연관 테이블 삭제
    cur.execute("DELETE FROM sentences WHERE rcept_no = ?", (rcept_no,))
    cur.execute("DELETE FROM financial_metrics WHERE rcept_no = ?", (rcept_no,))
    cur.execute("DELETE FROM summaries WHERE rcept_no = ?", (rcept_no,))
    cur.execute("DELETE FROM filings WHERE rcept_no = ?", (rcept_no,))

conn.commit()
conn.close()
print("=== 오염 데이터 클렌징 완료 ===")

# 이제 오늘자 공시에 대해 정상 수집 및 신규 NLG 모델 빌드 재가동
print("=== 오늘자 공시 재수집 파이프라인 가동 ===")
engine = DartLeanEngine()
engine._is_already_processed = lambda rcept_no: False  # 무조건 갱신

start_date = "20260519"
end_date = "20260520"
try:
    engine.run_pipeline(corp_code=None, bgn_de=start_date, end_de=end_date)
    print("=== 5/19 ~ 5/20 공시 완전 정화 및 분석 재빌드 성공! ===")
finally:
    engine.close()
