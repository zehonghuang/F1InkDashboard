ALTER TABLE mp_users
    ADD COLUMN nick_name VARCHAR(64) NULL AFTER unionid,
    ADD COLUMN avatar_url VARCHAR(512) NULL AFTER nick_name;

