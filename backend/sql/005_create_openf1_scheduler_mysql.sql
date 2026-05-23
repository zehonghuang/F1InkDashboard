CREATE TABLE IF NOT EXISTS openf1_sync_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_key INT NOT NULL,
  started_at_utc DATETIME(6) NOT NULL,
  finished_at_utc DATETIME(6) NULL,
  ok TINYINT(1) NOT NULL DEFAULT 0,
  duration_ms INT UNSIGNED NULL,
  total_rows INT UNSIGNED NULL,
  total_insert_attempt INT UNSIGNED NULL,
  endpoints_json JSON NULL,
  error_message VARCHAR(512) NULL,
  created_at_utc DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY ix_openf1_sync_runs_session (session_key, started_at_utc),
  KEY ix_openf1_sync_runs_ok (ok, started_at_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS openf1_sync_session_status (
  session_key INT NOT NULL,
  last_attempt_at_utc DATETIME(6) NULL,
  last_success_at_utc DATETIME(6) NULL,
  last_ok TINYINT(1) NULL,
  last_duration_ms INT UNSIGNED NULL,
  last_total_rows INT UNSIGNED NULL,
  last_total_insert_attempt INT UNSIGNED NULL,
  last_error_message VARCHAR(512) NULL,
  updated_at_utc DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (session_key),
  KEY ix_openf1_sync_session_status_last_attempt (last_attempt_at_utc),
  KEY ix_openf1_sync_session_status_last_success (last_success_at_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

