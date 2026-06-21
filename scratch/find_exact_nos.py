import sqlite3

conn = sqlite3.connect("lean_engine.db")
cursor = conn.cursor()

print("=== 2026년 5월 22일 엠로 및 이엠텍 공시 찾기 ===")
cursor.execute("""
    SELECT rcept_no, report_nm, corp_code 
    FROM filings 
    WHERE rcept_dt = '20260522' 
      AND (report_nm LIKE '%기업설명회%' OR report_nm LIKE '%주주명부%')
""")

for r in cursor.fetchall():
    # 우리는 corp_code 매핑 정보를 모르므로, raw_text의 첫 부분이나 corp_code를 보고 매칭
    print(f"rcept_no: {r[0]} | report_nm: {r[1]} | corp_code: {r[2]}")

conn.close()
