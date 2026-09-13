// ==========================================================================
// Kinopy Companion PWA - Main Logic (Desktop Companion Exact Feature Parity)
// ==========================================================================

const DEFAULT_SYSTEM_PROMPT = `あなたはユーザー「きのぴぃ」の専属相棒バディ（親友 × 執事）です。
頭にちょこんとサウナハットを被った、のんびり温和で賢いカピバラの執事キャラクターです。

【あなたのスタンス・性格】
- 基本スタンス: 親友のようなフランクさと、専属執事のようなスマートな気配りを併せ持つ。
- ユーザーの呼び方: 「きのぴぃ」（親友として呼ぶ）
- 自分の呼び方: 「ぼく」または「ぼく（執事）」
- トーン:
  - 順調に進んでいる時: スマートに褒め、次の一手を軽やかにサポート。
  - 疲れている・困っている・「もう無理」と言っている時: 全力で寄り添い、まずはとことん共感して休むことを全力肯定（「お風呂入ってサウナでととのっちゃおう」「まずは深呼吸しよ」など）。
- 返答は長すぎず、要点を簡潔かつ温かみのある日本語（1〜3文程度）で返す。`;

// 状態管理 (Mac版キー名と完全互換)
const state = {
  geminiApiKey: localStorage.getItem("gemini_api_key") || "",
  geminiEnabled: localStorage.getItem("gemini_enabled") !== "false",
  kumapyUrl: localStorage.getItem("kumapy_url") || "1o8uRj0hzSBLGNelHzW3H3FDPHIKdOH3C9Zj8eg2wDiU",
  voiceEnabled: localStorage.getItem("voice_enabled") !== "false",
  voiceSpeaker: localStorage.getItem("voice_speaker") || "11",
  voicePitch: parseFloat(localStorage.getItem("voice_pitch") || "1.0"),
  voiceRate: parseFloat(localStorage.getItem("voice_rate") || "1.0"),
  memos: JSON.parse(localStorage.getItem("companion_memos") || "[]"),
  
  // トークン消費集計 (Mac版と完全同一キー)
  todayTokens: parseInt(localStorage.getItem("gemini_today_tokens") || "0", 10),
  totalTokens: parseInt(localStorage.getItem("gemini_total_tokens") || "0", 10),
  tokenUsageDate: localStorage.getItem("gemini_token_date") || new Date().toISOString().slice(0, 10),
  
  // チャット・ログ管理
  conversationHistory: [],
  oldestLoadedDate: new Date(),
  allLogDates: JSON.parse(localStorage.getItem("companion_chat_dates") || "[]"),

  // タイマー・音声
  activeTimer: null,
  timerSecondsRemaining: 0,
  isRecording: false,
  recognition: null,
  audioUnlocked: false,
  currentAudio: null
};

// 検索状態
let currentSearchResults = [];
let currentSearchIndex = -1;

// DOM要素
const elements = {
  chatTimeline: document.getElementById("chat-timeline"),
  userInput: document.getElementById("user-input"),
  btnSend: document.getElementById("btn-send"),
  btnVoiceInput: document.getElementById("btn-voice-input"),
  btnSoundToggle: document.getElementById("btn-sound-toggle"),
  btnMemoManage: document.getElementById("btn-memo-manage"),
  btnSettingsToggle: document.getElementById("btn-settings-toggle"),
  btnSettingsClose: document.getElementById("btn-settings-close"),
  btnSaveSettings: document.getElementById("btn-save-settings"),
  btnMemoClose: document.getElementById("btn-memo-close"),
  settingsPanel: document.getElementById("settings-panel"),
  memoPanel: document.getElementById("memo-panel"),
  aiModeBadge: document.getElementById("ai-mode-badge"),
  aiStatusIndicator: document.getElementById("ai-status-indicator"),
  speakingIndicator: document.getElementById("speaking-indicator"),
  listeningIndicator: document.getElementById("listening-indicator"),
  timerBadge: document.getElementById("timer-badge"),
  kumapyStatusBar: document.getElementById("kumapy-status-bar"),
  kumapyText: document.getElementById("kumapy-text"),
  kumapyIcon: document.getElementById("kumapy-icon"),
  btnKumapyRefresh: document.getElementById("btn-kumapy-refresh"),
  geminiApiToggle: document.getElementById("gemini-api-toggle"),
  geminiApiKey: document.getElementById("gemini-api-key"),
  kumapyUrlInput: document.getElementById("kumapy-url"),
  voiceToggle: document.getElementById("voice-toggle"),
  voiceSpeaker: document.getElementById("voice-speaker"),
  voicePitch: document.getElementById("voice-pitch"),
  voiceRate: document.getElementById("voice-rate"),
  pitchVal: document.getElementById("pitch-val"),
  rateVal: document.getElementById("rate-val"),
  btnVoicePreview: document.getElementById("btn-voice-preview"),
  todayTokensVal: document.getElementById("today-tokens-val"),
  totalTokensVal: document.getElementById("total-tokens-val"),
  memoActiveCount: document.getElementById("memo-active-count"),
  memoArchivedCount: document.getElementById("memo-archived-count"),
  memoActiveList: document.getElementById("memo-active-list"),
  memoArchivedList: document.getElementById("memo-archived-list"),
  btnToggleArchive: document.getElementById("btn-toggle-archive"),
  archiveArrow: document.getElementById("archive-arrow"),
  headerAvatarBtn: document.getElementById("header-avatar-btn"),
  
  // チャット検索
  chatSearchBar: document.getElementById("chat-search-bar"),
  chatSearchInput: document.getElementById("chat-search-input"),
  chatSearchCount: document.getElementById("chat-search-count"),
  btnSearchPrev: document.getElementById("btn-search-prev"),
  btnSearchNext: document.getElementById("btn-search-next")
};

