import "dotenv/config";
import fs from "fs";
import path from "path";
import chokidar from "chokidar";
import fetch from "node-fetch";

// ====== FOLDERS ======
const INPUT = "./input_text";
const OUTPUT = "./output_text";
const PROCESSED = "./processed_text";

// Auto-create folders
console.log("🔧 Initializing folders...");
[INPUT, OUTPUT, PROCESSED].forEach(dir => {
  const exists = fs.existsSync(dir);
  if (!exists) {
    console.log(`📁 Creating folder: ${dir}`);
    fs.mkdirSync(dir, { recursive: true });
  } else {
    console.log(`📁 Folder exists: ${dir}`);
  }
});
console.log("✅ Folder initialization complete");



// real adam voice: pNInz6obpgDQGcFmaJgB
// andrew voice: MClEFoImJXBTgLwdLI5n
// rachel voice: ZT9u07TYPVl83ejeLakq
// ====== ELEVENLABS VOICE MAP ======
const VOICE_IDS = {
CHRIS: "pNInz6obpgDQGcFmaJgB",
  TAYLOR: "eBvoGh8YGJn1xokno71w",
};

// ====== PARSE DIALOGUE ======
function parseDialogue(script) {
   return script
     .split("\n")
     .map(l => l.trim())
     .filter(Boolean)
     .map(line => {
       const match = line.match(/^\[([A-Z]+)\]\s*(.+)$/);
       if (!match) return null;
       const speaker = match[1];
       return {
         speaker,
         voiceId: VOICE_IDS[speaker],
         text: match[2],
       };
     })
     .filter(Boolean);
}

 

// ====== ELEVENLABS TTS ======
async function tts(voiceId, text, outFile) {
  console.log(`🌐 Calling TTS API for voiceId: ${voiceId}, text length: ${text.length}`);
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    }
  );

  console.log(`📡 TTS API response status: ${res.status} ${res.statusText}`);
  if (!res.ok) {
    const errorText = await res.text();
    console.error(`❌ TTS API error: ${errorText}`);
    throw new Error(errorText);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  console.log(`💾 Writing MP3 file: ${outFile} (${buffer.length} bytes)`);
  fs.writeFileSync(outFile, buffer);
  console.log(`✅ TTS complete for: ${outFile}`);
}

// ====== WATCH INPUT FOLDER ======
console.log("👀 Initializing file watcher for:", INPUT);
const watcher = chokidar.watch(INPUT, {
  awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 100 },
});

watcher.on("ready", () => {
  console.log("✅ Watching text input folder:", INPUT);
  console.log("⏳ Waiting for new files...");
});

watcher.on("add", async file => {
  try {
    console.log("========================================");
    console.log("📄 New dialogue file detected:", file);
    console.log(`📂 Full path: ${path.resolve(file)}`);

    const base = path.basename(file);
    const baseName = path.basename(file, path.extname(file));
    console.log(`📝 Base name: ${baseName}`);
    
    const outDir = path.join(OUTPUT, baseName);
    console.log(`📁 Output directory: ${outDir}`);
    fs.mkdirSync(outDir, { recursive: true });
    console.log("✅ Output directory ready");

    console.log("📖 Reading file content...");
    const content = fs.readFileSync(file, "utf-8");
    console.log(`📄 File content length: ${content.length} characters`);
    console.log("📄 First 200 chars:", content.substring(0, 200));
    
    const lines = parseDialogue(content);
    console.log(`🔄 Starting to process ${lines.length} dialogue lines...`);

    if (lines.length === 0) {
      console.warn("⚠️ No dialogue lines found! Check file format.");
      return;
    }

    for (let i = 0; i < lines.length; i++) {
      console.log(`\n--- Processing line ${i + 1}/${lines.length} ---`);
      const { speaker, voiceId, text } = lines[i];
      console.log(`👤 Speaker: ${speaker}, VoiceId: ${voiceId}`);
      
      if (!voiceId) {
        console.warn(`⚠️ Skipping line ${i + 1}: Unknown voice`);
        continue;
      }

      const filename = `${String(i + 1).padStart(2, "0")}_${speaker}.mp3`;
      const outPath = path.join(outDir, filename);
      console.log(`🎯 Output file: ${filename}`);

      console.log(`🎙️ ${speaker}: ${text}`);
      await tts(voiceId, text, outPath);
      console.log(`✅ Saved MP3: ${filename}`);
    }

    const processedPath = path.join(PROCESSED, base);
    console.log(`\n📦 Moving file to processed folder: ${processedPath}`);
    fs.renameSync(file, processedPath);
    console.log("✅ Finished file:", base);
    console.log("========================================\n");
  } catch (err) {
    console.error("❌ Error occurred:");
    console.error("Error message:", err.message);
    console.error("Error stack:", err.stack);
    console.error("Full error:", err);
  }
});

console.log("🚀 Script started, watcher initialized");