const API = (typeof window !== "undefined" && window.location.protocol.startsWith("http") && (window.location.origin.includes("workers.dev") || (!window.location.hostname.includes("localhost") && !window.location.hostname.includes("127.0.0.1")) || window.location.port === "8787"))
    ? window.location.origin
    : "https://the-cdn-website.nploc1209.workers.dev";

function getStoredAccount() {
    try {
        const stored = localStorage.getItem("cdn_user");
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (e) {
    }
    return null;
}

function updateDockAuth() {
    const authLink = document.querySelector(".dock .auth a");
    if (!authLink) return;
    const acc = getStoredAccount();
    if (acc && acc.username) {
        authLink.textContent = acc.username;
    } else {
        authLink.textContent = "Account";
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
        updateDockAuth();
        updateGreeting();
    });
} else {
    updateDockAuth();
    updateGreeting();
}

window.addEventListener("storage", (e) => {
    if (e.key === "cdn_user") {
        updateDockAuth();
        updateGreeting();
    }
    if (e.key === "cdn_file_banner_dismissed" || e.key === "cdn_password_changed") {
        const banner = document.getElementById("file-account-banner");
        if (banner) {
            banner.style.display = "none";
        }
    }
});

function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
}

function updateGreeting() {
    const welcomeTitle = document.querySelector(".welcome h2");
    if (welcomeTitle) {
        const acc = getStoredAccount();
        const username = acc?.username;
        const isGuest = !username || username.startsWith("guest_");
        welcomeTitle.textContent = isGuest ? `${getGreeting()}!` : `${getGreeting()}, ${username}!`;
    }
}

function getStoredOwnerId() {
    const acc = getStoredAccount();
    if (acc && acc.id) {
        return acc.id;
    }
    let guestId = localStorage.getItem("cdn_guest_id");
    if (!guestId) {
        guestId = "guest_" + Math.random().toString(36).substring(2, 10);
        localStorage.setItem("cdn_guest_id", guestId);
    }
    return guestId;
}

function authFetch(url, options = {}) {
    const headers = new Headers(options.headers || {});
    const ownerId = getStoredOwnerId();
    if (ownerId && !headers.has("X-Owner-Id")) {
        headers.set("X-Owner-Id", ownerId);
    }
    return fetch(url, { ...options, headers });
}

const plusIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`;
const fileIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>`;
const imageIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-image"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`;
const linkIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-link"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
const trashIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`;
const copyIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
const checkIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check"><polyline points="20 6 9 17 4 12"/></svg>`;

const canvas = document.getElementById("board");
let ctx = null;
let drawCanvas = null;
let drawCtx = null;
let currentTool = "pen";
let loadedImage = null;
let imgX = 0;
let imgY = 0;
let imgW = 0;
let imgH = 0;
let isInteracting = false;
let startX = 0;
let startY = 0;
let lastImgX = 0;
let lastImgY = 0;

const toolPen = document.getElementById("tool-pen");
const toolEraser = document.getElementById("tool-eraser");
const toolMove = document.getElementById("tool-move");
const toolReset = document.getElementById("tool-reset");

function setTool(tool) {
    currentTool = tool;
    const buttons = [
        { el: toolPen, name: "pen" },
        { el: toolEraser, name: "eraser" },
        { el: toolMove, name: "move" }
    ];

    for (const b of buttons) {
        if (b.el) {
            if (b.name === tool) {
                b.el.classList.add("active");
            } else {
                b.el.classList.remove("active");
            }
        }
    }

    if (canvas) {
        if (tool === "move") {
            canvas.style.cursor = "grab";
        } else if (tool === "eraser") {
            canvas.style.cursor = "crosshair";
        } else {
            canvas.style.cursor = "crosshair";
        }
    }
}

function renderCanvas() {
    if (!canvas || !ctx) {
        return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (loadedImage) {
        ctx.drawImage(loadedImage, imgX, imgY, imgW, imgH);
    }

    if (drawCanvas) {
        ctx.drawImage(drawCanvas, 0, 0);
    }
}

function resizeCanvas() {
    if (!canvas) {
        return;
    }

    const rect = canvas.getBoundingClientRect();
    const w = Math.round(rect.width || canvas.clientWidth || 600);
    const h = Math.round(rect.height || canvas.clientHeight || 400);

    if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
        let tempCanvas = null;
        if (drawCanvas && drawCanvas.width > 0 && drawCanvas.height > 0) {
            tempCanvas = document.createElement("canvas");
            tempCanvas.width = drawCanvas.width;
            tempCanvas.height = drawCanvas.height;
            tempCanvas.getContext("2d").drawImage(drawCanvas, 0, 0);
        }

        canvas.width = w;
        canvas.height = h;

        if (!drawCanvas) {
            drawCanvas = document.createElement("canvas");
        }
        drawCanvas.width = w;
        drawCanvas.height = h;
        drawCtx = drawCanvas.getContext("2d");

        if (tempCanvas) {
            drawCtx.drawImage(tempCanvas, 0, 0);
        }

        renderCanvas();
    }
}