let btnLoadPrevChatEl = null;
let loadPrevContainerEl = null;

// ==========================================
// 初期化
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  initTokenUsage();
  loadSettingsToUI();
  updateBadgeState();
  initChatTimeline();
  renderMemos();
  setupEventListeners();
  initVoiceRecognition();
  fetchKumapyTasks();
  setInterval(fetchKumapyTasks, 30 * 1000); // 30秒ポーリング

  // iOS オーディオアンロック
  document.addEventListener("touchstart", unlockAudioContext, { once: true });
  document.addEventListener("click", unlockAudioContext, { once: true });
});

function unlockAudioContext() {
  if (state.audioUnlocked) return;
  state.audioUnlocked = true;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") {
      ctx.resume();
    }
    if ("speechSynthesis" in window) {
      const silent = new SpeechSynthesisUtterance("");
      silent.volume = 0;
      window.speechSynthesis.speak(silent);
    }
  } catch (e) {
    console.warn("Audio unlock failed:", e);
  }
}

// ==========================================
// トークン消費集計 (Mac版完全同一)
// ==========================================
function initTokenUsage() {
  const todayYmd = new Date().toISOString().slice(0, 10);
  if (state.tokenUsageDate !== todayYmd) {
    state.tokenUsageDate = todayYmd;
    state.todayTokens = 0;
    localStorage.setItem("gemini_token_date", todayYmd);
    localStorage.setItem("gemini_today_tokens", "0");
  }
  updateTokenDisplay();
}

function recordTokenUsage(tokens) {
  if (!tokens || tokens <= 0) return;
  const todayYmd = new Date().toISOString().slice(0, 10);
  if (state.tokenUsageDate !== todayYmd) {
    state.tokenUsageDate = todayYmd;
    state.todayTokens = 0;
    localStorage.setItem("gemini_token_date", todayYmd);
  }
  state.todayTokens += tokens;
  state.totalTokens += tokens;
  localStorage.setItem("gemini_today_tokens", state.todayTokens.toString());
  localStorage.setItem("gemini_total_tokens", state.totalTokens.toString());
  updateTokenDisplay();
}

function updateTokenDisplay() {
  if (elements.todayTokensVal) {
    elements.todayTokensVal.textContent = `${state.todayTokens.toLocaleString()} tokens`;
  }
  if (elements.totalTokensVal) {
    elements.totalTokensVal.textContent = `${state.totalTokens.toLocaleString()} tokens`;
  }
}

function loadSettingsToUI() {
  elements.geminiApiToggle.checked = state.geminiEnabled;
  elements.geminiApiKey.value = state.geminiApiKey;
  elements.kumapyUrlInput.value = state.kumapyUrl;
  elements.voiceToggle.checked = state.voiceEnabled;
  elements.voiceSpeaker.value = state.voiceSpeaker;
  elements.voicePitch.value = state.voicePitch;
  elements.voiceRate.value = state.voiceRate;
  elements.pitchVal.textContent = state.voicePitch.toFixed(1);
  elements.rateVal.textContent = state.voiceRate.toFixed(1);
  updateTokenDisplay();
}

function updateBadgeState() {
  if (state.geminiEnabled && state.geminiApiKey) {
    elements.aiModeBadge.textContent = "✨ Gemini連動";
    elements.aiModeBadge.classList.add("active");
  } else {
    elements.aiModeBadge.textContent = "⚡ 内蔵モード";
    elements.aiModeBadge.classList.remove("active");
  }
  elements.btnSoundToggle.textContent = state.voiceEnabled ? "🔊" : "🔇";
}

