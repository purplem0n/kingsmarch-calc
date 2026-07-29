import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const CDN = "https://web.poecdn.com";

const jsonFiles = ["poe.ninja.tattoo.json", "poe.ninja.runegraft.json"];

function collectImages(data) {
  const paths = new Set();
  for (const item of data.core?.items ?? []) {
    if (item.image) paths.add(item.image);
  }
  for (const item of data.items ?? []) {
    if (item.image) paths.add(item.image);
  }
  return paths;
}

async function downloadImage(imagePath) {
  const localPath = path.join(root, "images", imagePath.replace(/^\//, ""));
  await fs.mkdir(path.dirname(localPath), { recursive: true });

  try {
    await fs.access(localPath);
    return { imagePath, status: "skipped" };
  } catch {
    /* not cached yet */
  }

  const url = `${CDN}${imagePath}`;
  const res = await fetch(url);
  if (!res.ok) {
    return { imagePath, status: "failed", error: `${res.status} ${res.statusText}` };
  }

  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(localPath, buf);
  return { imagePath, status: "downloaded" };
}

const allPaths = new Set();
for (const file of jsonFiles) {
  const data = JSON.parse(await fs.readFile(path.join(root, file), "utf8"));
  for (const p of collectImages(data)) allPaths.add(p);
}

console.log(`Found ${allPaths.size} unique images`);

const results = await Promise.all([...allPaths].map(downloadImage));
const downloaded = results.filter((r) => r.status === "downloaded").length;
const skipped = results.filter((r) => r.status === "skipped").length;
const failed = results.filter((r) => r.status === "failed");

console.log(`Downloaded: ${downloaded}, skipped: ${skipped}, failed: ${failed.length}`);
if (failed.length) {
  for (const f of failed) console.error(`  ${f.imagePath}: ${f.error}`);
  process.exitCode = 1;
}