function initCanvas() {
    if (!canvas) {
        return;
    }

    ctx = canvas.getContext("2d");
    drawCanvas = document.createElement("canvas");
    drawCtx = drawCanvas.getContext("2d");

    resizeCanvas();

    canvas.addEventListener("pointerdown", (e) => {
        resizeCanvas();
        isInteracting = true;
        startX = e.offsetX;
        startY = e.offsetY;
        lastImgX = imgX;
        lastImgY = imgY;

        if (currentTool === "move") {
            canvas.style.cursor = "grabbing";
            return;
        }

        if (currentTool === "pen") {
            drawCtx.globalCompositeOperation = "source-over";
            drawCtx.strokeStyle = "#000000";
            drawCtx.lineWidth = 3;
            drawCtx.lineCap = "round";
            drawCtx.lineJoin = "round";
            drawCtx.beginPath();
            drawCtx.moveTo(e.offsetX, e.offsetY);
            drawCtx.lineTo(e.offsetX, e.offsetY);
            drawCtx.stroke();
            renderCanvas();
        } else if (currentTool === "eraser") {
            drawCtx.globalCompositeOperation = "destination-out";
            drawCtx.lineWidth = 24;
            drawCtx.lineCap = "round";
            drawCtx.lineJoin = "round";
            drawCtx.beginPath();
            drawCtx.moveTo(e.offsetX, e.offsetY);
            drawCtx.lineTo(e.offsetX, e.offsetY);
            drawCtx.stroke();
            renderCanvas();
        }
    });

    canvas.addEventListener("pointermove", (e) => {
        if (!isInteracting) {
            return;
        }

        if (currentTool === "move") {
            imgX = lastImgX + (e.offsetX - startX);
            imgY = lastImgY + (e.offsetY - startY);
            renderCanvas();
            return;
        }

        if (currentTool === "pen" || currentTool === "eraser") {
            drawCtx.lineTo(e.offsetX, e.offsetY);
            drawCtx.stroke();
            renderCanvas();
        }
    });

    canvas.addEventListener("pointerup", () => {
        isInteracting = false;
        if (currentTool === "move") {
            canvas.style.cursor = "grab";
        }
    });

    canvas.addEventListener("pointerleave", () => {
        isInteracting = false;
        if (currentTool === "move") {
            canvas.style.cursor = "grab";
        }
    });

    window.addEventListener("resize", () => {
        resizeCanvas();
    });

    if (toolPen) {
        toolPen.addEventListener("click", () => setTool("pen"));
    }

    if (toolEraser) {
        toolEraser.addEventListener("click", () => setTool("eraser"));
    }

    if (toolMove) {
        toolMove.addEventListener("click", () => setTool("move"));
    }

    if (toolReset) {
        toolReset.addEventListener("click", () => {
            if (drawCtx) {
                drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
            }

            if (loadedImage) {
                const padding = 20;
                const maxW = canvas.width - padding * 2;
                const maxH = canvas.height - padding * 2;
                const scale = Math.min(maxW / loadedImage.width, maxH / loadedImage.height, 1);
                imgW = Math.round(loadedImage.width * scale);
                imgH = Math.round(loadedImage.height * scale);
                imgX = Math.round((canvas.width - imgW) / 2);
                imgY = Math.round((canvas.height - imgH) / 2);
            }

            renderCanvas();
        });
    }

    setTool("pen");
}

function loadFileToCanvas(fileId, fileName) {
    if (!canvas) {
        return;
    }

    resizeCanvas();

    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
        loadedImage = img;
        const padding = 20;
        const maxW = Math.max(100, canvas.width - padding * 2);
        const maxH = Math.max(100, canvas.height - padding * 2);
        const scale = Math.min(maxW / img.width, maxH / img.height, 1);
        imgW = Math.round(img.width * scale);
        imgH = Math.round(img.height * scale);
        imgX = Math.round((canvas.width - imgW) / 2);
        imgY = Math.round((canvas.height - imgH) / 2);
        setTool("move");
        renderCanvas();
    };

    img.onerror = () => {
        const fallbackImg = new Image();
        fallbackImg.onload = () => {
            loadedImage = fallbackImg;
            const padding = 20;
            const maxW = Math.max(100, canvas.width - padding * 2);
            const maxH = Math.max(100, canvas.height - padding * 2);
            const scale = Math.min(maxW / fallbackImg.width, maxH / fallbackImg.height, 1);
            imgW = Math.round(fallbackImg.width * scale);
            imgH = Math.round(fallbackImg.height * scale);
            imgX = Math.round((canvas.width - imgW) / 2);
            imgY = Math.round((canvas.height - imgH) / 2);
            setTool("move");
            renderCanvas();
        };
        fallbackImg.src = `${API}/f/${fileId}`;
    };

    img.src = `${API}/f/${fileId}`;
}

