const STORAGE_LIMIT = 128 * 1024 * 1024;

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Range, If-None-Match, If-Match, If-Modified-Since, X-Owner-Id",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, Content-Disposition, ETag, Accept-Ranges"
};

function jsonResponse(data, status = 200, headers = {}) {
    return Response.json(data, {
        status,
        headers: {
            ...corsHeaders,
            ...headers
        }
    });
}

function getOwnerId(request, url) {
    return request.headers.get("x-owner-id") ||
           url.searchParams.get("owner_id") ||
           "demo";
}

function generateProgressBar(used, limit, length = 20) {
    if (limit <= 0) {
        return "░".repeat(length);
    }

    const ratio = Math.min(1, Math.max(0, used / limit));
    const filled = Math.round(ratio * length);

    return "█".repeat(filled) + "░".repeat(length - filled);
}

async function logActivity(env, ownerId, action, fileId = null, fileName = null) {
    try {
        const now = Date.now();
        const oneDayAgo = now - 86400000;

        await env.DB.batch([
            env.DB
                .prepare(`
                    DELETE FROM logs
                    WHERE created_at < ?
                `)
                .bind(oneDayAgo),
            env.DB
                .prepare(`
                    INSERT INTO logs (owner_id, action, file_id, file_name, created_at)
                    VALUES (?, ?, ?, ?, ?)
                `)
                .bind(
                    ownerId,
                    action,
                    fileId,
                    fileName,
                    now
                )
        ]);
    } catch (e) {
    }
}

async function logAnalytics(env, ownerId, event, bytes = 0, fileId = null) {
    try {
        await env.DB
            .prepare(`
                INSERT INTO analytics (owner_id, file_id, event, bytes, created_at)
                VALUES (?, ?, ?, ?, ?)
            `)
            .bind(
                ownerId,
                fileId,
                event,
                bytes,
                Date.now()
            )
            .run();
    } catch (e) {
    }
}

