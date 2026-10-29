'use strict';
/**
 * FDI OPERATOR TERMINAL - CORE FRONTEND CONTROLLER
 */

// Global State
let currentUser = null;
let socket = null;
let activeContact = null;
let contactsMap = new Map();
let termHistory = [];
let termHistoryIdx = -1;
let mediaRecorder = null;
let audioChunks = [];
let typingTimeout = null;
let isRecordingAudio = false;

// Helpers
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
// INITIALIZATION & AUTHENTICATION
// ==========================================================================

async function initApp() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      setupUserSession(data.user);
    } else {
      showAuthModal();
    }
  } catch (err) {
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

async function handleAuthSubmit() {
  const username = $('#auth-username').value.trim();
  const password = $('#auth-password').value;
  const isRegister = $('#btn-switch-register').dataset.mode === 'register';

  if (!username || !password) {
    window.fdiAudio.alertDenied();
    showToast('Credentials required', true);
    return;
  }

  const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) {
      window.fdiAudio.alertDenied();
      showToast(data.error || 'Authentication failure', true);
      return;
    }
    window.fdiAudio.chimeSuccess();
    $('#modal-auth').style.display = 'none';
    setupUserSession(data.user);
    showToast(`Welcome Operator ${data.user.username}`);
  } catch (err) {
    window.fdiAudio.alertDenied();
    showToast('Terminal connection error', true);
  }
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

  initSocket();
  loadContacts();
}

$('#btn-logout')?.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
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
// REAL-TIME SOCKET CONNECTION
// ==========================================================================

function initSocket() {
  if (socket) socket.disconnect();
  socket = io({ transports: ['websocket', 'polling'] });

  socket.on('connect', () => {
    console.log('[+] Realtime socket channel linked');
  });

  socket.on('message', (msg) => {
    // If incoming message belongs to currently active conversation
    if (activeContact && (msg.from === activeContact.id || msg.to === activeContact.id)) {
      appendChatMessage(msg);
      window.fdiAudio.chirpIncoming();
    } else {
      window.fdiAudio.beep(900, 0.05);
    }
    loadContacts(false);
  });

  socket.on('chat:typing', (data) => {
    if (activeContact && data.from === activeContact.id) {
      const bar = $('#chat-typing-indicator');
      if (bar) {
        if (data.isTyping) {
          $('#typing-agent-name').textContent = data.username;
          bar.style.display = 'flex';
          window.fdiAudio.typeKey(' ');
        } else {
          bar.style.display = 'none';
        }
      }
    }
  });

  socket.on('presence:update', (data) => {
    const c = contactsMap.get(data.userId);
    if (c) {
      c.online = data.online;
      renderContactsList();
      if (activeContact && activeContact.id === data.userId) {
        updateActiveContactHeader();
      }
    }
  });

  socket.on('contacts:refresh', () => {
    loadContacts(true);
  });

  socket.on('force-logout', (data) => {
    window.fdiAudio.alertDenied();
    alert(`[!] TERMINAL SESSION TERMINATED:\n${data.reason}`);
    window.location.reload();
  });

  // Admin intercept stream
  socket.on('intercept', (msg) => {
    appendInterceptMessage(msg);
  });

  socket.on('log:entry', (entry) => {
    appendMonitorLog(entry);
  });

  socket.on('broadcast', (data) => {
    window.fdiAudio.alertDenied();
    alert(`[!!!] FDI NETWORK BROADCAST:\n\n${data.text}`);
  });
}

// ==========================================================================
// CONTACTS & 5-HOUR WINDOW COUNTDOWN
// ==========================================================================

