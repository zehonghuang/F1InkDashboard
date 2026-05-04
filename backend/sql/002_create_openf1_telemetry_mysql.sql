USE toinc_F1;

CREATE TABLE IF NOT EXISTS openf1_car_data (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  meeting_key INT NULL,
  session_key INT NULL,
  driver_number SMALLINT UNSIGNED NOT NULL,
  date_utc DATETIME(6) NOT NULL,

  speed SMALLINT UNSIGNED NULL,
  throttle TINYINT UNSIGNED NULL,
  brake TINYINT UNSIGNED NULL,
  drs TINYINT UNSIGNED NULL,
  n_gear TINYINT UNSIGNED NULL,
  rpm INT UNSIGNED NULL,

  created_at_utc DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

  PRIMARY KEY (id),
  UNIQUE KEY uq_openf1_car_data (session_key, driver_number, date_utc),
  KEY ix_openf1_car_data_driver_time (driver_number, date_utc),
  KEY ix_openf1_car_data_session_driver_time (session_key, driver_number, date_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS openf1_laps (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  meeting_key INT NULL,
  session_key INT NULL,
  driver_number SMALLINT UNSIGNED NOT NULL,
  lap_number SMALLINT UNSIGNED NULL,
  date_start_utc DATETIME(6) NOT NULL,

  lap_duration DOUBLE NULL,
  duration_sector_1 DOUBLE NULL,
  duration_sector_2 DOUBLE NULL,
  duration_sector_3 DOUBLE NULL,
  i1_speed SMALLINT UNSIGNED NULL,
  i2_speed SMALLINT UNSIGNED NULL,
  st_speed SMALLINT UNSIGNED NULL,
  is_pit_out_lap TINYINT(1) NULL,

  created_at_utc DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

  PRIMARY KEY (id),
  UNIQUE KEY uq_openf1_laps (session_key, driver_number, lap_number, date_start_utc),
  KEY ix_openf1_laps_driver_time (driver_number, date_start_utc),
  KEY ix_openf1_laps_session_driver_time (session_key, driver_number, date_start_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

