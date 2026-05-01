// ============================================================
// CONFIG TEMPLATE — copy this file to config.js and fill in hashes
// ============================================================
// config.js is gitignored, so secrets stay out of the repo.
//
// To generate a hash for a password, run in a terminal:
//   echo -n "yourPassword" | openssl dgst -sha256
// Paste the resulting hex string (without the "SHA2-256(stdin)= " prefix).
// ============================================================
window.APP_CONFIG = {
  playerPasswordHash: "PUT_SHA256_HEX_HERE",
  gmPasswordHash:     "PUT_SHA256_HEX_HERE",
  mutherWorkerUrl:    "https://muthur-proxy.alienmuthur.workers.dev",
  mutherWorkerToken:  "PUT_WORKER_TOKEN_HERE"
};
