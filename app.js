// ==========================================
// Kinopy Companion PWA - App Main Logic
// ==========================================

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

// 状態管理
const state = {
  geminiApiKey: localStorage.getItem("gemini_api_key") || "",
  geminiEnabled: localStorage.getItem("gemini_enabled") !== "false", // デフォルトON
  kumapyUrl: localStorage.getItem("kumapy_url") || "1o8uRj0hzSBLGNelHzW3H3FDPHIKdOH3C9Zj8eg2wDiU",
  voiceEnabled: localStorage.getItem("voice_enabled") !== "false",
  voiceSpeaker: localStorage.getItem("voice_speaker") || "11",
  voicePitch: parseFloat(localStorage.getItem("voice_pitch") || "1.0"),
  voiceRate: parseFloat(localStorage.getItem("voice_rate") || "1.0"),
  memos: JSON.parse(localStorage.getItem("companion_memos") || "[]"),
  chatHistory: JSON.parse(localStorage.getItem("companion_chat_history") || "[]"),
  todayTokens: parseInt(localStorage.getItem("companion_today_tokens") || "0", 10),
  totalTokens: parseInt(localStorage.getItem("companion_total_tokens") || "0", 10),
  lastTokenDate: localStorage.getItem("companion_last_token_date") || new Date().toDateString(),
  activeTimer: null,
  timerSecondsRemaining: 0,
  isRecording: false,
  recognition: null
};

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
  timerBadge: document.getElementById("timer-badge"),
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
  headerAvatarBtn: document.getElementById("header-avatar-btn")
};

// ==========================================
// 初期化
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  initDateTokenReset();
  loadSettingsToUI();
  updateBadgeState();
  renderChatHistory();
  renderMemos();
  setupEventListeners();
  initVoiceRecognition();
  fetchKumapySchedule();

  // 初回起動メッセージ
  if (state.chatHistory.length === 0) {
    addMessage("bot", "きのぴぃ、おつかれさま！サウナハット被っていつでもスタンバイしてるよ。今日何する？何でも話してね！");
  }
});

// 日付が変わったら当日トークンをリセット
function initDateTokenReset() {
  const today = new Date().toDateString();
  if (state.lastTokenDate !== today) {
    state.todayTokens = 0;
    state.lastTokenDate = today;
    localStorage.setItem("companion_today_tokens", "0");
    localStorage.setItem("companion_last_token_date", today);
  }
}

// UIに設定値を反映
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

function updateTokenDisplay() {
  elements.todayTokensVal.textContent = `${state.todayTokens.toLocaleString()} tokens`;
  elements.totalTokensVal.textContent = `${state.totalTokens.toLocaleString()} tokens`;
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

  // 音声入力ボタン
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
    addMessage("bot", state.geminiEnabled ? "Gemini AIモードをONにしたよ！賢くお答えするね。" : "内蔵モードに切り替えたよ！");
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

  // Kumapy更新
  elements.btnKumapyRefresh.addEventListener("click", () => {
    fetchKumapySchedule();
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
  document.querySelectorAll(".quick-chip-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      handleQuickAction(action);
    });
  });

  // ヘッダーアバタータップでランダム一言
  elements.headerAvatarBtn.addEventListener("click", () => {
    const greetings = [
      "サウナハット被っていつでもスタンバイOKだよ！",
      "無理しすぎないで、たまにはサウナで汗流してリフレッシュしよ！",
      "きのぴぃ、今取り組んでるタスク、順調？",
      "ひと休みするならぼくに言ってね。タイマーも測れるよ！"
    ];
    const picked = greetings[Math.floor(Math.random() * greetings.length)];
    addMessage("bot", picked);
    speakText(picked);
  });
}

// ==========================================
// メッセージ送信・チャットロジック
// ==========================================
async function handleUserSend() {
  const text = elements.userInput.value.trim();
  if (!text) return;

  elements.userInput.value = "";
  addMessage("user", text);

  // コマンド判定（タイマー、メモなど）
  if (handleSpecialCommands(text)) {
    return;
  }

  // Gemini API または 内蔵応答
  if (state.geminiEnabled && state.geminiApiKey) {
    await callGeminiApi(text);
  } else {
    handleBuiltinResponse(text);
  }
}

function addMessage(sender, text) {
  const msgObj = {
    sender,
    text,
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  };
  state.chatHistory.push(msgObj);
  // 最大100件保持
  if (state.chatHistory.length > 100) {
    state.chatHistory.shift();
  }
  localStorage.setItem("companion_chat_history", JSON.stringify(state.chatHistory));

  renderMessageDOM(msgObj);
  scrollToBottom();
}

