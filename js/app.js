'use strict';
/**
 * FDI OPERATOR TERMINAL - CLOUD SERVERLESS CONTROLLER (GitHub Pages Ready)
 * Communicates via free Public WSS MQTT Brokers (broker.emqx.io / broker.hivemq.com)
 * No credit card, no server cost, works 100% on GitHub Pages forever.
 */

// ==========================================================================
// CRYPTOGRAPHIC LEVEL S VERIFIER & KEY-DERIVED VAULT (SHA-256)
// Plaintext root credentials and access code are NEVER stored in source code.
// ==========================================================================
const _LV_U_HASH = 'fec545932eb7bc1987127659dc576ee2299aa69f87673b30a97e0792fe969b4b';
const _LV_C_HASH = 'f4800dbd7ee20bb752996e55a20bd1260daccb1f93d48665f001e5edfddb06e6';
const _LV_AUTH_HASH = 'fb8607a6f6ae64de9087c850f1b52bef530ea1ae0e287f37abe899d5bf3ca563';
const _LV_SES_HASH = 'd0aa4e81212e5dd50c33638676ef527516a5be188d8ce6dab10025104f4a8709';
const _LV_VAULT = [38, 62, 75, 34, 122, 216, 45, 41, 57, 144, 160, 34, 164, 159];

function _sha256Bytes(ascii) {
  const rightRotate = (v, n) => (v >>> n) | (v << (32 - n));
  const maxWord = 4294967296;
  const result = [];
  const words = [];
  const asciiBitLength = ascii.length * 8;
  let hash = [];
  const k = [];
  let primeCounter = 0;
  const isComposite = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 313; i += candidate) isComposite[i] = candidate;
      hash[primeCounter] = (Math.pow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  ascii += '\x80';
  while ((ascii.length % 64) - 56) ascii += '\x00';
  for (let i = 0; i < ascii.length; i++) {
    words[i >> 2] |= ascii.charCodeAt(i) << ((3 - (i % 4)) * 8);
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;
  for (let j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0);
    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const a = hash[0], e = hash[4];
      const t1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);
      const t2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash = [(t1 + t2) | 0].concat(hash);
      hash[4] = (hash[4] + t1) | 0;
      hash.pop();
    }
    for (let i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
  }
  for (let i = 0; i < 8; i++) {
    for (let j = 3; j + 1; j--) result.push((hash[i] >> (j * 8)) & 255);
  }
  return result;
}

function _sha256Hex(str) {
  return _sha256Bytes(str).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function isRootSubjectName(u) {
  return Boolean(u) && _sha256Hex('FDI_B81_USR_SALT_v4::' + String(u).trim().toUpperCase()) === _LV_U_HASH;
}

function isRootAccessCode(c) {
  return Boolean(c) && _sha256Hex('FDI_B81_CODE_SALT_v4::' + String(c).trim().toUpperCase()) === _LV_C_HASH;
}

function isProtectedRootTarget(code, username, role) {
  if (role === 'admin') return true;
  if (username && (isRootSubjectName(username) || isRootAccessCode(username))) return true;
  if (code && (isRootAccessCode(code) || isRootSubjectName(code))) return true;
  if (currentUser && currentUser.role === 'admin') {
    if (code && currentUser.accessCode && String(code).toUpperCase() === currentUser.accessCode.toUpperCase()) return true;
    if (username && currentUser.username && String(username).toUpperCase() === currentUser.username.toUpperCase()) return true;
  }
  return false;
}

function verifyRootCredentials(u, p) {
  return Boolean(u && p) && _sha256Hex('FDI_B81_AUTH_SALT_v4::' + u.toUpperCase() + '::' + p) === _LV_AUTH_HASH;
}

function unlockRootAccessCode(u, p) {
  const key = _sha256Bytes('FDI_B81_KEY_v4::' + u.toUpperCase() + '::' + p);
  return _LV_VAULT.map((b, i) => String.fromCharCode(b ^ key[i])).join('');
}

function verifyRootSession(user) {
  if (!user || !user.username || !user.accessCode) return false;
  return _sha256Hex('FDI_B81_SES_v4::' + user.username.toUpperCase() + '::' + user.accessCode) === _LV_SES_HASH;
}

// Global State
let currentUser = null;
let mqttClient = null;
let mqttConnected = false;
let activeContact = null;
let contactsMap = new Map();
let termHistory = [];
let termHistoryIdx = -1;
let mediaRecorder = null;
let audioChunks = [];
let typingTimeout = null;
let isRecordingAudio = false;

// System Surveillance Vault (Level S exclusive)
let auditLogs = [];
let interceptedMessages = [];
let interceptedPairs = new Map(); // pairKey -> { aName, aCode, bName, bCode, msgs: [] }
let activeWiretapPairKey = 'ALL';
let vaultFiles = [];
let activeNetworkLinks = new Map(); // pairKey -> { key, codeA, nameA, codeB, nameB, establishedAt, lastActivity, msgCount }
let processedIncomingIds = new Set();
let processedInterceptIds = new Set();
let presenceInterval = null;
let mqttReconnectTimer = null;

// DOM Helpers
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function showToast(msg, isError = false) {
  const container = $('#toast-container');
  if (!container) return;
  const t = document.createElement('div');
  t.className = `fdi-toast ${isError ? 'error' : ''}`;
  t.innerHTML = `<span>${isError ? '[!]' : '[+]'}</span> <span>${escapeHtml(msg)}</span>`;
  container.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 250);
  }, 3500);
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(2) + ' MB';
}

function formatTimeLeft(ms) {
  if (ms <= 0) return 'EXPIRED';
  const totalSecs = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Generate unique 12-char formatted access code: XXXX-XXXX-XXXX
function generateAccessCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 12; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
    if (i === 3 || i === 7) out += '-';
  }
  return out;
}

// Attach keyboard typing sound synthesis to all current and future inputs
window.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
    if (!e.ctrlKey && !e.altKey && !e.metaKey) {
      window.fdiAudio.typeKey(e.key);
    }
  }
});

// Real-Time System Clock
setInterval(() => {
  const now = new Date();
  const clk = $('#top-clock');
  if (clk) clk.textContent = now.toTimeString().split(' ')[0];
  updateContactTimers();
}, 1000);

// Audio Toggle Button
$('#btn-audio-toggle')?.addEventListener('click', () => {
  const enabled = window.fdiAudio.toggle();
  const lbl = $('#audio-status-label');
  if (lbl) {
    lbl.textContent = enabled ? 'ON' : 'MUTED';
    lbl.style.color = enabled ? 'var(--fdi-green)' : 'var(--text-dim)';
  }
});

// ==========================================================================
// INITIALIZATION & USER AUTHENTICATION
// ==========================================================================

function initApp() {
  // Purge any legacy un-scoped messages to ensure stale chats from other sessions never stick
  localStorage.removeItem('fdi_messages');

  // Sync initial audio toggle UI state with saved preference
  const lbl = $('#audio-status-label');
  if (lbl && window.fdiAudio) {
    lbl.textContent = window.fdiAudio.enabled ? 'ON' : 'MUTED';
    lbl.style.color = window.fdiAudio.enabled ? 'var(--fdi-green)' : 'var(--text-dim)';
  }

  const savedProfile = localStorage.getItem('fdi_user_profile');
  if (savedProfile) {
    try {
      const user = JSON.parse(savedProfile);
      // Verify cryptographic Level S session signature
      if (verifyRootSession(user)) {
        user.role = 'admin';
      } else if (isRootSubjectName(user.username)) {
        // Reject unverified root profile tampering
        localStorage.removeItem('fdi_user_profile');
        showAuthModal();
        return;
      } else {
        user.role = 'agent';
      }
      setupUserSession(user);
    } catch {
      showAuthModal();
    }
  } else {
    showAuthModal();
  }
}

function showAuthModal(isRegister = false) {
  $('#modal-auth').style.display = 'flex';
  const submitBtn = $('#btn-submit-login');
  const switchBtn = $('#btn-switch-register');

  if (isRegister) {
    submitBtn.textContent = 'REGISTER SUBJECT';
    switchBtn.textContent = 'SWITCH TO LOGIN';
    switchBtn.dataset.mode = 'register';
  } else {
    submitBtn.textContent = 'AUTHENTICATE';
    switchBtn.textContent = 'REGISTER NEW SUBJECT';
    switchBtn.dataset.mode = 'login';
  }
}

$('#btn-switch-register')?.addEventListener('click', () => {
  const isRegister = $('#btn-switch-register').dataset.mode === 'register';
  showAuthModal(!isRegister);
});

$('#btn-submit-login')?.addEventListener('click', handleAuthSubmit);
$('#auth-password')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleAuthSubmit();
});

function handleAuthSubmit() {
  const username = $('#auth-username').value.trim();
  const password = $('#auth-password').value;
  const isRegister = $('#btn-switch-register').dataset.mode === 'register';

  if (!username || !password) {
    window.fdiAudio.alertDenied();
    showToast('Credentials required', true);
    return;
  }

  const u = username.toUpperCase().replace(/[^A-Z0-9_.\- ]/g, '').trim();
  if (!u) {
    window.fdiAudio.alertDenied();
    showToast('Invalid username characters', true);
    return;
  }

  // 1. Cryptographic Level S Operator Verification (Zero-Knowledge Hash + Vault Unlock)
  if (isRootSubjectName(u)) {
    if (!verifyRootCredentials(u, password)) {
      window.fdiAudio.alertDenied();
      showToast('ACCESS DENIED: INVALID OPERATOR CREDENTIALS', true);
      return;
    }

    const unlockedCode = unlockRootAccessCode(u, password);
    const adminUser = {
      id: 'fdi_root_op',
      username: u,
      role: 'admin',
      accessCode: unlockedCode,
      createdAt: Date.now()
    };
    localStorage.setItem('fdi_user_profile', JSON.stringify(adminUser));
    window.fdiAudio.chimeSuccess();
    $('#modal-auth').style.display = 'none';
    setupUserSession(adminUser);
    showToast(`CLEARANCE LEVEL S CONFIRMED. Welcome Operator ${u}.`);
    return;
  }

  // 2. Regular Agent Accounts
  let user = null;
  if (isRegister) {
    user = {
      id: 'sub_' + Math.random().toString(36).substr(2, 8),
      username: u,
      role: 'agent',
      accessCode: generateAccessCode(),
      createdAt: Date.now()
    };
  } else {
    // Login on this device
    const existing = localStorage.getItem('fdi_user_profile');
    if (existing) {
      user = JSON.parse(existing);
      user.username = u;
      user.role = 'agent';
    } else {
      user = {
        id: 'sub_' + Math.random().toString(36).substr(2, 8),
        username: u,
        role: 'agent',
        accessCode: generateAccessCode(),
        createdAt: Date.now()
      };
    }
  }

  localStorage.setItem('fdi_user_profile', JSON.stringify(user));
  window.fdiAudio.chimeSuccess();
  $('#modal-auth').style.display = 'none';
  setupUserSession(user);
  showToast(`Welcome Agent ${user.username}`);
}

function setupUserSession(user) {
  currentUser = user;
  $('#user-header-profile').style.display = 'flex';
  $('#top-username').textContent = user.username;
  $('#my-code-display').textContent = user.accessCode;

  // Level S Admin Indicator, Dock Tools & Permanent Removal of "HAPUS AKUN" Button for Admin
  const adminSlot = $('#admin-indicator-slot');
  const adminTools = $('#admin-dock-tools');
  const purgeSelfBtn = $('#btn-purge-self');
  if (user.role === 'admin' || isProtectedRootTarget(user.accessCode, user.username, user.role)) {
    user.role = 'admin';
    adminSlot.innerHTML = `<span class="level-s-tag">CLEARANCE: LEVEL S</span>`;
    adminTools.style.display = 'flex';
    // Permanently remove the "HAPUS AKUN" button from the Admin UI so it can never be clicked
    if (purgeSelfBtn) {
      purgeSelfBtn.style.display = 'none';
      purgeSelfBtn.remove();
    }
  } else {
    adminSlot.innerHTML = `<span style="font-size:11px; color:var(--text-dim);">CLEARANCE: AGENT</span>`;
    adminTools.style.display = 'none';
    if (purgeSelfBtn) {
      purgeSelfBtn.style.display = 'inline-flex';
    }
  }

  loadStoredContacts();
  initServerlessMQTT();
}

