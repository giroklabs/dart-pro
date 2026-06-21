import sqlite3

conn = sqlite3.connect("lean_engine.db")
cursor = conn.cursor()

cursor.execute("""
    SELECT s.rcept_no, f.report_nm, s.summary_text, s.created_at 
    FROM summaries s
    JOIN filings f ON s.rcept_no = f.rcept_no
    WHERE s.created_at >= date('now', '-1 day') OR s.rcept_no LIKE '20260521%'
    LIMIT 20
""")

rows = cursor.fetchall()
print(f"Total found: {len(rows)}")
for r in rows:
    print(f"[{r[0]}] {r[1]}")
    print(f"Summary:\n{r[2]}")
    print("-" * 50)

conn.close()