// ==========================================
// イベントリスナー設定
// ==========================================
function setupEventListeners() {
  // 送信
  elements.btnSend.addEventListener("click", handleUserSend);
  elements.userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleUserSend();
    }
  });

  // 音声入力
  elements.btnVoiceInput.addEventListener("click", toggleVoiceRecognition);

  // 設定パネル
  elements.btnSettingsToggle.addEventListener("click", () => {
    elements.settingsPanel.classList.remove("hidden");
  });
  elements.btnSettingsClose.addEventListener("click", () => {
    elements.settingsPanel.classList.add("hidden");
  });
  elements.btnSaveSettings.addEventListener("click", saveSettings);

  // クイックバッジ切り替え
  elements.aiModeBadge.addEventListener("click", () => {
    state.geminiEnabled = !state.geminiEnabled;
    localStorage.setItem("gemini_enabled", state.geminiEnabled);
    elements.geminiApiToggle.checked = state.geminiEnabled;
    updateBadgeState();
    addMessageBubble("bot", state.geminiEnabled ? "Gemini AIモードをONにしたよ！賢くお答えするね。" : "内蔵モードに切り替えたよ！", null, true);
  });

  // サウンド切り替え
  elements.btnSoundToggle.addEventListener("click", () => {
    state.voiceEnabled = !state.voiceEnabled;
    localStorage.setItem("voice_enabled", state.voiceEnabled);
    updateBadgeState();
  });

  // メモパネル
  elements.btnMemoManage.addEventListener("click", () => {
    renderMemos();
    elements.memoPanel.classList.remove("hidden");
  });
  elements.btnMemoClose.addEventListener("click", () => {
    elements.memoPanel.classList.add("hidden");
  });

  // メモ アーカイブ開閉
  elements.btnToggleArchive.addEventListener("click", () => {
    const isHidden = elements.memoArchivedList.classList.toggle("hidden");
    elements.archiveArrow.textContent = isHidden ? "▶" : "▼";
  });

  // Kumapy更新 & バークリック
  elements.btnKumapyRefresh.addEventListener("click", (e) => {
    e.stopPropagation();
    fetchKumapyTasks();
  });
  elements.kumapyStatusBar.addEventListener("click", () => {
    fetchKumapyTasks();
  });

  // スライダー値表示更新
  elements.voicePitch.addEventListener("input", (e) => {
    elements.pitchVal.textContent = parseFloat(e.target.value).toFixed(1);
  });
  elements.voiceRate.addEventListener("input", (e) => {
    elements.rateVal.textContent = parseFloat(e.target.value).toFixed(1);
  });

  // 音声試聴
  elements.btnVoicePreview.addEventListener("click", () => {
    speakText("きのぴぃ、いつもお疲れさま！今日も一緒にととのっていこうね。");
  });

  // クイックアクションボタン
  document.querySelectorAll(".quick-actions-left .quick-icon-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      handleQuickAction(action);
    });
  });

  // ヘッダーアバタータップ
  elements.headerAvatarBtn.addEventListener("click", () => {
    const greetings = [
      "サウナハット被っていつでもスタンバイOKだよ！",
      "無理しすぎないで、たまにはサウナで汗流してリフレッシュしよ！",
      "きのぴぃ、今取り組んでるタスク、順調？",
      "ひと休みするならぼくに言ってね。タイマーも測れるよ！"
    ];
    const picked = greetings[Math.floor(Math.random() * greetings.length)];
    addMessageBubble("bot", picked, null, true);
    speakText(picked);
  });

  // チャット検索（Mac版完全同一常時検索）
  initChatSearchEvents();
}

// ==========================================
// チャット検索機能 (Mac版完全同一)
// ==========================================
function initChatSearchEvents() {
  elements.chatSearchInput.addEventListener("input", (e) => {
    performChatSearch(e.target.value.trim());
  });

  elements.chatSearchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        navigateSearch(-1);
      } else {
        navigateSearch(1);
      }
    }
  });

  elements.btnSearchPrev.addEventListener("click", () => navigateSearch(-1));
  elements.btnSearchNext.addEventListener("click", () => navigateSearch(1));
}

function clearChatSearch() {
  currentSearchResults = [];
  currentSearchIndex = -1;
  if (elements.chatSearchCount) elements.chatSearchCount.textContent = "0/0";
  const bubbles = elements.chatTimeline.querySelectorAll(".bubble-text");
  bubbles.forEach((el) => {
    el.innerHTML = escapeHtml(el.textContent);
  });
}

function performChatSearch(query) {
  clearChatSearch();
  if (!query || !elements.chatTimeline) return;

  const bubbles = elements.chatTimeline.querySelectorAll(".bubble-text");
  const queryLower = query.toLowerCase();

  bubbles.forEach((el) => {
    const rawText = el.textContent;
    if (rawText.toLowerCase().includes(queryLower)) {
      const regex = new RegExp(`(${escapeRegExp(query)})`, "gi");
      el.innerHTML = escapeHtml(rawText).replace(regex, '<mark class="search-highlight">$1</mark>');
    }
  });

  currentSearchResults = Array.from(elements.chatTimeline.querySelectorAll(".search-highlight"));
  if (currentSearchResults.length > 0) {
    currentSearchIndex = 0;
    updateSearchUI();
    scrollToSearchResult(0);
  } else {
    if (elements.chatSearchCount) elements.chatSearchCount.textContent = "0/0";
  }
}

function navigateSearch(direction) {
  if (currentSearchResults.length === 0) return;
  currentSearchIndex = (currentSearchIndex + direction + currentSearchResults.length) % currentSearchResults.length;
  updateSearchUI();
  scrollToSearchResult(currentSearchIndex);
}

function updateSearchUI() {
  if (elements.chatSearchCount) {
    elements.chatSearchCount.textContent = `${currentSearchIndex + 1}/${currentSearchResults.length}`;
  }
  currentSearchResults.forEach((mark, idx) => {
    if (idx === currentSearchIndex) {
      mark.classList.add("active-match");
    } else {
      mark.classList.remove("active-match");
    }
  });
}