async function loadContacts(selectFirstIfNone = false) {
  try {
    const res = await fetch('/api/chat/contacts');
    if (!res.ok) return;
    const data = await res.json();
    contactsMap.clear();
    for (const c of data.contacts) {
      contactsMap.set(c.id, c);
    }
    renderContactsList();

    if (selectFirstIfNone && !activeContact && data.contacts.length > 0) {
      selectContact(data.contacts[0].id);
    }
  } catch (err) {
    console.error('Failed to load contacts', err);
  }
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
    item.className = `contact-item ${activeContact && activeContact.id === c.id ? 'active' : ''}`;
    item.dataset.id = c.id;

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
        <span style="font-size:10px; color:var(--text-dim);">TUNNEL: 5H P2P</span>
        <span class="contact-timer-slot">${timerHtml}</span>
      </div>
    `;

    item.addEventListener('click', () => selectContact(c.id));
    container.appendChild(item);
  });
}

function updateContactTimers() {
  const now = Date.now();
  $$('.contact-item').forEach((el) => {
    const id = Number(el.dataset.id);
    const c = contactsMap.get(id);
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
// ACTIVE CHAT TRANSCRIPT & MESSAGING
// ==========================================================================

async function selectContact(peerId) {
  const contact = contactsMap.get(Number(peerId));
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

  // Load message history
  try {
    const res = await fetch(`/api/chat/messages/${peerId}`);
    if (res.ok) {
      const data = await res.json();
      const container = $('#messages-container');
      container.innerHTML = '';
      data.messages.forEach((m) => appendChatMessage(m, false));
      container.scrollTop = container.scrollHeight;
    }
  } catch (err) {
    console.error('Failed to load messages', err);
  }
}

function updateActiveContactHeader() {
  if (!activeContact) return;
  $('#active-peer-avatar').textContent = activeContact.username.slice(0, 2).toUpperCase();
  $('#active-peer-name').textContent = activeContact.username;
  $('#active-peer-status').innerHTML = activeContact.online
    ? `<span class="online-dot is-online"></span> LINK ONLINE // ENCRYPTED`
    : `<span class="online-dot"></span> OFFLINE // ASYNC STORED`;
  updateContactTimers();
}

