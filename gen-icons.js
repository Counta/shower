const { createCanvas } = require('canvas');
const fs = require('fs');

function makeIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  const r = size * 0.18;
  const w = size;
  const h = size;

  ctx.fillStyle = '#2563eb';
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(w - r, 0);
  ctx.quadraticCurveTo(w, 0, w, r);
  ctx.lineTo(w, h - r);
  ctx.quadraticCurveTo(w, h, w - r, h);
  ctx.lineTo(r, h);
  ctx.quadraticCurveTo(0, h, 0, h - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fill();

  const cx = w / 2;
  const cy = h / 2;
  const rx = w * 0.28;
  const ry = h * 0.18;

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(cx, cy - ry * 0.25, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(cx, cy + ry * 0.6, rx * 0.55, ry * 0.4, 0, 0, Math.PI);
  ctx.fill();

  ctx.fillStyle = '#2563eb';
  ctx.fillRect(cx - rx * 0.06, cy - ry * 1.2, rx * 0.12, ry * 0.55);

  const dropY = cy + ry * 0.9;
  const dropR = size * 0.05;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, dropY + dropR, dropR, 0, Math.PI * 2);
  ctx.fill();

  return canvas.toBuffer('image/png');
}

fs.writeFileSync('icon-192.png', makeIcon(192));
fs.writeFileSync('icon-512.png', makeIcon(512));
console.log('done');
