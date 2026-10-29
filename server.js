'use strict';
/**
 * FDI OPERATOR CHAT SYSTEM - MAIN SERVER ENTRY
 */
const path = require('path');
const http = require('http');
const express = require('express');
const helmet = require('helmet');
const cookie = require('cookie');
const { Server } = require('socket.io');

const cfg = require('./src/config');
const auth = require('./src/auth');
const setupSocket = require('./src/socket');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: false },
  cookie: true
});

// Security headers with relaxed CSP for retro Web Audio & canvas graphics
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      mediaSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// Cookie parsing
app.use((req, res, next) => {
  if (req.headers.cookie) {
    try { req.cookies = cookie.parse(req.headers.cookie); } catch { req.cookies = {}; }
  } else {
    req.cookies = {};
  }
  next();
});

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Static frontend
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/chat', require('./src/routes/chat'));
app.use('/api/files', require('./src/routes/files'));
app.use('/api/admin', require('./src/routes/admin'));

// Fallback to index.html for SPA
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Setup Realtime Sockets
setupSocket(io);

// Start server after ensuring admin account
async function main() {
  await auth.bootstrapAdmin();
  server.listen(cfg.PORT, () => {
    console.log(`\n======================================================`);
    console.log(`[+] FDI TERMINAL INITIALIZED & SECURED`);
    console.log(`[+] URL: http://localhost:${cfg.PORT}`);
    console.log(`[+] CLEARANCE: LEVEL S ACCESS READY`);
    console.log(`======================================================\n`);
  });
}

main().catch((err) => {
  console.error('[!] FATAL SYSTEM FAILURE:', err);
  process.exit(1);
});