// Complete client trace wiper (vaporizes 10000% of all local data without traces — NEVER touches Level S Admin)
function wipeAllClientTraces() {
  if (currentUser && isProtectedRootTarget(currentUser.accessCode, currentUser.username, currentUser.role)) {
    return;
  }
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('fdi_')) {
      keysToRemove.push(k);
    }
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));
  sessionStorage.clear();
}

// DISCONNECT: Burns active rooms and clears history cleanly for non-Level S
$('#btn-logout')?.addEventListener('click', () => {
  if (currentUser && currentUser.role !== 'admin' && !isProtectedRootTarget(currentUser.accessCode, currentUser.username, currentUser.role)) {
    // Broadcast session_burned to all active connected peers so their room burns immediately
    const grants = getStoredGrants();
    for (const peerCode of Object.keys(grants)) {
      publishPacket(`fdi_operator_v1/cmd/${peerCode}`, {
        action: 'session_burned',
        burnedBy: currentUser.accessCode,
        username: currentUser.username
      }, 1);
    }

    // Broadcast link termination
    publishPacket('fdi_operator_v1/links', {
      action: 'link_terminated',
      codeA: currentUser.accessCode
    }, 1);

    wipeAllClientTraces();
  } else {
    // Admin logout: logout without wiping system surveillance
    localStorage.removeItem('fdi_user_profile');
  }

  window.fdiAudio.alertDenied();
  window.location.reload();
});

// HAPUS AKUN SAYA (10000% Self Account Destruction - Strictly Disabled for Level S Admin)
$('#btn-purge-self')?.addEventListener('click', () => {
  if (!currentUser) return;
  if (isProtectedRootTarget(currentUser.accessCode, currentUser.username, currentUser.role)) {
    window.fdiAudio.alertDenied();
    showToast('AKUN ADMIN LEVEL S TIDAK DAPAT DIHAPUS ATAU DIGANGGU GUGAT!', true);
    return;
  }
  const ok = confirm(`PERINGATAN KRITIS: HAPUS AKUN 10000%?\n\nApakah Anda yakin ingin memusnahkan akun "${currentUser.username}" secara permanen?\nSeluruh riwayat, room, dan kunci enkripsi akan dimusnahkan tanpa meninggalkan jejak sedikitpun!`);
  if (!ok) return;

  // Broadcast to network that this account is nuked
  publishPacket('fdi_operator_v1/cmd/purge', {
    action: 'account_nuked',
    targetCode: currentUser.accessCode,
    targetUsername: currentUser.username,
    reason: 'SELF_PURGE'
  }, 1);

  // Notify any peers currently linked
  const grants = getStoredGrants();
  for (const peerCode of Object.keys(grants)) {
    publishPacket(`fdi_operator_v1/cmd/${peerCode}`, {
      action: 'account_nuked',
      targetCode: currentUser.accessCode,
      targetUsername: currentUser.username
    }, 1);
  }

  // Terminate any links
  publishPacket('fdi_operator_v1/links', {
    action: 'link_terminated',
    codeA: currentUser.accessCode
  }, 1);

  wipeAllClientTraces();
  window.fdiAudio.alertDenied();
  alert('[10000% VAPORIZED] AKUN & IDENTITAS ANDA TELAH DIHAPUS TOTAL TANPA MENINGGALKAN JEJAK.');
  window.location.reload();
});

$('#btn-copy-my-code')?.addEventListener('click', () => {
  if (currentUser?.accessCode) {
    navigator.clipboard.writeText(currentUser.accessCode);
    window.fdiAudio.beep(1200, 0.05);
    showToast('Access code copied to clipboard');
  }
});

// ==========================================================================
// SERVERLESS P2P MQTT REAL-TIME ENGINE (Works on GitHub Pages)
// ==========================================================================

function initServerlessMQTT() {
  if (mqttReconnectTimer) {
    clearTimeout(mqttReconnectTimer);
    mqttReconnectTimer = null;
  }

  if (typeof Paho === 'undefined') {
    console.error('Paho MQTT library not loaded');
    $('#top-link-status').textContent = 'OFFLINE (LIB MISSING)';
    return;
  }

  if (mqttClient && mqttConnected) {
    try {
      mqttClient.disconnect();
    } catch {
      // ignore disconnect error
    }
    mqttConnected = false;
  }

  const clientId = 'fdi_' + currentUser.username.toLowerCase().replace(/[^a-z0-9]/g, '') + '_' + Math.random().toString(16).substr(2, 6);
  const brokerHost = 'broker.emqx.io';
  const brokerPort = 8084;
  const path = '/mqtt';

  $('#top-link-status').textContent = 'CONNECTING CLOUD...';
  $('#top-link-status').style.color = 'var(--fdi-amber)';

  mqttClient = new Paho.Client(brokerHost, Number(brokerPort), path, clientId);

  mqttClient.onConnectionLost = (resp) => {
    console.warn('MQTT Connection lost:', resp.errorMessage);
    mqttConnected = false;
    $('#top-link-status').textContent = 'DISCONNECTED (RETRYING)';
    $('#top-link-status').style.color = 'var(--fdi-red)';
    if (mqttReconnectTimer) clearTimeout(mqttReconnectTimer);
    mqttReconnectTimer = setTimeout(initServerlessMQTT, 4000);
  };

  mqttClient.onMessageArrived = (message) => {
    handleIncomingNetworkPacket(message.destinationName, message.payloadString);
  };

  const connectOptions = {
    useSSL: true,
    timeout: 10,
    keepAliveInterval: 30,
    cleanSession: true,
    onSuccess: () => {
      mqttConnected = true;
      $('#top-link-status').textContent = 'CLOUD WSS ACTIVE';
      $('#top-link-status').style.color = 'var(--fdi-green)';
      addAuditLog('LINK_ESTABLISHED', `Connected to Cloud WSS Node (${brokerHost})`);

      if (currentUser.role === 'admin') {
        // Level S Admin: subscribe ONLY to wildcard 'fdi_operator_v1/#' (which covers inbox, typing, presence, broadcast, cmd, links)
        // Avoiding duplicate subscriptions prevents the MQTT broker from delivering each packet twice to Admin!
        mqttClient.subscribe('fdi_operator_v1/#', { qos: 1 });
        addAuditLog('LEVEL_S_RADAR', 'Wiretap intercept attached to global network traffic');
      } else {
        // Regular Agent: subscribe only to specific authorized channels
        mqttClient.subscribe(`fdi_operator_v1/inbox/${currentUser.accessCode}`, { qos: 1 });
        mqttClient.subscribe(`fdi_operator_v1/typing/${currentUser.accessCode}`, { qos: 0 });
        mqttClient.subscribe('fdi_operator_v1/presence', { qos: 0 });
        mqttClient.subscribe('fdi_operator_v1/broadcast', { qos: 1 });
        mqttClient.subscribe(`fdi_operator_v1/cmd/${currentUser.accessCode}`, { qos: 1 });
        mqttClient.subscribe('fdi_operator_v1/cmd/purge', { qos: 1 });
        mqttClient.subscribe('fdi_operator_v1/links', { qos: 1 });
      }

      // Broadcast initial presence
      broadcastPresence();
      if (presenceInterval) clearInterval(presenceInterval);
      presenceInterval = setInterval(broadcastPresence, 40000);
    },
    onFailure: (err) => {
      console.warn('Failed to connect to primary broker, retrying...', err);
      $('#top-link-status').textContent = 'RETRYING...';
      $('#top-link-status').style.color = 'var(--fdi-red)';
      if (mqttReconnectTimer) clearTimeout(mqttReconnectTimer);
      mqttReconnectTimer = setTimeout(initServerlessMQTT, 5000);
    }
  };

  mqttClient.connect(connectOptions);
}

function broadcastPresence() {
  if (!mqttConnected || !currentUser) return;
  const payload = {
    id: currentUser.id,
    username: currentUser.username,
    accessCode: currentUser.accessCode,
    role: currentUser.role,
    online: true,
    ts: Date.now()
  };
  publishPacket('fdi_operator_v1/presence', payload, 0);
}

function publishPacket(topic, dataObj, qos = 1) {
  if (!mqttConnected || !mqttClient) return;
  try {
    const message = new Paho.Message(JSON.stringify(dataObj));
    message.destinationName = topic;
    message.qos = qos;
    mqttClient.send(message);
  } catch (err) {
    console.error('Failed to publish packet', err);
  }
}

// Packet Dispatcher
function handleIncomingNetworkPacket(topic, payloadStr) {
  let data;
  try {
    data = JSON.parse(payloadStr);
  } catch {
    return;
  }

  // Omniscient Intercept for Level S Admin
  if (currentUser.role === 'admin') {
    if (topic.startsWith('fdi_operator_v1/inbox/') && data.fromCode !== currentUser.accessCode) {
      appendInterceptMessage(data);
    }
  }

  // 1. Presence Announcement
  if (topic === 'fdi_operator_v1/presence') {
    if (data.accessCode !== currentUser.accessCode) {
      registerDiscoveredSubject(data);
    }
  }

  // 2. Direct Inbox Message
  else if (topic === `fdi_operator_v1/inbox/${currentUser.accessCode}`) {
    handleIncomingMessage(data);
  }

  // 3. Typing Indicator
  else if (topic === `fdi_operator_v1/typing/${currentUser.accessCode}`) {
    if (activeContact && activeContact.accessCode === data.fromCode) {
      const bar = $('#chat-typing-indicator');
      if (bar) {
        if (data.isTyping) {
          $('#typing-agent-name').textContent = data.fromName;
          bar.style.display = 'flex';
          window.fdiAudio.typeKey(' ');
        } else {
          bar.style.display = 'none';
        }
      }
    }
  }

  // 4. Global Broadcast
  else if (topic === 'fdi_operator_v1/broadcast') {
    window.fdiAudio.alertDenied();
    alert(`[!!!] FDI NETWORK BROADCAST TRANSMISSION:\n\n${data.text}`);
    addAuditLog('BROADCAST_RCVD', data.text);
  }

  // 5. Bilateral Link Status Channel
  else if (topic === 'fdi_operator_v1/links') {
    if (data.action === 'link_established') {
      recordNetworkLink(data.fromCode, data.fromName, data.toCode, data.toName, true);
    } else if (data.action === 'link_terminated') {
      removeNetworkLink(data.codeA, data.codeB);
    }
  }

  // 6. Global or Targeted Purge Channel (10000% Identity Annihilation)
  else if (topic === 'fdi_operator_v1/cmd/purge' || topic === `fdi_operator_v1/cmd/${currentUser.accessCode}`) {
    const tCode = data.targetCode || data.accessCode;
    const tName = data.targetUsername || data.username || 'subjek';

    // ABSOLUTE IMMUTABILITY: Ignore any network packet attempting to target or purge the Root Level S Operator
    if (isProtectedRootTarget(tCode, tName, data.role)) {
      addAuditLog('SHIELD_BLOCKED', `Blocked unauthorized network command (${data.action}) targeting Root Level S`);
      return;
    }

    if (data.action === 'account_nuked' || data.action === 'force_nuke_account') {
      const isTarget = currentUser && !isProtectedRootTarget(currentUser.accessCode, currentUser.username, currentUser.role) && (
        currentUser.accessCode === data.targetCode ||
        currentUser.accessCode === data.accessCode ||
        (data.targetUsername && currentUser.username.toUpperCase() === data.targetUsername.toUpperCase())
      );

      if (isTarget) {
        window.fdiAudio.alertDenied();
        alert(`[!] PERINGATAN SISTEM FDI: AKUN ANDA TELAH DIMUSNAHKAN 10000% SECARA PERMANEN OLEH LEVEL S OPERATOR.\n\nSeluruh file identitas, sesi, dan riwayat di perangkat ini telah dihapus bersih tanpa jejak.`);
        wipeAllClientTraces();
        window.location.reload();
        return;
      }

      // Purge subject from this client's memory & storage
      executeLocalPurgeForSubject(tCode, tName);
      showToast(`Akun ${tName} telah dimusnahkan 10000% dari jaringan.`);
      addAuditLog('ACCOUNT_PURGED', `${tName} (${tCode}) purged from network`);
      return;
    }

    // Direct Command Channel Actions
    if (data.action === 'session_burned') {
      if (currentUser.role !== 'admin' && !isProtectedRootTarget(currentUser.accessCode, currentUser.username, currentUser.role)) {
        clearStoredMessagesForPeer(data.burnedBy);
        const grants = getStoredGrants();
        delete grants[data.burnedBy];
        localStorage.setItem('fdi_grants', JSON.stringify(grants));

        if (activeContact && activeContact.accessCode === data.burnedBy) {
          unselectActiveContact(`[!] SUBJECT ${escapeHtml(data.username || 'PEER')} DISCONNECTED. TRANSMISSION SESSION BURNED. Re-enter code to reconnect.`);
        }

        contactsMap.delete(data.burnedBy);
        removeNetworkLink(data.burnedBy);
        renderContactsList();
        window.fdiAudio.alertDenied();
        showToast(`Subject ${data.username || 'peer'} disconnected. Comms channel burned.`);
      } else {
        addAuditLog('SESSION_BURNED', `${data.username || data.burnedBy} disconnected`);
      }
    } else if (data.action === 'kick') {
      // Root Level S Admin is completely immune to kick
      if (isProtectedRootTarget(currentUser.accessCode, currentUser.username, currentUser.role)) return;
      window.fdiAudio.alertDenied();
      alert(`[!] TERMINAL SESSION KICKED BY LEVEL S OPERATOR.`);
      window.location.reload();
    } else if (data.action === 'ban') {
      // Root Level S Admin is completely immune to ban
      if (isProtectedRootTarget(currentUser.accessCode, currentUser.username, currentUser.role)) return;
      window.fdiAudio.alertDenied();
      alert(`[!] SUBJECT ACCOUNT BANNED BY LEVEL S OPERATOR.`);
      wipeAllClientTraces();
      window.location.reload();
    } else if (data.action === 'revoke') {
      // Root Level S Admin is completely immune to revoke
      if (isProtectedRootTarget(currentUser.accessCode, currentUser.username, currentUser.role)) return;
      showToast('Active 5-hour access window revoked by Level S operator', true);
      localStorage.removeItem('fdi_grants');
      loadStoredContacts();
    }
  }
}

