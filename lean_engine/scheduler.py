import time
import schedule
import logging
import datetime
import threading
import os
from core_engine import DartLeanEngine
from insight_generator import InsightGenerator

logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler("lean_engine_scheduler.log", encoding="utf-8"),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger(__name__)

engine = DartLeanEngine()
job_lock = threading.Lock()


def job():
    # DART 공시 미운영 시간(주말 및 평일 19:00 ~ 07:30) API 호출 차단
    now = datetime.datetime.now()
    if now.weekday() >= 5 or not (datetime.time(7, 30) <= now.time() <= datetime.time(19, 0)):
        logger.debug("DART 미운영 시간대(평일 07:30~19:00 외)이므로 API 호출을 건너뜁니다.")
        return

    if not job_lock.acquire(blocking=False):
        logger.warning("이전 작업이 아직 실행 중이어서 이번 주기 실행은 건너뜁니다.")
        return

    try:
        today = datetime.date.today()
        start_date = (today - datetime.timedelta(days=7)).strftime('%Y%m%d')
        end_date = today.strftime('%Y%m%d')

        logger.info("전 종목 공시 수집 시작: %s ~ %s", start_date, end_date)
        engine.run_pipeline(None, start_date, end_date)
        logger.info("공시 수집 완료, AI 인사이트 리포트 생성 시작...")
        
        # AI Insight 생성기 실행
        try:
            db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "lean_engine.db")
            insight_gen = InsightGenerator(db_path)
            insight_gen.generate_daily_reports(today.strftime('%Y%m%d'))
            logger.info("AI 인사이트 리포트 생성 완료")
        except Exception as e:
            logger.error("AI 인사이트 리포트 생성 실패: %s", e)

        logger.info("정기 작업 완료")
    except Exception:
        logger.exception("작업 실패")
    finally:
        job_lock.release()


def main():
    logger.info("Lean Engine 스케줄러 시작 (주기: 1분)")
    job()
    schedule.every(1).minutes.do(job)

    while True:
        schedule.run_pending()
        idle = schedule.idle_seconds()
        time.sleep(1 if idle is None else max(1, min(idle, 1)))


if __name__ == "__main__":
    main()