function renderMessageDOM(msgObj) {
  const div = document.createElement("div");
  div.className = `message-bubble ${msgObj.sender}-msg`;

  const content = document.createElement("div");
  content.className = "message-content";
  content.textContent = msgObj.text;

  const time = document.createElement("div");
  time.className = "message-time";
  time.textContent = msgObj.time;

  div.appendChild(content);
  div.appendChild(time);
  elements.chatTimeline.appendChild(div);
}

function renderChatHistory() {
  elements.chatTimeline.innerHTML = "";
  state.chatHistory.forEach(renderMessageDOM);
  scrollToBottom();
}

function scrollToBottom() {
  setTimeout(() => {
    elements.chatTimeline.scrollTop = elements.chatTimeline.scrollHeight;
  }, 50);
}

// ==========================================
// Gemini API 呼び出し (Thinking対応: gemini-3.6-flash, 1000 tokens)
// ==========================================
async function callGeminiApi(userPrompt) {
  elements.aiStatusIndicator.classList.remove("hidden");

  // 会話履歴をGemini contents形式に変換（直近6件）
  const recentHistory = state.chatHistory.slice(-6);
  const contents = recentHistory.map((m) => ({
    role: m.sender === "user" ? "user" : "model",
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
      addMessage("bot", errReply);
      speakText(errReply);
      return;
    }

    const candidate = data.candidates && data.candidates[0];
    const replyText = candidate?.content?.parts?.[0]?.text || "（返答を生成できませんでした）";

    // トークン消費集計
    if (data.usageMetadata) {
      const used = data.usageMetadata.totalTokenCount || 0;
      state.todayTokens += used;
      state.totalTokens += used;
      localStorage.setItem("companion_today_tokens", state.todayTokens.toString());
      localStorage.setItem("companion_total_tokens", state.totalTokens.toString());
      updateTokenDisplay();
    }

    addMessage("bot", replyText);
    speakText(replyText);

  } catch (err) {
    elements.aiStatusIndicator.classList.add("hidden");
    console.error("Fetch Gemini error:", err);
    const fallbackReply = "通信環境が不安定みたい。でもぼくはいつでもきのぴぃの味方だよ！";
    addMessage("bot", fallbackReply);
    speakText(fallbackReply);
  }
}

// ==========================================
// 内蔵ルール応答
// ==========================================
function handleBuiltinResponse(text) {
  let reply = "";
  const lower = text.toLowerCase();

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

  addMessage("bot", reply);
  speakText(reply);
}

// ==========================================
// 特殊コマンド処理（メモ・タイマー）
// ==========================================
function handleSpecialCommands(text) {
  // メモ登録判定
  if (text.startsWith("メモ:") || text.startsWith("メモ：") || text.startsWith("memo:")) {
    const memoBody = text.replace(/^(メモ[:：]|memo:)\s*/i, "").trim();
    if (memoBody) {
      addMemo(memoBody);
      const reply = `メモ「${memoBody}」を保管したよ！📋ボタンからいつでも確認・管理できるよ。`;
      addMessage("bot", reply);
      speakText(reply);
      return true;
    }
  }

  // タイマー判定 (例: 15分タイマー, 3分タイマー, タイマー 10分)
  const timerMatch = text.match(/(\d+)\s*(分|min)/i);
  if (timerMatch && (text.includes("タイマー") || text.includes("測って") || text.includes("はかって"))) {
    const minutes = parseInt(timerMatch[1], 10);
    startTimer(minutes);
    const reply = `${minutes}分タイマーをセットしたよ！集中して、終わったらチャイムで教えるね。`;
    addMessage("bot", reply);
    speakText(reply);
    return true;
  }

  return false;
}

// ==========================================
// クイックアクション
// ==========================================
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
// タイマー機能 & Web Audio チャイム
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
      addMessage("bot", msg);
      speakText(msg);
    }
  }, 1000);
}

function updateTimerDisplay() {
  const m = Math.floor(state.timerSecondsRemaining / 60);
  const s = state.timerSecondsRemaining % 60;
  elements.timerBadge.textContent = `⏱️ ${m}:${s.toString().padStart(2, "0")}`;
}

// Web Audio APIによる軽やかなチャイム音
function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
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
    console.warn("Web Audio Chime failed:", e);
  }
}

// ==========================================
// 音声合成 (VOICEVOX Web API / iOS SpeechSynthesis)
// ==========================================
let currentAudio = null;