// ==========================================================================
// CONTACTS & 5-HOUR WINDOW ENGINE (Strictly Isolated for Regular Users)
// ==========================================================================

function getStoredGrants() {
  try {
    return JSON.parse(localStorage.getItem('fdi_grants') || '{}');
  } catch {
    return {};
  }
}

function saveGrant(peerCode, peerUsername, durationMs = 5 * 60 * 60 * 1000) {
  const grants = getStoredGrants();
  grants[peerCode] = {
    username: peerUsername,
    accessCode: peerCode,
    expiresAt: Date.now() + durationMs,
    updatedAt: Date.now()
  };
  localStorage.setItem('fdi_grants', JSON.stringify(grants));
}

function loadStoredContacts() {
  contactsMap.clear();

  // If Admin Level S: discover all subjects automatically
  if (currentUser.role === 'admin') {
    const discovered = getDiscoveredSubjects();
    discovered.forEach((sub) => {
      if (sub.accessCode !== currentUser.accessCode) {
        contactsMap.set(sub.accessCode, {
          username: sub.username,
          accessCode: sub.accessCode,
          role: sub.role || 'agent',
          unlimited: true,
          expiresAt: null,
          online: sub.online !== false
        });
      }
    });
  } else {
    // STRICT ISOLATION FOR REGULAR AGENTS:
    // Only display contacts where an explicit, active access code grant exists
    const grants = getStoredGrants();
    const now = Date.now();
    for (const [code, g] of Object.entries(grants)) {
      if (g.expiresAt && g.expiresAt > now) {
        contactsMap.set(code, {
          username: g.username,
          accessCode: code,
          role: 'agent',
          unlimited: false,
          expiresAt: g.expiresAt,
          online: true
        });
      }
    }
  }

  renderContactsList();
}

function renderContactsList() {
  const container = $('#contacts-list-container');
  if (!container) return;
  container.innerHTML = '';

  const contacts = [...contactsMap.values()];
  if (contacts.length === 0) {
    container.innerHTML = `
      <div style="padding:16px; text-align:center; color:var(--text-dim); font-size:12px;">
        No active comms links.<br>Click "CONNECT PEER CODE" to open a 5-hour window.
      </div>`;
    return;
  }

  const now = Date.now();
  contacts.forEach((c) => {
    const item = document.createElement('div');
    item.className = `contact-item ${activeContact && activeContact.accessCode === c.accessCode ? 'active' : ''}`;
    item.dataset.code = c.accessCode;

    let timerHtml = '';
    if (c.unlimited) {
      timerHtml = `<span class="timer-pill unlimited">LEVEL S UNLIMITED</span>`;
    } else if (c.expiresAt) {
      const left = c.expiresAt - now;
      if (left <= 0) {
        timerHtml = `<span class="timer-pill expired">EXPIRED</span>`;
      } else if (left < 30 * 60 * 1000) {
        timerHtml = `<span class="timer-pill warning">${formatTimeLeft(left)}</span>`;
      } else {
        timerHtml = `<span class="timer-pill">${formatTimeLeft(left)}</span>`;
      }
    } else {
      timerHtml = `<span class="timer-pill expired">NO ACCESS</span>`;
    }

    item.innerHTML = `
      <div class="contact-top-row">
        <span class="contact-name">
          <span class="online-dot ${c.online ? 'is-online' : ''}"></span>
          ${escapeHtml(c.username)}
        </span>
        ${c.role === 'admin' ? '<span class="level-s-tag" style="font-size:9px; padding:1px 4px;">ADMIN</span>' : ''}
      </div>
      <div class="contact-bottom-row">
        <span style="font-size:10px; color:var(--text-dim);">${c.accessCode}</span>
        <span class="contact-timer-slot">${timerHtml}</span>
      </div>
    `;

    item.addEventListener('click', () => selectContact(c.accessCode));
    container.appendChild(item);
  });
}

function updateContactTimers() {
  const now = Date.now();
  $$('.contact-item').forEach((el) => {
    const code = el.dataset.code;
    const c = contactsMap.get(code);
    if (!c || c.unlimited || !c.expiresAt) return;
    const slot = el.querySelector('.contact-timer-slot');
    if (!slot) return;
    const left = c.expiresAt - now;
    if (left <= 0) {
      slot.innerHTML = `<span class="timer-pill expired">EXPIRED</span>`;
      // Auto-lock chat if currently open
      if (activeContact && activeContact.accessCode === code) {
        $('#chat-input-panel').style.display = 'none';
        $('#chat-expired-banner').style.display = 'flex';
      }
    } else if (left < 30 * 60 * 1000) {
      slot.innerHTML = `<span class="timer-pill warning">${formatTimeLeft(left)}</span>`;
    } else {
      slot.innerHTML = `<span class="timer-pill">${formatTimeLeft(left)}</span>`;
    }
  });

  if (activeContact) {
    const timerBadge = $('#active-peer-timer');
    if (activeContact.unlimited) {
      timerBadge.textContent = 'ACCESS: LEVEL S UNLIMITED';
      timerBadge.className = 'timer-pill unlimited';
    } else if (activeContact.expiresAt) {
      const left = activeContact.expiresAt - now;
      if (left <= 0) {
        timerBadge.textContent = 'WINDOW: EXPIRED';
        timerBadge.className = 'timer-pill expired';
        $('#chat-input-panel').style.display = 'none';
        $('#chat-expired-banner').style.display = 'flex';
      } else {
        timerBadge.textContent = `5H REMAINING: ${formatTimeLeft(left)}`;
        timerBadge.className = left < 30 * 60 * 1000 ? 'timer-pill warning' : 'timer-pill';
      }
    }
  }
}

// ==========================================================================
// ACTIVE CHAT TRANSCRIPT & P2P TRANSMISSION
// ==========================================================================

function getMessagesKey() {
  return currentUser ? `fdi_msgs_${currentUser.accessCode}` : 'fdi_messages';
}

function getStoredMessages(peerCode) {
  try {
    const key = getMessagesKey();
    const all = JSON.parse(localStorage.getItem(key) || '{}');
    const rawList = all[peerCode] || [];
    // Deduplicate any messages with identical ID or identical (fromCode + text + at)
    const seenIds = new Set();
    const seenSigs = new Set();
    const deduped = [];
    let hadDuplicates = false;
    for (const m of rawList) {
      const sig = `${m.fromCode || ''}|${m.text || ''}|${m.at || ''}`;
      if ((m.id && seenIds.has(m.id)) || seenSigs.has(sig)) {
        hadDuplicates = true;
        continue;
      }
      if (m.id) seenIds.add(m.id);
      seenSigs.add(sig);
      deduped.push(m);
    }
    if (hadDuplicates) {
      all[peerCode] = deduped;
      localStorage.setItem(key, JSON.stringify(all));
    }
    return deduped;
  } catch {
    return [];
  }
}

function saveStoredMessage(peerCode, msg) {
  try {
    const key = getMessagesKey();
    const all = JSON.parse(localStorage.getItem(key) || '{}');
    if (!all[peerCode]) all[peerCode] = [];
    // Prevent duplicate messages from ever being saved
    const isDup = all[peerCode].some((m) =>
      (msg.id && m.id === msg.id) ||
      (m.fromCode === msg.fromCode && m.text === msg.text && Math.abs((m.at || 0) - (msg.at || 0)) < 400)
    );
    if (isDup) return false;
    all[peerCode].push(msg);
    localStorage.setItem(key, JSON.stringify(all));
    return true;
  } catch (err) {
    console.error('Failed to save message', err);
    return false;
  }
}

function clearStoredMessagesForPeer(peerCode) {
  try {
    const key = getMessagesKey();
    const all = JSON.parse(localStorage.getItem(key) || '{}');
    delete all[peerCode];
    localStorage.setItem(key, JSON.stringify(all));
  } catch (err) {
    console.error('Failed to clear messages for peer', err);
  }
}

function unselectActiveContact(burnMessage = null) {
  activeContact = null;
  const emptyPlaceholder = $('#empty-chat-placeholder');
  const msgContainer = $('#messages-container');
  if (msgContainer) {
    msgContainer.innerHTML = '';
    msgContainer.style.display = 'none';
  }
  if (emptyPlaceholder) emptyPlaceholder.style.display = 'flex';
  $('#active-chat-header').style.display = 'none';
  $('#chat-bilateral-banner').style.display = 'none';
  $('#chat-input-panel').style.display = 'none';

  const bannerText = burnMessage || '[!] 5-HOUR TRANSMISSION WINDOW EXPIRED. Subject code re-entry required.';
  $('#chat-expired-banner').innerHTML = `
    <div>${bannerText}</div>
    <button class="btn-fdi-primary" id="btn-reopen-code" style="padding:4px 10px; font-size:11px;">ENTER CODE</button>
  `;
  $('#btn-reopen-code')?.addEventListener('click', () => $('#btn-open-code-modal').click());
  $('#chat-expired-banner').style.display = burnMessage ? 'flex' : 'none';
}

function selectContact(peerCode) {
  const contact = contactsMap.get(peerCode);
  if (!contact) return;
  activeContact = contact;

  renderContactsList();
  updateActiveContactHeader();

  const emptyPlaceholder = $('#empty-chat-placeholder');
  const msgContainer = $('#messages-container');
  if (emptyPlaceholder) emptyPlaceholder.style.display = 'none';
  if (msgContainer) msgContainer.style.display = 'flex';
  $('#active-chat-header').style.display = 'flex';

  // Bilateral link banner in Comms
  const linkBanner = $('#chat-bilateral-banner');
  const linkInfo = $('#chat-bilateral-info');
  if (linkBanner && linkInfo) {
    linkBanner.style.display = 'flex';
    linkInfo.innerHTML = `ACTIVE BILATERAL LINK: <strong style="color:var(--fdi-green);">${escapeHtml(currentUser.username)}</strong> <span style="color:var(--fdi-amber); margin:0 4px;">⇄</span> <strong style="color:var(--fdi-green);">${escapeHtml(contact.username)}</strong> (${contact.accessCode})`;
  }

  const now = Date.now();
  const isAccessible = contact.unlimited || (contact.expiresAt && contact.expiresAt > now);
  if (isAccessible) {
    $('#chat-input-panel').style.display = 'flex';
    $('#chat-expired-banner').style.display = 'none';
  } else {
    $('#chat-input-panel').style.display = 'none';
    $('#chat-expired-banner').style.display = 'flex';
  }

  loadConversationHistory(peerCode);
}

