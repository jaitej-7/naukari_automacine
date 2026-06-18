import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import 'dotenv/config';

/**
 * Downloads the master resume PDF from Supabase Storage and writes it to a local path.
 * @param {string} storagePath Storage path in the bucket (e.g. resumes/master.pdf)
 * @param {string} localDestPath Local path where file should be saved
 * @returns {Promise<boolean>} Success status
 */
export async function downloadResumeFromSupabase(storagePath, localDestPath) {
  const supabaseUrl = process.env.SUPABASE_URL;
  // Fall back to ANON key or SERVICE key
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey || !storagePath) {
    console.warn('[Storage Helper] Supabase URL, Key, or storagePath missing. Cannot download resume from cloud storage.');
    return false;
  }

  // Supabase Storage authenticated object URL
  // Format: https://[project-ref].supabase.co/storage/v1/object/authenticated/[bucket-name]/[path-to-file]
  const bucket = 'resumes';
  const url = `${supabaseUrl}/storage/v1/object/authenticated/${bucket}/${storagePath}`;

  try {
    console.log(`[Storage Helper] Downloading resume from Supabase Storage: ${url}`);
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${supabaseKey}`,
        apikey: supabaseKey
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }

    // Ensure directory exists
    await fs.mkdir(path.dirname(localDestPath), { recursive: true });

    // Node 18 fetch returns Web ReadableStream. Convert to Node Stream to write
    const stream = createWriteStream(localDestPath);
    const bodyReader = response.body.getReader();
    
    // Read the stream chunks and write to file
    while (true) {
      const { done, value } = await bodyReader.read();
      if (done) break;
      stream.write(Buffer.from(value));
    }
    stream.end();

    console.log(`[Storage Helper] Resume downloaded successfully to ${localDestPath}`);
    return true;
  } catch (error) {
    console.error('[Storage Helper] Resume download failed:', error.message);
    return false;
  }
}
