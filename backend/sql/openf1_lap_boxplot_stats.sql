USE toinc_F1;

CREATE TABLE IF NOT EXISTS openf1_lap_boxplot_stats (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

  session_key INT NOT NULL,
  driver_number SMALLINT UNSIGNED NOT NULL,

  metric VARCHAR(32) NOT NULL,
  subset VARCHAR(32) NOT NULL,
  group_key VARCHAR(64) NOT NULL DEFAULT 'session',

  lap_from SMALLINT UNSIGNED NULL,
  lap_to SMALLINT UNSIGNED NULL,

  sample_count INT UNSIGNED NOT NULL DEFAULT 0,

  min_value DOUBLE NULL,
  q1_value DOUBLE NULL,
  median_value DOUBLE NULL,
  q3_value DOUBLE NULL,
  max_value DOUBLE NULL,

  iqr_value DOUBLE NULL,
  whisker_low DOUBLE NULL,
  whisker_high DOUBLE NULL,

  outliers_json JSON NOT NULL,
  payload_json JSON NOT NULL,

  created_at_utc DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at_utc DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),

  PRIMARY KEY (id),
  UNIQUE KEY uq_openf1_lap_boxplot_stats (session_key, driver_number, metric, subset, group_key),
  KEY ix_openf1_lap_boxplot_stats_session_metric (session_key, metric),
  KEY ix_openf1_lap_boxplot_stats_session_driver (session_key, driver_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS openf1_lap_tags (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

  session_key INT NOT NULL,
  driver_number SMALLINT UNSIGNED NOT NULL,
  lap_number SMALLINT UNSIGNED NOT NULL,
  date_start_utc DATETIME(6) NOT NULL,

  is_pit_out_lap TINYINT(1) NULL,

  has_yellow TINYINT(1) NOT NULL DEFAULT 0,
  has_sc TINYINT(1) NOT NULL DEFAULT 0,
  has_vsc TINYINT(1) NOT NULL DEFAULT 0,

  flags_json JSON NOT NULL,

  created_at_utc DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at_utc DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),

  PRIMARY KEY (id),
  UNIQUE KEY uq_openf1_lap_tags (session_key, driver_number, lap_number, date_start_utc),
  KEY ix_openf1_lap_tags_session_driver (session_key, driver_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;