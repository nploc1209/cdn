CREATE TABLE files
(
    id         TEXT PRIMARY KEY,
    owner_id   TEXT    NOT NULL,

    name       TEXT    NOT NULL,
    r2_key     TEXT    NOT NULL UNIQUE,

    size       INTEGER NOT NULL,
    mime_type  TEXT,

    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX idx_files_owner
    ON files (owner_id);

CREATE INDEX idx_files_created
    ON files (created_at);