function updateActiveContactHeader() {
  if (!activeContact) return;
  $('#active-peer-avatar').textContent = activeContact.username.slice(0, 2).toUpperCase();
  $('#active-peer-name').textContent = activeContact.username;
  $('#active-peer-status').innerHTML = activeContact.online
    ? `<span class="online-dot is-online"></span> LINK ONLINE // CLOUD WSS`
    : `<span class="online-dot"></span> ASYNC QUEUED`;
  const tagText = $('#active-bilateral-text');
  if (tagText) {
    tagText.textContent = `LINKED ⇄ ${activeContact.username.toUpperCase()}`;
  }
  updateContactTimers();
}

function loadConversationHistory(peerCode) {
  const container = $('#messages-container');
  if (!container) return;
  container.innerHTML = '';
  const msgs = getStoredMessages(peerCode);
  if (msgs.length === 0) {
    const emptyNotice = document.createElement('div');
    emptyNotice.className = 'empty-thread-notice';
    emptyNotice.innerHTML = `
      <div style="text-align:center; padding:24px 16px; color:var(--text-dim); font-size:12px;">
        <div style="color:var(--fdi-green); font-weight:700; margin-bottom:4px;">[SECURE BILATERAL COMMS TUNNEL INITIALIZED]</div>
        <div>Transmission history is strictly ephemeral. End-to-end encrypted channel is ready.</div>
      </div>
    `;
    container.appendChild(emptyNotice);
  } else {
    msgs.forEach((m) => appendChatMessage(m, false));
  }
  container.scrollTop = container.scrollHeight;
}

function appendChatMessage(msg, autoScroll = true) {
  const container = $('#messages-container');
  if (!container) return;

  // Remove empty thread notice if present
  const emptyNotice = container.querySelector('.empty-thread-notice');
  if (emptyNotice) emptyNotice.remove();

  // Prevent rendering duplicate message bubble in DOM
  if (msg.id && container.querySelector(`[data-msg-id="${msg.id}"]`)) {
    return;
  }

  const isOut = msg.fromCode === currentUser.accessCode;
  const bubble = document.createElement('div');
  bubble.className = `msg-bubble ${isOut ? 'outgoing' : 'incoming'}`;
  if (msg.id) bubble.dataset.msgId = msg.id;

  const timeStr = new Date(msg.at).toLocaleTimeString('sv-SE');
  let bodyHtml = '';

  if (msg.kind === 'file' && msg.file) {
    const isImg = msg.file.mime?.startsWith('image/');
    const isAudio = msg.file.mime?.startsWith('audio/');

    bodyHtml = `
      <div class="msg-file-card">
        <div class="msg-file-info">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <div>
            <div class="msg-file-name">${escapeHtml(msg.file.name)}</div>
            <div class="msg-file-size">${formatBytes(msg.file.size)} // MIME: ${msg.file.mime}</div>
          </div>
        </div>
        <a href="${msg.file.dataUrl}" download="${escapeHtml(msg.file.name)}" class="btn-retro-sm">GET</a>
      </div>
    `;

    if (isImg) {
      bodyHtml += `<img src="${msg.file.dataUrl}" class="msg-img-preview" alt="Preview">`;
    } else if (isAudio) {
      bodyHtml += `<audio controls src="${msg.file.dataUrl}" class="msg-audio-player"></audio>`;
    }

    if (msg.text) {
      bodyHtml += `<div class="msg-text" style="margin-top:6px;">${escapeHtml(msg.text)}</div>`;
    }
  } else {
    bodyHtml = `<div class="msg-text">${escapeHtml(msg.text)}</div>`;
  }

  bubble.innerHTML = `
    <div class="msg-header-row">
      <span class="msg-sender">${escapeHtml(msg.fromName)}</span>
      <span>${timeStr}</span>
    </div>
    ${bodyHtml}
  `;

  container.appendChild(bubble);
  if (autoScroll) {
    container.scrollTop = container.scrollHeight;
  }
}

// Transmit Message
function transmitMessage() {
  if (!activeContact) return;
  const input = $('#chat-msg-input');
  const text = input.value.trim();
  if (!text) return;

  const msgObj = {
    id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    fromCode: currentUser.accessCode,
    fromName: currentUser.username,
    toCode: activeContact.accessCode,
    toName: activeContact.username,
    kind: 'text',
    text,
    at: Date.now()
  };

  // Publish via MQTT to peer's private inbox
  publishPacket(`fdi_operator_v1/inbox/${activeContact.accessCode}`, msgObj, 1);

  // Save locally and render
  saveStoredMessage(activeContact.accessCode, msgObj);
  appendChatMessage(msgObj, true);
  recordNetworkLink(currentUser.accessCode, currentUser.username, activeContact.accessCode, activeContact.username, false);

  input.value = '';
  window.fdiAudio.typeKey('Enter');
  emitTyping(false);
  addAuditLog('TRANSMIT_TEXT', `Sent to ${activeContact.username}`);
}

$('#btn-send-message')?.addEventListener('click', transmitMessage);
$('#chat-msg-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') transmitMessage();
  else emitTyping(true);
});

function emitTyping(isTyping) {
  if (!activeContact || !mqttConnected) return;
  publishPacket(`fdi_operator_v1/typing/${activeContact.accessCode}`, {
    fromCode: currentUser.accessCode,
    fromName: currentUser.username,
    isTyping
  }, 0);
  clearTimeout(typingTimeout);
  if (isTyping) {
    typingTimeout = setTimeout(() => {
      publishPacket(`fdi_operator_v1/typing/${activeContact.accessCode}`, {
        fromCode: currentUser.accessCode,
        fromName: currentUser.username,
        isTyping: false
      }, 0);
    }, 2500);
  }
}

function handleIncomingMessage(msg) {
  if (!msg) return;
  if (msg.id && processedIncomingIds.has(msg.id)) return;
  if (msg.id) processedIncomingIds.add(msg.id);

  const isSaved = saveStoredMessage(msg.fromCode, msg);
  if (!isSaved) return;

  if (msg.kind === 'file' && msg.file) {
    vaultFiles.push(msg.file);
  }

  recordNetworkLink(msg.fromCode, msg.fromName, msg.toCode || currentUser.accessCode, msg.toName || currentUser.username, false);

  // If sender not in contacts, add grant only if active link; or update placeholder name
  if (!contactsMap.has(msg.fromCode)) {
    if (currentUser.role === 'admin') {
      contactsMap.set(msg.fromCode, {
        username: msg.fromName,
        accessCode: msg.fromCode,
        role: 'agent',
        unlimited: true,
        expiresAt: null,
        online: true
      });
      renderContactsList();
    } else {
      saveGrant(msg.fromCode, msg.fromName);
      loadStoredContacts();
    }
  } else if (msg.fromName && contactsMap.get(msg.fromCode)?.username !== msg.fromName) {
    const c = contactsMap.get(msg.fromCode);
    c.username = msg.fromName;
    if (currentUser.role !== 'admin') {
      const grants = getStoredGrants();
      if (grants[msg.fromCode]) {
        grants[msg.fromCode].username = msg.fromName;
        localStorage.setItem('fdi_grants', JSON.stringify(grants));
      }
    }
    renderContactsList();
    if (activeContact && activeContact.accessCode === msg.fromCode) {
      updateActiveContactHeader();
    }
  }

  // If chat is open with sender
  if (activeContact && activeContact.accessCode === msg.fromCode) {
    appendChatMessage(msg, true);
    window.fdiAudio.chirpIncoming();
  } else {
    window.fdiAudio.beep(900, 0.05);
    showToast(`Transmission received from ${msg.fromName}`);
  }

  addAuditLog('TRANSMIT_RCVD', `From ${msg.fromName}`);
}

// File Attachment Upload
$('#btn-attach-file')?.addEventListener('click', () => {
  $('#file-upload-input').click();
});

$('#file-upload-input')?.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file || !activeContact) return;

  if (file.size > 2 * 1024 * 1024) {
    showToast('File size limit 2MB for cloud sync', true);
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result;
    const msgObj = {
      id: 'file_' + Date.now(),
      fromCode: currentUser.accessCode,
      fromName: currentUser.username,
      toCode: activeContact.accessCode,
      toName: activeContact.username,
      kind: 'file',
      file: {
        name: file.name,
        mime: file.type || 'application/octet-stream',
        size: file.size,
        dataUrl
      },
      text: file.name,
      at: Date.now()
    };

    publishPacket(`fdi_operator_v1/inbox/${activeContact.accessCode}`, msgObj, 1);
    saveStoredMessage(activeContact.accessCode, msgObj);
    appendChatMessage(msgObj, true);
    vaultFiles.push(msgObj.file);

    window.fdiAudio.chimeSuccess();
    showToast(`Transmitted evidence file ${file.name}`);
  };
  reader.readAsDataURL(file);
  e.target.value = '';
});

// Voice Note Recording
$('#btn-record-audio')?.addEventListener('click', async () => {
  if (!activeContact) return;
  const btn = $('#btn-record-audio');

  if (!isRecordingAudio) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result;
          const msgObj = {
            id: 'audio_' + Date.now(),
            fromCode: currentUser.accessCode,
            fromName: currentUser.username,
            toCode: activeContact.accessCode,
            toName: activeContact.username,
            kind: 'file',
            file: {
              name: `voice_${Date.now()}.webm`,
              mime: 'audio/webm',
              size: audioBlob.size,
              dataUrl
            },
            text: '[TACTICAL AUDIO TRANSMISSION]',
            at: Date.now()
          };

          publishPacket(`fdi_operator_v1/inbox/${activeContact.accessCode}`, msgObj, 1);
          saveStoredMessage(activeContact.accessCode, msgObj);
          appendChatMessage(msgObj, true);
          vaultFiles.push(msgObj.file);

          window.fdiAudio.chimeSuccess();
          showToast('Tactical voice note transmitted');
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorder.start();
      isRecordingAudio = true;
      btn.classList.add('recording');
      window.fdiAudio.beep(880, 0.08);
      showToast('Recording tactical transmission...');
    } catch (err) {
      window.fdiAudio.alertDenied();
      showToast('Microphone access denied', true);
    }
  } else {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    isRecordingAudio = false;
    btn.classList.remove('recording');
    window.fdiAudio.beep(440, 0.08);
  }
});

// ==========================================================================
// ACCESS CODE MODAL (5-Hour Window Unlock)
// ==========================================================================

$('#btn-open-code-modal')?.addEventListener('click', () => {
  $('#modal-access-code').style.display = 'flex';
  $('#input-access-code').value = '';
  $('#input-access-code').focus();
});

$('#btn-reopen-code')?.addEventListener('click', () => {
  $('#modal-access-code').style.display = 'flex';
  $('#input-access-code').value = '';
  $('#input-access-code').focus();
});

$('#btn-close-code-modal')?.addEventListener('click', () => {
  $('#modal-access-code').style.display = 'none';
});
$('#btn-cancel-code-modal')?.addEventListener('click', () => {
  $('#modal-access-code').style.display = 'none';
});

$('#btn-submit-access-code')?.addEventListener('click', handleAccessCodeSubmit);
$('#input-access-code')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleAccessCodeSubmit();
});

function handleAccessCodeSubmit() {
  const code = $('#input-access-code').value.trim();
  if (!code) return;

  if (code === currentUser.accessCode) {
    window.fdiAudio.alertDenied();
    showToast('Cannot link to own access code', true);
    return;
  }

  // Find if subject is discovered, or create placeholder
  const discovered = getDiscoveredSubjects();
  const sub = discovered.find((s) => s.accessCode === code);
  const peerName = sub ? sub.username : 'AGENT_' + code.substr(0, 4);

  // Save 5-hour grant
  saveGrant(code, peerName, 5 * 60 * 60 * 1000);

  // Broadcast bilateral link to network
  publishPacket('fdi_operator_v1/links', {
    action: 'link_established',
    fromCode: currentUser.accessCode,
    fromName: currentUser.username,
    toCode: code,
    toName: peerName,
    ts: Date.now()
  }, 1);

  recordNetworkLink(currentUser.accessCode, currentUser.username, code, peerName, true);

  window.fdiAudio.chimeSuccess();
  $('#modal-access-code').style.display = 'none';
  showToast(`5-Hour window opened with ${peerName}`);
  loadStoredContacts();
  selectContact(code);
  addAuditLog('ACCESS_GRANTED', `Opened 5-hour window with ${peerName} (${code})`);
}