initCanvas();

const fileInput = document.getElementById("file-input");
const addFileButton = document.getElementById("add-file");
const addFileDriveButton = document.getElementById("add-file-drive");
const fileList = document.getElementById("file-list");

const emptyState = document.getElementById("empty-state");
const dashboard = document.getElementById("dashboard");
const workplace = document.getElementById("workplace");

function formatSize(bytes) {
    if (bytes < 1024) {
        return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }

    if (bytes < 1024 * 1024 * 1024) {
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    }

    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString("en-GB");
}

function formatDateTime(timestamp) {
    const d = new Date(timestamp);
    const date = d.toLocaleDateString("en-GB");
    const time = d.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });

    return `${time} ${date}`;
}

function updateUI(files) {
    if (!emptyState || !dashboard || !workplace) {
        return;
    }

    updateGreeting();

    if (files.length === 0) {
        emptyState.style.display = "";
        dashboard.style.display = "none";
        workplace.style.display = "none";
        return;
    }

    emptyState.style.display = "none";
    dashboard.style.display = "";
    workplace.style.display = "";

    setTimeout(() => {
        resizeCanvas();
    }, 50);
}

function setUploadProgress(percent) {
    const buttons = [addFileButton, addFileDriveButton].filter(Boolean);
    for (const btn of buttons) {
        btn.disabled = true;
        btn.style.position = "relative";
        btn.style.overflow = "hidden";
        btn.style.background = `linear-gradient(to right, #006400 ${percent}%, #111 ${percent}%)`;
        btn.innerHTML = `
            <svg style="width: 14px; height: 14px; margin-right: 6px; animation: spin 1s linear infinite;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-linecap="round"/>
            </svg>
            ${percent}%
        `;
    }
}

function resetUploadButton() {
    const buttons = [addFileButton, addFileDriveButton].filter(Boolean);
    for (const btn of buttons) {
        btn.disabled = false;
        btn.style.background = "";
        btn.innerHTML = `${plusIconSvg} Add file`;
    }
}

async function loadDashboardStats() {
    const storageLeftEl = document.getElementById("storage-left");
    const loadEl = document.querySelector("#dashboard #load");
    const bandwidthValEl = document.getElementById("bandwidth-val");
    const requestsValEl = document.getElementById("requests-val");
    const bwPolyline = document.querySelector(".chart-bandwidth polyline");
    const bwArea = document.querySelector(".chart-bandwidth .area");
    const reqPolyline = document.querySelector(".chart-requests polyline");
    const reqArea = document.querySelector(".chart-requests .area");

    if (!storageLeftEl && !loadEl && !bwPolyline && !reqPolyline) {
        return;
    }

    try {
        const response = await authFetch(`${API}/api/status`, { cache: "no-store" });

        if (!response.ok) {
            throw new Error("Failed to load status");
        }

        const data = await response.json();

        if (storageLeftEl && data.storage) {
            storageLeftEl.textContent = `${formatSize(data.storage.available)} left`;
        }

        if (loadEl && data.storage) {
            loadEl.textContent = data.storage.bar;
        }

        if (bandwidthValEl && data.bandwidth) {
            bandwidthValEl.textContent = `(${formatSize(data.bandwidth.total)})`;
        }

        if (requestsValEl && data.requests) {
            requestsValEl.textContent = `(${data.requests.total} reqs)`;
        }

        if (bwPolyline && data.charts?.bandwidth?.points) {
            bwPolyline.setAttribute("points", data.charts.bandwidth.points);
        }

        if (bwArea && data.charts?.bandwidth?.area) {
            bwArea.setAttribute("d", data.charts.bandwidth.area);
        }

        if (reqPolyline && data.charts?.requests?.points) {
            reqPolyline.setAttribute("points", data.charts.requests.points);
        }

        if (reqArea && data.charts?.requests?.area) {
            reqArea.setAttribute("d", data.charts.requests.area);
        }
    } catch (error) {
        console.error("Failed to load dashboard stats:", error);
    }
}

async function loadFiles() {
    if (!fileList) {
        return;
    }

    try {
        const response = await authFetch(`${API}/api/files`, { cache: "no-store" });

        if (!response.ok) {
            throw new Error("Failed to load files");
        }

        const data = await response.json();
        const files = data.files || [];

        fileList.innerHTML = "";

        for (const file of files) {
            const row = document.createElement("tr");
            row.dataset.id = file.id;
            row.dataset.name = file.name;

            const isImage = (file.mime_type && file.mime_type.startsWith("image/")) ||
                            /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(file.name);

            row.innerHTML = `
                <td>
                    <div class="file" style="cursor: pointer;">
                        ${isImage ? imageIconSvg : fileIconSvg}
                        <span class="file-name">${escapeHtml(file.name)}</span>
                    </div>
                </td>

                <td style="text-align: center">
                    ${formatSize(file.size)}
                </td>

                <td style="text-align: center">
                    ${formatDate(file.created_at)}
                </td>

                <td>
                    <div class="config">
                        <button class="link-button" data-id="${file.id}" title="Copy link">
                            ${linkIconSvg}
                        </button>

                        <button class="delete-button" data-id="${file.id}" title="Delete file">
                            ${trashIconSvg}
                        </button>
                    </div>
                </td>
            `;

            fileList.appendChild(row);
        }

        updateUI(files);

        const currentAcc = getStoredAccount();
        if (currentAcc && currentAcc.username) {
            renderFileAccountBanner(currentAcc);
        }
    } catch (error) {
        console.error("Failed to load files:", error);
    }
}

