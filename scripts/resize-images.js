import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ASSETS_DIR = path.resolve(__dirname, '../src/lib/assets/drawings');
const MAX_WIDTH = 2500;

async function processImages() {
    console.log(`Scanning ${ASSETS_DIR}...`);
    try {
        const files = await fs.readdir(ASSETS_DIR);

        for (const file of files) {
            if (!file.match(/\.(png|jpg|jpeg)$/i)) continue;

            const filePath = path.join(ASSETS_DIR, file);
            const stats = await fs.stat(filePath);
            const sizeMB = stats.size / (1024 * 1024);

            console.log(`Processing ${file} (${sizeMB.toFixed(2)} MB)...`);

            // Create a temporary path
            const tempPath = filePath + '.tmp.png';

            try {
                const image = sharp(filePath);
                const metadata = await image.metadata();

                if (metadata.width > MAX_WIDTH || sizeMB > 5) {
                    await image
                        .resize({ width: MAX_WIDTH, withoutEnlargement: true })
                        .png({ compressionLevel: 9, palette: true }) // High compression, palette based (great for drawings)
                        .toFile(tempPath);

                    // Replace original
                    await fs.rename(tempPath, filePath);
                    console.log(`✅ Resized and compressed ${file}`);
                } else {
                    console.log(`⏭️  Skipped ${file} (already small enough)`);
                }
            } catch (err) {
                console.error(`❌ Error processing ${file}:`, err);
                // Clean up temp file if exists
                try { await fs.unlink(tempPath); } catch (e) { }
            }
        }
        console.log('Done!');
    } catch (err) {
        console.error('Directory not found or error reading directory:', err);
    }
}

processImages();
