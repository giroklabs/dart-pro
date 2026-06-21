import sqlite3

conn = sqlite3.connect("lean_engine.db")
cursor = conn.cursor()

print("=== filings 테이블 날짜 포맷 확인 ===")
cursor.execute("SELECT rcept_no, rcept_dt, report_nm FROM filings ORDER BY rcept_no DESC LIMIT 10")
for row in cursor.fetchall():
    print(row)

conn.close()