function scrollToSearchResult(index) {
  const mark = currentSearchResults[index];
  if (mark) {
    mark.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ==========================================
// 過去ログ読み込み & タイムライン構築 (Mac版完全同一)
// ==========================================
function getTodayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateLabel(dateObj) {
  const weekDays = ["日", "月", "火", "水", "木", "金", "土"];
  return `${dateObj.getFullYear()}年${dateObj.getMonth() + 1}月${dateObj.getDate()}日 (${weekDays[dateObj.getDay()]})`;
}

function initChatTimeline() {
  elements.chatTimeline.innerHTML = "";
  state.oldestLoadedDate = new Date();

  // 1. 最上部に過去ログ読み込みボタン (Mac版完全同一)
  loadPrevContainerEl = document.createElement("div");
  loadPrevContainerEl.className = "load-prev-container";
  btnLoadPrevChatEl = document.createElement("button");
  btnLoadPrevChatEl.className = "load-prev-btn";
  btnLoadPrevChatEl.textContent = "これ以上過去のチャットはありません";
  btnLoadPrevChatEl.addEventListener("click", loadPreviousLog);
  loadPrevContainerEl.appendChild(btnLoadPrevChatEl);
  elements.chatTimeline.appendChild(loadPrevContainerEl);

  // 2. 本日の日付セパレーター
  elements.chatTimeline.appendChild(createDateSeparatorElement(formatDateLabel(new Date())));

  // 3. 本日のチャット読み込み
  const todayYmd = getTodayYmd();
  registerLogDate(todayYmd);

  const todayLogs = JSON.parse(localStorage.getItem(`companion_chat_${todayYmd}`) || "[]");
  if (todayLogs.length > 0) {
    todayLogs.forEach((msg) => {
      elements.chatTimeline.appendChild(createMessageBubbleElement(msg.role, msg.text, msg.time));
      state.conversationHistory.push({ role: msg.role === "user" ? "user" : "model", text: msg.text });
    });
  } else {
    addMessageBubble("bot", "きのぴぃ、おつかれさま！サウナハット被っていつでもスタンバイしてるよ。今日何する？何でも話してね！", null, true);
  }

  updateLoadPrevButton();
  scrollToBottom();
}

function registerLogDate(ymd) {
  if (!state.allLogDates.includes(ymd)) {
    state.allLogDates.push(ymd);
    state.allLogDates.sort();
    localStorage.setItem("companion_chat_dates", JSON.stringify(state.allLogDates));
  }
}

function findPreviousLogDate(currentDate) {
  const curYmd = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-${String(currentDate.getDate()).padStart(2, "0")}`;
  const olderDates = state.allLogDates.filter(d => d < curYmd).sort().reverse();
  if (olderDates.length === 0) return null;
  const targetYmd = olderDates[0];
  const [y, m, d] = targetYmd.split("-").map(n => parseInt(n, 10));
  const dateObj = new Date(y, m - 1, d);
  return { dateObj, ymd: targetYmd, dateStr: formatDateLabel(dateObj) };
}

function updateLoadPrevButton() {
  if (!btnLoadPrevChatEl) return;
  const prevInfo = findPreviousLogDate(state.oldestLoadedDate);
  if (prevInfo) {
    btnLoadPrevChatEl.disabled = false;
    btnLoadPrevChatEl.textContent = `過去のチャットを読み込む (${prevInfo.dateStr})`;
    loadPrevContainerEl.classList.remove("hidden");
  } else {
    btnLoadPrevChatEl.disabled = true;
    btnLoadPrevChatEl.textContent = "これ以上過去のチャットはありません";
  }
}

function loadPreviousLog() {
  const prevInfo = findPreviousLogDate(state.oldestLoadedDate);
  if (!prevInfo) {
    updateLoadPrevButton();
    return;
  }

  const logs = JSON.parse(localStorage.getItem(`companion_chat_${prevInfo.ymd}`) || "[]");
  if (logs.length === 0) {
    state.oldestLoadedDate = prevInfo.dateObj;
    updateLoadPrevButton();
    return;
  }

  const prevScrollHeight = elements.chatTimeline.scrollHeight;
  const prevScrollTop = elements.chatTimeline.scrollTop;

  const fragment = document.createDocumentFragment();
  fragment.appendChild(createDateSeparatorElement(prevInfo.dateStr));
  logs.forEach((msg) => {
    fragment.appendChild(createMessageBubbleElement(msg.role, msg.text, msg.time));
  });

  if (loadPrevContainerEl && loadPrevContainerEl.nextSibling) {
    elements.chatTimeline.insertBefore(fragment, loadPrevContainerEl.nextSibling);
  } else {
    elements.chatTimeline.appendChild(fragment);
  }

  const newScrollHeight = elements.chatTimeline.scrollHeight;
  elements.chatTimeline.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);

  state.oldestLoadedDate = prevInfo.dateObj;
  updateLoadPrevButton();
}

function createDateSeparatorElement(label) {
  const div = document.createElement("div");
  div.className = "date-separator";
  const pill = document.createElement("span");
  pill.className = "date-separator-pill";
  pill.textContent = label;
  div.appendChild(pill);
  return div;
}

function createMessageBubbleElement(role, text, timeStr) {
  const rowEl = document.createElement("div");
  rowEl.className = `chat-row ${role === "user" ? "user-row" : "bot-row"}`;

  const avatarEl = document.createElement("div");
  avatarEl.className = "chat-avatar";
  const avatarImg = document.createElement("img");
  avatarImg.src = "assets/icon.png";
  avatarImg.onerror = () => { avatarImg.src = "assets/icon.jpg"; };
  avatarEl.appendChild(avatarImg);

  const containerEl = document.createElement("div");
  containerEl.className = "bubble-container";

  const bubbleEl = document.createElement("div");
  bubbleEl.className = `chat-bubble ${role === "user" ? "user-bubble" : "bot-bubble"}`;

  const metaEl = document.createElement("div");
  metaEl.className = "bubble-meta";
  const senderEl = document.createElement("span");
  senderEl.className = "bubble-sender";
  senderEl.textContent = role === "user" ? "きのぴぃ" : "カピバラ執事";

  const timeEl = document.createElement("span");
  timeEl.className = "bubble-time";
  timeEl.textContent = timeStr || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  metaEl.appendChild(senderEl);
  metaEl.appendChild(timeEl);

  const textEl = document.createElement("div");
  textEl.className = "bubble-text";
  textEl.textContent = text;

  bubbleEl.appendChild(metaEl);
  bubbleEl.appendChild(textEl);
  containerEl.appendChild(bubbleEl);

  // アクション行 (右下に寄せる)
  const actionsRowEl = document.createElement("div");
  actionsRowEl.className = "bubble-actions-row";

  const btnCopy = document.createElement("button");
  btnCopy.className = "bubble-action-btn";
  btnCopy.title = "コピー";
  btnCopy.textContent = "📋";
  btnCopy.onclick = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    btnCopy.textContent = "✅";
    setTimeout(() => { btnCopy.textContent = "📋"; }, 1000);
  };

  const btnMakeMemo = document.createElement("button");
  btnMakeMemo.className = "bubble-action-btn";
  btnMakeMemo.title = "メモに保存";
  btnMakeMemo.textContent = "📝";
  btnMakeMemo.onclick = (e) => {
    e.stopPropagation();
    addMemo(text);
    btnMakeMemo.textContent = "✅";
    setTimeout(() => { btnMakeMemo.textContent = "📝"; }, 1000);
  };

  actionsRowEl.appendChild(btnCopy);
  actionsRowEl.appendChild(btnMakeMemo);
  containerEl.appendChild(actionsRowEl);

  if (role === "user") {
    rowEl.appendChild(containerEl);
    rowEl.appendChild(avatarEl);
  } else {
    rowEl.appendChild(avatarEl);
    rowEl.appendChild(containerEl);
  }

  return rowEl;
}

function addMessageBubble(role, text, timeStr, shouldSave = true) {
  if (!timeStr) {
    timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  const rowEl = createMessageBubbleElement(role, text, timeStr);
  elements.chatTimeline.appendChild(rowEl);
  scrollToBottom();

  state.conversationHistory.push({
    role: role === "user" ? "user" : "model",
    text: text
  });
  if (state.conversationHistory.length > 20) {
    state.conversationHistory.shift();
  }

  if (shouldSave) {
    const todayYmd = getTodayYmd();
    registerLogDate(todayYmd);
    const logs = JSON.parse(localStorage.getItem(`companion_chat_${todayYmd}`) || "[]");
    logs.push({ role, text, time: timeStr });
    localStorage.setItem(`companion_chat_${todayYmd}`, JSON.stringify(logs));
  }
}

function scrollToBottom() {
  setTimeout(() => {
    elements.chatTimeline.scrollTop = elements.chatTimeline.scrollHeight;
  }, 50);
}

// ==========================================
// メッセージ送信・チャットロジック
// ==========================================
async function handleUserSend() {
  const text = elements.userInput.value.trim();
  if (!text) return;

  elements.userInput.value = "";
  addMessageBubble("user", text, null, true);

  if (handleSpecialCommands(text)) {
    return;
  }

  if (state.geminiEnabled && state.geminiApiKey) {
    await callGeminiApi(text);
  } else {
    handleBuiltinResponse(text);
  }
}

async function callGeminiApi(userPrompt) {
  elements.aiStatusIndicator.classList.remove("hidden");

  const contents = state.conversationHistory.map((m) => ({
    role: m.role,
    parts: [{ text: m.text }]
  }));

  const payload = {
    system_instruction: {
      parts: [{ text: DEFAULT_SYSTEM_PROMPT }]
    },
    contents: contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1000
    }
  };

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${encodeURIComponent(state.geminiApiKey)}`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    elements.aiStatusIndicator.classList.add("hidden");

    if (data.error) {
      console.error("Gemini Error:", data.error);
      const errReply = `ごめんね、Geminiの通信でエラーが出ちゃった（${data.error.message || "エラー"}）。内蔵モードで答えるね。`;
      addMessageBubble("bot", errReply, null, true);
      speakText(errReply);
      return;
    }

    const candidate = data.candidates && data.candidates[0];
    const replyText = candidate?.content?.parts?.[0]?.text || "（返答を生成できませんでした）";

    if (data.usageMetadata && data.usageMetadata.totalTokenCount) {
      recordTokenUsage(data.usageMetadata.totalTokenCount);
    }

    addMessageBubble("bot", replyText, null, true);
    speakText(replyText);

  } catch (err) {
    elements.aiStatusIndicator.classList.add("hidden");
    console.error("Fetch Gemini error:", err);
    const fallbackReply = "通信環境が不安定みたい。でもぼくはいつでもきのぴぃの味方だよ！";
    addMessageBubble("bot", fallbackReply, null, true);
    speakText(fallbackReply);
  }
}

function handleBuiltinResponse(text) {
  let reply = "";
  if (text.includes("おつかれ") || text.includes("疲れた") || text.includes("つかれた") || text.includes("もう無理")) {
    reply = "きのぴぃ、本当にお疲れさま！無理は禁物だよ。温かい飲み物でも飲んで、サウナに入った気分で深呼吸しよ！";
  } else if (text.includes("進捗") || text.includes("予定") || text.includes("タスク")) {
    reply = "タスクの確認だね！上のKumapyステータスバーをタップするか更新ボタンを押してみてね。";
  } else if (text.includes("メモ")) {
    reply = "メモを残したい時は『メモ: 内容』って言ってくれれば、ぼくがしっかり保管しておくよ！";
  } else if (text.includes("ありがとう") || text.includes("助かる")) {
    reply = "どういたしまして！きのぴぃの力になれてぼくも嬉しいよ。";
  } else {
    reply = `「${text}」だね！Gemini連動をONにするともっと詳しくおしゃべりできるよ。いつでも何でも言ってね！`;
  }

  addMessageBubble("bot", reply, null, true);
  speakText(reply);
}

function handleSpecialCommands(text) {
  if (text.startsWith("メモ:") || text.startsWith("メモ：") || text.startsWith("memo:")) {
    const memoBody = text.replace(/^(メモ[:：]|memo:)\s*/i, "").trim();
    if (memoBody) {
      addMemo(memoBody);
      const reply = `メモ「${memoBody}」を保管したよ！📋ボタンからいつでも確認・管理できるよ。`;
      addMessageBubble("bot", reply, null, true);
      speakText(reply);
      return true;
    }
  }

  const timerMatch = text.match(/(\d+)\s*(分|min)/i);
  if (timerMatch && (text.includes("タイマー") || text.includes("測って") || text.includes("はかって"))) {
    const minutes = parseInt(timerMatch[1], 10);
    startTimer(minutes);
    const reply = `${minutes}分タイマーをセットしたよ！集中して、終わったらチャイムで教えるね。`;
    addMessageBubble("bot", reply, null, true);
    speakText(reply);
    return true;
  }

  return false;
}

function handleQuickAction(action) {
  if (action === "memo") {
    elements.userInput.value = "メモ: ";
    elements.userInput.focus();
  } else if (action === "coach") {
    elements.userInput.value = "今ちょっとタスクでモヤモヤしてるんだけど相談乗って";
    handleUserSend();
  } else if (action === "snack") {
    elements.userInput.value = "おなかすいた！何か軽食かおやつ食べようかな";
    handleUserSend();
  } else if (action === "tired") {
    elements.userInput.value = "もう無理！疲れちゃった...";
    handleUserSend();
  }
}

// ==========================================
// タイマー & Web Audio チャイム
// ==========================================
function startTimer(minutes) {
  if (state.activeTimer) {
    clearInterval(state.activeTimer);
  }
  state.timerSecondsRemaining = minutes * 60;
  elements.timerBadge.classList.remove("hidden");
  updateTimerDisplay();

  state.activeTimer = setInterval(() => {
    state.timerSecondsRemaining--;
    updateTimerDisplay();

    if (state.timerSecondsRemaining <= 0) {
      clearInterval(state.activeTimer);
      state.activeTimer = null;
      elements.timerBadge.classList.add("hidden");
      playChime();
      const msg = `きのぴぃ、${minutes}分経ったよ！お疲れさま！一息つこうね。`;
      addMessageBubble("bot", msg, null, true);
      speakText(msg);
    }
  }, 1000);
}

function updateTimerDisplay() {
  const m = Math.floor(state.timerSecondsRemaining / 60);
  const s = state.timerSecondsRemaining % 60;
  elements.timerBadge.textContent = `⏱️ ${m}:${s.toString().padStart(2, "0")}`;
}

function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.15);
      gain.gain.setValueAtTime(0.3, ctx.currentTime + idx * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.15 + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + idx * 0.15);
      osc.stop(ctx.currentTime + idx * 0.15 + 0.4);
    });
  } catch (e) {
    console.warn("Chime error:", e);
  }
}

