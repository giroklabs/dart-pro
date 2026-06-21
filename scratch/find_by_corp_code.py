import sqlite3

conn = sqlite3.connect("lean_engine.db")
cursor = conn.cursor()

print("=== 엠로 & 이엠텍 공시 정보 ===")
cursor.execute("""
    SELECT rcept_no, report_nm, rcept_dt, corp_code 
    FROM filings 
    WHERE corp_code IN ('00396925', '00541163', '01748082')
""")
for row in cursor.fetchall():
    print(row)

conn.close()
