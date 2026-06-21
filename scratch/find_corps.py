import json
import os

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
corps_json_path = os.path.join(base_dir, "corps.json")
with open(corps_json_path, 'r', encoding='utf-8') as f:
    corps_map = json.load(f)

print("=== corps.json에서 검색 ===")
for code, name in corps_map.items():
    if "엠로" in name or "이엠텍" in name:
        print(f"Code: {code} | Name: {name}")
