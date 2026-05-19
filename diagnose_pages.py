import os
import requests
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("DART_API_KEY")

print("--- Diagnosing Multi-page DART API Disclosures (2026-05-18) ---")

url = "https://opendart.fss.or.kr/api/list.json"
found_page = None
found_index = None
total_count = None
total_page = None

# 최대 30페이지까지 탐색하면서 브이페이먼츠(01534610)의 위치를 찾습니다.
for page in range(1, 31):
    params = {
        "crtfc_key": api_key,
        "bgn_de": "20260518",
        "end_de": "20260518",
        "page_count": "100",
        "page_no": str(page)
    }
    res = requests.get(url, params=params).json()
    
    if page == 1:
        total_count = int(res.get("total_count", 0))
        total_page = int(res.get("total_page", 0))
        print(f"오늘 전체 공시 수: {total_count}건 (총 {total_page}페이지)")
        print("탐색 시작...")
        
    filings = res.get("list", [])
    for idx, f in enumerate(filings):
        if f.get("corp_code") == "01534610":
            found_page = page
            found_index = (page - 1) * 100 + idx + 1
            print(f"\n🎉 브이페이먼츠(01534610) 발견!")
            print(f"- 페이지 번호: {found_page}페이지")
            print(f"- 페이지 내 순서: {idx + 1}번째")
            print(f"- 전체 목록 내 순서: {found_index}번째 / 전체 {total_count}건")
            break
            
    if found_page:
        break
    else:
        print(f"Page {page}/{total_page} 탐색 완료 (브이페이먼츠 미발견)")

if not found_page:
    print(f"\n❌ 총 {min(total_page, 30)}페이지를 탐색했으나 브이페이먼츠를 찾지 못했습니다.")