const CHUNK_SIZE = 20 * 1024 * 1024;

async function uploadChunkedFile(file) {
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    const initRes = await authFetch(`${API}/api/upload/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            name: file.name,
            size: file.size,
            mimeType: file.type || "application/octet-stream"
        })
    });

    if (!initRes.ok) {
        let errMsg = "Failed to initialize chunked upload";
        try {
            const errData = await initRes.json();
            errMsg = errData.error || errMsg;
        } catch (e) {
        }
        throw new Error(errMsg);
    }

    const { id, uploadId, key } = await initRes.json();
    const parts = [];

    for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(file.size, start + CHUNK_SIZE);
        const chunk = file.slice(start, end);
        const partNumber = i + 1;

        let partResult = null;
        let attempts = 0;

        while (attempts < 3 && !partResult) {
            try {
                attempts++;
                partResult = await new Promise((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    xhr.open("PUT", `${API}/api/upload/part?uploadId=${encodeURIComponent(uploadId)}&key=${encodeURIComponent(key)}&partNumber=${partNumber}`);
                    xhr.setRequestHeader("Content-Type", "application/octet-stream");
                    xhr.setRequestHeader("X-Owner-Id", getStoredOwnerId());

                    xhr.upload.onprogress = (e) => {
                        if (e.lengthComputable) {
                            const totalUploaded = start + e.loaded;
                            const percent = Math.min(99, Math.round((totalUploaded / file.size) * 100));
                            setUploadProgress(percent);
                        }
                    };

                    xhr.onload = () => {
                        if (xhr.status >= 200 && xhr.status < 300) {
                            try {
                                resolve(JSON.parse(xhr.responseText));
                            } catch (e) {
                                resolve({ partNumber, etag: xhr.getResponseHeader("etag") || "" });
                            }
                        } else {
                            reject(new Error(`Chunk ${partNumber} returned status ${xhr.status}`));
                        }
                    };

                    xhr.onerror = () => reject(new Error(`Network error on chunk ${partNumber}`));
                    xhr.ontimeout = () => reject(new Error(`Timeout on chunk ${partNumber}`));
                    xhr.send(chunk);
                });
            } catch (err) {
                if (attempts >= 3) {
                    await authFetch(`${API}/api/upload/abort`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ uploadId, key })
                    }).catch(() => {});
                    throw err;
                }
            }
        }

        parts.push({
            partNumber: partResult.partNumber || partNumber,
            etag: partResult.etag
        });
    }

    setUploadProgress(99);

    const completeRes = await authFetch(`${API}/api/upload/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            id,
            uploadId,
            key,
            name: file.name,
            size: file.size,
            mimeType: file.type || "application/octet-stream",
            parts
        })
    });

    if (!completeRes.ok) {
        let errMsg = "Failed to complete upload";
        try {
            const errData = await completeRes.json();
            errMsg = errData.error || errMsg;
        } catch (e) {
        }
        throw new Error(errMsg);
    }

    setUploadProgress(100);
    return await completeRes.json();
}

async function uploadFile(file) {
    try {
        setUploadProgress(0);
        let uploadResult = null;

        if (file.size > 20 * 1024 * 1024) {
            uploadResult = await uploadChunkedFile(file);
        } else {
            const formData = new FormData();
            formData.append("file", file);

            let uploadSucceeded = false;

            try {
                uploadResult = await new Promise((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    xhr.open("POST", `${API}/api/upload`);
                    xhr.setRequestHeader("X-Owner-Id", getStoredOwnerId());

                    xhr.upload.onprogress = (e) => {
                        if (e.lengthComputable) {
                            const percent = Math.min(99, Math.round((e.loaded / e.total) * 100));
                            setUploadProgress(percent);
                        }
                    };

                    xhr.onload = () => {
                        setUploadProgress(100);
                        if (xhr.status >= 200 && xhr.status < 300) {
                            uploadSucceeded = true;
                            try {
                                const data = JSON.parse(xhr.responseText);
                                resolve(data);
                            } catch (err) {
                                resolve({});
                            }
                        } else {
                            let errMsg = "Upload failed";
                            try {
                                const errData = JSON.parse(xhr.responseText);
                                errMsg = errData.error || errMsg;
                            } catch (err) {
                            }
                            reject(new Error(errMsg));
                        }
                    };

                    xhr.onerror = () => {
                        reject(new Error("Network error during upload"));
                    };

                    xhr.send(formData);
                });
            } catch (xhrError) {
                if (!uploadSucceeded) {
                    setUploadProgress(50);
                    const res = await authFetch(`${API}/api/upload`, {
                        method: "POST",
                        body: formData
                    });
                    setUploadProgress(100);
                    if (!res.ok) {
                        let errMsg = "Upload failed";
                        try {
                            const errData = await res.json();
                            errMsg = errData.error || errMsg;
                        } catch (e) {
                        }
                        throw new Error(errMsg);
                    }
                    uploadResult = await res.json();
                } else {
                    throw xhrError;
                }
            }
        }

        if (uploadResult && uploadResult.new_account) {
            showNewAccountModal(uploadResult.new_account);
        }

        await loadFiles();
        await loadDashboardStats();
    } catch (error) {
        console.error("Upload failed:", error);
        alert(error.message);
    } finally {
        setTimeout(() => {
            resetUploadButton();
        }, 500);
    }
}

