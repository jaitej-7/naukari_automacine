const localtunnel = require('localtunnel');
(async () => {
  try {
    console.log("Starting localtunnel process...");
    const tunnel = await localtunnel({ port: 3000 });
    console.log("TUNNEL_URL=" + tunnel.url);
    setInterval(() => {
      console.log("TUNNEL_URL=" + tunnel.url);
    }, 1000);
  } catch (err) {
    console.log("TUNNEL_ERROR=" + err.message);
  }
})();
