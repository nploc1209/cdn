CREATE TABLE analytics
(
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id   TEXT    NOT NULL,
    file_id    TEXT,
    event      TEXT    NOT NULL,
    bytes      INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);

CREATE INDEX idx_analytics_owner_created
    ON analytics (owner_id, created_at);