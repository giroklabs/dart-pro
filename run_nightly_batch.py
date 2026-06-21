import os
import sys
import logging
from datetime import datetime

# Set up logging
log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
os.makedirs(log_dir, exist_ok=True)
log_file = os.path.join(log_dir, f"nightly_batch_{datetime.now().strftime('%Y%m%d')}.log")

logging.basicConfig(
    filename=log_file,
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)

logger = logging.getLogger("nightly_batch")

def run_batch():
    logger.info("Starting Nightly LLM Analyzer Batch...")
    
    try:
        from lean_engine.llm_analyzer import NightlyLLMAnalyzer
        current_dir = os.path.dirname(os.path.abspath(__file__))
        db_path = os.path.join(current_dir, "lean_engine.db")
        
        analyzer = NightlyLLMAnalyzer(db_path)
        analyzer.analyze_today_noise()
        
        logger.info("Nightly Batch completed successfully.")
    except Exception as e:
        logger.error(f"Nightly Batch failed: {e}", exc_info=True)

if __name__ == "__main__":
    run_batch()
