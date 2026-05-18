USE toinc_F1;

CREATE TABLE IF NOT EXISTS i18n_text (
  entity_type VARCHAR(32) NOT NULL,
  entity_key VARCHAR(64) NOT NULL,
  field VARCHAR(32) NOT NULL,
  lang VARCHAR(16) NOT NULL,
  text VARCHAR(255) NOT NULL,
  created_at_utc DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at_utc DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (entity_type, entity_key, field, lang),
  KEY ix_i18n_text_entity_lang (entity_type, lang),
  KEY ix_i18n_text_entity_field_lang (entity_type, field, lang)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
