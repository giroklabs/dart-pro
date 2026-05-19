import os
import requests
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("DART_API_KEY")
print(f"Using API Key: {api_key[:10]}...")

# 1. 브이페이먼츠 (01534610) 공시 목록 조회
url = "https://opendart.fss.or.kr/api/list.json"
params = {
    "crtfc_key": api_key,
    "bgn_de": "20260515",
    "end_de": "20260518",
    "page_count": "100",
    "page_no": "1",
    "corp_code": "01534610"
}

res = requests.get(url, params=params)
print("\n--- DART API Response for V-Payments (01534610) ---")
print(f"Status Code: {res.status_code}")
try:
    data = res.json()
    print("Response Data:")
    import json
    print(json.dumps(data, indent=2, ensure_ascii=False))
except Exception as e:
    print(f"Failed to parse JSON: {e}")
    print(f"Raw Text: {res.text[:1000]}")