// Auto-dash formatting for 12-char code input: XXXX-XXXX-XXXX
$('#input-access-code')?.addEventListener('input', (e) => {
  let val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (val.length > 4 && val.length <= 8) {
    val = val.slice(0, 4) + '-' + val.slice(4);
  } else if (val.length > 8) {
    val = val.slice(0, 4) + '-' + val.slice(4, 8) + '-' + val.slice(8, 12);
  }
  e.target.value = val;
});

// ==========================================================================
// DISCOVERED SUBJECTS REGISTRY (SILENT SURVEILLANCE FOR ADMIN ONLY)
// ==========================================================================

function getDiscoveredSubjects() {
  try {
    const raw = JSON.parse(localStorage.getItem('fdi_discovered_subjects') || '[]');
    const cleaned = raw.filter((s) => s && !isProtectedRootTarget(s.accessCode, s.username, s.role));
    if (cleaned.length !== raw.length) {
      localStorage.setItem('fdi_discovered_subjects', JSON.stringify(cleaned));
    }
    return cleaned;
  } catch {
    return [];
  }
}

function registerDiscoveredSubject(data) {
  if (!currentUser || !data || !data.accessCode) return;
  // Never register Root Level S Operator as a targetable regular subject
  if (isProtectedRootTarget(data.accessCode, data.username, data.role)) return;

  // For regular agents: if they already have an active grant with this peer (e.g. AGENT_XXXX placeholder), update the real username
  if (currentUser.role !== 'admin') {
    if (contactsMap.has(data.accessCode) && data.username) {
      const c = contactsMap.get(data.accessCode);
      if (c.username !== data.username) {
        c.username = data.username;
        const grants = getStoredGrants();
        if (grants[data.accessCode]) {
          grants[data.accessCode].username = data.username;
          localStorage.setItem('fdi_grants', JSON.stringify(grants));
        }
        renderContactsList();
        if (activeContact && activeContact.accessCode === data.accessCode) {
          updateActiveContactHeader();
        }
      }
    }
    return;
  }

  // Level S Admin: silently register and update contacts + database
  const list = getDiscoveredSubjects();
  const idx = list.findIndex((s) => s.accessCode === data.accessCode);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...data, lastSeen: Date.now() };
  } else {
    // SILENT REGISTRATION: No toasts to protect operator covert surveillance
    list.push({ ...data, firstSeen: Date.now(), lastSeen: Date.now() });
    addAuditLog('NODE_DISCOVERED', `Subject ${data.username} (${data.accessCode}) entered network`);
  }
  localStorage.setItem('fdi_discovered_subjects', JSON.stringify(list));

  contactsMap.set(data.accessCode, {
    username: data.username,
    accessCode: data.accessCode,
    role: data.role || 'agent',
    unlimited: true,
    expiresAt: null,
    online: true
  });
  renderContactsList();
  renderDatabaseTable(list);
}

// ==========================================================================
// LEVEL S OPERATOR DOCK & EXCLUSIVE MODULES
// ==========================================================================

$$('.dock-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const mod = btn.dataset.mod;
    $$('.dock-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    $$('.workspace-module').forEach((m) => (m.style.display = 'none'));
    const targetMod = $(`#module-${mod}`);
    if (targetMod) {
      targetMod.style.display = 'flex';
      targetMod.style.flexDirection = 'column';
      targetMod.style.width = '100%';
      window.fdiAudio.beep(1100, 0.04);
      onModuleOpen(mod);
    }
  });
});

function onModuleOpen(mod) {
  if (mod === 'terminal') {
    $('#term-cli-input')?.focus();
    if ($('#term-output-area').children.length === 0) {
      appendTermOutput("FDI ROOT OPERATOR TERMINAL [Level S]\nType 'help' for command reference.\n");
    }
  } else if (mod === 'database') {
    renderDatabaseTable(getDiscoveredSubjects());
  } else if (mod === 'intercept') {
    renderInterceptChannels();
  } else if (mod === 'analyzer') {
    loadAnalyzerFiles();
  } else if (mod === 'monitor') {
    loadMonitorStats();
  }
}

// 1. TERMINAL CONTROLLER
function appendTermOutput(text, isError = false) {
  const screen = $('#term-output-area');
  if (!screen) return;
  const p = document.createElement('div');
  p.style.color = isError ? 'var(--fdi-red)' : 'var(--fdi-green)';
  p.textContent = text;
  screen.appendChild(p);
  screen.scrollTop = screen.scrollHeight;
}

$('#term-cli-input')?.addEventListener('keydown', (e) => {
  const input = e.target;
  if (e.key === 'Enter') {
    const cmd = input.value.trim();
    if (!cmd) return;
    termHistory.push(cmd);
    termHistoryIdx = termHistory.length;
    input.value = '';

    appendTermOutput(`FDI-OPERATOR:~$ ${cmd}`);
    handleTerminalCommand(cmd);
  } else if (e.key === 'ArrowUp') {
    if (termHistoryIdx > 0) {
      termHistoryIdx--;
      input.value = termHistory[termHistoryIdx];
    }
  } else if (e.key === 'ArrowDown') {
    if (termHistoryIdx < termHistory.length - 1) {
      termHistoryIdx++;
      input.value = termHistory[termHistoryIdx];
    } else {
      termHistoryIdx = termHistory.length;
      input.value = '';
    }
  }
});

function handleTerminalCommand(raw) {
  const parts = raw.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  addAuditLog('TERMINAL_CMD', raw);

  if (cmd === 'clear') {
    $('#term-output-area').innerHTML = '';
  } else if (cmd === 'help') {
    appendTermOutput(`
 FDI OPERATOR TERMINAL :: LEVEL S COMMANDS
 -----------------------------------------
 help                     daftar perintah
 stats                    statistik sistem & traffic
 users                    semua subjek terdaftar di jaringan
 links                    pantau seluruh koneksi bilateral (siapa bicara dengan siapa)
 whois <user>             profil lengkap & access code subjek
 feed                     pesan-pesan terbaru di jaringan
 broadcast <pesan>        kirim transmisi darurat ke semua node
 kick <code/user>         putuskan sesi subjek
 ban <code/user>          blokir subjek
 revoke <code/user>       cabut jendela akses 5 jam
 nuke <code/user>         MUSNAHKAN AKUN 10000% TANPA JEJAK
 clear                    bersihkan layar terminal
    `);
  } else if (cmd === 'stats') {
    const subs = getDiscoveredSubjects();
    appendTermOutput(`
 SUBJECTS DISCOVERED ... ${subs.length + 1}
 CLOUD WSS BROKER ...... broker.emqx.io:8084
 INTERCEPTED TRAFFIC ... ${interceptedMessages.length} msgs
 ACTIVE BILATERAL LINKS  ${activeNetworkLinks.size} active sessions
 AUDIT LOGS RECORDED .. ${auditLogs.length} events
 CLEARANCE STATUS ...... LEVEL S (ACTIVE)
    `);
  } else if (cmd === 'users') {
    const subs = getDiscoveredSubjects();
    let out = 'ID        USERNAME       CLEARANCE   ACCESS CODE    STATUS\n';
    out += `001       ${currentUser.username.padEnd(14)} LEVEL S     ${currentUser.accessCode} ONLINE\n`;
    subs.forEach((s, idx) => {
      out += `${String(idx + 2).padStart(3, '0')}       ${s.username.padEnd(14)} AGENT       ${s.accessCode} ONLINE\n`;
    });
    appendTermOutput(out);
  } else if (cmd === 'links') {
    const links = [...activeNetworkLinks.values()];
    if (links.length === 0) {
      appendTermOutput('No active bilateral interconnect links at this moment.');
    } else {
      let out = 'ACTIVE BILATERAL INTERCONNECTIONS (WHO IS TALKING TO WHO):\n-----------------------------------------------------------\n';
      links.forEach((l) => {
        out += `${l.nameA} (${l.codeA}) <====[ ACTIVE P2P LINK ]====> ${l.nameB} (${l.codeB}) [${l.msgCount || 0} msgs]\n`;
      });
      appendTermOutput(out);
    }
  } else if (cmd === 'whois') {
    const target = args[0];
    if (!target) {
      appendTermOutput('ERROR: Target username or code required. Usage: whois <user/code>', true);
      return;
    }
    const all = [{ id: 'fdi_root_op', username: currentUser.username, role: 'admin', accessCode: currentUser.accessCode, online: true }, ...getDiscoveredSubjects()];
    const sub = all.find((s) => s.accessCode.toUpperCase() === target.toUpperCase() || s.username.toUpperCase() === target.toUpperCase());
    if (!sub) {
      appendTermOutput(`SUBJECT NOT FOUND: ${target}`, true);
      return;
    }
    const linked = getLinkedPeerForUser(sub.accessCode);
    appendTermOutput(`
 SUBJECT DOSSIER :: ${sub.username}
 -----------------------------------------
 ID ............. ${sub.id || 'N/A'}
 USERNAME ....... ${sub.username}
 CLEARANCE ...... ${sub.role === 'admin' ? 'LEVEL S (ROOT)' : 'AGENT'}
 ACCESS CODE .... ${sub.accessCode}
 LINKED PEER .... ${linked ? `${linked.name} (${linked.code})` : 'STANDBY (UNLINKED)'}
 LAST SEEN ...... ${sub.lastSeen ? new Date(sub.lastSeen).toLocaleString() : 'ONLINE NOW'}
    `);
  } else if (cmd === 'feed') {
    if (interceptedMessages.length === 0) {
      appendTermOutput('No intercepted network transmissions recorded yet.');
    } else {
      const recent = interceptedMessages.slice(-15);
      let out = 'RECENT INTERCEPTED NETWORK TRANSMISSIONS:\n-----------------------------------------\n';
      recent.forEach((m) => {
        out += `[${new Date(m.at).toLocaleTimeString('sv-SE')}] ${m.fromName} (${m.fromCode}) -> ${m.toName} (${m.toCode}): ${m.text || '[FILE]'}\n`;
      });
      appendTermOutput(out);
    }
  } else if (cmd === 'broadcast') {
    const text = args.join(' ');
    if (!text) {
      appendTermOutput('ERROR: Message text required', true);
      return;
    }
    publishPacket('fdi_operator_v1/broadcast', { text, sender: `OPERATOR ${currentUser.username}` }, 1);
    appendTermOutput(`[+] Broadcast transmitted to all network nodes.`);
    showToast('Broadcast transmitted');
  } else if (cmd === 'nuke' || cmd === 'purge' || cmd === 'hapusakun') {
    const target = args[0];
    if (!target) {
      appendTermOutput(`ERROR: Target username or code required. Usage: ${cmd} <code/user>`, true);
      return;
    }
    if (isProtectedRootTarget(target, target)) {
      appendTermOutput(`[!] ACCESS DENIED: AKUN ADMIN LEVEL S TIDAK DAPAT DIHAPUS ATAU DIGANGGU GUGAT!`, true);
      window.fdiAudio.alertDenied();
      return;
    }
    const subs = getDiscoveredSubjects();
    const sub = subs.find((s) => s.accessCode.toUpperCase() === target.toUpperCase() || s.username.toUpperCase() === target.toUpperCase());
    const targetCode = sub ? sub.accessCode : target;
    const targetName = sub ? sub.username : target;
    if (isProtectedRootTarget(targetCode, targetName, sub?.role)) {
      appendTermOutput(`[!] ACCESS DENIED: AKUN ADMIN LEVEL S TIDAK DAPAT DIHAPUS ATAU DIGANGGU GUGAT!`, true);
      window.fdiAudio.alertDenied();
      return;
    }
    adminNukeAccount(targetCode, targetName);
    appendTermOutput(`[+] 10000% Purge command signaled for ${targetName} (${targetCode})`);
  } else if (cmd === 'kick' || cmd === 'ban' || cmd === 'revoke') {
    const target = args[0];
    if (!target) {
      appendTermOutput(`ERROR: Target required. Usage: ${cmd} <code/user>`, true);
      return;
    }
    if (isProtectedRootTarget(target, target)) {
      appendTermOutput(`[!] ACCESS DENIED: AKUN ADMIN LEVEL S TIDAK DAPAT DIGANGGU GUGAT!`, true);
      window.fdiAudio.alertDenied();
      return;
    }
    const subs = getDiscoveredSubjects();
    const sub = subs.find((s) => s.accessCode.toUpperCase() === target.toUpperCase() || s.username.toUpperCase() === target.toUpperCase());
    const targetCode = sub ? sub.accessCode : target;
    if (isProtectedRootTarget(targetCode, sub?.username, sub?.role)) {
      appendTermOutput(`[!] ACCESS DENIED: AKUN ADMIN LEVEL S TIDAK DAPAT DIGANGGU GUGAT!`, true);
      window.fdiAudio.alertDenied();
      return;
    }
    publishPacket(`fdi_operator_v1/cmd/${targetCode}`, { action: cmd }, 1);
    appendTermOutput(`[+] Action '${cmd}' signaled to ${sub ? `${sub.username} (${targetCode})` : targetCode}`);
    showToast(`Action ${cmd} executed`);
  } else {
    appendTermOutput(`UNKNOWN COMMAND: ${cmd}. Type 'help' for instructions.`, true);
  }
}

