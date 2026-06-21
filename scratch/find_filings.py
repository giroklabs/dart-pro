import sqlite3

conn = sqlite3.connect("lean_engine.db")
cursor = conn.cursor()

# 회사명이나 공시명으로 검색
query = """
SELECT rcept_no, report_nm, raw_text[:100] 
FROM filings 
WHERE report_nm LIKE '%대량보유%' OR report_nm LIKE '%증권신고서%'
LIMIT 10
"""
cursor.execute("SELECT rcept_no, report_nm FROM filings WHERE report_nm LIKE '%대량보유%' OR report_nm LIKE '%증권신고서%'")
for row in cursor.fetchall():
    print(row)
conn.close()
