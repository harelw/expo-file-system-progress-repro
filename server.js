// Upload target for the repro: accepts any PUT/POST and answers 200 once the body
// has arrived. Reads the body slowly so iOS reports several progress events even
// over localhost.
const http = require("node:http");

const PORT = Number(process.env.PORT ?? 4321);

http
  .createServer((req, res) => {
    let bytes = 0;
    req.on("data", (chunk) => {
      bytes += chunk.length;
      req.pause();
      setTimeout(() => req.resume(), 25);
    });
    req.on("end", () => {
      console.log(`${req.method} ${req.url}: ${bytes} bytes`);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ received: bytes }));
    });
  })
  .listen(PORT, () => console.log(`Upload server on http://localhost:${PORT}`));
