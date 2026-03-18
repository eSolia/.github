-- Search Intelligence Pipeline — D1 schema
-- Database: search-intelligence
-- Create with: wrangler d1 create search-intelligence

-- Search performance data (Google Search Console + Bing Webmaster Tools)
CREATE TABLE IF NOT EXISTS search_performance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL DEFAULT 'google' CHECK(source IN ('google', 'bing')),
  date TEXT NOT NULL,
  query TEXT NOT NULL,
  page TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT '',
  clicks INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  ctr REAL NOT NULL DEFAULT 0,
  position REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source, date, query, page, country, device)
);

CREATE INDEX IF NOT EXISTS idx_sp_source ON search_performance(source);
CREATE INDEX IF NOT EXISTS idx_sp_date ON search_performance(date);
CREATE INDEX IF NOT EXISTS idx_sp_query ON search_performance(query);
CREATE INDEX IF NOT EXISTS idx_sp_page ON search_performance(page);
CREATE INDEX IF NOT EXISTS idx_sp_impressions ON search_performance(impressions DESC);
CREATE INDEX IF NOT EXISTS idx_sp_date_query ON search_performance(date, query);

-- FTS5 trigram index for substring keyword matching
CREATE VIRTUAL TABLE IF NOT EXISTS search_performance_fts USING fts5(
  query, content=search_performance, content_rowid=id, tokenize='trigram'
);

-- Keep FTS index in sync with inserts
CREATE TRIGGER IF NOT EXISTS sp_fts_insert AFTER INSERT ON search_performance
BEGIN
  INSERT INTO search_performance_fts(rowid, query) VALUES (new.id, new.query);
END;

-- 404 tracking for search-origin and referrer analysis
CREATE TABLE IF NOT EXISTS not_found_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  referrer TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  count INTEGER NOT NULL DEFAULT 1,
  first_seen TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(path, referrer)
);

CREATE INDEX IF NOT EXISTS idx_nf_path ON not_found_log(path);
CREATE INDEX IF NOT EXISTS idx_nf_count ON not_found_log(count DESC);

-- Derived content gap analysis
CREATE TABLE IF NOT EXISTS content_gaps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query_cluster TEXT NOT NULL,
  representative_query TEXT NOT NULL,
  total_impressions INTEGER NOT NULL DEFAULT 0,
  avg_position REAL NOT NULL DEFAULT 0,
  suggested_action TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'done', 'dismissed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cg_status ON content_gaps(status);

-- Meta tag A/B experiments
CREATE TABLE IF NOT EXISTS meta_experiments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page TEXT NOT NULL,
  field TEXT NOT NULL CHECK(field IN ('title', 'description')),
  original_value TEXT NOT NULL,
  new_value TEXT NOT NULL,
  start_date TEXT NOT NULL DEFAULT (date('now')),
  end_date TEXT,
  baseline_ctr REAL NOT NULL DEFAULT 0,
  current_ctr REAL NOT NULL DEFAULT 0,
  baseline_impressions INTEGER NOT NULL DEFAULT 0,
  current_impressions INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed', 'reverted')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_me_page ON meta_experiments(page);
CREATE INDEX IF NOT EXISTS idx_me_status ON meta_experiments(status);

-- SEO actions tracking (fixes applied via /seo-report)
CREATE TABLE IF NOT EXISTS seo_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action_type TEXT NOT NULL CHECK(action_type IN (
    'content_gap', 'meta_rewrite', 'redirect_added',
    'wrong_page_fix', 'content_strengthen', 'new_content', 'quality_fix'
  )),
  target_url TEXT NOT NULL DEFAULT '',
  target_query TEXT NOT NULL DEFAULT '',
  content_gap_id INTEGER,
  notes TEXT NOT NULL DEFAULT '',
  commit_hash TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'addressed' CHECK(status IN ('addressed', 'monitoring', 'reverted')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sa_type_status ON seo_actions(action_type, status);
CREATE INDEX IF NOT EXISTS idx_sa_gap_id ON seo_actions(content_gap_id);
CREATE INDEX IF NOT EXISTS idx_sa_created ON seo_actions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sa_url ON seo_actions(target_url);
