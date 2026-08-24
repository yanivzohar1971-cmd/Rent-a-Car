process.stderr.write(`DUMMY RELAY ONLINE pid=${process.pid}\n`);
setInterval(() => {}, 1000);

function shutdown() {
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
