import sqlite3

conn = sqlite3.connect("lean_engine.db")
cursor = conn.cursor()

print("=== 엠로 / 이엠텍 공시 검색 ===")
cursor.execute("""
    SELECT f.rcept_no, f.report_nm, f.rcept_dt, s.summary_text
    FROM filings f
    LEFT JOIN summaries s ON f.rcept_no = s.rcept_no
    WHERE f.report_nm LIKE '%기업설명회%' OR f.report_nm LIKE '%주주명부%'
""")

rows = cursor.fetchall()
for r in rows:
    print(f"[{r[0]}] {r[1]} ({r[2]})")
    print(f"Summary:\n{r[3]}")
    print("-" * 50)

conn.close()