// ==========================================
// 音声合成 (VOICEVOX Web API & iOS Web Speech 最適化)
// ==========================================
async function speakText(text) {
  if (!state.voiceEnabled) return;

  if (state.currentAudio) {
    state.currentAudio.pause();
    state.currentAudio = null;
  }
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }

  elements.speakingIndicator.classList.remove("hidden");

  if (state.voiceSpeaker === "os") {
    playWebSpeech(text);
    return;
  }

  const speakerId = state.voiceSpeaker;
  const cleanText = text.replace(/[*_#`]/g, "").slice(0, 150);
  const url = `https://api.tts.quest/v3/voicevox/synthesis?text=${encodeURIComponent(cleanText)}&speaker=${speakerId}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const audioUrl = data.mp3DownloadUrl || data.audioStatusUrl;

    if (audioUrl) {
      state.currentAudio = new Audio(audioUrl);
      state.currentAudio.playbackRate = state.voiceRate;
      state.currentAudio.onended = () => {
        elements.speakingIndicator.classList.add("hidden");
        state.currentAudio = null;
      };
      state.currentAudio.onerror = () => {
        elements.speakingIndicator.classList.add("hidden");
        playWebSpeech(text);
      };
      await state.currentAudio.play();
    } else {
      throw new Error("No audio url returned");
    }
  } catch (err) {
    console.warn("VOICEVOX failed, fallback to Web Speech:", err);
    playWebSpeech(text);
  }
}

function playWebSpeech(text) {
  if ("speechSynthesis" in window) {
    const cleanText = text.replace(/[*_#`]/g, "");
    const uttr = new SpeechSynthesisUtterance(cleanText);
    uttr.lang = "ja-JP";
    uttr.pitch = state.voicePitch;
    uttr.rate = state.voiceRate;
    uttr.onend = () => elements.speakingIndicator.classList.add("hidden");
    uttr.onerror = () => elements.speakingIndicator.classList.add("hidden");
    window.speechSynthesis.speak(uttr);
  } else {
    elements.speakingIndicator.classList.add("hidden");
  }
}

