CREATE TABLE IF NOT EXISTS mp_news_articles (
    id VARCHAR(64) NOT NULL,

    layout_code VARCHAR(16) NOT NULL,
    hero_display_code VARCHAR(16) NULL,
    type_code VARCHAR(16) NOT NULL,

    pinned TINYINT(1) NOT NULL DEFAULT 0,
    weight INT NOT NULL DEFAULT 0,

    tag_text VARCHAR(64) NOT NULL DEFAULT '',

    title VARCHAR(256) NOT NULL,
    summary VARCHAR(1024) NOT NULL DEFAULT '',

    cover_url VARCHAR(512) NOT NULL DEFAULT '',

    published_at DATETIME(3) NOT NULL,

    source_name VARCHAR(64) NOT NULL DEFAULT '',
    source_url VARCHAR(1024) NOT NULL DEFAULT '',

    content_format_code VARCHAR(32) NOT NULL DEFAULT 'PLAIN',
    content_text MEDIUMTEXT NULL,
    content_nodes JSON NULL,

    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,

    PRIMARY KEY (id),

    KEY idx_mp_news_articles_list (pinned, weight, published_at),
    KEY idx_mp_news_articles_published_at (published_at),
    KEY idx_mp_news_articles_type_code (type_code),
    KEY idx_mp_news_articles_layout_code (layout_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mp_news_article_tags (
    article_id VARCHAR(64) NOT NULL,
    tag VARCHAR(64) NOT NULL,

    created_at DATETIME(3) NOT NULL,

    PRIMARY KEY (article_id, tag),
    KEY idx_mp_news_article_tags_article_id (article_id),
    KEY idx_mp_news_article_tags_tag (tag)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE mp_news_articles
    ADD FULLTEXT KEY ft_mp_news_articles_search (title, summary, tag_text);

