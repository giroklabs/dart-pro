import sqlite3
import json

conn = sqlite3.connect('/Users/greego/Desktop/dart pro/lean_engine.db')
cursor = conn.cursor()

print("=== 1. Sentences Table Query ===")
cursor.execute("SELECT rcept_no, sent_order, content, score FROM sentences WHERE content LIKE '%사용한도%' LIMIT 10")
for row in cursor.fetchall():
    print(row)

print("\n=== 2. Disclosure Summaries Table Query ===")
cursor.execute("SELECT rcept_no, summary_text, top_ids FROM disclosure_summaries WHERE summary_text LIKE '%사용한도%' LIMIT 10")
for row in cursor.fetchall():
    print(row)

conn.close()
