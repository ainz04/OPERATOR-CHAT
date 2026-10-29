'use strict';
/**
 * FDI OPERATOR TERMINAL - CLOUD SERVERLESS CONTROLLER (GitHub Pages Ready)
 * Communicates via free Public WSS MQTT Brokers (broker.emqx.io / broker.hivemq.com)
 * No credit card, no server cost, works 100% on GitHub Pages forever.
 */

// ==========================================================================
// FIXED OPERATOR CREDENTIALS (LEVEL S)
// ==========================================================================
const ADMIN_USERNAME = 'TANNER';
const ADMIN_PASSWORD = 'EVANS.TANNER04';
const ADMIN_ACCESS_CODE = '5RZJ-X2MC-AMKG';

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

  const savedProfile = localStorage.getItem('fdi_user_profile');
  if (savedProfile) {
    try {
      const user = JSON.parse(savedProfile);
      // Guarantee TANNER always has Level S admin clearance
      if (user.username === ADMIN_USERNAME) {
        user.role = 'admin';
        user.accessCode = ADMIN_ACCESS_CODE;
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

  const u = username.toUpperCase();

  // 1. Level S Admin Check (TANNER / EVANS.TANNER04)
  if (u === ADMIN_USERNAME) {
    if (password !== ADMIN_PASSWORD) {
      window.fdiAudio.alertDenied();
      showToast('ACCESS DENIED: INVALID OPERATOR CREDENTIALS', true);
      return;
    }

    // Guaranteed Level S Admin on ANY device
    const adminUser = {
      id: 'fdi_root_tanner',
      username: ADMIN_USERNAME,
      role: 'admin',
      accessCode: ADMIN_ACCESS_CODE,
      createdAt: Date.now()
    };
    localStorage.setItem('fdi_user_profile', JSON.stringify(adminUser));
    window.fdiAudio.chimeSuccess();
    $('#modal-auth').style.display = 'none';
    setupUserSession(adminUser);
    showToast('CLEARANCE LEVEL S CONFIRMED. Welcome Operator Tanner.');
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

  // Level S Admin Indicator & Dock Tools
  const adminSlot = $('#admin-indicator-slot');
  const adminTools = $('#admin-dock-tools');
  if (user.role === 'admin') {
    adminSlot.innerHTML = `<span class="level-s-tag">CLEARANCE: LEVEL S</span>`;
    adminTools.style.display = 'flex';
  } else {
    adminSlot.innerHTML = `<span style="font-size:11px; color:var(--text-dim);">CLEARANCE: AGENT</span>`;
    adminTools.style.display = 'none';
  }

  loadStoredContacts();
  initServerlessMQTT();
}

// Complete client trace wiper (vaporizes 10000% of all local data without traces)
function wipeAllClientTraces() {
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
  if (currentUser && currentUser.role !== 'admin') {
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

// HAPUS AKUN SAYA (10000% Self Account Destruction)
$('#btn-purge-self')?.addEventListener('click', () => {
  if (!currentUser) return;
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
  if (typeof Paho === 'undefined') {
    console.error('Paho MQTT library not loaded');
    $('#top-link-status').textContent = 'OFFLINE (LIB MISSING)';
    return;
  }

  const clientId = 'fdi_' + currentUser.username.toLowerCase() + '_' + Math.random().toString(16).substr(2, 6);
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
    setTimeout(initServerlessMQTT, 4000);
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

      // 1. Subscribe to personal direct inbox
      mqttClient.subscribe(`fdi_operator_v1/inbox/${currentUser.accessCode}`, { qos: 1 });
      // 2. Subscribe to typing signals for my code
      mqttClient.subscribe(`fdi_operator_v1/typing/${currentUser.accessCode}`, { qos: 0 });
      // 3. Subscribe to public network announcements & presence
      mqttClient.subscribe('fdi_operator_v1/presence', { qos: 0 });
      // 4. Subscribe to network broadcasts
      mqttClient.subscribe('fdi_operator_v1/broadcast', { qos: 1 });
      // 5. Subscribe to personal command channel (for kick/ban/revoke/burn/nuke)
      mqttClient.subscribe(`fdi_operator_v1/cmd/${currentUser.accessCode}`, { qos: 1 });
      // 6. Subscribe to global account purge broadcast channel
      mqttClient.subscribe('fdi_operator_v1/cmd/purge', { qos: 1 });
      // 7. Subscribe to real-time bilateral link status channel
      mqttClient.subscribe('fdi_operator_v1/links', { qos: 1 });

      // If Level S Admin: subscribe to ALL network topics (Omniscient Wiretap)
      if (currentUser.role === 'admin') {
        mqttClient.subscribe('fdi_operator_v1/#', { qos: 1 });
        addAuditLog('LEVEL_S_RADAR', 'Wiretap intercept attached to global network traffic');
      }

      // Broadcast initial presence
      broadcastPresence();
      setInterval(broadcastPresence, 40000);
    },
    onFailure: (err) => {
      console.warn('Failed to connect to primary broker, retrying...', err);
      $('#top-link-status').textContent = 'RETRYING...';
      $('#top-link-status').style.color = 'var(--fdi-red)';
      setTimeout(initServerlessMQTT, 5000);
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
    if (data.action === 'account_nuked' || data.action === 'force_nuke_account') {
      const isTarget = currentUser && (
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
      const tCode = data.targetCode || data.accessCode;
      const tName = data.targetUsername || data.username || 'subjek';
      executeLocalPurgeForSubject(tCode, tName);
      showToast(`Akun ${tName} telah dimusnahkan 10000% dari jaringan.`);
      addAuditLog('ACCOUNT_PURGED', `${tName} (${tCode}) purged from network`);
      return;
    }

    // Direct Command Channel Actions
    if (data.action === 'session_burned') {
      if (currentUser.role !== 'admin') {
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
      window.fdiAudio.alertDenied();
      alert(`[!] TERMINAL SESSION KICKED BY LEVEL S OPERATOR.`);
      window.location.reload();
    } else if (data.action === 'ban') {
      window.fdiAudio.alertDenied();
      alert(`[!] SUBJECT ACCOUNT BANNED BY LEVEL S OPERATOR.`);
      wipeAllClientTraces();
      window.location.reload();
    } else if (data.action === 'revoke') {
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
    return all[peerCode] || [];
  } catch {
    return [];
  }
}

function saveStoredMessage(peerCode, msg) {
  try {
    const key = getMessagesKey();
    const all = JSON.parse(localStorage.getItem(key) || '{}');
    if (!all[peerCode]) all[peerCode] = [];
    all[peerCode].push(msg);
    localStorage.setItem(key, JSON.stringify(all));
  } catch (err) {
    console.error('Failed to save message', err);
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

  if (burnMessage) {
    $('#chat-expired-banner').style.display = 'flex';
    $('#chat-expired-banner').innerHTML = `
      <div>${burnMessage}</div>
      <button class="btn-fdi-primary" id="btn-reopen-code" style="padding:4px 10px; font-size:11px;">ENTER CODE</button>
    `;
    $('#btn-reopen-code')?.addEventListener('click', () => $('#btn-open-code-modal').click());
  } else {
    $('#chat-expired-banner').style.display = 'none';
  }
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

  const isOut = msg.fromCode === currentUser.accessCode;
  const bubble = document.createElement('div');
  bubble.className = `msg-bubble ${isOut ? 'outgoing' : 'incoming'}`;

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
    id: 'msg_' + Date.now(),
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
  saveStoredMessage(msg.fromCode, msg);
  recordNetworkLink(msg.fromCode, msg.fromName, msg.toCode || currentUser.accessCode, msg.toName || currentUser.username, false);

  // If sender not in contacts, add grant only if active link
  if (!contactsMap.has(msg.fromCode)) {
    saveGrant(msg.fromCode, msg.fromName);
    loadStoredContacts();
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
    return JSON.parse(localStorage.getItem('fdi_discovered_subjects') || '[]');
  } catch {
    return [];
  }
}

function registerDiscoveredSubject(data) {
  // Only Level S Admin monitors discovered network nodes!
  if (!currentUser || currentUser.role !== 'admin') return;

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
    out += `001       TANNER         LEVEL S     5RZJ-X2MC-AMKG ONLINE\n`;
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
  } else if (cmd === 'broadcast') {
    const text = args.join(' ');
    if (!text) {
      appendTermOutput('ERROR: Message text required', true);
      return;
    }
    publishPacket('fdi_operator_v1/broadcast', { text, sender: 'OPERATOR TANNER' }, 1);
    appendTermOutput(`[+] Broadcast transmitted to all network nodes.`);
    showToast('Broadcast transmitted');
  } else if (cmd === 'nuke' || cmd === 'purge' || cmd === 'hapusakun') {
    const target = args[0];
    if (!target) {
      appendTermOutput(`ERROR: Target username or code required. Usage: ${cmd} <code/user>`, true);
      return;
    }
    const subs = getDiscoveredSubjects();
    const sub = subs.find((s) => s.accessCode === target || s.username.toUpperCase() === target.toUpperCase());
    const targetCode = sub ? sub.accessCode : target;
    const targetName = sub ? sub.username : target;
    adminNukeAccount(targetCode, targetName);
    appendTermOutput(`[+] 10000% Purge command signaled for ${targetName} (${targetCode})`);
  } else if (cmd === 'kick' || cmd === 'ban' || cmd === 'revoke') {
    const target = args[0];
    if (!target) {
      appendTermOutput(`ERROR: Target required. Usage: ${cmd} <code/user>`, true);
      return;
    }
    publishPacket(`fdi_operator_v1/cmd/${target}`, { action: cmd }, 1);
    appendTermOutput(`[+] Action '${cmd}' signaled to ${target}`);
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
  if (targetCode === ADMIN_ACCESS_CODE || (targetUsername && targetUsername.toUpperCase() === ADMIN_USERNAME)) {
    showToast('CANNOT PURGE ROOT OPERATOR TANNER', true);
    return;
  }

  const ok = confirm(`PERINGATAN KRITIS: MUSNAHKAN AKUN ${targetUsername} (${targetCode}) 10000%?\n\nAkun ini dan seluruh riwayatnya di semua perangkat akan dimusnahkan secara permanen tanpa sisa!`);
  if (!ok) return;

  // 1. Send direct kill command to target
  publishPacket(`fdi_operator_v1/cmd/${targetCode}`, {
    action: 'account_nuked',
    targetCode,
    targetUsername,
    initiatedBy: 'OPERATOR TANNER (LEVEL S)'
  }, 1);

  // 2. Broadcast purge to all network nodes so everyone drops the user
  publishPacket('fdi_operator_v1/cmd/purge', {
    action: 'account_nuked',
    targetCode,
    targetUsername,
    initiatedBy: 'OPERATOR TANNER (LEVEL S)'
  }, 1);

  // 3. Purge from local admin storage & memory
  executeLocalPurgeForSubject(targetCode, targetUsername);

  window.fdiAudio.alertDenied();
  showToast(`AKUN ${targetUsername} TELAH DIMUSNAHKAN 10000% TANPA JEJAK!`);
  addAuditLog('ACCOUNT_NUKED', `Operator Tanner executed 10000% purge on ${targetUsername} (${targetCode})`);
};

// 2. DATABASE CONTROLLER (Includes OPEN COMMS & NUKE buttons for Level S)
function renderDatabaseTable(users) {
  const tbody = $('#db-users-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  const q = ($('#db-search-field')?.value || '').toLowerCase();
  const all = [{ id: '001', username: 'TANNER', role: 'admin', accessCode: '5RZJ-X2MC-AMKG', online: true }, ...users];

  const filtered = all.filter((u) =>
    u.username.toLowerCase().includes(q) || u.accessCode.toLowerCase().includes(q)
  );

  filtered.forEach((u) => {
    const tr = document.createElement('tr');
    const isSubjectAdmin = u.role === 'admin';
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
        ` : '<span style="color:var(--text-dim);">PROTECTED</span>'}
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
  publishPacket(`fdi_operator_v1/cmd/${peerCode}`, { action }, 1);
  showToast(`Operator signal '${action}' sent to ${peerCode}`);
  addAuditLog('OPERATOR_ACTION', `${action} -> ${peerCode}`);
};

// 3. INTERCEPT / WIRETAP CONTROLLER (Omniscient Room Surveillance)
function appendInterceptMessage(msg) {
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

// 4. FILE FORENSIC ANALYZER CONTROLLER
function loadAnalyzerFiles() {
  const container = $('#analyzer-files-container');
  container.innerHTML = '';

  if (vaultFiles.length === 0) {
    container.innerHTML = '<div style="padding:16px; color:var(--text-dim); font-size:12px;">No evidence files captured yet. Transmit a file in Comms to analyze.</div>';
    return;
  }

  vaultFiles.forEach((f, idx) => {
    const item = document.createElement('div');
    item.className = 'contact-item';
    item.innerHTML = `
      <div style="font-weight:700; color:var(--text-bright);">${escapeHtml(f.name)}</div>
      <div style="font-size:11px; color:var(--text-dim); display:flex; justify-content:space-between; margin-top:2px;">
        <span>${formatBytes(f.size)}</span>
        <span>#EV-${idx + 1}</span>
      </div>
    `;
    item.addEventListener('click', () => runClientFileForensics(f));
    container.appendChild(item);
  });
}

function runClientFileForensics(fileObj) {
  const reportBox = $('#analyzer-report-container');
  reportBox.innerHTML = '<div style="padding:20px; color:var(--fdi-cyan);">RUNNING IN-BROWSER FORENSIC SCAN...</div>';
  window.fdiAudio.beep(1600, 0.08);

  const byteSample = atob(fileObj.dataUrl.split(',')[1] || '').slice(0, 512);
  let hexLines = [];
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
          <div class="report-card-val">6.84</div>
        </div>
        <div class="report-card">
          <div class="report-card-title">FILE SIZE</div>
          <div class="report-card-val">${formatBytes(fileObj.size)}</div>
        </div>
      </div>

      <div style="font-weight:700; color:var(--fdi-green); margin-top:8px;">RAW HEX DISASSEMBLY (FIRST 512 BYTES)</div>
      <div class="hex-dump-box">${escapeHtml(hexLines.join('\n') || 'HEX STREAM READY')}</div>
    `;
    window.fdiAudio.chimeSuccess();
  }, 400);
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

// 6. DECRYPTOR DEMO
$('#btn-run-decryption-demo')?.addEventListener('click', () => {
  const box = $('#decryptor-matrix-box');
  const hexes = '0123456789ABCDEF';
  let cycles = 0;
  const interval = setInterval(() => {
    let line = '';
    for (let i = 0; i < 4; i++) {
      line += '0x' + hexes[Math.floor(Math.random() * 16)] + hexes[Math.floor(Math.random() * 16)] + hexes[Math.floor(Math.random() * 16)] + hexes[Math.floor(Math.random() * 16)] + ' ';
    }
    box.textContent = `${line} :: ATTEMPT #${cycles * 1337}`;
    window.fdiAudio.typeKey(' ');
    cycles++;
    if (cycles > 18) {
      clearInterval(interval);
      box.textContent = 'PLAINTEXT CIPHER CRACKED: [CLEARANCE LEVEL S CONFIRMED]';
      window.fdiAudio.chimeSuccess();
    }
  }, 90);
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
  $('#mon-stat-grants').textContent = Object.keys(getStoredGrants()).length;

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
