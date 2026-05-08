import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INPUT_DIR = path.resolve(__dirname, '../media');
const OUTPUT_DIR = path.resolve(__dirname, '../static/home');

const VIDEO_EXTS = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];

async function processVideo(filePath) {
    const name = path.basename(filePath, path.extname(filePath));
    const mp4Out = path.join(OUTPUT_DIR, `${name}.mp4`);
    const webmOut = path.join(OUTPUT_DIR, `${name}.webm`);
    const posterOut = path.join(OUTPUT_DIR, `${name}-poster.webp`);

    if (!await exists(mp4Out)) {
        console.log(`  → ${name}.mp4`);
        execSync(
            `ffmpeg -i "${filePath}" -vcodec h264 -crf 23 -preset slow -movflags +faststart -vf "scale=1920:-2" -an -y "${mp4Out}"`,
            { stdio: 'inherit' }
        );
    }

    if (!await exists(webmOut)) {
        console.log(`  → ${name}.webm`);
        execSync(
            `ffmpeg -i "${filePath}" -c:v libvpx-vp9 -crf 33 -b:v 0 -vf "scale=1920:-2" -an -y "${webmOut}"`,
            { stdio: 'inherit' }
        );
    }

    if (!await exists(posterOut)) {
        console.log(`  → ${name}-poster.webp`);
        execSync(
            `ffmpeg -i "${filePath}" -vframes 1 -vf "scale=1920:-2" -y /tmp/${name}-poster.jpg`,
            { stdio: 'inherit' }
        );
        await sharp(`/tmp/${name}-poster.jpg`).webp({ quality: 85 }).toFile(posterOut);
    }
}

async function processImage(filePath) {
    const name = path.basename(filePath, path.extname(filePath));
    const out = path.join(OUTPUT_DIR, `${name}.webp`);

    if (!await exists(out)) {
        console.log(`  → ${name}.webp`);
        await sharp(filePath).webp({ quality: 85 }).toFile(out);
    }
}

async function exists(p) {
    try { await fs.access(p); return true; } catch { return false; }
}

async function run() {
    const entries = await fs.readdir(INPUT_DIR, { withFileTypes: true }).catch(() => []);
    const files = entries.filter(e => e.isFile()).map(e => path.join(INPUT_DIR, e.name));

    if (files.length === 0) {
        console.log('No files found in media/. Drop source videos or images there and re-run.');
        return;
    }

    for (const filePath of files) {
        const ext = path.extname(filePath).toLowerCase();
        console.log(`Processing: ${path.basename(filePath)}`);

        if (VIDEO_EXTS.includes(ext)) {
            await processVideo(filePath);
        } else if (IMAGE_EXTS.includes(ext)) {
            await processImage(filePath);
        } else {
            console.log(`  Skipping (unsupported format)`);
        }
    }

    console.log('Done.');
}

run();