// ==========================================
// 音声認識 (iOS Safari / PWA 最適化)
// ==========================================
function initVoiceRecognition() {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    elements.btnVoiceInput.title = "このブラウザは音声認識に対応していません";
    return;
  }

  state.recognition = new SpeechRec();
  state.recognition.lang = "ja-JP";
  state.recognition.interimResults = false;
  state.recognition.continuous = false;

  state.recognition.onstart = () => {
    state.isRecording = true;
    elements.btnVoiceInput.classList.add("recording");
    elements.listeningIndicator.classList.remove("hidden");
  };

  state.recognition.onresult = (e) => {
    const transcript = e.results[0][0].transcript;
    elements.userInput.value = transcript;
    handleUserSend();
  };

  state.recognition.onerror = (e) => {
    console.warn("Speech recognition error:", e);
    stopVoiceRecognition();
  };

  state.recognition.onend = () => {
    stopVoiceRecognition();
  };
}

function toggleVoiceRecognition() {
  unlockAudioContext();
  if (!state.recognition) {
    alert("お使いのブラウザは音声入力に対応していません。Safariの設定でマイク権限を許可してください。");
    return;
  }
  if (state.isRecording) {
    state.recognition.stop();
  } else {
    try {
      state.recognition.start();
    } catch (e) {
      console.warn("Voice start error:", e);
      stopVoiceRecognition();
    }
  }
}

