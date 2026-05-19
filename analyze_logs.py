import re
import os
import sqlite3
from collections import defaultdict

# ANSI Terminal Colors
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
BLUE = "\033[94m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"

def get_db_stats():
    stats = {}
    db_path = "lean_engine.db"
    if not os.path.exists(db_path):
        return None
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # 총 수집 종목 수
        stats["total_companies"] = cursor.execute("SELECT COUNT(DISTINCT corp_code) FROM filings").fetchone()[0]
        # 총 수집 공시 수
        stats["total_filings"] = cursor.execute("SELECT COUNT(*) FROM filings").fetchone()[0]
        
        # 재무 지표 추출 통계
        stats["revenue_count"] = cursor.execute("SELECT COUNT(*) FROM financial_metrics WHERE metric_name='revenue'").fetchone()[0]
        stats["op_count"] = cursor.execute("SELECT COUNT(*) FROM financial_metrics WHERE metric_name='operating_profit'").fetchone()[0]
        stats["ni_count"] = cursor.execute("SELECT COUNT(*) FROM financial_metrics WHERE metric_name='net_income'").fetchone()[0]
        
        # 일자별 분포
        dates_res = cursor.execute("SELECT rcept_dt, COUNT(*) FROM filings GROUP BY rcept_dt ORDER BY rcept_dt DESC LIMIT 5").fetchall()
        stats["dates"] = dates_res
        
        # 최근 파싱된 공시 5건
        recent_res = cursor.execute("SELECT rcept_no, corp_code, report_nm, rcept_dt FROM filings ORDER BY created_at DESC LIMIT 5").fetchall()
        stats["recent"] = recent_res
        
        conn.close()
        return stats
    except Exception as e:
        return {"error": str(e)}

