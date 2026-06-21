import sqlite3

conn = sqlite3.connect("lean_engine.db")
cursor = conn.cursor()

# 최신 20건 공시 조회
cursor.execute("""
    SELECT rcept_no, corp_code, report_nm, rcept_dt 
    FROM filings 
    ORDER BY rcept_dt DESC, rcept_no DESC
    LIMIT 20
""")

print("=== LATEST FILINGS ===")
for r in cursor.fetchall():
    print(f"[{r[0]}] {r[2]} ({r[3]}) | corp_code: {r[1]}")

conn.close()
