import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ASSETS_DIR = path.resolve(__dirname, '../src/lib/assets/drawings');

async function getFiles(dir) {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(dirents.map((dirent) => {
        const res = path.resolve(dir, dirent.name);
        return dirent.isDirectory() ? getFiles(res) : res;
    }));
    return Array.prototype.concat(...files);
}

async function processImages() {
    console.log(`Generating multi-scale WebP images in ${ASSETS_DIR}...`);
    try {
        const allFiles = await getFiles(ASSETS_DIR);

        // Filter for source images
        const sourceFiles = allFiles.filter(f =>
            f.match(/\.(png|jpg|jpeg|webp)$/i) &&
            !f.includes('-sm.webp') &&
            !f.includes('-md.webp') &&
            !f.includes('-lg.webp')
        );

        console.log(`Found ${sourceFiles.length} source images.`);

        for (const filePath of sourceFiles) {
            const dir = path.dirname(filePath);
            const ext = path.extname(filePath);
            const baseName = path.basename(filePath, ext); // filename without extension

            // Define targets
            const targets = [
                { suffix: '-sm', width: 640 },
                { suffix: '-md', width: 1024 },
                { suffix: '-lg', width: 1920 }
            ];

            for (const target of targets) {
                const targetFilename = `${baseName}${target.suffix}.webp`;
                const targetPath = path.join(dir, targetFilename);

                // Check if exists
                try {
                    await fs.access(targetPath);
                    continue;
                } catch {
                    // File doesn't exist, proceed
                }

                console.log(`  Generating ${targetFilename}...`);

                try {
                    await sharp(filePath)
                        .resize({ width: target.width, withoutEnlargement: true })
                        .webp({ quality: 80 })
                        .toFile(targetPath);
                } catch (err) {
                    console.error(`❌ Error processing ${filePath} -> ${target.suffix}:`, err);
                }
            }
        }
        console.log('Done!');
    } catch (err) {
        console.error('Error:', err);
    }
}

processImages();
