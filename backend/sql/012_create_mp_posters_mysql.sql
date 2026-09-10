CREATE TABLE IF NOT EXISTS mp_posters (
    id BIGINT NOT NULL AUTO_INCREMENT,

    title VARCHAR(255) NOT NULL,

    poster_url VARCHAR(512) NOT NULL DEFAULT '',
    poster_width INT NOT NULL DEFAULT 0,
    poster_height INT NOT NULL DEFAULT 0,
    poster_ratio DOUBLE NOT NULL DEFAULT 0,

    status VARCHAR(32) NOT NULL DEFAULT 'draft',
    weight INT NOT NULL DEFAULT 0,

    content_format VARCHAR(32) NOT NULL DEFAULT 'RICH_TEXT_NODES',
    content_text MEDIUMTEXT NULL,
    content_nodes JSON NULL,

    published_at DATETIME(3) NULL,

    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,

    PRIMARY KEY (id),

    KEY idx_mp_posters_status_weight (status, weight, created_at),
    KEY idx_mp_posters_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