def analyze_logs():
    files = ["lean_engine_scheduler.log", "test_run.log"]
    parse_warnings = defaultdict(int)
    parse_details = defaultdict(list)
    system_errors = defaultdict(int)
    system_details = defaultdict(list)
    
    total_processed = 0
    total_skipped = 0
    
    print(f"{BOLD}{BLUE}=================================================={RESET}")
    print(f"{BOLD}{CYAN}📊 DART Pro 시스템 정밀 모니터링 & 분석 보고서{RESET}")
    print(f"{BOLD}{BLUE}=================================================={RESET}")
    
    # 1. DB 실시간 누적 현황 출력
    db_stats = get_db_stats()
    if db_stats and "error" not in db_stats:
        print(f"\n{BOLD}[ 누적 데이터베이스(lean_engine.db) 통계 ]{RESET}")
        print(f"  • {BOLD}총 수집 대상 기업 수:{RESET} {GREEN}{db_stats['total_companies']}{RESET}개 사")
        print(f"  • {BOLD}총 수집 완료 공시 수:{RESET} {GREEN}{db_stats['total_filings']}{RESET}건")
        print(f"  • {BOLD}재무 지표 추출 수:{RESET} 매출 {BLUE}{db_stats['revenue_count']}{RESET}건 | 영업이익 {BLUE}{db_stats['op_count']}{RESET}건 | 순이익 {BLUE}{db_stats['ni_count']}{RESET}건")
        
        if db_stats.get("dates"):
            print(f"  • {BOLD}최근 수집 일자별 건수:{RESET}")
            for dt, count in db_stats["dates"]:
                print(f"    - {dt[:4]}-{dt[4:6]}-{dt[6:]}: {YELLOW}{count:3d}{RESET} 건 수집됨")
    elif db_stats and "error" in db_stats:
        print(f"\n{RED}⚠ DB 연결 에러: {db_stats['error']}{RESET}")
    else:
        print(f"\n{YELLOW}ℹ 로컬 데이터베이스 파일이 아직 존재하지 않습니다.{RESET}")

    # 2. 로그 파일 정밀 스캔
    for filename in files:
        try:
            with open(filename, "r", encoding="utf-8") as f:
                content = f.read()
                
            # 처리수 및 스킵수 카운트
            total_processed += len(re.findall(r"처리 중\.\.\.", content))
            total_skipped += len(re.findall(r"이미 처리됨|skip financial extractor", content))
            
            # 1. 공시 파싱 및 Sanity Check 관련 경고/에러 감지
            warning_lines = re.findall(r"(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3}) \[(WARNING|ERROR)\] (.*)", content)
            for dt, lv, msg in warning_lines:
                if "Sanity Check" in msg or "비어 있음" in msg or "파일 없음" in msg or "읽기 실패" in msg or "추출 실패" in msg:
                    category = "공시 파싱 / 데이터 정밀성 검증 실패 (Sanity Check)" if "Sanity Check" in msg else "공시 문서 구조적 추출 실패 (ZIP/XML)"
                    parse_warnings[msg] += 1
                    parse_details[msg].append(f"[{filename}] {dt} [{lv}]: {msg}")
                else:
                    err_key = "네트워크 연결 오류 (opendart.fss.or.kr)" if "opendart.fss.or.kr" in msg or "ConnectionError" in msg else msg
                    system_errors[err_key] += 1
                    system_details[err_key].append(f"[{filename}] {dt} [{lv}]: {msg[:120]}...")
            
            # [DEBUG] 본문 추출 실패 개별 매칭
            debug_failures = re.findall(r"(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3}) \[DEBUG\] (.*본문 추출 실패.*)", content)
            for dt, msg in debug_failures:
                parse_warnings[msg] += 1
                parse_details[msg].append(f"[{filename}] {dt} [DEBUG]: {msg}")
                
        except FileNotFoundError:
            pass

    # 3. 로그 처리율 리포트
    if total_processed > 0:
        success_rate = ((total_processed - len(parse_warnings)) / total_processed) * 100
        print(f"\n{BOLD}[ 로그 수집/파싱 처리 통계 ]{RESET}")
        print(f"  • {BOLD}총 시도 건수:{RESET} {total_processed}건")
        print(f"  • {BOLD}스킵(기처리/노이즈):{RESET} {total_skipped}건")
        print(f"  • {BOLD}실질 파싱 성공률:{RESET} {GREEN}{success_rate:.1f}%{RESET}")

    # 4. 공시 데이터 검증 경고 출력
    print(f"\n{BOLD}[1] 🔎 공시 데이터 파싱 및 정밀 검증(Sanity Check) 경고 목록{RESET}")
    print(f"{BLUE}{'=' * 50}{RESET}")
    if not parse_warnings:
        print(f"{GREEN}✅ 수집된 공시 중 파싱/Sanity Check 경고가 없습니다. 모든 데이터가 완벽히 정확합니다!{RESET}")
    else:
        idx = 1
        for msg, count in sorted(parse_warnings.items(), key=lambda x: x[1], reverse=True):
            print(f"{YELLOW}({idx}) {msg} (총 {count}회){RESET}")
            for detail in list(dict.fromkeys(parse_details[msg]))[-2:]:
                print(f"    • {detail}")
            print("-" * 50)
            idx += 1
            
    # 5. 시스템/네트워크 에러 출력
    print(f"\n{BOLD}[2] 🌐 시스템 및 네트워크 API 호출 에러 목록{RESET}")
    print(f"{BLUE}{'=' * 50}{RESET}")
    if not system_errors:
        print(f"{GREEN}✅ 네트워크 및 DART Open API 통신 상태가 매우 양호합니다.{RESET}")
    else:
        idx = 1
        for err, count in sorted(system_errors.items(), key=lambda x: x[1], reverse=True):
            print(f"{RED}({idx}) {err} (총 {count}회){RESET}")
            for detail in list(dict.fromkeys(system_details[err]))[-2:]:
                print(f"    • {detail}")
            print("-" * 50)
            idx += 1

    # 6. 최근 수집된 공시 타임라인
    if db_stats and db_stats.get("recent"):
        print(f"\n{BOLD}[3] 🕒 실시간 파이프라인 최근 수집 타임라인 (최신 5건){RESET}")
        print(f"{BLUE}{'=' * 50}{RESET}")
        for rcept_no, corp_code, report_nm, rcept_dt in db_stats["recent"]:
            print(f"  • [{rcept_dt[:4]}-{rcept_dt[4:6]}-{rcept_dt[6:]}] 접수번호: {CYAN}{rcept_no}{RESET} | 기업코드: {BOLD}{corp_code}{RESET} | {report_nm.strip()}")
        print()

if __name__ == "__main__":
    analyze_logs()