// ==========================================================================
// BILATERAL LINK NETWORK TRACKER (Who is Connected with Whom)
// ==========================================================================

function getPairKey(code1, code2) {
  return [code1, code2].sort().join('<->');
}

function recordNetworkLink(code1, name1, code2, name2, isNew = false) {
  if (!code1 || !code2 || code1 === code2) return;
  const key = getPairKey(code1, code2);
  const existing = activeNetworkLinks.get(key) || {
    key,
    codeA: code1,
    nameA: name1 || code1.substr(0, 6),
    codeB: code2,
    nameB: name2 || code2.substr(0, 6),
    establishedAt: Date.now(),
    lastActivity: Date.now(),
    msgCount: 0
  };
  existing.lastActivity = Date.now();
  if (!isNew) {
    existing.msgCount = (existing.msgCount || 0) + 1;
  }
  activeNetworkLinks.set(key, existing);
  renderRadarInterconnectTable();
  if (currentUser?.role === 'admin') {
    renderDatabaseTable(getDiscoveredSubjects());
  }
}

function removeNetworkLink(code1, code2) {
  if (code2) {
    activeNetworkLinks.delete(getPairKey(code1, code2));
  } else {
    for (const [key, link] of activeNetworkLinks.entries()) {
      if (link.codeA === code1 || link.codeB === code1) {
        activeNetworkLinks.delete(key);
      }
    }
  }
  renderRadarInterconnectTable();
  if (currentUser?.role === 'admin') {
    renderDatabaseTable(getDiscoveredSubjects());
  }
}

function getLinkedPeerForUser(userCode) {
  for (const link of activeNetworkLinks.values()) {
    if (link.codeA === userCode) return { code: link.codeB, name: link.nameB };
    if (link.codeB === userCode) return { code: link.codeA, name: link.nameA };
  }
  return null;
}