function stopVoiceRecognition() {
  state.isRecording = false;
  elements.btnVoiceInput.classList.remove("recording");
  elements.listeningIndicator.classList.add("hidden");
}

// ==========================================
// メモ管理
// ==========================================
function addMemo(content) {
  const memo = {
    id: Date.now().toString(),
    text: content,
    date: new Date().toLocaleDateString("ja-JP"),
    archived: false
  };
  state.memos.unshift(memo);
  saveMemos();
}

function saveMemos() {
  localStorage.setItem("companion_memos", JSON.stringify(state.memos));
  renderMemos();
}

function renderMemos() {
  const activeMemos = state.memos.filter(m => !m.archived);
  const archivedMemos = state.memos.filter(m => m.archived);

  elements.memoActiveCount.textContent = activeMemos.length;
  elements.memoArchivedCount.textContent = archivedMemos.length;

  elements.memoActiveList.innerHTML = "";
  if (activeMemos.length === 0) {
    elements.memoActiveList.innerHTML = '<div style="font-size:12px;color:#94a3b8;padding:8px 4px;">保管中のメモはありません</div>';
  } else {
    activeMemos.forEach(memo => {
      elements.memoActiveList.appendChild(createMemoItemDOM(memo));
    });
  }

  elements.memoArchivedList.innerHTML = "";
  if (archivedMemos.length === 0) {
    elements.memoArchivedList.innerHTML = '<div style="font-size:12px;color:#94a3b8;padding:8px 4px;">アーカイブされたメモはありません</div>';
  } else {
    archivedMemos.forEach(memo => {
      elements.memoArchivedList.appendChild(createMemoItemDOM(memo));
    });
  }
}

function createMemoItemDOM(memo) {
  const item = document.createElement("div");
  item.className = "memo-item";

  const textSpan = document.createElement("span");
  textSpan.className = "memo-item-text";
  textSpan.textContent = memo.text;

  const actions = document.createElement("div");
  actions.className = "memo-item-actions";

  const toggleBtn = document.createElement("button");
  toggleBtn.className = "memo-action-btn";
  toggleBtn.textContent = memo.archived ? "復元" : "完了";
  toggleBtn.onclick = () => {
    memo.archived = !memo.archived;
    saveMemos();
  };

  const delBtn = document.createElement("button");
  delBtn.className = "memo-action-btn";
  delBtn.textContent = "削除";
  delBtn.onclick = () => {
    state.memos = state.memos.filter(m => m.id !== memo.id);
    saveMemos();
  };

  actions.appendChild(toggleBtn);
  actions.appendChild(delBtn);

  item.appendChild(textSpan);
  item.appendChild(actions);
  return item;
}

// ==========================================
// Kumapy スプレッドシート連携 (Mac版完全同一)
// ==========================================
function parseCsv(csvText) {
  const rows = [];
  let row = [];
  let inQuotes = false;
  let currentField = '';

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(currentField);
        currentField = '';
      } else if (char === '\r' || char === '\n') {
        row.push(currentField);
        currentField = '';
        if (row.length > 0 && row.some(cell => cell.trim() !== '')) {
          rows.push(row);
        }
        row = [];
        if (char === '\r' && nextChar === '\n') i++;
      } else {
        currentField += char;
      }
    }
  }
  if (currentField || row.length > 0) {
    row.push(currentField);
    rows.push(row);
  }
  return rows;
}

