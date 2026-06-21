import sqlite3

conn = sqlite3.connect("lean_engine.db")
cursor = conn.cursor()

print("=== 5월 20일 ~ 22일 공시 요약 오류/실패 여부 전수 검사 ===")

cursor.execute("""
    SELECT f.rcept_no, f.rcept_dt, f.report_nm, s.summary_text
    FROM filings f
    LEFT JOIN summaries s ON f.rcept_no = s.rcept_no
    WHERE f.rcept_dt BETWEEN '20260520' AND '20260522'
""")

rows = cursor.fetchall()
empty_count = 0
error_count = 0
total_count = len(rows)

for r_no, r_dt, r_nm, summary in rows:
    if not summary or not summary.strip():
        empty_count += 1
        print(f"❗ [빈 요약 오류] {r_dt} | {r_no} | {r_nm}")
    elif "exception" in summary.lower() or "error" in summary.lower():
        error_count += 1
        print(f"❗ [예외/에러 텍스트 포함] {r_dt} | {r_no} | {r_nm} | 요약: {summary[:100]}...")

print("-" * 50)
print(f"전체 검사 대상 공시: {total_count}건")
print(f"빈 요약 오류: {empty_count}건")
print(f"예외/에러 포함: {error_count}건")

conn.close()
