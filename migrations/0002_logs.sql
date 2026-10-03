CREATE TABLE logs
(
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id   TEXT    NOT NULL,
    action     TEXT    NOT NULL,
    file_id    TEXT,
    file_name  TEXT,
    created_at INTEGER NOT NULL
);

CREATE INDEX idx_logs_owner_created
    ON logs (owner_id, created_at);