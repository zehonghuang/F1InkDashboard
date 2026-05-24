CREATE TABLE IF NOT EXISTS device_boot_reports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  device_id VARCHAR(32) NOT NULL,
  device_uuid VARCHAR(64) DEFAULT NULL,
  device_key VARCHAR(64) DEFAULT NULL,
  mac VARCHAR(32) DEFAULT NULL,
  board_type VARCHAR(64) DEFAULT NULL,
  fw_user_agent VARCHAR(128) DEFAULT NULL,
  first_seen_at DATETIME(3) NOT NULL,
  last_seen_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_device_id (device_id),
  KEY idx_last_seen_at (last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
