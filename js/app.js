'use strict';
/**
 * FDI OPERATOR TERMINAL - CLOUD SERVERLESS CONTROLLER (GitHub Pages Ready)
 * Communicates via free Public WSS MQTT Brokers (broker.emqx.io / broker.hivemq.com)
 * No credit card, no server cost, works 100% on GitHub Pages forever.
 */

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

// System Audit Logs & Intercept Vault
let auditLogs = [];
let interceptedMessages = [];
let vaultFiles = [];

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
  }, 4000);
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

function formatBytes(bytes) {
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
  const savedProfile = localStorage.getItem('fdi_user_profile');
  if (savedProfile) {
    try {
      const user = JSON.parse(savedProfile);
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

  // Check if Admin Level S (TANNER)
  const isAdmin = username.toUpperCase() === 'TANNER' && (password === 'judamunte04' || password === 'lBn0rkay-HJf');

  let user = null;
  if (isRegister) {
    user = {
      id: 'sub_' + Math.random().toString(36).substr(2, 8),
      username: username.toUpperCase(),
      role: isAdmin ? 'admin' : 'agent',
      accessCode: isAdmin ? '5RZJ-X2MC-AMKG' : generateAccessCode(),
      createdAt: Date.now()
    };
  } else {
    // Login
    const existing = localStorage.getItem('fdi_user_profile');
    if (existing) {
      user = JSON.parse(existing);
      user.username = username.toUpperCase();
      if (isAdmin) user.role = 'admin';
    } else {
      user = {
        id: 'sub_' + Math.random().toString(36).substr(2, 8),
        username: username.toUpperCase(),
        role: isAdmin ? 'admin' : 'agent',
        accessCode: isAdmin ? '5RZJ-X2MC-AMKG' : generateAccessCode(),
        createdAt: Date.now()
      };
    }
  }

  localStorage.setItem('fdi_user_profile', JSON.stringify(user));
  window.fdiAudio.chimeSuccess();
  $('#modal-auth').style.display = 'none';
  setupUserSession(user);
  showToast(`Welcome Operator ${user.username}`);
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

$('#btn-logout')?.addEventListener('click', () => {
  localStorage.removeItem('fdi_user_profile');
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
  // Free public WebSocket broker with SSL/TLS
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
      // 5. Subscribe to personal command channel (for kick/ban/revoke)
      mqttClient.subscribe(`fdi_operator_v1/cmd/${currentUser.accessCode}`, { qos: 1 });

      // If Level S Admin: subscribe to ALL network topics (Surveillance & Wiretap)
      if (currentUser.role === 'admin') {
        mqttClient.subscribe('fdi_operator_v1/#', { qos: 1 });
        addAuditLog('LEVEL_S_RADAR', 'Wiretap intercept attached to global network traffic');
      }

      // Broadcast initial presence
      broadcastPresence();
      // Periodically broadcast presence every 45s
      setInterval(broadcastPresence, 45000);
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

  // Intercept mirroring for Level S Admin
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

  // 5. Admin Remote Command
  else if (topic === `fdi_operator_v1/cmd/${currentUser.accessCode}`) {
    if (data.action === 'kick') {
      window.fdiAudio.alertDenied();
      alert(`[!] TERMINAL SESSION KICKED BY LEVEL S OPERATOR:\n${data.reason || 'TERMINATED'}`);
      window.location.reload();
    } else if (data.action === 'ban') {
      window.fdiAudio.alertDenied();
      alert(`[!] SUBJECT ACCOUNT BANNED BY LEVEL S OPERATOR.`);
      localStorage.removeItem('fdi_user_profile');
      window.location.reload();
    } else if (data.action === 'revoke') {
      showToast('All your active 5-hour access windows have been revoked by Level S operator', true);
      localStorage.removeItem('fdi_grants');
      loadStoredContacts();
    }
  }
}

// ==========================================================================
// CONTACTS & 5-HOUR WINDOW ENGINE (Stored in localStorage)
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

  // If Admin Level S, discover all subjects automatically
  const discovered = getDiscoveredSubjects();
  const grants = getStoredGrants();

  if (currentUser.role === 'admin') {
    // Admin has permanent access to everyone
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
    // Regular agent: only show contacts where an access grant exists
    for (const [code, g] of Object.entries(grants)) {
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
    } else if (left < 30 * 60 * 1000) {
      slot.innerHTML = `<span class="timer-pill warning">${formatTimeLeft(left)}</span>`;
    } else {
      slot.innerHTML = `<span class="timer-pill">${formatTimeLeft(left)}</span>`;
    }
  });

  // Also update active chat header timer
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

function selectContact(peerCode) {
  const contact = contactsMap.get(peerCode);
  if (!contact) return;
  activeContact = contact;

  renderContactsList();
  updateActiveContactHeader();

  $('#empty-chat-placeholder').style.display = 'none';
  $('#active-chat-header').style.display = 'flex';

  const now = Date.now();
  const isAccessible = contact.unlimited || (contact.expiresAt && contact.expiresAt > now);
  if (isAccessible) {
    $('#chat-input-panel').style.display = 'flex';
    $('#chat-expired-banner').style.display = 'none';
  } else {
    $('#chat-input-panel').style.display = 'none';
    $('#chat-expired-banner').style.display = 'flex';
  }

  // Load message history from local storage
  loadConversationHistory(peerCode);
}

function updateActiveContactHeader() {
  if (!activeContact) return;
  $('#active-peer-avatar').textContent = activeContact.username.slice(0, 2).toUpperCase();
  $('#active-peer-name').textContent = activeContact.username;
  $('#active-peer-status').innerHTML = activeContact.online
    ? `<span class="online-dot is-online"></span> LINK ONLINE // CLOUD WSS`
    : `<span class="online-dot"></span> ASYNC QUEUED`;
  updateContactTimers();
}

function getStoredMessages(peerCode) {
  try {
    const all = JSON.parse(localStorage.getItem('fdi_messages') || '{}');
    return all[peerCode] || [];
  } catch {
    return [];
  }
}

function saveStoredMessage(peerCode, msg) {
  try {
    const all = JSON.parse(localStorage.getItem('fdi_messages') || '{}');
    if (!all[peerCode]) all[peerCode] = [];
    all[peerCode].push(msg);
    localStorage.setItem('fdi_messages', JSON.stringify(all));
  } catch (err) {
    console.error('Failed to save message', err);
  }
}

function loadConversationHistory(peerCode) {
  const container = $('#messages-container');
  container.innerHTML = '';
  const msgs = getStoredMessages(peerCode);
  msgs.forEach((m) => appendChatMessage(m, false));
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
  // Save to local storage
  saveStoredMessage(msg.fromCode, msg);

  // If sender not in contacts, add grant if they opened window
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

    // Register into vault files for Level S File Analyzer
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
    // Stop recording
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
// DISCOVERED SUBJECTS REGISTRY
// ==========================================================================

function getDiscoveredSubjects() {
  try {
    return JSON.parse(localStorage.getItem('fdi_discovered_subjects') || '[]');
  } catch {
    return [];
  }
}

function registerDiscoveredSubject(data) {
  const list = getDiscoveredSubjects();
  const idx = list.findIndex((s) => s.accessCode === data.accessCode);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...data, lastSeen: Date.now() };
  } else {
    list.push({ ...data, firstSeen: Date.now(), lastSeen: Date.now() });
    showToast(`New network node discovered: ${data.username}`);
  }
  localStorage.setItem('fdi_discovered_subjects', JSON.stringify(list));

  // If Admin Level S, refresh database table if open
  if (currentUser.role === 'admin') {
    renderDatabaseTable(list);
  }
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
    loadInterceptChannels();
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
 whois <user>             profil lengkap & access code subjek
 grants                   jendela akses 5 jam yang aktif
 feed                     pesan-pesan terbaru di jaringan
 broadcast <pesan>        kirim transmisi darurat ke semua node
 kick <code/user>         putuskan sesi subjek
 ban <code/user>          blokir subjek
 revoke <code/user>       cabut jendela akses 5 jam
 clear                    bersihkan layar terminal
    `);
  } else if (cmd === 'stats') {
    const subs = getDiscoveredSubjects();
    appendTermOutput(`
 SUBJECTS DISCOVERED ... ${subs.length + 1}
 CLOUD WSS BROKER ...... broker.emqx.io:8084
 INTERCEPTED TRAFFIC ... ${interceptedMessages.length} msgs
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
  } else if (cmd === 'broadcast') {
    const text = args.join(' ');
    if (!text) {
      appendTermOutput('ERROR: Message text required', true);
      return;
    }
    publishPacket('fdi_operator_v1/broadcast', { text, sender: 'OPERATOR TANNER' }, 1);
    appendTermOutput(`[+] Broadcast transmitted to all network nodes.`);
    showToast('Broadcast transmitted');
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

// 2. DATABASE CONTROLLER
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

    tr.innerHTML = `
      <td>${u.id || '--'}</td>
      <td style="font-weight:700;">${escapeHtml(u.username)}</td>
      <td>${isSubjectAdmin ? '<span class="level-s-tag">LEVEL S</span>' : 'AGENT'}</td>
      <td style="font-family:var(--font-pixel); font-size:16px; color:var(--fdi-green);">${u.accessCode}</td>
      <td><span class="stat-val">ONLINE</span></td>
      <td>--</td>
      <td style="font-size:11px;">${new Date().toLocaleDateString()}</td>
      <td>
        ${!isSubjectAdmin ? `
          <button class="btn-action-cell" onclick="adminAction('revoke', '${u.accessCode}')">REVOKE 5H</button>
          <button class="btn-action-cell danger" onclick="adminAction('kick', '${u.accessCode}')">KICK</button>
          <button class="btn-action-cell danger" onclick="adminAction('ban', '${u.accessCode}')">BAN</button>
        ` : '<span style="color:var(--text-dim);">PROTECTED</span>'}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

$('#db-search-field')?.addEventListener('input', () => renderDatabaseTable(getDiscoveredSubjects()));
$('#btn-refresh-db')?.addEventListener('click', () => renderDatabaseTable(getDiscoveredSubjects()));

window.adminAction = function (action, peerCode) {
  publishPacket(`fdi_operator_v1/cmd/${peerCode}`, { action }, 1);
  showToast(`Operator signal '${action}' sent to ${peerCode}`);
  addAuditLog('OPERATOR_ACTION', `${action} -> ${peerCode}`);
};

// 3. INTERCEPT / WIRETAP CONTROLLER
function appendInterceptMessage(msg) {
  interceptedMessages.push(msg);
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

function loadInterceptChannels() {
  const list = $('#intercept-pairs-list');
  list.innerHTML = `
    <div class="contact-item active">
      <div style="font-weight:700; color:var(--text-bright);">GLOBAL SURVEILLANCE RADAR</div>
      <div style="font-size:11px; color:var(--text-dim); margin-top:2px;">
        Intercepting all packets across topic fdi_operator_v1/#
      </div>
    </div>
  `;
}

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

  // Generate synthetic hex dump and Shannon entropy
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
