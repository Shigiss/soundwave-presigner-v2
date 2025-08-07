// index.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand    // ← Make sure this is imported!
} from "@aws-sdk/client-s3";

import { writeFile, readFile } from "fs/promises";
import { existsSync } from "fs";
const { spawnSync } = require("child_process");

const s3 = new S3Client({ region: "eu-north-1" });

export async function handler(event) {
  console.log("Event:", JSON.stringify(event, null, 2));

  // 1) FFmpeg check
  const ffmpegPath = "/opt/bin/ffmpeg";
  console.log("ffmpeg exists?", existsSync(ffmpegPath));
  console.log("FFmpeg version:", spawnSync(ffmpegPath, ["-version"]));

  const record = event.Records?.[0];
  if (!record) throw new Error("No S3 record");
  
  const bucket = record.s3.bucket.name;
  // Decode URL-encoded object key (replaces + with space, decodes %20 etc.)
  const srcKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));  
  const tmpIn  = "/tmp/input";
  const tmpOut = "/tmp/output.wav";

  try {
    // 2) Download incoming file
    console.log("Downloading", srcKey);
    const get = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: srcKey }));
    const body = await get.Body.transformToByteArray();
    await writeFile(tmpIn, Buffer.from(body));

    // 3) Run ffmpeg
    console.log("Running ffmpeg");
    spawnSync(ffmpegPath, ["-i", tmpIn, "-acodec", "pcm_s16le", "-ar", "44100", tmpOut], { timeout: 30000 });
    if (!existsSync(tmpOut)) throw new Error("Conversion failed: no output file");

    // 4) Upload converted .wav
    const fileName = srcKey.split("/").pop().replace(/\.\w+$/, ".wav");
    const outKey   = `converted/${fileName}`;
    console.log("Uploading to", outKey);    

    const wavBody = await readFile(tmpOut);
    await s3.send(new PutObjectCommand({
      Bucket:      bucket,
      Key:         outKey,
      Body:        wavBody,
      ContentType: "audio/wav"
    }));

    console.log("Uploaded to", outKey);
    return { statusCode: 200 };
  } catch (err) {
    console.error("Conversion error:", err);
    return { statusCode: 500, body: "Conversion failed: " + err.message };
  }
}