if (addFileButton && fileInput) {
    addFileButton.addEventListener("click", () => {
        fileInput.click();
    });
}

if (addFileDriveButton && fileInput) {
    addFileDriveButton.addEventListener("click", () => {
        fileInput.click();
    });
}

if (fileInput) {
    fileInput.addEventListener("change", async () => {
        const files = fileInput.files;

        if (!files || files.length === 0) {
            return;
        }

        for (const file of files) {
            await uploadFile(file);
        }

        fileInput.value = "";
    });
}

window.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.stopPropagation();
});

window.addEventListener("dragenter", (event) => {
    event.preventDefault();
    event.stopPropagation();
});

window.addEventListener("dragleave", (event) => {
    event.preventDefault();
    event.stopPropagation();
});

window.addEventListener("drop", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    const files = event.dataTransfer?.files;

    if (!files || files.length === 0) {
        return;
    }

    for (const file of files) {
        await uploadFile(file);
    }
});

if (fileList) {
    fileList.addEventListener("click", async (event) => {
        const deleteButton = event.target.closest(".delete-button");

        if (deleteButton) {
            const id = deleteButton.dataset.id;
            await deleteFile(id);
            return;
        }

        const linkButton = event.target.closest(".link-button");

        if (linkButton) {
            const id = linkButton.dataset.id;
            await copyFileLink(id, linkButton);
            return;
        }

        const row = event.target.closest("tr");
        if (row && row.dataset.id) {
            for (const r of fileList.querySelectorAll("tr")) {
                r.classList.remove("selected");
            }
            row.classList.add("selected");

            const fileId = row.dataset.id;
            const fileName = row.dataset.name || "";
            loadFileToCanvas(fileId, fileName);
        }
    });
}

