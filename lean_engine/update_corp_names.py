import sqlite3
import json
import os

db_path = '/home/ubuntu/dart-pro-new/lean_engine.db'
json_path = '/home/ubuntu/dart-pro-new/corps.json'

if not os.path.exists(db_path) or not os.path.exists(json_path):
    print("Files not found")
    exit(1)

with open(json_path, 'r', encoding='utf-8') as f:
    corp_map = json.load(f)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# UPDATE ai_reports
cursor.execute("SELECT report_id, corp_code FROM ai_reports WHERE corp_name = '알 수 없음'")
rows = cursor.fetchall()
updated = 0
for report_id, corp_code in rows:
    if corp_code in corp_map:
        cursor.execute("UPDATE ai_reports SET corp_name = ? WHERE report_id = ?", (corp_map[corp_code], report_id))
        updated += 1

# Populate company_details table for future use
cursor.execute("SELECT COUNT(*) FROM company_details")
if cursor.fetchone()[0] == 0:
    for code, name in corp_map.items():
        cursor.execute("INSERT OR IGNORE INTO company_details (corp_code, corp_name) VALUES (?, ?)", (code, name))
    print(f"Inserted {len(corp_map)} companies into company_details.")

conn.commit()
conn.close()

print(f"Updated {updated} records in ai_reports.")