async function ensureUsersTable(env) {
    try {
        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
        `).run();
        await env.DB.prepare(`
            CREATE INDEX IF NOT EXISTS idx_users_username ON users (username)
        `).run();
    } catch (e) {
    }
}

async function ensureUserAccount(env, ownerId) {
    try {
        await ensureUsersTable(env);
        const existing = await env.DB
            .prepare(`SELECT id, username, password FROM users WHERE id = ?`)
            .bind(ownerId)
            .first();

        if (existing) {
            return null;
        }

        let autoUsername = "";
        for (let i = 0; i < 5; i++) {
            const candidate = `guest_${Math.random().toString(36).substring(2, 6)}`;
            const taken = await env.DB.prepare(`SELECT id FROM users WHERE username = ?`).bind(candidate).first();
            if (!taken) {
                autoUsername = candidate;
                break;
            }
        }
        if (!autoUsername) {
            autoUsername = `guest_${Date.now().toString(36).slice(-4)}`;
        }

        const autoPassword = `pass_${Math.random().toString(36).substring(2, 8)}`;
        const now = Date.now();

        await env.DB
            .prepare(`
                INSERT INTO users (id, username, password, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
            `)
            .bind(ownerId, autoUsername, autoPassword, now, now)
            .run();

        return {
            id: ownerId,
            username: autoUsername,
            password: autoPassword
        };
    } catch (e) {
        return null;
    }
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const ownerId = getOwnerId(request, url);

        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: corsHeaders
            });
        }

        try {
            if (url.pathname === "/api/health") {
                await logAnalytics(env, ownerId, "api_request", 40);

                return jsonResponse({
                    status: "ok",
                    service: "the-cdn-website",
                    timestamp: Date.now()
                });
            }

            if (url.pathname === "/f/health" || url.pathname === "/f/ping") {
                await logAnalytics(env, ownerId, "cdn_request", 20);

                return jsonResponse({
                    status: "operational",
                    service: "cdn",
                    timestamp: Date.now()
                });
            }

            if (url.pathname === "/api/test-r2") {
                await env.FILES.put(
                    "test/hello.txt",
                    "Hello from The CDN Website!"
                );

                const object = await env.FILES.get("test/hello.txt");

                if (!object) {
                    return jsonResponse(
                        {error: "R2 object not found"},
                        500
                    );
                }

                await logAnalytics(env, ownerId, "api_request", 50);

                return new Response(await object.text(), {
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "text/plain"
                    }
                });
            }

            if (url.pathname === "/api/test-db") {
                const result = await env.DB
                    .prepare(
                        "SELECT name FROM sqlite_master WHERE type = 'table'"
                    )
                    .all();

                await logAnalytics(env, ownerId, "api_request", 50);

                return jsonResponse(result);
            }

            if (url.pathname === "/api/auth/login" && request.method === "POST") {
                await ensureUsersTable(env);
                const body = await request.json().catch(() => ({}));
                const username = (body.username || "").trim();
                const password = (body.password || "").trim();

                if (!username || !password) {
                    return jsonResponse({ error: "Username and password are required" }, 400);
                }

                const user = await env.DB
                    .prepare(`SELECT id, username, password, created_at FROM users WHERE username = ?`)
                    .bind(username)
                    .first();

                if (!user || user.password !== password) {
                    return jsonResponse({ error: "Invalid username or password" }, 401);
                }

                return jsonResponse({
                    success: true,
                    user: {
                        id: user.id,
                        username: user.username,
                        created_at: user.created_at
                    }
                });
            }

            if (url.pathname === "/api/auth/me" && request.method === "GET") {
                await ensureUsersTable(env);
                const user = await env.DB
                    .prepare(`SELECT id, username, password, created_at FROM users WHERE id = ?`)
                    .bind(ownerId)
                    .first();

                if (!user) {
                    return jsonResponse({ user: null });
                }

                return jsonResponse({
                    user: {
                        id: user.id,
                        username: user.username,
                        password: user.password,
                        created_at: user.created_at
                    }
                });
            }

            if (url.pathname === "/api/auth/change-username" && request.method === "POST") {
                await ensureUsersTable(env);
                const body = await request.json().catch(() => ({}));
                const newUsername = (body.username || "").trim();

                if (!newUsername || newUsername.length < 3) {
                    return jsonResponse({ error: "Username must be at least 3 characters" }, 400);
                }

                const user = await env.DB
                    .prepare(`SELECT id FROM users WHERE id = ?`)
                    .bind(ownerId)
                    .first();

                if (!user) {
                    return jsonResponse({ error: "Account not found" }, 404);
                }

                const taken = await env.DB
                    .prepare(`SELECT id FROM users WHERE username = ? AND id != ?`)
                    .bind(newUsername, ownerId)
                    .first();

                if (taken) {
                    return jsonResponse({ error: "Username is already taken" }, 409);
                }

                await env.DB
                    .prepare(`UPDATE users SET username = ?, updated_at = ? WHERE id = ?`)
                    .bind(newUsername, Date.now(), ownerId)
                    .run();

                return jsonResponse({ success: true, username: newUsername });
            }

            if (url.pathname === "/api/auth/change-password" && request.method === "POST") {
                await ensureUsersTable(env);
                const body = await request.json().catch(() => ({}));
                const oldPassword = (body.old_password || "").trim();
                const newPassword = (body.new_password || "").trim();

                if (!newPassword || newPassword.length < 4) {
                    return jsonResponse({ error: "New password must be at least 4 characters" }, 400);
                }

                const user = await env.DB
                    .prepare(`SELECT id, password FROM users WHERE id = ?`)
                    .bind(ownerId)
                    .first();

                if (!user) {
                    return jsonResponse({ error: "Account not found" }, 404);
                }

                if (user.password !== oldPassword) {
                    return jsonResponse({ error: "Incorrect old password" }, 400);
                }

                await env.DB
                    .prepare(`UPDATE users SET password = ?, updated_at = ? WHERE id = ?`)
                    .bind(newPassword, Date.now(), ownerId)
                    .run();

                return jsonResponse({ success: true });
            }

            if (url.pathname === "/api/auth/delete" && (request.method === "POST" || request.method === "DELETE")) {
                await ensureUsersTable(env);
                await env.DB
                    .prepare(`DELETE FROM users WHERE id = ?`)
                    .bind(ownerId)
                    .run();

                return jsonResponse({ success: true });
            }

            if (
                url.pathname === "/api/files" &&
                request.method === "GET"
            ) {
                const search = url.searchParams.get("search")?.trim();
                const limitParam = url.searchParams.get("limit");
                const offsetParam = url.searchParams.get("offset");

                let query = `
                    SELECT id,
                           name,
                           size,
                           mime_type,
                           created_at,
                           updated_at
                    FROM files
                    WHERE owner_id = ?
                `;
                const params = [ownerId];

                if (search) {
                    query += ` AND name LIKE ?`;
                    params.push(`%${search}%`);
                }

                query += ` ORDER BY created_at DESC`;

                if (limitParam) {
                    const limit = Math.min(Math.max(1, Number(limitParam) || 50), 100);
                    const offset = Math.max(0, Number(offsetParam) || 0);

                    query += ` LIMIT ? OFFSET ?`;
                    params.push(limit, offset);
                }

                const result = await env.DB
                    .prepare(query)
                    .bind(...params)
                    .all();

                await logAnalytics(env, ownerId, "api_request", 150);

                return jsonResponse({
                    files: result.results
                });
            }

            if (
                url.pathname === "/api/upload/init" &&
                request.method === "POST"
            ) {
                const body = await request.json().catch(() => ({}));
                const name = body.name || "upload.bin";
                const size = Number(body.size || 0);
                const mimeType = body.mimeType || "application/octet-stream";

                const storage = await env.DB
                    .prepare(`
                        SELECT COALESCE(SUM(size), 0) AS used
                        FROM files
                        WHERE owner_id = ?
                    `)
                    .bind(ownerId)
                    .first();

                const used = Number(storage?.used || 0);

                if (used + size > STORAGE_LIMIT) {
                    return jsonResponse(
                        {
                            error: "Storage limit exceeded",
                            used,
                            limit: STORAGE_LIMIT,
                            available: Math.max(0, STORAGE_LIMIT - used)
                        },
                        413
                    );
                }

                const id = crypto.randomUUID();
                const r2Key = `files/${ownerId}/${id}/${name}`;
                const multipart = await env.FILES.createMultipartUpload(r2Key, {
                    httpMetadata: {
                        contentType: mimeType
                    }
                });

                return jsonResponse({
                    id,
                    uploadId: multipart.uploadId,
                    key: r2Key,
                    chunkSize: 20 * 1024 * 1024
                });
            }

            if (
                url.pathname === "/api/upload/part" &&
                (request.method === "PUT" || request.method === "POST")
            ) {
                const uploadId = url.searchParams.get("uploadId");
                const key = url.searchParams.get("key");
                const partNumber = parseInt(url.searchParams.get("partNumber") || "1", 10);

                if (!uploadId || !key || isNaN(partNumber) || partNumber < 1) {
                    return jsonResponse(
                        {error: "Missing or invalid part parameters"},
                        400
                    );
                }

                const chunkData = await request.arrayBuffer();
                const multipart = env.FILES.resumeMultipartUpload(key, uploadId);
                const uploadedPart = await multipart.uploadPart(partNumber, chunkData);

                return jsonResponse({
                    partNumber: uploadedPart.partNumber,
                    etag: uploadedPart.etag
                });
            }

            if (
                url.pathname === "/api/upload/complete" &&
                request.method === "POST"
            ) {
                const body = await request.json().catch(() => ({}));
                const { id, uploadId, key, name, size, mimeType, parts } = body;

                if (!uploadId || !key || !parts || !Array.isArray(parts)) {
                    return jsonResponse(
                        {error: "Missing or invalid complete parameters"},
                        400
                    );
                }

                const multipart = env.FILES.resumeMultipartUpload(key, uploadId);
                const sortedParts = parts.slice().sort((a, b) => a.partNumber - b.partNumber);
                await multipart.complete(sortedParts);

                const now = Date.now();
                const fileName = name || "upload.bin";
                const fileSize = Number(size || 0);
                const finalMime = mimeType || "application/octet-stream";

                try {
                    await env.DB
                        .prepare(`
                            INSERT INTO files (id,
                                               owner_id,
                                               name,
                                               r2_key,
                                               size,
                                               mime_type,
                                               created_at,
                                               updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        `)
                        .bind(
                            id,
                            ownerId,
                            fileName,
                            key,
                            fileSize,
                            finalMime,
                            now,
                            now
                        )
                        .run();

                    await logActivity(env, ownerId, "upload", id, fileName);
                    await logAnalytics(env, ownerId, "upload", fileSize, id);
                } catch (error) {
                    await env.FILES.delete(key);
                    throw error;
                }

                const newAccount = await ensureUserAccount(env, ownerId);

                return jsonResponse({
                    id,
                    name: fileName,
                    size: fileSize,
                    mime_type: finalMime,
                    created_at: now,
                    url: `${url.origin}/f/${id}`,
                    new_account: newAccount
                });
            }

            if (
                url.pathname === "/api/upload/abort" &&
                request.method === "POST"
            ) {
                const body = await request.json().catch(() => ({}));
                const { uploadId, key } = body;

                if (uploadId && key) {
                    const multipart = env.FILES.resumeMultipartUpload(key, uploadId);
                    await multipart.abort();
                }

                return jsonResponse({
                    aborted: true
                });
            }

            if (
                url.pathname === "/api/upload" &&
                request.method === "POST"
            ) {
                let file = null;
                const contentType = request.headers.get("content-type") || "";

                if (contentType.includes("multipart/form-data")) {
                    const formData = await request.formData();
                    let formFile = formData.get("file") || formData.get("upload") || formData.get("data");

                    if (!formFile) {
                        for (const [, val] of formData.entries()) {
                            if (val && typeof val === "object" && (typeof val.arrayBuffer === "function" || typeof val.stream === "function" || val.size !== undefined)) {
                                formFile = val;
                                break;
                            }
                        }
                    }

                    if (formFile && typeof formFile === "object") {
                        file = formFile;
                    } else if (typeof formFile === "string") {
                        file = new File([formFile], "upload.txt", {
                            type: "text/plain"
                        });
                    }
                } else if (request.body) {
                    const blob = await request.blob();
                    const rawName = url.searchParams.get("name") ||
                                    request.headers.get("x-filename") ||
                                    "upload.bin";

                    file = new File([blob], rawName, {
                        type: contentType || "application/octet-stream"
                    });
                }

                if (!file) {
                    return jsonResponse(
                        {error: "No file provided"},
                        400
                    );
                }

                const fileName = (file && typeof file.name === "string" && file.name.length > 0)
                    ? file.name
                    : (url.searchParams.get("name") || request.headers.get("x-filename") || "upload.bin");
                const mimeType = (file && typeof file.type === "string" && file.type.length > 0)
                    ? file.type
                    : "application/octet-stream";

                let fileData = null;
                if (typeof file.arrayBuffer === "function") {
                    fileData = await file.arrayBuffer();
                } else if (typeof file.stream === "function") {
                    fileData = file.stream();
                } else {
                    fileData = file;
                }

                const fileSize = (fileData instanceof ArrayBuffer)
                    ? fileData.byteLength
                    : Number(file?.size || 0);

                const storage = await env.DB
                    .prepare(`
                        SELECT COALESCE(SUM(size), 0) AS used
                        FROM files
                        WHERE owner_id = ?
                    `)
                    .bind(ownerId)
                    .first();

                const used = Number(storage?.used || 0);

                if (used + fileSize > STORAGE_LIMIT) {
                    return jsonResponse(
                        {
                            error: "Storage limit exceeded",
                            used,
                            limit: STORAGE_LIMIT,
                            available: Math.max(0, STORAGE_LIMIT - used)
                        },
                        413
                    );
                }

                const id = crypto.randomUUID();
                const r2Key = `files/${ownerId}/${id}/${fileName}`;
                const now = Date.now();

                await env.FILES.put(
                    r2Key,
                    fileData,
                    {
                        httpMetadata: {
                            contentType: mimeType
                        }
                    }
                );

                try {
                    await env.DB
                        .prepare(`
                            INSERT INTO files (id,
                                               owner_id,
                                               name,
                                               r2_key,
                                               size,
                                               mime_type,
                                               created_at,
                                               updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        `)
                        .bind(
                            id,
                            ownerId,
                            fileName,
                            r2Key,
                            fileSize,
                            mimeType,
                            now,
                            now
                        )
                        .run();

                    await logActivity(env, ownerId, "upload", id, fileName);
                    await logAnalytics(env, ownerId, "upload", fileSize, id);
                } catch (error) {
                    await env.FILES.delete(r2Key);
                    throw error;
                }

                const newAccount = await ensureUserAccount(env, ownerId);

                return jsonResponse({
                    id,
                    name: fileName,
                    size: fileSize,
                    mime_type: mimeType,
                    created_at: now,
                    url: `${url.origin}/f/${id}`,
                    new_account: newAccount
                });
            }

            if (
                url.pathname.startsWith("/f/") &&
                (request.method === "GET" || request.method === "HEAD")
            ) {
                const subPath = url.pathname.slice(3);
                const id = subPath.split("/")[0];

                if (!id) {
                    return jsonResponse(
                        {error: "Missing file id"},
                        400
                    );
                }

                const file = await env.DB
                    .prepare(`
                        SELECT id,
                               owner_id,
                               name,
                               r2_key,
                               mime_type,
                               size
                        FROM files
                        WHERE id = ?
                    `)
                    .bind(id)
                    .first();

                if (!file) {
                    return jsonResponse(
                        {error: "File not found"},
                        404
                    );
                }

                const ifNoneMatch = request.headers.get("if-none-match");

                const object = await env.FILES.get(file.r2_key, {
                    range: request.headers,
                    onlyIf: request.headers
                });

                if (!object) {
                    return jsonResponse(
                        {error: "File missing from storage"},
                        404
                    );
                }

                if (ifNoneMatch && (ifNoneMatch === object.httpEtag || ifNoneMatch === "*")) {
                    await logActivity(env, file.owner_id || ownerId, "cached", id, file.name);
                    await logAnalytics(env, file.owner_id || ownerId, "download", 0, id);

                    return new Response(null, {
                        status: 304,
                        headers: {
                            ...corsHeaders,
                            "ETag": object.httpEtag,
                            "Cache-Control": "public, max-age=31536000, immutable"
                        }
                    });
                }

                const isDownload = url.searchParams.has("download") ||
                                   url.searchParams.has("dl");
                const dispositionType = isDownload ? "attachment" : "inline";
                const safeName = encodeURIComponent(file.name);
                const disposition = `${dispositionType}; filename="${safeName}"; filename*=UTF-8''${safeName}`;

                const responseHeaders = new Headers({
                    ...corsHeaders,
                    "Content-Type": file.mime_type ||
                                    object.httpMetadata?.contentType ||
                                    "application/octet-stream",
                    "Content-Disposition": disposition,
                    "Cache-Control": "public, max-age=31536000, immutable",
                    "ETag": object.httpEtag,
                    "Accept-Ranges": "bytes"
                });

                const servedBytes = object.range ? object.range.length : file.size;

                await logActivity(
                    env,
                    file.owner_id || ownerId,
                    request.method === "HEAD" ? "head" : "download",
                    id,
                    file.name
                );

                await logAnalytics(
                    env,
                    file.owner_id || ownerId,
                    request.method === "HEAD" ? "cdn_request" : "download",
                    servedBytes,
                    id
                );

                if (object.range) {
                    responseHeaders.set(
                        "Content-Range",
                        `bytes ${object.range.offset}-${object.range.offset + object.range.length - 1}/${file.size}`
                    );
                    responseHeaders.set("Content-Length", String(object.range.length));

                    if (request.method === "HEAD") {
                        return new Response(null, {
                            status: 206,
                            headers: responseHeaders
                        });
                    }

                    return new Response(object.body, {
                        status: 206,
                        headers: responseHeaders
                    });
                }

                responseHeaders.set("Content-Length", String(object.size || file.size));

                if (request.method === "HEAD") {
                    return new Response(null, {
                        status: 200,
                        headers: responseHeaders
                    });
                }

                return new Response(object.body, {
                    headers: responseHeaders
                });
            }

            if (
                url.pathname.startsWith("/api/files/") &&
                url.pathname.endsWith("/link") &&
                request.method === "GET"
            ) {
                const parts = url.pathname.split("/");
                const id = parts[3];

                if (!id) {
                    return jsonResponse(
                        {error: "Missing file id"},
                        400
                    );
                }

                const file = await env.DB
                    .prepare(`
                        SELECT id,
                               name
                        FROM files
                        WHERE id = ?
                          AND owner_id = ?
                    `)
                    .bind(id, ownerId)
                    .first();

                if (!file) {
                    return jsonResponse(
                        {error: "File not found"},
                        404
                    );
                }

                await logAnalytics(env, ownerId, "api_request", 50, id);

                return jsonResponse({
                    id: file.id,
                    name: file.name,
                    url: `${url.origin}/f/${file.id}`
                });
            }

            if (
                url.pathname.startsWith("/api/files/") &&
                request.method === "GET"
            ) {
                const id = url.pathname.slice("/api/files/".length).split("/")[0];

                if (!id) {
                    return jsonResponse(
                        {error: "Missing file id"},
                        400
                    );
                }

                const file = await env.DB
                    .prepare(`
                        SELECT id,
                               name,
                               size,
                               mime_type,
                               created_at,
                               updated_at
                        FROM files
                        WHERE id = ?
                          AND owner_id = ?
                    `)
                    .bind(id, ownerId)
                    .first();

                if (!file) {
                    return jsonResponse(
                        {error: "File not found"},
                        404
                    );
                }

                await logAnalytics(env, ownerId, "api_request", 80, id);

                return jsonResponse({
                    id: file.id,
                    name: file.name,
                    size: file.size,
                    mime_type: file.mime_type,
                    created_at: file.created_at,
                    updated_at: file.updated_at,
                    url: `${url.origin}/f/${file.id}`
                });
            }

            if (
                url.pathname.startsWith("/api/files/") &&
                request.method === "PATCH"
            ) {
                const id = url.pathname.slice("/api/files/".length).split("/")[0];
                const body = await request.json().catch(() => ({}));
                const newName = body.name?.trim();

                if (!id) {
                    return jsonResponse(
                        {error: "Missing file id"},
                        400
                    );
                }

                if (!newName) {
                    return jsonResponse(
                        {error: "File name is required"},
                        400
                    );
                }

                const file = await env.DB
                    .prepare(`
                        SELECT id, name
                        FROM files
                        WHERE id = ?
                          AND owner_id = ?
                    `)
                    .bind(id, ownerId)
                    .first();

                if (!file) {
                    return jsonResponse(
                        {error: "File not found"},
                        404
                    );
                }

                const now = Date.now();

                await env.DB
                    .prepare(`
                        UPDATE files
                        SET name = ?,
                            updated_at = ?
                        WHERE id = ?
                          AND owner_id = ?
                    `)
                    .bind(newName, now, id, ownerId)
                    .run();

                await logActivity(env, ownerId, "rename", id, newName);
                await logAnalytics(env, ownerId, "api_request", 100, id);

                return jsonResponse({
                    success: true,
                    id,
                    name: newName,
                    updated_at: now
                });
            }

            if (
                url.pathname.startsWith("/api/files/") &&
                request.method === "DELETE"
            ) {
                const id = url.pathname.slice("/api/files/".length).split("/")[0];

                if (!id) {
                    return jsonResponse(
                        {error: "Missing file id"},
                        400
                    );
                }

                const file = await env.DB
                    .prepare(`
                        SELECT r2_key,
                               name
                        FROM files
                        WHERE id = ?
                          AND owner_id = ?
                    `)
                    .bind(id, ownerId)
                    .first();

                if (!file) {
                    return jsonResponse(
                        {error: "File not found"},
                        404
                    );
                }

                await env.FILES.delete(file.r2_key);

                await env.DB
                    .prepare(`
                        DELETE
                        FROM files
                        WHERE id = ?
                          AND owner_id = ?
                    `)
                    .bind(id, ownerId)
                    .run();

                await logActivity(env, ownerId, "delete", id, file.name);
                await logAnalytics(env, ownerId, "delete", 0, id);

                return jsonResponse({
                    success: true
                });
            }

            if (
                url.pathname === "/api/files/batch-delete" &&
                request.method === "POST"
            ) {
                const body = await request.json().catch(() => ({}));
                const ids = Array.isArray(body?.ids) ? body.ids : [];

                if (ids.length === 0) {
                    return jsonResponse(
                        {error: "No file ids provided"},
                        400
                    );
                }

                const deleted = [];

                for (const id of ids) {
                    const file = await env.DB
                        .prepare(`
                            SELECT r2_key, name
                            FROM files
                            WHERE id = ?
                              AND owner_id = ?
                        `)
                        .bind(id, ownerId)
                        .first();

                    if (file) {
                        await env.FILES.delete(file.r2_key);

                        await env.DB
                            .prepare(`
                                DELETE FROM files
                                WHERE id = ?
                                  AND owner_id = ?
                            `)
                            .bind(id, ownerId)
                            .run();

                        await logActivity(env, ownerId, "delete", id, file.name);
                        await logAnalytics(env, ownerId, "delete", 0, id);

                        deleted.push(id);
                    }
                }

                return jsonResponse({
                    success: true,
                    deleted
                });
            }

            if (
                url.pathname === "/api/status" &&
                request.method === "GET"
            ) {
                await logAnalytics(env, ownerId, "api_request", 200);

                const stats = await env.DB
                    .prepare(`
                        SELECT COUNT(*)               AS file_count,
                               COALESCE(SUM(size), 0) AS storage_used
                        FROM files
                        WHERE owner_id = ?
                    `)
                    .bind(ownerId)
                    .first();

                const globalStats = await env.DB
                    .prepare(`
                        SELECT COUNT(*)               AS file_count,
                               COALESCE(SUM(size), 0) AS storage_used
                        FROM files
                    `)
                    .first();

                const storageUsed = Number(stats?.storage_used || 0);
                const fileCount = Number(stats?.file_count || 0);
                const globalStorageUsed = Number(globalStats?.storage_used || 0);
                const globalFileCount = Number(globalStats?.file_count || 0);
                const GLOBAL_STORAGE_LIMIT = 10 * 1024 * 1024 * 1024;

                const analyticsStats = await env.DB
                    .prepare(`
                        SELECT event,
                               COUNT(*)                AS req_count,
                               COALESCE(SUM(bytes), 0) AS byte_count
                        FROM analytics
                        WHERE owner_id = ?
                        GROUP BY event
                    `)
                    .bind(ownerId)
                    .all();

                let downloadBytes = 0;
                let uploadBytes = 0;
                let otherBytes = 0;
                let downloadReqs = 0;
                let uploadReqs = 0;
                let otherReqs = 0;

                for (const row of analyticsStats.results) {
                    if (row.event === "download") {
                        downloadBytes = Number(row.byte_count || 0);
                        downloadReqs = Number(row.req_count || 0);
                    } else if (row.event === "upload") {
                        uploadBytes = Number(row.byte_count || 0);
                        uploadReqs = Number(row.req_count || 0);
                    } else {
                        otherBytes += Number(row.byte_count || 0);
                        otherReqs += Number(row.req_count || 0);
                    }
                }

                const totalBandwidth = downloadBytes + uploadBytes + otherBytes;
                const totalRequests = downloadReqs + uploadReqs + otherReqs;
                const percentage = Number(
                    ((storageUsed / STORAGE_LIMIT) * 100).toFixed(2)
                );

                const totalLogsResult = await env.DB
                    .prepare(`
                        SELECT COUNT(*) AS total
                        FROM logs
                        WHERE owner_id = ?
                    `)
                    .bind(ownerId)
                    .first();

                const errorLogsResult = await env.DB
                    .prepare(`
                        SELECT COUNT(*) AS total
                        FROM logs
                        WHERE owner_id = ? AND action LIKE '%error%'
                    `)
                    .bind(ownerId)
                    .first();

                const totalLogs = Number(totalLogsResult?.total || 0);
                const errorLogs = Number(errorLogsResult?.total || 0);

                let calculatedApiUptime = "100.00%";
                if (totalLogs > 0) {
                    const ratio = Math.max(0, (totalLogs - errorLogs) / totalLogs);
                    calculatedApiUptime = (ratio * 100).toFixed(2) + "%";
                }

                let calculatedCdnUptime = "100.00%";
                if (downloadReqs > 0) {
                    const cdnRatio = Math.max(0, (downloadReqs - errorLogs) / downloadReqs);
                    calculatedCdnUptime = (cdnRatio * 100).toFixed(2) + "%";
                }

                const now = Date.now();
                const bucketMinutes = 5;
                const bucketMs = bucketMinutes * 60 * 1000;
                const bucketCount = 11;
                const chartStartTime = now - bucketCount * bucketMs;

                const recentTimeline = await env.DB
                    .prepare(`
                        SELECT CAST((created_at - ?) / ? AS INTEGER) AS bucket,
                               COUNT(*)                               AS req_count,
                               COALESCE(SUM(bytes), 0)                AS byte_count
                        FROM analytics
                        WHERE owner_id = ? AND created_at >= ?
                        GROUP BY bucket
                    `)
                    .bind(chartStartTime, bucketMs, ownerId, chartStartTime)
                    .all();

                const bucketMap = {};
                for (const row of recentTimeline.results || []) {
                    const b = Number(row.bucket);
                    if (b >= 0 && b < bucketCount) {
                        bucketMap[b] = {
                            requests: Number(row.req_count || 0),
                            bytes: Number(row.byte_count || 0)
                        };
                    }
                }

                const bandwidthValues = [];
                const requestValues = [];

                for (let i = 0; i < bucketCount; i++) {
                    const b = bucketMap[i] || { requests: 0, bytes: 0 };
                    bandwidthValues.push(b.bytes);
                    requestValues.push(b.requests);
                }

                const maxBandwidth = Math.max(...bandwidthValues, 1024);
                const maxRequests = Math.max(...requestValues, 5);

                const bandwidthCoords = bandwidthValues.map((val, idx) => {
                    const x = idx * 40;
                    const y = Math.round(85 - (val / maxBandwidth) * 65);
                    return `${x},${y}`;
                });

                const requestsCoords = requestValues.map((val, idx) => {
                    const x = idx * 40;
                    const y = Math.round(85 - (val / maxRequests) * 65);
                    return `${x},${y}`;
                });

                const bandwidthPoints = bandwidthCoords.join(" ");
                const requestsPoints = requestsCoords.join(" ");

                const bandwidthArea = `M0 100 L${bandwidthCoords.join(" L")} L400 100 Z`;
                const requestsArea = `M0 100 L${requestsCoords.join(" L")} L400 100 Z`;

                return jsonResponse({
                    status: "operational",
                    cdn: {
                        status: "operational",
                        uptime: calculatedCdnUptime
                    },
                    api: {
                        status: "operational",
                        uptime: calculatedApiUptime
                    },
                    storage: {
                        used: storageUsed,
                        limit: STORAGE_LIMIT,
                        available: Math.max(0, STORAGE_LIMIT - storageUsed),
                        percentage,
                        bar: generateProgressBar(storageUsed, STORAGE_LIMIT, 27),
                        short_bar: generateProgressBar(storageUsed, STORAGE_LIMIT, 17),
                        global_used: globalStorageUsed,
                        global_limit: GLOBAL_STORAGE_LIMIT,
                        global_available: Math.max(0, GLOBAL_STORAGE_LIMIT - globalStorageUsed),
                        global_bar: generateProgressBar(globalStorageUsed, GLOBAL_STORAGE_LIMIT, 27),
                        global_short_bar: generateProgressBar(globalStorageUsed, GLOBAL_STORAGE_LIMIT, 17)
                    },
                    files: fileCount,
                    global_files: globalFileCount,
                    bandwidth: {
                        total: totalBandwidth,
                        download: downloadBytes,
                        upload: uploadBytes
                    },
                    requests: {
                        total: totalRequests,
                        download: downloadReqs,
                        upload: uploadReqs
                    },
                    charts: {
                        bandwidth: {
                            points: bandwidthPoints,
                            area: bandwidthArea
                        },
                        requests: {
                            points: requestsPoints,
                            area: requestsArea
                        }
                    }
                });
            }

            if (
                (url.pathname === "/api/status/logs" ||
                 url.pathname === "/api/logs") &&
                (request.method === "GET" || request.method === "DELETE")
            ) {
                if (request.method === "DELETE" || url.searchParams.get("clear") === "true") {
                    await env.DB
                        .prepare("DELETE FROM logs WHERE owner_id = ?")
                        .bind(ownerId)
                        .run();

                    return jsonResponse({
                        success: true,
                        cleared: true,
                        logs: [],
                        total: 0
                    });
                }

                const oneDayAgo = Date.now() - 86400000;
                const purgeBefore = 1775062500000;

                await env.DB
                    .prepare(`
                        DELETE FROM logs
                        WHERE created_at < ? OR created_at <= ?
                    `)
                    .bind(oneDayAgo, purgeBefore)
                    .run();

                const limitParam = url.searchParams.get("limit");
                const offsetParam = url.searchParams.get("offset");

                const limit = Math.min(
                    Math.max(1, Number(limitParam) || 50),
                    100
                );
                const offset = Math.max(
                    0,
                    Number(offsetParam) || 0
                );

                const cutoff = Math.max(oneDayAgo, purgeBefore);

                const result = await env.DB
                    .prepare(`
                        SELECT id,
                               action,
                               file_id,
                               file_name,
                               created_at
                        FROM logs
                        WHERE owner_id = ? AND created_at > ?
                        ORDER BY created_at DESC
                        LIMIT ? OFFSET ?
                    `)
                    .bind(ownerId, cutoff, limit, offset)
                    .all();

                const countResult = await env.DB
                    .prepare(`
                        SELECT COUNT(*) AS total
                        FROM logs
                        WHERE owner_id = ? AND created_at > ?
                    `)
                    .bind(ownerId, cutoff)
                    .first();

                await logAnalytics(env, ownerId, "api_request", 150);

                return jsonResponse({
                    logs: result.results,
                    total: Number(countResult?.total || 0),
                    limit,
                    offset
                });
            }

            if (
                url.pathname === "/api/analytics" &&
                request.method === "GET"
            ) {
                const limitParam = url.searchParams.get("limit");
                const limit = Math.min(
                    Math.max(1, Number(limitParam) || 50),
                    100
                );

                const summary = await env.DB
                    .prepare(`
                        SELECT event,
                               COUNT(*)                AS count,
                               COALESCE(SUM(bytes), 0) AS total_bytes
                        FROM analytics
                        WHERE owner_id = ?
                        GROUP BY event
                    `)
                    .bind(ownerId)
                    .all();

                const recent = await env.DB
                    .prepare(`
                        SELECT id,
                               file_id,
                               event,
                               bytes,
                               created_at
                        FROM analytics
                        WHERE owner_id = ?
                        ORDER BY created_at DESC
                        LIMIT ?
                    `)
                    .bind(ownerId, limit)
                    .all();

                await logAnalytics(env, ownerId, "api_request", 200);

                return jsonResponse({
                    summary: summary.results,
                    recent: recent.results
                });
            }

            if (
                url.pathname === "/api/announcement" &&
                request.method === "GET"
            ) {
                return jsonResponse({
                    active: false,
                    announcement: null
                });
            }

            if (url.pathname === "/api") {
                return jsonResponse({
                    name: "The CDN Website",
                    status: "ok"
                });
            }

            if (url.pathname === "/auth" || url.pathname === "/account" || url.pathname === "/auth.html") {
                const rewriteReq = new Request(new URL("/account.html", request.url), request);
                return env.ASSETS ? env.ASSETS.fetch(rewriteReq) : jsonResponse({ error: "Not found" }, 404);
            }

            if (env.ASSETS) {
                const assetResponse = await env.ASSETS.fetch(request);
                if (assetResponse.ok && !url.pathname.endsWith(".html") && url.pathname !== "/") {
                    const cachedHeaders = new Headers(assetResponse.headers);
                    cachedHeaders.set("Cache-Control", "no-cache");
                    return new Response(assetResponse.body, {
                        status: assetResponse.status,
                        statusText: assetResponse.statusText,
                        headers: cachedHeaders
                    });
                }
                return assetResponse;
            }

            return jsonResponse(
                {error: "Not found"},
                404
            );
        } catch (error) {
            await logActivity(env, ownerId, "error", null, error.message);

            return jsonResponse(
                {
                    error: error.message || "Internal server error"
                },
                500
            );
        }
    }
};
