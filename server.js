const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('✅ Astra RP Bot — En ligne');
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`✅ Serveur HTTP démarré sur le port ${PORT}`);
});

server.on('error', (err) => {
  console.error('❌ Erreur serveur:', err.message);
  process.exit(1);
});
