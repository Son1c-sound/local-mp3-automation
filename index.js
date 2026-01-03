import "dotenv/config";
import fs from "fs";
import path from "path";
import chokidar from "chokidar";
import OpenAI from "openai";
import fetch from "node-fetch";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ====== FOLDERS ======
const INPUT = "./input";
const PROCESSING = "./processing";
const OUTPUT = "./output";
const PROCESSED = "./processed";

// Auto-create folders if missing
[INPUT, PROCESSING, OUTPUT, PROCESSED].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ====== ELEVENLABS VOICE MAP ======
const VOICE_IDS = {
  ADAM: "pNInz6obpgDQGcFmaJgB",    // Adam voice ID
  RACHEL: "MClEFoImJXBTgLwdLI5n",  // Rachel voice ID
};

// ====== TRANSCRIBE MP3 ======
async function transcribe(filePath) {
  const res = await openai.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: "whisper-1",
  });
  return res.text;
}

// ====== REWRITE INTO MARKER-BASED DIALOGUE ======
async function rewriteToDialogue(text) {
  const prompt = `
Rewrite the following text as dialogue.

Rules:
- Use explicit markers: [ADAM|NAME=] or [RACHEL|NAME=]
- Allowed voices ONLY: ADAM, RACHEL
- No narration
- Natural, TikTok-style back-and-forth
- Short punchy lines

Text:
${text}
`;

  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
  });

  return res.choices[0].message.content.trim();
}

// ====== PARSE DIALOGUE ======
function parseDialogue(script) {
  return script
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean)
    .map(line => {
      const match = line.match(/\[(\w+)(?:\|NAME=(.*?))?\]\s*(.*)/);
      if (!match) return null;
      const marker = match[1];
      return {
        voiceId: VOICE_IDS[marker],
        text: match[3],
      };
    })
    .filter(Boolean);
}

// ====== ELEVENLABS TTS ======
async function tts(voiceId, text, outFile) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": process.env.ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      voice_settings: { stability: 0.50, similarity_boost: 0.75 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs failed: ${err}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outFile, buffer);
}

// ====== WATCH INPUT FOLDER ======
const watcher = chokidar.watch(INPUT, { awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 } });

watcher.on("ready", () => console.log("✅ Input folder is being watched:", INPUT));

watcher.on("add", async file => {
  try {
    console.log("▶ New MP3 detected:", file);

    const base = path.basename(file);
    const working = path.join(PROCESSING, base);

    // Move to processing
    fs.renameSync(file, working);

    // 1. Transcribe
    const rawText = await transcribe(working);

    // 2. Rewrite to dialogue
    const dialogue = await rewriteToDialogue(rawText);

    // 3. Create per-file output folder
    const baseName = path.basename(file, path.extname(file));
    const fileOutputDir = path.join(OUTPUT, baseName);
    if (!fs.existsSync(fileOutputDir)) fs.mkdirSync(fileOutputDir, { recursive: true });

    // 4. Save dialogue.txt
    fs.writeFileSync(path.join(fileOutputDir, "dialogue.txt"), dialogue);

    // 5. Parse + generate clips
    const lines = parseDialogue(dialogue);

    for (let i = 0; i < lines.length; i++) {
      const { voiceId, text } = lines[i];
      if (!voiceId) {
        console.warn(`⚠️ Skipping line ${i + 1}: Unknown voice`);
        continue;
      }

      const filename = `${String(i + 1).padStart(2, "0")}.mp3`;
      const outPath = path.join(fileOutputDir, filename);

      console.log(`🎙️ ElevenLabs speaking line ${i + 1}: "${text}"`);
      await tts(voiceId, text, outPath);
      console.log(`✅ Saved MP3: ${filename}`);
    }

    // 6. Move original to processed
    const processedPath = path.join(PROCESSED, base);
    if (fs.existsSync(working)) fs.renameSync(working, processedPath);

    console.log("✅ Done:", base);
  } catch (err) {
    console.error("❌ Error:", err);
  }
});
