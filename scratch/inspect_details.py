import sqlite3

conn = sqlite3.connect("lean_engine.db")

print("--- 대량보유 20260520000202 TEXT ---")
raw_text = conn.execute("SELECT raw_text FROM filings WHERE rcept_no='20260520000202'").fetchone()[0]
for line in raw_text.splitlines():
    if '보유비율' in line or '이번보고서' in line or '직전보고서' in line:
        print(line)

print("\n--- 증권신고서 20260521000651 TEXT ---")
raw_text2 = conn.execute("SELECT raw_text FROM filings WHERE rcept_no='20260521000651'").fetchone()[0]
for line in raw_text2.splitlines():
    if '이자율' in line or '확정' in line or '모집' in line:
        print(line[:150])

conn.close()
