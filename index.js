import "dotenv/config";
import fs from "fs";
import path from "path";
import chokidar from "chokidar";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ====== FOLDERS ======
const INPUT = "./input";
const PROCESSING = "./processing";
const OUTPUT = "./output";
const PROCESSED = "./processed";

[INPUT, PROCESSING, OUTPUT, PROCESSED].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ====== TRANSCRIBE ======
async function transcribe(filePath) {
  const res = await openai.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: "whisper-1",
  });
  return res.text.trim();
}

// ====== WATCHER ======
const watcher = chokidar.watch(INPUT, {
  awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 },
});

watcher.on("ready", () =>
  console.log("✅ Watching input folder:", INPUT)
);

watcher.on("add", async file => {
  try {
    console.log("▶ New MP3:", file);

    const base = path.basename(file);
    const working = path.join(PROCESSING, base);
    fs.renameSync(file, working);

    const text = await transcribe(working);

    const baseName = path.basename(base, path.extname(base));
    const outFile = path.join(OUTPUT, `${baseName}.txt`);
    fs.writeFileSync(outFile, text);

    fs.renameSync(working, path.join(PROCESSED, base));
    console.log("✅ Done:", base);
  } catch (err) {
    console.error("❌ Error:", err);
  }
});
