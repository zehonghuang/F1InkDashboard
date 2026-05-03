CREATE DATABASE IF NOT EXISTS `toinc_F1`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `toinc_F1`;

CREATE TABLE IF NOT EXISTS `f1_season` (
  `year` INT NOT NULL,
  `ergast_url` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `f1_circuit` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `ergast_circuit_id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(128) NULL,
  `locality` VARCHAR(128) NULL,
  `country` VARCHAR(128) NULL,
  `latitude` DECIMAL(9,6) NULL,
  `longitude` DECIMAL(9,6) NULL,
  `ergast_url` VARCHAR(255) NULL,
  `formula1_slug` VARCHAR(128) NULL,
  `track_key` VARCHAR(64) NULL,
  `map_image_url` VARCHAR(255) NULL,
  `assets_json` JSON NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_f1_circuit_ergast_circuit_id` (`ergast_circuit_id`),
  KEY `idx_f1_circuit_country` (`country`),
  KEY `idx_f1_circuit_locality` (`locality`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `f1_race` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `season_year` INT NOT NULL,
  `round` INT NOT NULL,
  `race_name` VARCHAR(128) NOT NULL,
  `ergast_url` VARCHAR(255) NULL,
  `circuit_id` BIGINT NOT NULL,
  `race_start_utc` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_f1_race_season_round` (`season_year`, `round`),
  KEY `idx_f1_race_season_start` (`season_year`, `race_start_utc`),
  KEY `idx_f1_race_circuit_id` (`circuit_id`),
  CONSTRAINT `fk_f1_race_season` FOREIGN KEY (`season_year`) REFERENCES `f1_season` (`year`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_f1_race_circuit` FOREIGN KEY (`circuit_id`) REFERENCES `f1_circuit` (`id`)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `f1_race_session` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `race_id` BIGINT NOT NULL,
  `session_type` ENUM('FP1','FP2','FP3','Q','SPRINT','RACE') NOT NULL,
  `start_utc` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_f1_race_session_race_type` (`race_id`, `session_type`),
  KEY `idx_f1_race_session_start` (`start_utc`),
  CONSTRAINT `fk_f1_race_session_race` FOREIGN KEY (`race_id`) REFERENCES `f1_race` (`id`)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `f1_driver` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `ergast_driver_id` VARCHAR(64) NOT NULL,
  `code` VARCHAR(8) NULL,
  `permanent_number` INT NULL,
  `given_name` VARCHAR(64) NULL,
  `family_name` VARCHAR(64) NULL,
  `date_of_birth` DATE NULL,
  `nationality` VARCHAR(64) NULL,
  `ergast_url` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_f1_driver_ergast_driver_id` (`ergast_driver_id`),
  KEY `idx_f1_driver_name` (`family_name`, `given_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `f1_constructor` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `ergast_constructor_id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(128) NOT NULL,
  `nationality` VARCHAR(64) NULL,
  `ergast_url` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_f1_constructor_ergast_constructor_id` (`ergast_constructor_id`),
  KEY `idx_f1_constructor_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `f1_driver_standing` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `season_year` INT NOT NULL,
  `round` INT NOT NULL,
  `driver_id` BIGINT NOT NULL,
  `position` INT NOT NULL,
  `points` DECIMAL(7,2) NOT NULL,
  `wins` INT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_f1_driver_standing_season_round_driver` (`season_year`, `round`, `driver_id`),
  KEY `idx_f1_driver_standing_lookup` (`season_year`, `round`, `position`),
  CONSTRAINT `fk_f1_driver_standing_season` FOREIGN KEY (`season_year`) REFERENCES `f1_season` (`year`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_f1_driver_standing_driver` FOREIGN KEY (`driver_id`) REFERENCES `f1_driver` (`id`)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `f1_constructor_standing` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `season_year` INT NOT NULL,
  `round` INT NOT NULL,
  `constructor_id` BIGINT NOT NULL,
  `position` INT NOT NULL,
  `points` DECIMAL(7,2) NOT NULL,
  `wins` INT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_f1_constructor_standing_season_round_constructor` (`season_year`, `round`, `constructor_id`),
  KEY `idx_f1_constructor_standing_lookup` (`season_year`, `round`, `position`),
  CONSTRAINT `fk_f1_constructor_standing_season` FOREIGN KEY (`season_year`) REFERENCES `f1_season` (`year`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_f1_constructor_standing_constructor` FOREIGN KEY (`constructor_id`) REFERENCES `f1_constructor` (`id`)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
