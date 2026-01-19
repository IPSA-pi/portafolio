import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ASSETS_DIR = path.resolve(__dirname, '../src/lib/assets/drawings');

async function testImages() {
    console.log(`Testing images in ${ASSETS_DIR}...`);
    try {
        const files = await fs.readdir(ASSETS_DIR);

        for (const file of files) {
            if (!file.match(/\.(png|jpg|jpeg)$/i)) continue;

            const filePath = path.join(ASSETS_DIR, file);
            try {
                const image = sharp(filePath);
                const metadata = await image.metadata();
                console.log(`✅ ${file}: ${metadata.format} ${metadata.width}x${metadata.height}`);
            } catch (err) {
                console.error(`❌ FAILED ${file}:`, err.message);
            }
        }
    } catch (err) {
        console.error('Error:', err);
    }
}

testImages();
