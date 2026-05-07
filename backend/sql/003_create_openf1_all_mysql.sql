USE toinc_F1;

CREATE TABLE IF NOT EXISTS openf1_meetings (
  meeting_key INT NOT NULL,
  year INT NULL,
  meeting_name VARCHAR(128) NULL,
  meeting_official_name VARCHAR(256) NULL,
  location VARCHAR(128) NULL,
  country_name VARCHAR(128) NULL,
  country_code VARCHAR(8) NULL,
  country_key INT NULL,
  circuit_key INT NULL,
  circuit_short_name VARCHAR(128) NULL,
  circuit_type VARCHAR(64) NULL,
  circuit_image VARCHAR(512) NULL,
  circuit_info_url VARCHAR(512) NULL,
  country_flag VARCHAR(512) NULL,
  date_start_utc DATETIME(0) NULL,
  date_end_utc DATETIME(0) NULL,
  gmt_offset VARCHAR(16) NULL,
  is_cancelled TINYINT(1) NULL,
  created_at_utc DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at_utc DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (meeting_key),
  KEY ix_openf1_meetings_year (year),
  KEY ix_openf1_meetings_country (country_name),
  KEY ix_openf1_meetings_date (date_start_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS openf1_sessions (
  session_key INT NOT NULL,
  meeting_key INT NULL,
  year INT NULL,
  session_name VARCHAR(64) NULL,
  session_type VARCHAR(64) NULL,
  location VARCHAR(128) NULL,
  country_name VARCHAR(128) NULL,
  country_code VARCHAR(8) NULL,
  country_key INT NULL,
  circuit_key INT NULL,
  circuit_short_name VARCHAR(128) NULL,
  date_start_utc DATETIME(0) NULL,
  date_end_utc DATETIME(0) NULL,
  gmt_offset VARCHAR(16) NULL,
  is_cancelled TINYINT(1) NULL,
  created_at_utc DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at_utc DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (session_key),
  KEY ix_openf1_sessions_meeting (meeting_key),
  KEY ix_openf1_sessions_year (year),
  KEY ix_openf1_sessions_date (date_start_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS openf1_drivers (
  session_key INT NOT NULL,
  driver_number SMALLINT UNSIGNED NOT NULL,
  meeting_key INT NULL,
  broadcast_name VARCHAR(64) NULL,
  first_name VARCHAR(64) NULL,
  last_name VARCHAR(64) NULL,
  full_name VARCHAR(96) NULL,
  name_acronym VARCHAR(8) NULL,
  country_code VARCHAR(8) NULL,
  headshot_url VARCHAR(512) NULL,
  team_name VARCHAR(64) NULL,
  team_colour VARCHAR(8) NULL,
  created_at_utc DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at_utc DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (session_key, driver_number),
  KEY ix_openf1_drivers_driver (driver_number),
  KEY ix_openf1_drivers_team (team_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


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
  segments_sector_1 JSON NULL,
  segments_sector_2 JSON NULL,
  segments_sector_3 JSON NULL,
  created_at_utc DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_openf1_laps (session_key, driver_number, lap_number, date_start_utc),
  KEY ix_openf1_laps_driver_time (driver_number, date_start_utc),
  KEY ix_openf1_laps_session_driver_time (session_key, driver_number, date_start_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS openf1_location (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  meeting_key INT NULL,
  session_key INT NULL,
  driver_number SMALLINT UNSIGNED NOT NULL,
  date_utc DATETIME(6) NOT NULL,
  x INT NULL,
  y INT NULL,
  z INT NULL,
  created_at_utc DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_openf1_location (session_key, driver_number, date_utc),
  KEY ix_openf1_location_session_driver_time (session_key, driver_number, date_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS openf1_position (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  meeting_key INT NULL,
  session_key INT NULL,
  driver_number SMALLINT UNSIGNED NOT NULL,
  date_utc DATETIME(6) NOT NULL,
  position SMALLINT UNSIGNED NULL,
  created_at_utc DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_openf1_position (session_key, driver_number, date_utc),
  KEY ix_openf1_position_session_driver_time (session_key, driver_number, date_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS openf1_intervals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  meeting_key INT NULL,
  session_key INT NULL,
  driver_number SMALLINT UNSIGNED NOT NULL,
  date_utc DATETIME(6) NOT NULL,
  gap_to_leader DOUBLE NULL,
  interval_to_ahead DOUBLE NULL,
  created_at_utc DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_openf1_intervals (session_key, driver_number, date_utc),
  KEY ix_openf1_intervals_session_time (session_key, date_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS openf1_pit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  meeting_key INT NULL,
  session_key INT NULL,
  driver_number SMALLINT UNSIGNED NOT NULL,
  date_utc DATETIME(6) NOT NULL,
  lap_number SMALLINT UNSIGNED NULL,
  lane_duration DOUBLE NULL,
  pit_duration DOUBLE NULL,
  stop_duration DOUBLE NULL,
  created_at_utc DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_openf1_pit (session_key, driver_number, date_utc),
  KEY ix_openf1_pit_session_time (session_key, date_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS openf1_race_control (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  meeting_key INT NULL,
  session_key INT NULL,
  date_utc DATETIME(6) NOT NULL,
  category VARCHAR(32) NULL,
  scope VARCHAR(32) NULL,
  message VARCHAR(512) NULL,
  flag VARCHAR(64) NULL,
  driver_number SMALLINT UNSIGNED NULL,
  lap_number SMALLINT UNSIGNED NULL,
  qualifying_phase TINYINT UNSIGNED NULL,
  sector SMALLINT UNSIGNED NULL,
  created_at_utc DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_openf1_race_control (session_key, date_utc, category, message(128)),
  KEY ix_openf1_race_control_session_time (session_key, date_utc),
  KEY ix_openf1_race_control_driver_time (driver_number, date_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS openf1_weather (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  meeting_key INT NULL,
  session_key INT NULL,
  date_utc DATETIME(6) NOT NULL,
  air_temperature DOUBLE NULL,
  track_temperature DOUBLE NULL,
  humidity TINYINT UNSIGNED NULL,
  pressure DOUBLE NULL,
  rainfall TINYINT(1) NULL,
  wind_direction SMALLINT UNSIGNED NULL,
  wind_speed DOUBLE NULL,
  created_at_utc DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_openf1_weather (session_key, date_utc),
  KEY ix_openf1_weather_session_time (session_key, date_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS openf1_team_radio (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  meeting_key INT NULL,
  session_key INT NULL,
  driver_number SMALLINT UNSIGNED NOT NULL,
  date_utc DATETIME(6) NOT NULL,
  recording_url VARCHAR(512) NULL,
  created_at_utc DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_openf1_team_radio (session_key, driver_number, date_utc),
  KEY ix_openf1_team_radio_session_time (session_key, date_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS openf1_overtakes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  meeting_key INT NULL,
  session_key INT NULL,
  date_utc DATETIME(6) NOT NULL,
  overtaking_driver_number SMALLINT UNSIGNED NULL,
  overtaken_driver_number SMALLINT UNSIGNED NULL,
  position SMALLINT UNSIGNED NULL,
  created_at_utc DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_openf1_overtakes (session_key, date_utc, overtaking_driver_number, overtaken_driver_number),
  KEY ix_openf1_overtakes_session_time (session_key, date_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS openf1_stints (
  session_key INT NOT NULL,
  driver_number SMALLINT UNSIGNED NOT NULL,
  stint_number SMALLINT UNSIGNED NOT NULL,
  meeting_key INT NULL,
  compound VARCHAR(16) NULL,
  lap_start SMALLINT UNSIGNED NULL,
  lap_end SMALLINT UNSIGNED NULL,
  tyre_age_at_start SMALLINT UNSIGNED NULL,
  created_at_utc DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at_utc DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (session_key, driver_number, stint_number),
  KEY ix_openf1_stints_driver (driver_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS openf1_session_result (
  session_key INT NOT NULL,
  driver_number SMALLINT UNSIGNED NOT NULL,
  meeting_key INT NULL,
  position SMALLINT UNSIGNED NULL,
  number_of_laps SMALLINT UNSIGNED NULL,
  dnf TINYINT(1) NULL,
  dns TINYINT(1) NULL,
  dsq TINYINT(1) NULL,
  duration_s DOUBLE NULL,
  gap_to_leader_s DOUBLE NULL,
  duration_json JSON NULL,
  gap_to_leader_json JSON NULL,
  created_at_utc DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at_utc DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (session_key, driver_number),
  KEY ix_openf1_session_result_position (session_key, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS openf1_starting_grid (
  session_key INT NOT NULL,
  position SMALLINT UNSIGNED NOT NULL,
  driver_number SMALLINT UNSIGNED NULL,
  meeting_key INT NULL,
  lap_duration DOUBLE NULL,
  created_at_utc DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at_utc DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (session_key, position),
  KEY ix_openf1_starting_grid_driver (session_key, driver_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS openf1_championship_drivers (
  session_key INT NOT NULL,
  driver_number SMALLINT UNSIGNED NOT NULL,
  meeting_key INT NULL,
  position_start SMALLINT UNSIGNED NULL,
  position_current SMALLINT UNSIGNED NULL,
  points_start INT NULL,
  points_current INT NULL,
  created_at_utc DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at_utc DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (session_key, driver_number),
  KEY ix_openf1_championship_drivers_position (session_key, position_current)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS openf1_championship_teams (
  session_key INT NOT NULL,
  team_name VARCHAR(64) NOT NULL,
  meeting_key INT NULL,
  position_start SMALLINT UNSIGNED NULL,
  position_current SMALLINT UNSIGNED NULL,
  points_start INT NULL,
  points_current INT NULL,
  created_at_utc DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at_utc DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (session_key, team_name),
  KEY ix_openf1_championship_teams_position (session_key, position_current)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

