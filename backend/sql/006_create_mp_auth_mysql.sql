CREATE TABLE IF NOT EXISTS mp_users (
    id BIGINT NOT NULL AUTO_INCREMENT,
    openid VARCHAR(64) NOT NULL,
    unionid VARCHAR(64) NULL,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_mp_users_openid (openid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mp_sessions (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    token CHAR(64) NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    created_at DATETIME(3) NOT NULL,
    last_seen_at DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_mp_sessions_token (token),
    KEY idx_mp_sessions_user_id (user_id),
    KEY idx_mp_sessions_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mp_user_devices (
    id BIGINT NOT NULL AUTO_INCREMENT,
    device_id VARCHAR(32) NOT NULL,
    user_id BIGINT NOT NULL,
    bound_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_mp_user_devices_device_id (device_id),
    KEY idx_mp_user_devices_user_id (user_id),
    KEY idx_mp_user_devices_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

