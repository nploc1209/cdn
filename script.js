const canvas = document.getElementById('board');

if (canvas) {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    const ctx = canvas.getContext('2d');

    let drawing = false;

    canvas.addEventListener('pointerdown', (e) => {
        drawing = true;
        ctx.beginPath();
        ctx.moveTo(e.offsetX, e.offsetY);
    });

    canvas.addEventListener('pointermove', (e) => {
        if (!drawing) return;

        ctx.lineTo(e.offsetX, e.offsetY);
        ctx.stroke();
    });

    canvas.addEventListener('pointerup', () => {
        drawing = false;
    });

    canvas.addEventListener('pointerleave', () => {
        drawing = false;
    });
}