async function deleteFile(id) {
    try {
        const response = await authFetch(`${API}/api/files/${id}`, {
            method: "DELETE"
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Delete failed");
        }

        await loadFiles();
        await loadDashboardStats();
    } catch (error) {
        console.error("Delete failed:", error);
        alert(error.message);
    }
}

async function copyFileLink(id, btn = null) {
    try {
        const response = await authFetch(`${API}/api/files/${id}/link`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Failed to get link");
        }

        await navigator.clipboard.writeText(data.url);
        if (btn) {
            btn.innerHTML = checkIconSvg;
            setTimeout(() => {
                btn.innerHTML = linkIconSvg;
            }, 1500);
        }
    } catch (error) {
        console.error("Failed to copy link:", error);
        alert(error.message);
    }
}

async function loadStatusPage() {
    const diagnosticsEl = document.querySelector(".diagnostics");

    if (!diagnosticsEl) {
        return;
    }

    const cdnResponseEl = document.querySelector(".diagnostics .box:nth-child(1) .box-content div:nth-child(1) strong");
    const cdnUptimeEl = document.querySelector(".diagnostics .box:nth-child(1) .box-content div:nth-child(2) strong");
    const storageLoadEl = document.querySelector(".diagnostics #load");
    const totalLeftEl = document.getElementById("total-left") || document.getElementById("total-left>") || document.querySelector(".diagnostics .box:nth-child(2) .box-content div:nth-child(1) p:nth-of-type(2)");
    const totalFilesEl = document.querySelector(".diagnostics .box:nth-child(2) .box-content div:nth-child(2) strong");
    const apiResponseEl = document.querySelector(".diagnostics .box:nth-child(3) .box-content div:nth-child(1) strong");
    const apiUptimeEl = document.querySelector(".diagnostics .box:nth-child(3) .box-content div:nth-child(2) strong");

    try {
        const cdnStart = performance.now();
        const cdnPromise = fetch(`${API}/f/health`, { cache: "no-store" })
            .then(() => Math.round(performance.now() - cdnStart))
            .catch(() => 40);

        const apiStart = performance.now();
        const apiPromise = authFetch(`${API}/api/status`, { cache: "no-store" })
            .then(async (res) => {
                const latency = Math.round(performance.now() - apiStart);
                if (!res.ok) {
                    throw new Error("Failed to load status");
                }
                const data = await res.json();
                return { latency, data };
            });

        const [cdnLatency, apiResult] = await Promise.all([cdnPromise, apiPromise]);
        const apiLatency = apiResult.latency;
        const data = apiResult.data;

        if (cdnResponseEl) {
            cdnResponseEl.textContent = `${cdnLatency} ms`;
        }

        if (cdnUptimeEl) {
            cdnUptimeEl.textContent = data.cdn?.uptime || "100.00%";
        }

        if (storageLoadEl && data.storage) {
            storageLoadEl.textContent = data.storage.global_short_bar || data.storage.short_bar || data.storage.bar;
        }

        if (totalLeftEl && data.storage) {
            const usedBytes = data.storage.global_used ?? data.storage.used ?? 0;
            const limitBytes = data.storage.global_limit ?? (10 * 1024 * 1024 * 1024);
            const usedGb = (usedBytes / (1024 * 1024 * 1024)).toFixed(2);
            const limitGb = Math.round(limitBytes / (1024 * 1024 * 1024));
            totalLeftEl.textContent = `${usedGb}/${limitGb} GB`;
        }

        if (totalFilesEl) {
            totalFilesEl.textContent = String(data.global_files ?? data.files ?? 0);
        }

        if (apiResponseEl) {
            apiResponseEl.textContent = `${apiLatency} ms`;
        }

        if (apiUptimeEl) {
            apiUptimeEl.textContent = data.api?.uptime || "100.00%";
        }
    } catch (error) {
        console.error("Failed to load status page:", error);
    }
}

async function loadLogs() {
    const logsBox = document.getElementById("logs");

    if (!logsBox) {
        return;
    }

    try {
        const response = await authFetch(`${API}/api/status/logs`, { cache: "no-store" });

        if (!response.ok) {
            throw new Error("Failed to load logs");
        }

        const data = await response.json();
        const logs = data.logs || [];

        let contentEl = logsBox.querySelector(".logs-content");

        if (!contentEl) {
            contentEl = document.createElement("div");
            contentEl.className = "logs-content";
            logsBox.appendChild(contentEl);
        }

        if (logs.length === 0) {
            contentEl.innerHTML = `
                <div style="padding: 20px; text-align: center; font-family: Georgia, serif; color: #666;">
                    No activity recorded yet.
                </div>
            `;
            return;
        }

        const vibrantColors = {
            upload: "#059669",
            delete: "#e11d48",
            download: "#0284c7",
            rename: "#d97706",
            error: "#dc2626"
        };

        let rows = "";

        for (const log of logs) {
            const raw = (log.action || "REQUEST").replace(/_/g, " ").trim().split(" ")[0].toLowerCase();
            const actionColor = vibrantColors[raw] || "#2563eb";

            rows += `
                <tr>
                    <td style="text-align: center; width: 95px; padding: 8px 4px;">
                        <span style="color: ${actionColor}; font-weight: 800; font-size: 12px; letter-spacing: 0.8px; text-transform: uppercase;">
                            ${escapeHtml(raw)}
                        </span>
                    </td>
                    <td style="padding: 8px 10px; font-weight: 500; color: #1e293b;">${escapeHtml(log.file_name || log.file_id || "-")}</td>
                    <td style="text-align: right; width: 140px; color: #64748b; font-size: 13px;">
                        ${formatDateTime(log.created_at)}
                    </td>
                </tr>
            `;
        }

        contentEl.innerHTML = `
            <table class="explorer logs-table">
                <tbody>
                    ${rows}
                </tbody>
            </table>
        `;
    } catch (error) {
        console.error("Failed to load logs:", error);
    }
}

async function loadAnnouncement() {
    const notifyBox = document.getElementById("notify");

    if (!notifyBox) {
        return;
    }

    const informEl = notifyBox.querySelector(".inform");
    if (!informEl) {
        return;
    }

    try {
        const response = await fetch(`${API}/api/announcement`, { cache: "no-store" });

        if (!response.ok) {
            return;
        }

        const data = await response.json();

        if (data.active && data.announcement) {
            const caption = notifyBox.querySelector("figcaption");
            if (caption) {
                caption.innerHTML = `<strong>${escapeHtml(data.announcement)}</strong>`;
            }
        }
    } catch (error) {
        console.error("Failed to load announcement:", error);
    }
}

function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

if (document.getElementById("file-list") || document.getElementById("empty-state")) {
    Promise.all([loadFiles(), loadDashboardStats()]);
}

if (document.getElementById("logs") || document.querySelector(".diagnostics")) {
    Promise.all([loadStatusPage(), loadLogs(), loadAnnouncement()]);
}

function initDocsPage() {
    const copyButtons = document.querySelectorAll(".codebox .copy-btn");
    copyButtons.forEach((btn) => {
        btn.addEventListener("click", async () => {
            const container = btn.closest(".codebox");
            if (!container) {
                return;
            }
            const codeEl = container.querySelector(".docs-code");
            if (!codeEl) {
                return;
            }
            const textToCopy = codeEl.innerText.trim();

            try {
                await navigator.clipboard.writeText(textToCopy);
                btn.classList.add("copied");
                btn.innerHTML = checkIconSvg;
                setTimeout(() => {
                    btn.classList.remove("copied");
                    btn.innerHTML = copyIconSvg;
                }, 1500);
            } catch (e) {
                console.error("Clipboard copy failed:", e);
            }
        });
    });
}

if (document.querySelector(".docs-grid-4") || document.querySelector(".codebox")) {
    initDocsPage();
}

async function renderFileAccountBanner(account) {
    const banner = document.getElementById("file-account-banner");
    if (!banner) {
        return;
    }

    if (localStorage.getItem("cdn_file_banner_dismissed") === "true" ||
        localStorage.getItem("cdn_password_changed") === "true" ||
        account.password_changed) {
        banner.style.display = "none";
        return;
    }

    let password = account.password || "";
    if (!password) {
        try {
            const res = await authFetch(`${API}/api/auth/me`, { cache: "no-store" });
            if (res.ok) {
                const data = await res.json();
                if (data.user && data.user.password) {
                    password = data.user.password;
                    account.password = password;
                    localStorage.setItem("cdn_user", JSON.stringify(account));
                }
            }
        } catch (e) {
        }
    }

    const userEl = document.getElementById("banner-username");
    const passEl = document.getElementById("banner-password");
    if (userEl) userEl.textContent = account.username;
    if (passEl) {
        passEl.dataset.plain = password;
        passEl.innerHTML = `<span class="pass-masked">••••••••</span><span class="pass-plain">${escapeHtml(password)}</span>`;
    }

    banner.style.display = "flex";

    const copyUserBtn = document.getElementById("copy-banner-user");
    if (copyUserBtn) {
        copyUserBtn.onclick = async () => {
            await navigator.clipboard.writeText(account.username);
            copyUserBtn.innerHTML = checkIconSvg;
            setTimeout(() => {
                copyUserBtn.innerHTML = copyIconSvg;
            }, 1500);
        };
    }

    const copyPassBtn = document.getElementById("copy-banner-pass");
    if (copyPassBtn) {
        copyPassBtn.onclick = async () => {
            const plain = passEl?.dataset?.plain || account.password || password;
            await navigator.clipboard.writeText(plain);
            copyPassBtn.innerHTML = checkIconSvg;
            setTimeout(() => {
                copyPassBtn.innerHTML = copyIconSvg;
            }, 1500);
        };
    }

    const closeBtn = document.getElementById("close-file-banner");
    if (closeBtn) {
        closeBtn.onclick = () => {
            banner.style.display = "none";
            localStorage.setItem("cdn_file_banner_dismissed", "true");
        };
    }
}

function showNewAccountModal(account) {
    localStorage.setItem("cdn_user", JSON.stringify(account));
    localStorage.removeItem("cdn_guest_id");
    localStorage.removeItem("cdn_file_banner_dismissed");
    localStorage.removeItem("cdn_status_notice_dismissed");
    localStorage.removeItem("cdn_password_changed");

    updateGreeting();

    renderFileAccountBanner(account);
    updateDockAuth();
}

async function initAccountPage() {
    const page = document.getElementById("account-page");
    if (!page) {
        return;
    }

    let account = getStoredAccount();

    try {
        const res = await authFetch(`${API}/api/auth/me`);
        if (res.ok) {
            const data = await res.json();
            if (data.user) {
                account = { ...account, ...data.user };
                localStorage.setItem("cdn_user", JSON.stringify(account));
                updateDockAuth();
            }
        }
    } catch (e) {
    }

    const infoCard = document.getElementById("account-info-card");
    const emptyNotice = document.getElementById("account-empty-notice");
    const usernameDisplay = document.getElementById("acc-display-username");
    const idDisplay = document.getElementById("acc-display-id");
    const createdDisplay = document.getElementById("acc-display-created");
    const logoutBtn = document.getElementById("btn-logout");
    const editSections = document.getElementById("account-edit-sections");

    const loginCard = document.getElementById("account-login-card");
    if (account) {
        if (infoCard) infoCard.style.display = "block";
        if (editSections) editSections.style.display = "block";
        if (emptyNotice) emptyNotice.style.display = "none";
        if (loginCard) loginCard.style.display = "none";
        if (usernameDisplay) usernameDisplay.textContent = account.username;
        if (idDisplay) idDisplay.textContent = account.id;
        if (createdDisplay) createdDisplay.textContent = account.created_at ? formatDate(account.created_at) : "Recently";
    } else {
        if (infoCard) infoCard.style.display = "none";
        if (editSections) editSections.style.display = "none";
        if (emptyNotice) emptyNotice.style.display = "block";
        if (loginCard) loginCard.style.display = "block";
    }

    if (logoutBtn) {
        logoutBtn.onclick = () => {
            localStorage.removeItem("cdn_user");
            localStorage.removeItem("cdn_guest_id");
            updateDockAuth();
            window.location.reload();
        };
    }

    const deleteBtn = document.getElementById("btn-delete-acc");
    if (deleteBtn) {
        deleteBtn.onclick = async () => {
            const confirmed = confirm("Are you sure you want to delete your account? This action cannot be undone.");
            if (!confirmed) {
                return;
            }
            try {
                await authFetch(`${API}/api/auth/delete`, { method: "POST" });
            } catch (e) {
            }
            localStorage.removeItem("cdn_user");
            localStorage.removeItem("cdn_guest_id");
            updateDockAuth();
            window.location.reload();
        };
    }

    const formUser = document.getElementById("form-change-username");
    const userMsg = document.getElementById("msg-change-user");
    if (formUser) {
        formUser.onsubmit = async (e) => {
            e.preventDefault();
            const input = document.getElementById("input-new-username");
            const newName = input ? input.value.trim() : "";
            if (!newName) return;
            if (userMsg) {
                userMsg.textContent = "Updating...";
                userMsg.className = "form-msg pending";
            }
            try {
                const res = await authFetch(`${API}/api/auth/change-username`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ username: newName })
                });
                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error || "Failed to change username");
                }
                account = { ...account, username: newName };
                localStorage.setItem("cdn_user", JSON.stringify(account));
                if (usernameDisplay) usernameDisplay.textContent = newName;
                updateDockAuth();
                if (userMsg) {
                    userMsg.textContent = "Username changed successfully!";
                    userMsg.className = "form-msg success";
                }
                if (input) input.value = "";
            } catch (err) {
                if (userMsg) {
                    userMsg.textContent = err.message;
                    userMsg.className = "form-msg error";
                }
            }
        };
    }

    const formPass = document.getElementById("form-change-password");
    const passMsg = document.getElementById("msg-change-pass");
    if (formPass) {
        formPass.onsubmit = async (e) => {
            e.preventDefault();
            const oldInput = document.getElementById("input-old-password");
            const newInput = document.getElementById("input-new-password");
            const oldPass = oldInput ? oldInput.value : "";
            const newPass = newInput ? newInput.value : "";
            if (!oldPass || !newPass) return;
            if (passMsg) {
                passMsg.textContent = "Updating...";
                passMsg.className = "form-msg pending";
            }
            try {
                const res = await authFetch(`${API}/api/auth/change-password`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ old_password: oldPass, new_password: newPass })
                });
                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error || "Failed to change password");
                }
                account = { ...account, password: newPass, password_changed: true };
                localStorage.setItem("cdn_user", JSON.stringify(account));
                localStorage.setItem("cdn_file_banner_dismissed", "true");
                localStorage.setItem("cdn_password_changed", "true");
                const banner = document.getElementById("file-account-banner");
                if (banner) {
                    banner.style.display = "none";
                }
                if (passMsg) {
                    passMsg.textContent = "Password changed successfully!";
                    passMsg.className = "form-msg success";
                }
                if (oldInput) oldInput.value = "";
                if (newInput) newInput.value = "";
            } catch (err) {
                if (passMsg) {
                    passMsg.textContent = err.message;
                    passMsg.className = "form-msg error";
                }
            }
        };
    }

    const formLogin = document.getElementById("form-login");
    const loginMsg = document.getElementById("msg-login");
    if (formLogin) {
        formLogin.onsubmit = async (e) => {
            e.preventDefault();
            const userInput = document.getElementById("input-login-username");
            const passInput = document.getElementById("input-login-password");
            const username = userInput ? userInput.value.trim() : "";
            const password = passInput ? passInput.value : "";
            if (!username || !password) return;
            if (loginMsg) {
                loginMsg.textContent = "Logging in...";
                loginMsg.className = "form-msg pending";
            }
            try {
                const res = await fetch(`${API}/api/auth/login`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ username, password })
                });
                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error || "Login failed");
                }
                localStorage.setItem("cdn_user", JSON.stringify(data.user));
                localStorage.removeItem("cdn_guest_id");
                localStorage.setItem("cdn_file_banner_dismissed", "true");
                localStorage.setItem("cdn_password_changed", "true");
                updateDockAuth();
                if (loginMsg) {
                    loginMsg.textContent = "Login successful! Redirecting to files...";
                    loginMsg.className = "form-msg success";
                }
                setTimeout(() => {
                    window.location.href = "index.html";
                }, 800);
            } catch (err) {
                if (loginMsg) {
                    loginMsg.textContent = err.message;
                    loginMsg.className = "form-msg error";
                }
            }
        };
    }
}

if (document.getElementById("account-page")) {
    initAccountPage();
}