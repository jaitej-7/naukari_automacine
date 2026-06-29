import express from 'express';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 7860;

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Naukri Bot Status</title>
        <style>
          body { font-family: system-ui; text-align: center; padding: 50px; background: #0f172a; color: #f8fafc; }
          .status { display: inline-block; padding: 10px 20px; background: #22c55e; color: white; border-radius: 9999px; font-weight: bold; }
        </style>
      </head>
      <body>
        <h1>🤖 Naukri Bot is Online!</h1>
        <div class="status">Daemon is running in the background</div>
        <p style="margin-top: 20px; color: #94a3b8;">This page keeps the Hugging Face Space awake.</p>
      </body>
    </html>
  `);
});

app.listen(port, () => {
  console.log(`[HF Server] Web server listening on port ${port}`);
  console.log(`[HF Server] Spawning background daemon...`);
  
  const daemon = spawn('node', [path.join(__dirname, 'daemon.js')], { stdio: 'inherit' });
  
  daemon.on('close', (code) => {
    console.log(`[HF Server] Daemon exited with code ${code}`);
  });
});
