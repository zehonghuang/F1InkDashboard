USE toinc_F1;

CREATE TABLE IF NOT EXISTS openf1_lap_controls_series (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_key INT NOT NULL,
  driver_number SMALLINT UNSIGNED NOT NULL,
  lap_number SMALLINT UNSIGNED NOT NULL,
  date_start_utc DATETIME(6) NOT NULL,
  lap_duration DOUBLE NULL,
  duration_sector_1 DOUBLE NULL,
  duration_sector_2 DOUBLE NULL,
  duration_sector_3 DOUBLE NULL,
  max_points INT UNSIGNED NOT NULL DEFAULT 0,
  points_count INT UNSIGNED NOT NULL DEFAULT 0,
  payload_json JSON NOT NULL,
  created_at_utc DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at_utc DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_openf1_lap_controls_series (session_key, driver_number, lap_number, date_start_utc),
  KEY ix_openf1_lap_controls_series_session_driver (session_key, driver_number),
  KEY ix_openf1_lap_controls_series_session_driver_lap (session_key, driver_number, lap_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