async function speakText(text) {
  if (!state.voiceEnabled) return;

  // 既存再生の停止
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }

  elements.speakingIndicator.classList.remove("hidden");

  // OS標準音声の場合
  if (state.voiceSpeaker === "os") {
    if ("speechSynthesis" in window) {
      const uttr = new SpeechSynthesisUtterance(text);
      uttr.lang = "ja-JP";
      uttr.pitch = state.voicePitch;
      uttr.rate = state.voiceRate;
      uttr.onend = () => elements.speakingIndicator.classList.add("hidden");
      uttr.onerror = () => elements.speakingIndicator.classList.add("hidden");
      window.speechSynthesis.speak(uttr);
    } else {
      elements.speakingIndicator.classList.add("hidden");
    }
    return;
  }

  // VOICEVOX Web API (tts.quest)
  const speakerId = state.voiceSpeaker;
  const cleanText = text.replace(/[*_#`]/g, "").slice(0, 150); // 長文カット
  const url = `https://api.tts.quest/v3/voicevox/synthesis?text=${encodeURIComponent(cleanText)}&speaker=${speakerId}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.mp3DownloadUrl || data.audioStatusUrl) {
      const audioUrl = data.mp3DownloadUrl || data.audioStatusUrl;
      currentAudio = new Audio(audioUrl);
      currentAudio.playbackRate = state.voiceRate;
      currentAudio.onended = () => {
        elements.speakingIndicator.classList.add("hidden");
        currentAudio = null;
      };
      currentAudio.onerror = () => {
        elements.speakingIndicator.classList.add("hidden");
      };
      await currentAudio.play();
    } else {
      throw new Error("VOICEVOX URL not found");
    }
  } catch (err) {
    console.warn("VOICEVOX Web API failed, fallback to Web Speech:", err);
    if ("speechSynthesis" in window) {
      const uttr = new SpeechSynthesisUtterance(text);
      uttr.lang = "ja-JP";
      uttr.onend = () => elements.speakingIndicator.classList.add("hidden");
      uttr.onerror = () => elements.speakingIndicator.classList.add("hidden");
      window.speechSynthesis.speak(uttr);
    } else {
      elements.speakingIndicator.classList.add("hidden");
    }
  }
}

// ==========================================
// 音声認識 (Web Speech API)
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
  if (!state.recognition) {
    alert("お使いのブラウザは音声入力に対応していません。SafariまたはChromeをご利用ください。");
    return;
  }
  if (state.isRecording) {
    state.recognition.stop();
  } else {
    try {
      state.recognition.start();
    } catch (e) {
      console.warn("Voice start error:", e);
    }
  }
}

function stopVoiceRecognition() {
  state.isRecording = false;
  elements.btnVoiceInput.classList.remove("recording");
}

// ==========================================
// メモ管理機能
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
    elements.memoActiveList.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:8px 4px;">保管中のメモはありません</div>';
  } else {
    activeMemos.forEach(memo => {
      elements.memoActiveList.appendChild(createMemoItemDOM(memo));
    });
  }

  elements.memoArchivedList.innerHTML = "";
  if (archivedMemos.length === 0) {
    elements.memoArchivedList.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:8px 4px;">アーカイブされたメモはありません</div>';
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
// Kumapy 連携 (Google Sheets CSV/JSON fetch)
// ==========================================
async function fetchKumapySchedule() {
  elements.kumapyText.textContent = "Kumapyタスクを確認中...";
  elements.kumapyIcon.textContent = "⏳";

  let sheetId = state.kumapyUrl.trim();
  const match = sheetId.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match) {
    sheetId = match[1];
  }

  if (!sheetId) {
    elements.kumapyText.textContent = "スプレッドシートID未設定";
    elements.kumapyIcon.textContent = "⚠️";
    return;
  }

  // Google Sheets 公開CSVエンドポイント (gviz/tq)
  const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=CalendarEventsKumapy`;

  try {
    const res = await fetch(csvUrl);
    if (!res.ok) throw new Error("Fetch failed");
    const csvText = await res.text();
    parseKumapyCSV(csvText);
  } catch (err) {
    console.warn("Kumapy CSV Fetch failed:", err);
    elements.kumapyText.textContent = "タスク: 予定を取得できませんでした（IDまたは公開設定を確認）";
    elements.kumapyIcon.textContent = "📌";
  }
}

function parseKumapyCSV(csv) {
  const lines = csv.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length <= 1) {
    elements.kumapyText.textContent = "進行中のタスクはありません（自由時間！）";
    elements.kumapyIcon.textContent = "☕";
    return;
  }

  // 直近の予定（2行目以降）を抽出
  const firstRow = lines[1].split(",").map(cell => cell.replace(/^"|"$/g, ""));
  const summary = firstRow[1] || firstRow[0] || "タスク作業";
  const startTime = firstRow[2] || "";

  elements.kumapyText.textContent = `次: ${summary} ${startTime ? `(${startTime})` : ""}`;
  elements.kumapyIcon.textContent = "🎯";
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
  addMessage("bot", "設定を保存したよ！ありがとう！");
}
