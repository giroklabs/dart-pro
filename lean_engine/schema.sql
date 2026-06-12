PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS filings (
    rcept_no TEXT PRIMARY KEY,
    corp_code TEXT,
    report_nm TEXT,
    rcept_dt TEXT,
    raw_text TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sentences (
    sentence_id INTEGER PRIMARY KEY AUTOINCREMENT,
    rcept_no TEXT NOT NULL,
    sent_order INTEGER NOT NULL,
    content TEXT NOT NULL,
    score REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (rcept_no) REFERENCES filings(rcept_no) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sent_unique
ON sentences (rcept_no, sent_order);

CREATE TABLE IF NOT EXISTS summaries (
    rcept_no TEXT PRIMARY KEY,
    summary_text TEXT NOT NULL,
    top_sentence_ids TEXT,
    insight_text TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (rcept_no) REFERENCES filings(rcept_no) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS financial_metrics (
    metric_id INTEGER PRIMARY KEY AUTOINCREMENT,
    rcept_no TEXT NOT NULL,
    corp_code TEXT NOT NULL,
    period_label TEXT NOT NULL,
    period_type TEXT,
    metric_name TEXT NOT NULL,
    metric_value REAL,
    raw_text TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (rcept_no) REFERENCES filings(rcept_no) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_financial_metric_unique
ON financial_metrics (rcept_no, metric_name);
