import sqlite3

conn = sqlite3.connect("lean_engine.db")
cursor = conn.cursor()

print("=== 엠로 & 이엠텍 접수번호 조회 ===")

cursor.execute("SELECT rcept_no, report_nm, raw_text FROM filings WHERE rcept_dt='20260522'")
for rcept_no, report_nm, raw_text in cursor.fetchall():
    if "엠로" in raw_text:
        print(f"[엠로 후보] {rcept_no} | {report_nm} (Length: {len(raw_text)})")
    if "이엠텍" in raw_text:
        print(f"[이엠텍 후보] {rcept_no} | {report_nm} (Length: {len(raw_text)})")

conn.close()