function appendChatMessage(msg, autoScroll = true) {
  const container = $('#messages-container');
  if (!container) return;

  const isOut = msg.from === currentUser.id;
  const bubble = document.createElement('div');
  bubble.className = `msg-bubble ${isOut ? 'outgoing' : 'incoming'}`;

  const timeStr = new Date(msg.at).toLocaleTimeString('sv-SE');
  let bodyHtml = '';

  if (msg.kind === 'file' && msg.file) {
    const isImg = msg.file.mime.startsWith('image/');
    const isAudio = msg.file.mime.startsWith('audio/');
    
    bodyHtml = `
      <div class="msg-file-card">
        <div class="msg-file-info">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <div>
            <div class="msg-file-name">${escapeHtml(msg.file.name)}</div>
            <div class="msg-file-size">${formatBytes(msg.file.size)} // SHA-256: ${msg.file.sha256.slice(0, 8)}...</div>
          </div>
        </div>
        <a href="/api/files/${msg.file.id}?download=1" download="${escapeHtml(msg.file.name)}" class="btn-retro-sm">GET</a>
      </div>
    `;

    if (isImg) {
      bodyHtml += `<img src="/api/files/${msg.file.id}" class="msg-img-preview" alt="Preview">`;
    } else if (isAudio) {
      bodyHtml += `<audio controls src="/api/files/${msg.file.id}" class="msg-audio-player"></audio>`;
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

// Send Text Message
function transmitMessage() {
  if (!activeContact) return;
  const input = $('#chat-msg-input');
  const text = input.value.trim();
  if (!text) return;

  socket.emit('chat:send', { to: activeContact.id, text }, (res) => {
    if (res?.error) {
      window.fdiAudio.alertDenied();
      showToast(res.error, true);
    }
  });

  input.value = '';
  window.fdiAudio.typeKey('Enter');
  emitTyping(false);
}

$('#btn-send-message')?.addEventListener('click', transmitMessage);
$('#chat-msg-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') transmitMessage();
  else emitTyping(true);
});

function emitTyping(isTyping) {
  if (!activeContact || !socket) return;
  socket.emit('chat:typing', { to: activeContact.id, isTyping });
  clearTimeout(typingTimeout);
  if (isTyping) {
    typingTimeout = setTimeout(() => {
      socket.emit('chat:typing', { to: activeContact.id, isTyping: false });
    }, 2500);
  }
}

// File Attachment Upload
$('#btn-attach-file')?.addEventListener('click', () => {
  $('#file-upload-input').click();
});

$('#file-upload-input')?.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file || !activeContact) return;

  const formData = new FormData();
  formData.append('file', file);
  formData.append('caption', file.name);

  showToast(`Encrypting & transmitting ${file.name}...`);
  try {
    const res = await fetch(`/api/files/${activeContact.id}`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (!res.ok) {
      window.fdiAudio.alertDenied();
      showToast(data.error || 'File transfer failed', true);
      return;
    }
    window.fdiAudio.chimeSuccess();
    showToast('File transmitted');
  } catch (err) {
    window.fdiAudio.alertDenied();
    showToast('Upload error', true);
  }
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

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('file', audioBlob, `transmission_${Date.now()}.webm`);
        formData.append('caption', '[TACTICAL AUDIO TRANSMISSION]');

        showToast('Transmitting encrypted voice note...');
        try {
          const res = await fetch(`/api/files/${activeContact.id}`, {
            method: 'POST',
            body: formData
          });
          if (res.ok) {
            window.fdiAudio.chimeSuccess();
            showToast('Voice note transmitted');
          }
        } catch {
          window.fdiAudio.alertDenied();
        }
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

async function handleAccessCodeSubmit() {
  const code = $('#input-access-code').value.trim();
  if (!code) return;

  try {
    const res = await fetch('/api/chat/access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    const data = await res.json();
    if (!res.ok) {
      window.fdiAudio.alertDenied();
      showToast(data.error || 'Access code rejected', true);
      return;
    }
    window.fdiAudio.chimeSuccess();
    $('#modal-access-code').style.display = 'none';
    showToast(`5-Hour window opened with ${data.contact.username}`);
    await loadContacts();
    selectContact(data.contact.id);
  } catch (err) {
    window.fdiAudio.alertDenied();
    showToast('Failed to verify access code', true);
  }
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
// LEVEL S OPERATOR DOCK & MODULE ROUTING
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
    loadDatabaseUsers();
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

$('#term-cli-input')?.addEventListener('keydown', async (e) => {
  const input = e.target;
  if (e.key === 'Enter') {
    const cmd = input.value.trim();
    if (!cmd) return;
    termHistory.push(cmd);
    termHistoryIdx = termHistory.length;
    input.value = '';

    appendTermOutput(`FDI-OPERATOR:~$ ${cmd}`);
    if (cmd.toLowerCase() === 'clear') {
      $('#term-output-area').innerHTML = '';
      return;
    }

    try {
      const res = await fetch('/api/admin/terminal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd })
      });
      const data = await res.json();
      appendTermOutput(data.output || 'NO OUTPUT', data.error);
      if (data.open?.module) {
        $(`.dock-btn[data-mod="${data.open.module}"]`)?.click();
      }
    } catch (err) {
      appendTermOutput('CONNECTION FAILURE', true);
    }
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

// 2. DATABASE CONTROLLER
async function loadDatabaseUsers() {
  try {
    const res = await fetch('/api/admin/users');
    if (!res.ok) return;
    const data = await res.json();
    renderDatabaseTable(data.users);
  } catch (err) {
    console.error('Failed to load DB users', err);
  }
}

function renderDatabaseTable(users) {
  const tbody = $('#db-users-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  const q = ($('#db-search-field')?.value || '').toLowerCase();
  const filtered = users.filter((u) =>
    u.username.toLowerCase().includes(q) || u.access_code.toLowerCase().includes(q) || String(u.id).includes(q)
  );

  filtered.forEach((u) => {
    const tr = document.createElement('tr');
    const isSubjectAdmin = u.role === 'admin';
    const statusText = u.banned ? 'BANNED' : u.online ? 'ONLINE' : 'OFFLINE';

    tr.innerHTML = `
      <td>${u.id}</td>
      <td style="font-weight:700;">${escapeHtml(u.username)}</td>
      <td>${isSubjectAdmin ? '<span class="level-s-tag">LEVEL S</span>' : 'AGENT'}</td>
      <td style="font-family:var(--font-pixel); font-size:16px; color:var(--fdi-green);">${u.access_code}</td>
      <td><span class="${u.online ? 'stat-val' : ''}">${statusText}</span></td>
      <td>${u.sent || 0} msgs</td>
      <td style="font-size:11px;">${new Date(u.created_at).toLocaleDateString()}</td>
      <td>
        ${!isSubjectAdmin ? `
          <button class="btn-action-cell" onclick="adminAction('revoke', ${u.id})">REVOKE 5H</button>
          <button class="btn-action-cell" onclick="adminAction('regen', ${u.id})">REGEN CODE</button>
          <button class="btn-action-cell danger" onclick="adminAction('kick', ${u.id})">KICK</button>
          <button class="btn-action-cell danger" onclick="adminAction('${u.banned ? 'unban' : 'ban'}', ${u.id})">${u.banned ? 'UNBAN' : 'BAN'}</button>
        ` : '<span style="color:var(--text-dim);">PROTECTED</span>'}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

$('#db-search-field')?.addEventListener('input', loadDatabaseUsers);
$('#btn-refresh-db')?.addEventListener('click', loadDatabaseUsers);

window.adminAction = async function (action, userId) {
  try {
    const res = await fetch(`/api/admin/users/${userId}/${action}`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Action failed', true);
      return;
    }
    showToast(data.output || 'Action executed');
    loadDatabaseUsers();
  } catch {
    showToast('Action network error', true);
  }
};

// 3. INTERCEPT / WIRETAP CONTROLLER
async function loadInterceptChannels() {
  try {
    const res = await fetch('/api/admin/conversations');
    if (!res.ok) return;
    const data = await res.json();
    const list = $('#intercept-pairs-list');
    list.innerHTML = '';

    data.conversations.forEach((c) => {
      const item = document.createElement('div');
      item.className = 'contact-item';
      item.innerHTML = `
        <div style="font-weight:700; color:var(--text-bright);">${escapeHtml(c.aName)} &harr; ${escapeHtml(c.bName)}</div>
        <div style="font-size:11px; color:var(--text-dim); display:flex; justify-content:space-between; margin-top:2px;">
          <span>${c.count} transmissions</span>
          <span>${new Date(c.last_at).toLocaleTimeString()}</span>
        </div>
      `;
      item.addEventListener('click', () => {
        $$('#intercept-pairs-list .contact-item').forEach((i) => i.classList.remove('active'));
        item.classList.add('active');
        openWiretappedConversation(c.a, c.b, `${c.aName} &harr; ${c.bName}`);
      });
      list.appendChild(item);
    });
  } catch (err) {
    console.error('Failed to load intercept pairs', err);
  }
}

async function openWiretappedConversation(a, b, title) {
  $('#intercept-active-title').textContent = `WIRETAP: ${title}`;
  try {
    const res = await fetch(`/api/admin/conversations/${a}/${b}`);
    if (!res.ok) return;
    const data = await res.json();
    const stream = $('#intercept-messages-stream');
    stream.innerHTML = '';
    data.messages.forEach(appendInterceptMessage);
    stream.scrollTop = stream.scrollHeight;
  } catch (err) {
    console.error('Failed to wiretap conversation', err);
  }
}

function appendInterceptMessage(msg) {
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

// 4. FILE FORENSIC ANALYZER CONTROLLER
async function loadAnalyzerFiles() {
  try {
    const res = await fetch('/api/admin/files');
    if (!res.ok) return;
    const data = await res.json();
    const container = $('#analyzer-files-container');
    container.innerHTML = '';

    data.files.forEach((f) => {
      const item = document.createElement('div');
      item.className = 'contact-item';
      item.innerHTML = `
        <div style="font-weight:700; color:var(--text-bright);">${escapeHtml(f.original_name)}</div>
        <div style="font-size:11px; color:var(--text-dim); display:flex; justify-content:space-between; margin-top:2px;">
          <span>${formatBytes(f.size)}</span>
          <span>#${f.id}</span>
        </div>
      `;
      item.addEventListener('click', () => runFileForensics(f.id));
      container.appendChild(item);
    });
  } catch (err) {
    console.error('Failed to load analyzer files', err);
  }
}

async function runFileForensics(fileId) {
  const reportBox = $('#analyzer-report-container');
  reportBox.innerHTML = '<div style="padding:20px; color:var(--fdi-cyan);">RUNNING DEEP HEURISTIC FORENSIC SCAN...</div>';
  window.fdiAudio.beep(1600, 0.08);

  try {
    const res = await fetch(`/api/admin/files/${fileId}/analyze`);
    if (!res.ok) throw new Error('Analysis failed');
    const { report } = await res.json();

    reportBox.innerHTML = `
      <div style="font-size:18px; font-weight:700; color:var(--fdi-green);">EVIDENCE FILE REPORT :: ${escapeHtml(report.name)}</div>
      
      <div class="report-grid">
        <div class="report-card">
          <div class="report-card-title">DETECTED SIGNATURE</div>
          <div class="report-card-val" style="font-size:13px;">${escapeHtml(report.signature)}</div>
        </div>
        <div class="report-card">
          <div class="report-card-title">SHANNON ENTROPY (0-8)</div>
          <div class="report-card-val">${report.entropy}</div>
        </div>
        <div class="report-card">
          <div class="report-card-title">DECLARED MIME</div>
          <div class="report-card-val" style="font-size:13px;">${escapeHtml(report.declaredMime)}</div>
        </div>
        <div class="report-card">
          <div class="report-card-title">FILE SIZE</div>
          <div class="report-card-val">${formatBytes(report.size)}</div>
        </div>
      </div>

      ${report.flags?.length ? `
        <div style="background:rgba(255,65,65,0.15); border:1px solid var(--fdi-red); padding:10px 14px; color:var(--fdi-red);">
          <strong>[!] SECURITY ANOMALIES DETECTED:</strong><br>
          ${report.flags.map((f) => `&bull; ${escapeHtml(f)}`).join('<br>')}
        </div>
      ` : ''}

      <div style="font-weight:700; color:var(--fdi-green); margin-top:8px;">RAW HEX DISASSEMBLY (FIRST 512 BYTES)</div>
      <div class="hex-dump-box">${escapeHtml(report.hexdump)}</div>

      <div style="font-weight:700; color:var(--fdi-green); margin-top:8px;">EXTRACTED ASCII STRINGS</div>
      <div class="hex-dump-box" style="max-height:180px;">${escapeHtml(report.strings.join('\n') || '(No strings identified)')}</div>
    `;
    window.fdiAudio.chimeSuccess();
  } catch (err) {
    reportBox.innerHTML = `<div style="color:var(--fdi-red); padding:20px;">[!] FORENSIC SCAN FAILED</div>`;
  }
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
async function loadMonitorStats() {
  try {
    const res = await fetch('/api/admin/overview');
    if (!res.ok) return;
    const data = await res.json();
    $('#mon-stat-users').textContent = data.stats.users;
    $('#mon-stat-online').textContent = data.online.length;
    $('#mon-stat-msgs').textContent = data.stats.messages;
    $('#mon-stat-grants').textContent = data.stats.active_grants;

    const logBox = $('#mon-logs-feed');
    logBox.innerHTML = data.logs
      .map((l) => `[${new Date(l.ts).toLocaleTimeString()}] ${l.level.padEnd(5)} ${l.event.padEnd(16)} ${l.username || 'SYS'} :: ${escapeHtml(l.detail || '')}`)
      .join('\n');
    logBox.scrollTop = logBox.scrollHeight;
  } catch (err) {
    console.error('Failed to load telemetry', err);
  }
}

function appendMonitorLog(entry) {
  const logBox = $('#mon-logs-feed');
  if (!logBox) return;
  const line = `[${new Date(entry.ts).toLocaleTimeString()}] ${entry.level.padEnd(5)} ${entry.event.padEnd(16)} :: ${escapeHtml(entry.detail || '')}\n`;
  logBox.textContent = line + logBox.textContent;
}

// Start application
window.addEventListener('DOMContentLoaded', initApp);
