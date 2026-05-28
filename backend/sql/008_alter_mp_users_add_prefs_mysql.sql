ALTER TABLE mp_users
    ADD COLUMN preferred_team_name VARCHAR(64) NULL AFTER avatar_url,
    ADD COLUMN preferred_team_keys TEXT NULL AFTER preferred_team_name,
    ADD COLUMN preferred_driver_numbers TEXT NULL AFTER preferred_team_keys;
