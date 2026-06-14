USE toinc_F1;

CREATE TABLE IF NOT EXISTS openf1_meeting_circuit_maps (
  meeting_key INT NOT NULL,
  season_year INT NOT NULL,
  ergast_circuit_id VARCHAR(64) NULL,
  circuit_name VARCHAR(128) NULL,
  track_key VARCHAR(64) NULL,
  map_image_url VARCHAR(255) NULL,
  map_image_url_detail VARCHAR(255) NULL,
  created_at_utc DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at_utc DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (meeting_key),
  KEY ix_openf1_meeting_circuit_maps_season (season_year),
  KEY ix_openf1_meeting_circuit_maps_circuit (ergast_circuit_id),
  CONSTRAINT fk_openf1_meeting_circuit_maps_meeting
    FOREIGN KEY (meeting_key) REFERENCES openf1_meetings (meeting_key)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