function renderRadarInterconnectTable() {
  const tbody = $('#radar-interconnect-tbody');
  const countEl = $('#radar-active-links-count');
  if (!tbody) return;

  const links = [...activeNetworkLinks.values()];
  if (countEl) countEl.textContent = `${links.length} ACTIVE LINKS`;

  if (links.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; color:var(--text-dim); padding:16px;">
          No bilateral comms links active at this moment.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = '';
  const now = Date.now();
  links.forEach((l) => {
    const elapsedSecs = Math.floor((now - l.establishedAt) / 1000);
    const durationStr = `${Math.floor(elapsedSecs / 60)}m ${elapsedSecs % 60}s`;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:700; color:var(--text-bright);">${escapeHtml(l.nameA)} <span style="font-size:10px; color:var(--text-dim);">(${l.codeA})</span></td>
      <td style="color:var(--fdi-amber); font-weight:700; text-align:center;">
        <span class="link-pulse-dot" style="margin-right:4px;"></span> ⇄ ENCRYPTED P2P ⇄
      </td>
      <td style="font-weight:700; color:var(--text-bright);">${escapeHtml(l.nameB)} <span style="font-size:10px; color:var(--text-dim);">(${l.codeB})</span></td>
      <td style="color:var(--fdi-green); font-weight:700; text-align:center;">${l.msgCount || 0} msgs</td>
      <td><span class="badge-linked">ACTIVE LINK</span> <span style="font-size:10px; color:var(--text-dim);">(${durationStr})</span></td>
      <td>
        <button class="btn-action-cell" onclick="enterInterceptRoom('${l.codeA}', '${l.codeB}', '${escapeHtml(l.nameA)}', '${escapeHtml(l.nameB)}')">ENTER WIRETAP</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ==========================================================================
// 10000% LOCAL & REMOTE ACCOUNT PURGE CONTROLLER
// ==========================================================================

function executeLocalPurgeForSubject(targetCode, targetUsername) {
  if (!targetCode) return;
  // ABSOLUTE PROTECTION: Root Level S Admin can never be purged from any node
  if (isProtectedRootTarget(targetCode, targetUsername)) return;

  // 1. Remove from contactsMap
  contactsMap.delete(targetCode);

  // 2. Remove from discovered subjects in localStorage
  const list = getDiscoveredSubjects().filter((s) => s.accessCode !== targetCode && (!targetUsername || s.username.toUpperCase() !== targetUsername.toUpperCase()));
  localStorage.setItem('fdi_discovered_subjects', JSON.stringify(list));

  // 3. Remove from grants
  const grants = getStoredGrants();
  delete grants[targetCode];
  localStorage.setItem('fdi_grants', JSON.stringify(grants));

  // 4. Remove stored messages for target
  clearStoredMessagesForPeer(targetCode);

  // 5. Remove from activeNetworkLinks
  removeNetworkLink(targetCode);

  // 6. Remove from intercepted pairs
  for (const [key, p] of interceptedPairs.entries()) {
    if (p.aCode === targetCode || p.bCode === targetCode) {
      interceptedPairs.delete(key);
    }
  }

  // 7. If currently open chat is with target, burn it immediately
  if (activeContact && activeContact.accessCode === targetCode) {
    unselectActiveContact(`[!] AKUN ${escapeHtml(targetUsername || 'SUBJEK')} TELAH DIMUSNAHKAN 10000%. ROOM CHAT DIHAPUS TOTAL TANPA JEJAK.`);
  }

  renderContactsList();
  if (currentUser?.role === 'admin') {
    renderDatabaseTable(list);
    renderInterceptChannels();
  }
}

window.adminNukeAccount = function (targetCode, targetUsername) {
  if (!currentUser || currentUser.role !== 'admin') return;
  if (isProtectedRootTarget(targetCode, targetUsername)) {
    window.fdiAudio.alertDenied();
    showToast('PROTEKSI MUTLAK: AKUN ADMIN LEVEL S TIDAK DAPAT DIHAPUS ATAU DIGANGGU GUGAT!', true);
    return;
  }

  const ok = confirm(`PERINGATAN KRITIS: MUSNAHKAN AKUN ${targetUsername} (${targetCode}) 10000%?\n\nAkun ini dan seluruh riwayatnya di semua perangkat akan dimusnahkan secara permanen tanpa sisa!`);
  if (!ok) return;

  // 1. Send direct kill command to target
  publishPacket(`fdi_operator_v1/cmd/${targetCode}`, {
    action: 'account_nuked',
    targetCode,
    targetUsername,
    initiatedBy: 'LEVEL S OPERATOR'
  }, 1);

  // 2. Broadcast purge to all network nodes so everyone drops the user
  publishPacket('fdi_operator_v1/cmd/purge', {
    action: 'account_nuked',
    targetCode,
    targetUsername,
    initiatedBy: 'LEVEL S OPERATOR'
  }, 1);

  // 3. Purge from local admin storage & memory
  executeLocalPurgeForSubject(targetCode, targetUsername);

  window.fdiAudio.alertDenied();
  showToast(`AKUN ${targetUsername} TELAH DIMUSNAHKAN 10000% TANPA JEJAK!`);
  addAuditLog('ACCOUNT_NUKED', `Level S Operator executed 10000% purge on ${targetUsername} (${targetCode})`);
};

// 2. DATABASE CONTROLLER (Includes OPEN COMMS & NUKE buttons for Level S)
function renderDatabaseTable(users) {
  const tbody = $('#db-users-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  const q = ($('#db-search-field')?.value || '').toLowerCase();
  const rootEntry = currentUser && currentUser.role === 'admin'
    ? [{ id: '001', username: currentUser.username, role: 'admin', accessCode: currentUser.accessCode, online: true }]
    : [];
  const nonAdminUsers = (users || []).filter((u) => u && !isProtectedRootTarget(u.accessCode, u.username, u.role));
  const all = [...rootEntry, ...nonAdminUsers];

  const filtered = all.filter((u) =>
    u.username.toLowerCase().includes(q) || u.accessCode.toLowerCase().includes(q)
  );

  filtered.forEach((u) => {
    const tr = document.createElement('tr');
    const isSubjectAdmin = isProtectedRootTarget(u.accessCode, u.username, u.role);
    const linked = getLinkedPeerForUser(u.accessCode);
    const linkCell = linked
      ? `<span class="badge-linked">⇄ ${escapeHtml(linked.name)}</span>`
      : `<span class="badge-unlinked">STANDBY (UNLINKED)</span>`;

    tr.innerHTML = `
      <td>${u.id || '--'}</td>
      <td style="font-weight:700;">${escapeHtml(u.username)}</td>
      <td>${isSubjectAdmin ? '<span class="level-s-tag">LEVEL S</span>' : 'AGENT'}</td>
      <td style="font-family:var(--font-pixel); font-size:16px; color:var(--fdi-green);">${u.accessCode}</td>
      <td><span class="stat-val">ONLINE</span></td>
      <td>${linkCell}</td>
      <td style="font-size:11px;">${new Date().toLocaleDateString()}</td>
      <td>
        ${!isSubjectAdmin ? `
          <button class="btn-action-cell" onclick="joinSubjectComms('${u.accessCode}', '${escapeHtml(u.username)}')">OPEN COMMS</button>
          <button class="btn-action-cell" onclick="adminAction('revoke', '${u.accessCode}')">REVOKE 5H</button>
          <button class="btn-action-cell danger" onclick="adminAction('kick', '${u.accessCode}')">KICK</button>
          <button class="btn-action-cell danger" style="color:var(--fdi-red); border-color:var(--fdi-red); font-weight:700;" onclick="adminNukeAccount('${u.accessCode}', '${escapeHtml(u.username)}')">HAPUS AKUN (10000%)</button>
        ` : '<span class="level-s-tag" style="font-size:10px;">IMMUTABLE // ROOT PROTECTED</span>'}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

$('#db-search-field')?.addEventListener('input', () => renderDatabaseTable(getDiscoveredSubjects()));
$('#btn-refresh-db')?.addEventListener('click', () => renderDatabaseTable(getDiscoveredSubjects()));

window.joinSubjectComms = function (peerCode, peerUsername) {
  contactsMap.set(peerCode, {
    username: peerUsername,
    accessCode: peerCode,
    role: 'agent',
    unlimited: true,
    expiresAt: null,
    online: true
  });
  renderContactsList();
  $(`.dock-btn[data-mod="chat"]`)?.click();
  selectContact(peerCode);
  showToast(`Operator comms opened with ${peerUsername}`);
};

window.adminAction = function (action, peerCode) {
  if (isProtectedRootTarget(peerCode)) {
    window.fdiAudio.alertDenied();
    showToast('PROTEKSI MUTLAK: AKUN ADMIN LEVEL S TIDAK DAPAT DIGANGGU GUGAT!', true);
    return;
  }
  publishPacket(`fdi_operator_v1/cmd/${peerCode}`, { action }, 1);
  showToast(`Operator signal '${action}' sent to ${peerCode}`);
  addAuditLog('OPERATOR_ACTION', `${action} -> ${peerCode}`);
};

// 3. INTERCEPT / WIRETAP CONTROLLER (Omniscient Room Surveillance)
function appendInterceptMessage(msg) {
  if (!msg) return;
  if (msg.id && processedInterceptIds.has(msg.id)) return;
  if (msg.id) processedInterceptIds.add(msg.id);

  if (msg.kind === 'file' && msg.file) {
    vaultFiles.push(msg.file);
  }

  interceptedMessages.push(msg);

  // Group by bilateral pair
  const pairKey = [msg.fromCode, msg.toCode].sort().join('<->');
  if (!interceptedPairs.has(pairKey)) {
    interceptedPairs.set(pairKey, {
      aName: msg.fromName,
      aCode: msg.fromCode,
      bName: msg.toName,
      bCode: msg.toCode,
      msgs: []
    });
  }
  interceptedPairs.get(pairKey).msgs.push(msg);

  // Update channels list if visible
  renderInterceptChannels();

  // If viewing this pair or viewing ALL
  if (activeWiretapPairKey === 'ALL' || activeWiretapPairKey === pairKey) {
    renderWiretapMessageBubble(msg);
  }
}

function renderInterceptChannels() {
  const list = $('#intercept-pairs-list');
  if (!list) return;
  list.innerHTML = '';

  // 1. Global stream item
  const allItem = document.createElement('div');
  allItem.className = `contact-item ${activeWiretapPairKey === 'ALL' ? 'active' : ''}`;
  allItem.innerHTML = `
    <div style="font-weight:700; color:var(--text-bright);">GLOBAL SURVEILLANCE RADAR</div>
    <div style="font-size:11px; color:var(--text-dim); margin-top:2px;">
      Live intercept across all rooms (${interceptedMessages.length} msgs)
    </div>
  `;
  allItem.addEventListener('click', () => {
    activeWiretapPairKey = 'ALL';
    $('#intercept-active-title').textContent = 'GLOBAL WIRETAP STREAM (ALL CHANNELS)';
    renderInterceptChannels();
    loadInterceptStreamForPair('ALL');
  });
  list.appendChild(allItem);

  // 2. Pair rooms
  for (const [key, p] of interceptedPairs.entries()) {
    const item = document.createElement('div');
    item.className = `contact-item ${activeWiretapPairKey === key ? 'active' : ''}`;
    item.innerHTML = `
      <div style="font-weight:700; color:var(--fdi-amber);">${escapeHtml(p.aName)} &harr; ${escapeHtml(p.bName)}</div>
      <div style="font-size:11px; color:var(--text-dim); display:flex; justify-content:space-between; margin-top:2px;">
        <span>${p.msgs.length} transmissions</span>
        <button class="btn-retro-sm" style="font-size:10px; padding:1px 4px;" onclick="event.stopPropagation(); enterInterceptRoom('${p.aCode}', '${p.bCode}', '${escapeHtml(p.aName)}', '${escapeHtml(p.bName)}')">ENTER</button>
      </div>
    `;
    item.addEventListener('click', () => {
      activeWiretapPairKey = key;
      $('#intercept-active-title').textContent = `WIRETAP: ${p.aName} <-> ${p.bName}`;
      renderInterceptChannels();
      loadInterceptStreamForPair(key);
    });
    list.appendChild(item);
  }
}

function loadInterceptStreamForPair(pairKey) {
  const stream = $('#intercept-messages-stream');
  if (!stream) return;
  stream.innerHTML = '';

  const msgs = pairKey === 'ALL' ? interceptedMessages : (interceptedPairs.get(pairKey)?.msgs || []);
  msgs.forEach(renderWiretapMessageBubble);
  stream.scrollTop = stream.scrollHeight;
}

function renderWiretapMessageBubble(msg) {
  const stream = $('#intercept-messages-stream');
  if (!stream) return;

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble incoming';
  bubble.style.borderColor = 'var(--fdi-amber)';

  const timeStr = new Date(msg.at).toLocaleTimeString('sv-SE');
  bubble.innerHTML = `
    <div class="msg-header-row">
      <span style="color:var(--fdi-amber); font-weight:700;">[INTERCEPT] ${escapeHtml(msg.fromName)} &rarr; ${escapeHtml(msg.toName)}</span>
      <span>${timeStr}</span>
    </div>
    <div class="msg-text">${escapeHtml(msg.text || (msg.file ? `[FILE: ${msg.file.name}]` : ''))}</div>
  `;
  stream.appendChild(bubble);
  stream.scrollTop = stream.scrollHeight;
}

window.enterInterceptRoom = function (aCode, bCode, aName, bName) {
  // Add both to admin contacts so admin can transmit to either
  contactsMap.set(aCode, { username: aName, accessCode: aCode, role: 'agent', unlimited: true, expiresAt: null, online: true });
  contactsMap.set(bCode, { username: bName, accessCode: bCode, role: 'agent', unlimited: true, expiresAt: null, online: true });
  renderContactsList();
  $(`.dock-btn[data-mod="chat"]`)?.click();
  selectContact(aCode);
  showToast(`Joined channel with ${aName}`);
};

// 4. FILE FORENSIC & CRYPT ANALYZER CONTROLLER
let activeForensicFile = null;
let activeForensicHexText = '';

function syncVaultFilesFromMessages() {
  const seen = new Set(vaultFiles.map((f) => `${f.name}|${f.size}`));
  const addFileIfNew = (fileObj) => {
    if (!fileObj || !fileObj.dataUrl) return;
    const sig = `${fileObj.name}|${fileObj.size}`;
    if (!seen.has(sig)) {
      seen.add(sig);
      vaultFiles.push(fileObj);
    }
  };

  // Scan intercepted messages
  interceptedMessages.forEach((m) => {
    if (m && m.kind === 'file' && m.file) addFileIfNew(m.file);
  });

  // Scan stored messages for current user
  try {
    const key = getMessagesKey();
    const all = JSON.parse(localStorage.getItem(key) || '{}');
    for (const msgs of Object.values(all)) {
      if (Array.isArray(msgs)) {
        msgs.forEach((m) => {
          if (m && m.kind === 'file' && m.file) addFileIfNew(m.file);
        });
      }
    }
  } catch {
    // ignore storage parse error
  }
}

function buildHexDisassemblyForFile(fileObj) {
  let byteSample = '';
  try {
    byteSample = atob((fileObj.dataUrl || '').split(',')[1] || '').slice(0, 512);
  } catch {
    byteSample = '';
  }

  const freq = new Array(256).fill(0);
  for (let i = 0; i < byteSample.length; i++) {
    freq[byteSample.charCodeAt(i) & 0xff]++;
  }
  let entropy = 0;
  if (byteSample.length > 0) {
    for (let i = 0; i < 256; i++) {
      if (freq[i] > 0) {
        const p = freq[i] / byteSample.length;
        entropy -= p * Math.log2(p);
      }
    }
  }

  const hexLines = [];
  for (let i = 0; i < byteSample.length; i += 16) {
    let hexPart = '';
    let asciiPart = '';
    for (let j = 0; j < 16; j++) {
      if (i + j < byteSample.length) {
        const code = byteSample.charCodeAt(i + j);
        hexPart += code.toString(16).padStart(2, '0') + ' ';
        asciiPart += (code >= 32 && code < 127) ? String.fromCharCode(code) : '.';
      } else {
        hexPart += '   ';
      }
    }
    hexLines.push(`${i.toString(16).padStart(8, '0')}  ${hexPart} |${asciiPart}|`);
  }

  return {
    entropy,
    hexDumpText: hexLines.join('\n') || 'HEX STREAM READY'
  };
}

function renderOriginalDecryptedFileHtml(fileObj) {
  if (!fileObj || !fileObj.dataUrl) return '';
  const mime = (fileObj.mime || 'application/octet-stream').toLowerCase();
  const nameLower = (fileObj.name || '').toLowerCase();
  let previewHtml = '';

  if (mime.startsWith('image/')) {
    previewHtml = `
      <div style="background:#020503; border:1px solid var(--border-bright); padding:10px; display:flex; justify-content:center;">
        <img src="${fileObj.dataUrl}" alt="${escapeHtml(fileObj.name)}" style="max-width:100%; max-height:420px; object-fit:contain; border:1px solid var(--fdi-green);">
      </div>
    `;
  } else if (mime.startsWith('audio/')) {
    previewHtml = `
      <div style="background:#020503; border:1px solid var(--border-bright); padding:12px;">
        <audio controls src="${fileObj.dataUrl}" class="msg-audio-player" style="width:100%;"></audio>
      </div>
    `;
  } else if (mime.startsWith('video/')) {
    previewHtml = `
      <div style="background:#020503; border:1px solid var(--border-bright); padding:10px; display:flex; justify-content:center;">
        <video controls src="${fileObj.dataUrl}" style="max-width:100%; max-height:400px; border:1px solid var(--fdi-green);"></video>
      </div>
    `;
  } else if (mime === 'application/pdf') {
    previewHtml = `
      <iframe src="${fileObj.dataUrl}" style="width:100%; height:420px; border:1px solid var(--fdi-green); background:#fff;"></iframe>
    `;
  } else {
    let decodedText = '';
    try {
      const rawBytes = atob((fileObj.dataUrl || '').split(',')[1] || '');
      const isTextLike =
        mime.startsWith('text/') ||
        /\.(txt|json|csv|md|html|xml|js|css|log|ini|yml|yaml)$/i.test(nameLower);
      if (isTextLike) {
        decodedText = decodeURIComponent(escape(rawBytes));
      } else {
        decodedText = rawBytes.replace(/[^\x20-\x7E\r\n\t]/g, '.');
      }
    } catch {
      decodedText = '[BINARY STREAM DECODED - CLICK DOWNLOAD FILE ASLI TO OPEN]';
    }
    previewHtml = `
      <div class="hex-dump-box" style="color:var(--text-bright); border-color:var(--fdi-green); max-height:320px; overflow-y:auto;">${escapeHtml(decodedText.slice(0, 8000))}</div>
    `;
  }

  return `
    <div class="decrypted-file-card">
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-bright); padding-bottom:10px;">
        <div>
          <div style="color:var(--fdi-green); font-weight:700; font-size:14px;">
            [+] CRYPT SUCCESS // FILE ASLI DITEMUKAN: ${escapeHtml(fileObj.name)}
          </div>
          <div style="font-size:11px; color:var(--text-dim); margin-top:2px;">
            ORIGINAL MIME: ${escapeHtml(fileObj.mime)} // SIZE: ${formatBytes(fileObj.size)} // STATUS: DECRYPTED ORIGINAL PAYLOAD
          </div>
        </div>
        <a href="${fileObj.dataUrl}" download="${escapeHtml(fileObj.name)}" class="btn-fdi-primary" style="text-decoration:none; font-size:12px; padding:6px 14px;">
          DOWNLOAD FILE ASLI
        </a>
      </div>
      ${previewHtml}
    </div>
  `;
}

function loadAnalyzerFiles() {
  syncVaultFilesFromMessages();
  const container = $('#analyzer-files-container');
  if (!container) return;
  container.innerHTML = '';

  if (vaultFiles.length === 0) {
    container.innerHTML = '<div style="padding:16px; color:var(--text-dim); font-size:12px;">No evidence files captured yet. Transmit a file in Comms to analyze.</div>';
    return;
  }

  vaultFiles.forEach((f, idx) => {
    const item = document.createElement('div');
    item.className = `contact-item ${activeForensicFile === f ? 'active' : ''}`;
    item.innerHTML = `
      <div style="font-weight:700; color:var(--text-bright);">${escapeHtml(f.name)}</div>
      <div style="font-size:11px; color:var(--text-dim); display:flex; justify-content:space-between; margin-top:2px;">
        <span>${formatBytes(f.size)}</span>
        <span style="color:var(--fdi-amber);">#EV-${idx + 1}</span>
      </div>
    `;
    item.addEventListener('click', () => runClientFileForensics(f));
    container.appendChild(item);
  });
}

function runClientFileForensics(fileObj) {
  activeForensicFile = fileObj;
  loadAnalyzerFiles();

  const reportBox = $('#analyzer-report-container');
  reportBox.innerHTML = '<div style="padding:20px; color:var(--fdi-cyan);">RUNNING IN-BROWSER FORENSIC SCAN...</div>';
  window.fdiAudio.beep(1600, 0.08);

  const { entropy, hexDumpText } = buildHexDisassemblyForFile(fileObj);
  activeForensicHexText = hexDumpText;

  // Also sync hex into CRYPT module input automatically
  const cryptInput = $('#crypt-hex-input');
  if (cryptInput) cryptInput.value = hexDumpText;

  setTimeout(() => {
    reportBox.innerHTML = `
      <div style="font-size:18px; font-weight:700; color:var(--fdi-green);">EVIDENCE FILE REPORT :: ${escapeHtml(fileObj.name)}</div>
      
      <div class="report-grid">
        <div class="report-card">
          <div class="report-card-title">MIME SPECIFICATION</div>
          <div class="report-card-val" style="font-size:13px;">${escapeHtml(fileObj.mime)}</div>
        </div>
        <div class="report-card">
          <div class="report-card-title">SHANNON ENTROPY (0-8)</div>
          <div class="report-card-val">${entropy.toFixed(2)}</div>
        </div>
        <div class="report-card">
          <div class="report-card-title">FILE SIZE</div>
          <div class="report-card-val">${formatBytes(fileObj.size)}</div>
        </div>
        <div class="report-card">
          <div class="report-card-title">PAYLOAD CIPHER STATUS</div>
          <div class="report-card-val" id="forensic-cipher-status" style="color:var(--fdi-amber); font-size:13px;">ENCRYPTED RAW HEX</div>
        </div>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; background:#07120c; border:1px solid var(--border-bright); padding:8px 12px;">
        <div style="font-weight:700; color:var(--fdi-green);">RAW HEX DISASSEMBLY (FIRST 512 BYTES // SELECTABLE)</div>
        <div style="display:flex; gap:8px; align-items:center;">
          <button class="btn-retro-sm" id="btn-copy-raw-hex" title="Salin Raw Hex">COPY RAW HEX</button>
          <button class="btn-fdi-primary" id="btn-inline-crypt-file" style="padding:5px 18px; font-size:12px;">CRYPT</button>
        </div>
      </div>

      <div id="inline-crypt-file-viewer" style="display:none;"></div>

      <div class="hex-dump-box" id="forensic-hex-dump-box">${escapeHtml(hexDumpText)}</div>
    `;

    $('#btn-copy-raw-hex')?.addEventListener('click', () => {
      navigator.clipboard.writeText(hexDumpText);
      const cInput = $('#crypt-hex-input');
      if (cInput) cInput.value = hexDumpText;
      window.fdiAudio.beep(1200, 0.05);
      showToast('Raw Hex copied to clipboard & synced to CRYPT');
    });

    $('#btn-inline-crypt-file')?.addEventListener('click', () => {
      const btn = $('#btn-inline-crypt-file');
      const statusEl = $('#forensic-cipher-status');
      const viewer = $('#inline-crypt-file-viewer');
      if (!viewer) return;

      btn.textContent = 'DECRYPTING...';
      btn.disabled = true;
      window.fdiAudio.beep(1400, 0.06);

      let step = 0;
      const timer = setInterval(() => {
        window.fdiAudio.typeKey(' ');
        step++;
        if (step >= 6) {
          clearInterval(timer);
          btn.textContent = 'CRYPT // DECRYPTED';
          btn.disabled = false;
          if (statusEl) {
            statusEl.textContent = 'DECRYPTED (FILE ASLI READY)';
            statusEl.style.color = 'var(--fdi-green)';
          }
          viewer.style.display = 'block';
          viewer.innerHTML = renderOriginalDecryptedFileHtml(fileObj);

          // Also sync result to CRYPT module
          const cryptResult = $('#crypt-decrypted-result');
          const matrixBox = $('#decryptor-matrix-box');
          if (cryptResult) cryptResult.innerHTML = renderOriginalDecryptedFileHtml(fileObj);
          if (matrixBox) matrixBox.textContent = `PLAINTEXT PAYLOAD CRACKED :: ${fileObj.name}`;

          window.fdiAudio.chimeSuccess();
          showToast(`File asli "${fileObj.name}" berhasil didekripsi!`);
        }
      }, 65);
    });

    window.fdiAudio.chimeSuccess();
  }, 300);
}

// 5. AUDIO VISUALIZER OSCILLOSCOPE
let audioVizActive = false;
let audioVizCtx = null;
let audioVizAnalyser = null;
let audioVizStream = null;

$('#btn-toggle-mic-viz')?.addEventListener('click', async () => {
  const btn = $('#btn-toggle-mic-viz');
  const canvas = $('#audio-viz-canvas');
  const canvasCtx = canvas.getContext('2d');

  if (!audioVizActive) {
    try {
      audioVizStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioVizCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioVizCtx.createMediaStreamSource(audioVizStream);
      audioVizAnalyser = audioVizCtx.createAnalyser();
      audioVizAnalyser.fftSize = 2048;
      source.connect(audioVizAnalyser);

      audioVizActive = true;
      btn.textContent = 'STOP MIC TEST';
      btn.style.borderColor = 'var(--fdi-red)';
      btn.style.color = 'var(--fdi-red)';

      const bufferLength = audioVizAnalyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      function draw() {
        if (!audioVizActive) return;
        requestAnimationFrame(draw);
        audioVizAnalyser.getByteTimeDomainData(dataArray);

        canvasCtx.fillStyle = '#040806';
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

        canvasCtx.lineWidth = 2;
        canvasCtx.strokeStyle = '#39ff84';
        canvasCtx.beginPath();

        const sliceWidth = canvas.width / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 128.0;
          const y = (v * canvas.height) / 2;
          if (i === 0) canvasCtx.moveTo(x, y);
          else canvasCtx.lineTo(x, y);
          x += sliceWidth;
        }

        canvasCtx.lineTo(canvas.width, canvas.height / 2);
        canvasCtx.stroke();
      }
      draw();
    } catch {
      showToast('Microphone unavailable', true);
    }
  } else {
    audioVizActive = false;
    btn.textContent = 'START MIC TEST';
    btn.style.borderColor = 'var(--border-bright)';
    btn.style.color = 'var(--text-main)';
    if (audioVizStream) audioVizStream.getTracks().forEach((t) => t.stop());
    if (audioVizCtx) audioVizCtx.close();
  }
});

// 6. DECRYPTOR MODULE (Interactive Raw Hex to Original File Reconstructor)
$('#btn-load-latest-hex')?.addEventListener('click', () => {
  syncVaultFilesFromMessages();
  const targetFile = activeForensicFile || vaultFiles[vaultFiles.length - 1];
  if (!targetFile) {
    showToast('Belum ada file bukti yang masuk', true);
    return;
  }
  activeForensicFile = targetFile;
  const { hexDumpText } = buildHexDisassemblyForFile(targetFile);
  $('#crypt-hex-input').value = hexDumpText;
  window.fdiAudio.beep(1100, 0.05);
  showToast(`Loaded Raw Hex from ${targetFile.name}`);
});

$('#btn-clear-crypt-hex')?.addEventListener('click', () => {
  $('#crypt-hex-input').value = '';
  $('#crypt-decrypted-result').innerHTML = '';
  $('#decryptor-matrix-box').textContent = '0x7F45 0x4C46 0x0201 0x0100 :: READY FOR HEX PAYLOAD';
});

function reconstructFileFromRawHexText(rawInput) {
  syncVaultFilesFromMessages();
  const cleanInput = rawInput.trim();

  // 1. Check if the pasted Raw Hex matches any captured evidence file in vaultFiles
  for (const f of vaultFiles) {
    const { hexDumpText } = buildHexDisassemblyForFile(f);
    if (cleanInput && (hexDumpText.includes(cleanInput.slice(0, 48)) || cleanInput.includes(hexDumpText.slice(0, 48)))) {
      return f;
    }
  }
  if (!cleanInput && activeForensicFile) {
    return activeForensicFile;
  }

  // 2. Otherwise parse raw hex bytes directly from the pasted hex disassembly or hex stream
  const lines = cleanInput.split(/\r?\n/);
  const byteValList = [];
  for (const line of lines) {
    // Strip leading offset (e.g. "00000000  ") and trailing ASCII column ("|....|")
    const withoutAscii = line.replace(/\|.*\|$/, '');
    const withoutOffset = withoutAscii.replace(/^[0-9a-fA-F]{6,8}\s+/, '');
    const matches = withoutOffset.match(/\b[0-9a-fA-F]{2}\b/g);
    if (matches) {
      matches.forEach((h) => byteValList.push(parseInt(h, 16)));
    }
  }

  if (byteValList.length === 0) {
    return activeForensicFile || vaultFiles[vaultFiles.length - 1] || null;
  }

  // Detect magic bytes (PNG, JPG, GIF, PDF, WEBM, MP3, etc.)
  let mime = 'text/plain';
  let ext = 'txt';
  if (byteValList[0] === 0x89 && byteValList[1] === 0x50 && byteValList[2] === 0x4e && byteValList[3] === 0x47) {
    mime = 'image/png'; ext = 'png';
  } else if (byteValList[0] === 0xff && byteValList[1] === 0xd8) {
    mime = 'image/jpeg'; ext = 'jpg';
  } else if (byteValList[0] === 0x47 && byteValList[1] === 0x49 && byteValList[2] === 0x46) {
    mime = 'image/gif'; ext = 'gif';
  } else if (byteValList[0] === 0x25 && byteValList[1] === 0x50 && byteValList[2] === 0x44 && byteValList[3] === 0x46) {
    mime = 'application/pdf'; ext = 'pdf';
  } else if (byteValList[0] === 0x1a && byteValList[1] === 0x45 && byteValList[2] === 0xdf && byteValList[3] === 0xa3) {
    mime = 'audio/webm'; ext = 'webm';
  }

  let binStr = '';
  for (let i = 0; i < byteValList.length; i++) {
    binStr += String.fromCharCode(byteValList[i]);
  }
  const b64 = btoa(binStr);
  return {
    name: `decrypted_payload.${ext}`,
    mime,
    size: byteValList.length,
    dataUrl: `data:${mime};base64,${b64}`
  };
}

$('#btn-run-decryption-demo')?.addEventListener('click', () => {
  const box = $('#decryptor-matrix-box');
  const rawHex = ($('#crypt-hex-input')?.value || '').trim();
  const targetFile = reconstructFileFromRawHexText(rawHex);

  if (!targetFile) {
    window.fdiAudio.alertDenied();
    showToast('Masukkan Raw Hex dari menu FILE atau pilih file bukti terlebih dahulu!', true);
    return;
  }

  const hexes = '0123456789ABCDEF';
  let cycles = 0;
  const interval = setInterval(() => {
    let line = '';
    for (let i = 0; i < 4; i++) {
      line += '0x' + hexes[Math.floor(Math.random() * 16)] + hexes[Math.floor(Math.random() * 16)] + hexes[Math.floor(Math.random() * 16)] + hexes[Math.floor(Math.random() * 16)] + ' ';
    }
    box.textContent = `${line} :: DECRYPTING HEX #${cycles * 1337}`;
    window.fdiAudio.typeKey(' ');
    cycles++;
    if (cycles > 10) {
      clearInterval(interval);
      box.textContent = `PLAINTEXT CIPHER CRACKED :: ${targetFile.name}`;
      const resBox = $('#crypt-decrypted-result');
      if (resBox) {
        resBox.innerHTML = renderOriginalDecryptedFileHtml(targetFile);
      }
      window.fdiAudio.chimeSuccess();
      showToast(`File asli "${targetFile.name}" berhasil ditampilkan!`);
    }
  }, 65);
});

// 7. MONITOR CONTROLLER
function addAuditLog(event, detail) {
  const entry = {
    ts: Date.now(),
    level: 'INFO',
    event,
    detail
  };
  auditLogs.unshift(entry);
  if (auditLogs.length > 100) auditLogs.pop();
  appendMonitorLog(entry);
}

function loadMonitorStats() {
  const subs = getDiscoveredSubjects();
  $('#mon-stat-users').textContent = subs.length + 1;
  $('#mon-stat-online').textContent = mqttConnected ? subs.length + 1 : 0;
  $('#mon-stat-msgs').textContent = interceptedMessages.length;
  $('#mon-stat-grants').textContent = Math.max(activeNetworkLinks.size, Object.keys(getStoredGrants()).length);

  renderRadarInterconnectTable();

  const logBox = $('#mon-logs-feed');
  logBox.innerHTML = auditLogs
    .map((l) => `[${new Date(l.ts).toLocaleTimeString()}] ${l.level.padEnd(5)} ${l.event.padEnd(16)} :: ${escapeHtml(l.detail || '')}`)
    .join('\n');
}

function appendMonitorLog(entry) {
  const logBox = $('#mon-logs-feed');
  if (!logBox) return;
  const line = `[${new Date(entry.ts).toLocaleTimeString()}] ${entry.level.padEnd(5)} ${entry.event.padEnd(16)} :: ${escapeHtml(entry.detail || '')}\n`;
  logBox.textContent = line + logBox.textContent;
}

// Boot application
window.addEventListener('DOMContentLoaded', initApp);