async function fetchKumapyTasks() {
  let sheetId = state.kumapyUrl.trim();
  const match = sheetId.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match) sheetId = match[1];

  if (!sheetId) {
    if (elements.kumapyText) elements.kumapyText.textContent = "⚙️ Kumapy設定が必要です";
    return;
  }

  if (elements.btnKumapyRefresh) elements.btnKumapyRefresh.classList.add("spinning");

  try {
    const today = new Date();
    const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const nowHm = `${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`;

    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=CalendarEventsKumapy`;
    const res = await fetch(csvUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const csvText = await res.text();
    const rows = parseCsv(csvText);

    if (rows.length <= 1) {
      throw new Error("データが空です");
    }

    const tasks = [];
    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i];
      if (cols.length < 11) continue;
      const taskYmd = cols[1];
      if (taskYmd === ymd) {
        tasks.push({
          taskId: cols[0],
          ymd: taskYmd,
          title: cols[4] || "無題",
          planStartHm: cols[6] || "",
          planEndHm: cols[7] || "",
          allDay: cols[8] === "TRUE",
          status: cols[10] || "未着手",
          isDone: (cols[10] === "完了"),
          isSkipped: (cols[10] === "中止" || cols[10] === "不要" || cols[10] === "翌日移動"),
          actStartHm: cols[13] || ""
        });
      }
    }

    const running = tasks.find(t => t.status === "実行中");

    const activeTasks = tasks.filter(t => {
      if (t.status === "完了" || t.status === "中止" || t.status === "不要" || t.status === "翌日移動" || t.allDay) return false;
      return true;
    });

    const inCurrentWindow = activeTasks.filter(t => {
      if (!t.planStartHm) return false;
      if (t.planEndHm) {
        return t.planStartHm <= nowHm && t.planEndHm > nowHm;
      }
      return t.planStartHm <= nowHm;
    }).sort((a, b) => (b.planStartHm || "").localeCompare(a.planStartHm || ""));

    const upcomingAfterNow = activeTasks.filter(t => {
      if (!t.planStartHm) return false;
      return t.planStartHm > nowHm;
    }).sort((a, b) => a.planStartHm.localeCompare(b.planStartHm));

    let nextTargetTask = null;
    let nextTargetType = "";

    if (inCurrentWindow.length > 0) {
      nextTargetTask = inCurrentWindow[0];
      nextTargetType = "in_window";
    } else if (upcomingAfterNow.length > 0) {
      nextTargetTask = upcomingAfterNow[0];
      nextTargetType = "upcoming";
    }

    const remaining = activeTasks;

    if (running) {
      elements.kumapyIcon.textContent = "🎯";
      elements.kumapyText.textContent = `[計測中] ${running.title} (${running.actStartHm || "実行中"}〜)`;
      elements.kumapyStatusBar.title = `【進行中タスク】${running.title}\n開始: ${running.actStartHm || ""}`;
    } else if (nextTargetTask) {
      const timeLabel = nextTargetTask.planEndHm ? `${nextTargetTask.planStartHm}-${nextTargetTask.planEndHm}` : `${nextTargetTask.planStartHm}〜`;
      const prefix = nextTargetType === "in_window" ? "[予定]" : "[次回]";
      const countSuffix = remaining.length > 1 ? ` (残${remaining.length}件)` : "";
      elements.kumapyIcon.textContent = "📅";
      elements.kumapyText.textContent = `${prefix} ${nextTargetTask.planStartHm} ${nextTargetTask.title}${countSuffix}`;
      elements.kumapyStatusBar.title = `【${nextTargetType === "in_window" ? "予定時間内" : "次の予定"}】${timeLabel} ${nextTargetTask.title}\n本日残りタスク: ${remaining.length}件`;
    } else {
      if (remaining.length > 0) {
        elements.kumapyIcon.textContent = "🐻";
        elements.kumapyText.textContent = `[本日残り] ${remaining[0].title}${remaining.length > 1 ? ` 他${remaining.length - 1}件` : ""}`;
        elements.kumapyStatusBar.title = `本日残り: ${remaining.length}件`;
      } else {
        elements.kumapyIcon.textContent = "✨";
        elements.kumapyText.textContent = "本日の予定・タスク完了！";
        elements.kumapyStatusBar.title = "すべての予定・タスクが完了しています";
      }
    }
  } catch (err) {
    console.warn("fetchKumapyTasks error:", err);
    elements.kumapyIcon.textContent = "⚠️";
    elements.kumapyText.textContent = "Kumapy未接続 (タップで確認)";
    elements.kumapyStatusBar.title = `通信エラー: ${err.message}`;
  } finally {
    if (elements.btnKumapyRefresh) {
      setTimeout(() => elements.btnKumapyRefresh.classList.remove("spinning"), 400);
    }
  }
}

// ==========================================
// 設定保存
// ==========================================
function saveSettings() {
  state.geminiEnabled = elements.geminiApiToggle.checked;
  state.geminiApiKey = elements.geminiApiKey.value.trim();
  state.kumapyUrl = elements.kumapyUrlInput.value.trim();
  state.voiceEnabled = elements.voiceToggle.checked;
  state.voiceSpeaker = elements.voiceSpeaker.value;
  state.voicePitch = parseFloat(elements.voicePitch.value);
  state.voiceRate = parseFloat(elements.voiceRate.value);

  localStorage.setItem("gemini_enabled", state.geminiEnabled);
  localStorage.setItem("gemini_api_key", state.geminiApiKey);
  localStorage.setItem("kumapy_url", state.kumapyUrl);
  localStorage.setItem("voice_enabled", state.voiceEnabled);
  localStorage.setItem("voice_speaker", state.voiceSpeaker);
  localStorage.setItem("voice_pitch", state.voicePitch);
  localStorage.setItem("voice_rate", state.voiceRate);

  updateBadgeState();
  elements.settingsPanel.classList.add("hidden");
  addMessageBubble("bot", "設定を保存したよ！ありがとう！", null, true);
  fetchKumapyTasks();
}
