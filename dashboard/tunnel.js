const localtunnel = require('localtunnel');
const fs = require('fs');

(async () => {
  try {
    console.log("Starting localtunnel on port 3000...");
    const tunnel = await localtunnel({ port: 3000 });
    console.log("Tunnel URL:", tunnel.url);
    fs.writeFileSync('tunnel-url.txt', tunnel.url);
    
    tunnel.on('close', () => {
      console.log("Tunnel closed");
    });
  } catch (err) {
    console.error("Error starting tunnel:", err);
    fs.writeFileSync('tunnel-url.txt', 'ERROR: ' + err.message);
  }
})();
