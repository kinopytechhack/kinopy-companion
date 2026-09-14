// ==========================================================================
// Kinopy Companion PWA - Main Logic (iOS Audio & Cloud Sync Optimized)
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

const DEFAULT_SYNC_GAS_URL = "https://script.google.com/macros/s/AKfycbwaT8iCLLVBU_IT65V3_fvrChkuvGIwgdRiEB_EJCcEmRHvH10kIabTHNV9arcJUKUa3g/exec";

// 状態管理
const savedSyncUrl = localStorage.getItem("companion_sync_gas_url");
const syncGasUrl = (!savedSyncUrl || savedSyncUrl.includes("AKfycbx") || savedSyncUrl.includes("AKfycbz")) ? DEFAULT_SYNC_GAS_URL : savedSyncUrl;
localStorage.setItem("companion_sync_gas_url", syncGasUrl);

const state = {
  geminiApiKey: localStorage.getItem("gemini_api_key") || "",
  geminiEnabled: localStorage.getItem("gemini_enabled") !== "false",
  kumapyUrl: localStorage.getItem("kumapy_url") || "1o8uRj0hzSBLGNelHzW3H3FDPHIKdOH3C9Zj8eg2wDiU",
  syncGasUrl: syncGasUrl, // クラウド同期用GAS URL
  voiceEnabled: localStorage.getItem("voice_enabled") !== "false",
  voiceSpeaker: localStorage.getItem("voice_speaker") || "11",
  voicePitch: parseFloat(localStorage.getItem("voice_pitch") || "1.0"),
  voiceRate: parseFloat(localStorage.getItem("voice_rate") || "1.0"),
  memos: JSON.parse(localStorage.getItem("companion_memos") || "[]"),
  
  // トークン消費集計
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
  isSpeaking: false,
  audioUnlocked: false,
  sharedAudio: new Audio()
};

// 録音
let mediaRecorder = null;
let audioChunks = [];
let audioStream = null;

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
  companionSyncUrlInput: document.getElementById("companion-sync-url"),
  syncStatusBadge: document.getElementById("sync-status-badge"),
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
  fetchKumapyTasks();
  setInterval(fetchKumapyTasks, 30 * 1000);
  
  // クラウド同期（GAS経由）
  syncFromCloud();

  // iOS オーディオアンロック (タップ・タッチ時に確実に準備)
  const unlockEvents = ["touchstart", "touchend", "click", "keydown"];
  const unlocker = () => {
    unlockAudioContext();
  };
  unlockEvents.forEach(evt => document.addEventListener(evt, unlocker, { passive: true }));
});

// iOS Safari オーディオアンロック
function unlockAudioContext() {
  if (state.audioUnlocked) return;
  state.audioUnlocked = true;

  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") {
      ctx.resume();
    }
    // 空の無音WAVを再生してHTMLMediaElementを完全アンロック
    state.sharedAudio.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
    state.sharedAudio.play().then(() => {
      state.sharedAudio.pause();
    }).catch(() => {});

    // iOS SpeechSynthesisのアンロック
    if ("speechSynthesis" in window) {
      const silent = new SpeechSynthesisUtterance(" ");
      silent.volume = 0.01;
      window.speechSynthesis.speak(silent);
    }
  } catch (e) {
    console.warn("Audio unlock warning:", e);
  }
}

// ==========================================
// トークン消費集計
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
  state.geminiApiKey = localStorage.getItem("gemini_api_key") || "";
  state.geminiEnabled = localStorage.getItem("gemini_enabled") !== "false";
  state.kumapyUrl = localStorage.getItem("kumapy_url") || "1o8uRj0hzSBLGNelHzW3H3FDPHIKdOH3C9Zj8eg2wDiU";
  state.syncGasUrl = localStorage.getItem("companion_sync_gas_url") || DEFAULT_SYNC_GAS_URL;
  state.voiceEnabled = localStorage.getItem("voice_enabled") !== "false";
  state.voiceSpeaker = localStorage.getItem("voice_speaker") || "11";
  state.voicePitch = parseFloat(localStorage.getItem("voice_pitch") || "1.0");
  state.voiceRate = parseFloat(localStorage.getItem("voice_rate") || "1.0");

  if (elements.geminiApiToggle) elements.geminiApiToggle.checked = state.geminiEnabled;
  if (elements.geminiApiKey) elements.geminiApiKey.value = state.geminiApiKey;
  if (elements.kumapyUrlInput) elements.kumapyUrlInput.value = state.kumapyUrl;
  if (elements.companionSyncUrlInput) elements.companionSyncUrlInput.value = state.syncGasUrl;
  if (elements.voiceToggle) elements.voiceToggle.checked = state.voiceEnabled;
  if (elements.voiceSpeaker) elements.voiceSpeaker.value = state.voiceSpeaker;
  if (elements.voicePitch) elements.voicePitch.value = state.voicePitch;
  if (elements.voiceRate) elements.voiceRate.value = state.voiceRate;
  if (elements.pitchVal) elements.pitchVal.textContent = state.voicePitch.toFixed(1);
  if (elements.rateVal) elements.rateVal.textContent = state.voiceRate.toFixed(1);
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
  // 送信（クリック）
  elements.btnSend.addEventListener("click", () => {
    unlockAudioContext();
    handleUserSend();
  });

  // テキスト入力のEnterキー送信（IME変換中を正しく除外＆確実にクリア）
  elements.userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      if (e.isComposing) return; // IME確定中は送信しない
      e.preventDefault();
      unlockAudioContext();
      handleUserSend();
    }
  });

  // 音声録音（トグル式マイク）
  elements.btnVoiceInput.addEventListener("click", () => {
    unlockAudioContext();
    toggleVoiceRecording();
  });

  // 設定パネル
  elements.btnSettingsToggle.addEventListener("click", () => {
    loadSettingsToUI();
    elements.settingsPanel.classList.remove("hidden");
  });
  elements.btnSettingsClose.addEventListener("click", () => {
    saveSettings(false);
    elements.settingsPanel.classList.add("hidden");
  });
  elements.btnSaveSettings.addEventListener("click", () => saveSettings(true));

  // APIキーのリアルタイム自動保存
  const syncApiKey = (e) => {
    state.geminiApiKey = e.target.value.trim();
    localStorage.setItem("gemini_api_key", state.geminiApiKey);
    updateBadgeState();
  };
  elements.geminiApiKey.addEventListener("input", syncApiKey);
  elements.geminiApiKey.addEventListener("change", syncApiKey);
  elements.geminiApiKey.addEventListener("blur", syncApiKey);

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
    unlockAudioContext();
    speak("きのぴぃ、いつもお疲れさま！今日も一緒にととのっていこうね。");
  });

  // クイックアクションボタン
  document.querySelectorAll(".quick-actions-left .quick-icon-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      unlockAudioContext();
      const action = btn.dataset.action;
      handleQuickAction(action);
    });
  });

  // ヘッダーアバタータップ
  elements.headerAvatarBtn.addEventListener("click", () => {
    unlockAudioContext();
    const greetings = [
      "サウナハット被っていつでもスタンバイOKだよ！",
      "無理しすぎないで、たまにはサウナで汗流してリフレッシュしよ！",
      "きのぴぃ、今取り組んでるタスク、順調？",
      "ひと休みするならぼくに言ってね。タイマーも測れるよ！"
    ];
    const picked = greetings[Math.floor(Math.random() * greetings.length)];
    addMessageBubble("bot", picked, null, true);
    speak(picked);
  });

  // チャット検索
  initChatSearchEvents();
}

// ==========================================
// 音声録音 ＆ iOS対応
// ==========================================
async function toggleVoiceRecording() {
  unlockAudioContext();
  if (state.isRecording) {
    stopVoiceRecording();
  } else {
    await startVoiceRecording();
  }
}

async function startVoiceRecording() {
  if (state.isRecording) return;

  try {
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.isRecording = true;
    elements.btnVoiceInput.classList.add("recording");
    elements.listeningIndicator.classList.remove("hidden");

    audioChunks = [];

    // iOS WebKit / Chrome / Safari 対応のMIME判定
    let mimeType = "";
    if (typeof MediaRecorder !== "undefined") {
      if (MediaRecorder.isTypeSupported("audio/mp4")) {
        mimeType = "audio/mp4";
      } else if (MediaRecorder.isTypeSupported("audio/webm")) {
        mimeType = "audio/webm";
      } else if (MediaRecorder.isTypeSupported("audio/aac")) {
        mimeType = "audio/aac";
      }
    }

    const options = mimeType ? { mimeType } : {};
    mediaRecorder = new MediaRecorder(audioStream, options);

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        audioChunks.push(e.data);
      }
    };

    mediaRecorder.onstop = async () => {
      state.isRecording = false;
      elements.btnVoiceInput.classList.remove("recording");
      elements.listeningIndicator.classList.add("hidden");

      if (audioStream) {
        audioStream.getTracks().forEach(t => t.stop());
        audioStream = null;
      }

      if (audioChunks.length === 0) return;
      const actualType = mimeType || "audio/mp4";
      const audioBlob = new Blob(audioChunks, { type: actualType });
      await processRecordedAudio(audioBlob, actualType);
    };

    mediaRecorder.start();

  } catch (err) {
    console.error("Microphone error:", err);
    state.isRecording = false;
    elements.btnVoiceInput.classList.remove("recording");
    elements.listeningIndicator.classList.add("hidden");

    // Web Speech API フォールバック試行
    tryWebSpeechRecognition();
  }
}

function tryWebSpeechRecognition() {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    alert("マイクが利用できません。iPhoneの「設定 > Safari > マイク」をご確認ください。");
    return;
  }

  const rec = new SpeechRec();
  rec.lang = "ja-JP";
  rec.interimResults = false;
  rec.continuous = false;

  rec.onstart = () => {
    state.isRecording = true;
    elements.btnVoiceInput.classList.add("recording");
    elements.listeningIndicator.classList.remove("hidden");
  };

  rec.onresult = (e) => {
    const text = e.results[0][0].transcript;
    elements.userInput.value = text;
    handleUserSend();
  };

  rec.onerror = (e) => {
    console.warn("SpeechRec error:", e);
    state.isRecording = false;
    elements.btnVoiceInput.classList.remove("recording");
    elements.listeningIndicator.classList.add("hidden");
  };

  rec.onend = () => {
    state.isRecording = false;
    elements.btnVoiceInput.classList.remove("recording");
    elements.listeningIndicator.classList.add("hidden");
  };

  try {
    rec.start();
  } catch (e) {
    console.warn("Rec start error:", e);
  }
}

function stopVoiceRecording() {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
  } else {
    state.isRecording = false;
    elements.btnVoiceInput.classList.remove("recording");
    elements.listeningIndicator.classList.add("hidden");
    if (audioStream) {
      audioStream.getTracks().forEach(t => t.stop());
      audioStream = null;
    }
  }
}

async function processRecordedAudio(audioBlob, mimeType) {
  elements.aiStatusIndicator.textContent = "✨ 音声を解析中...";
  elements.aiStatusIndicator.classList.remove("hidden");

  if (state.geminiApiKey && state.geminiEnabled) {
    try {
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        try {
          const base64Data = reader.result.split(",")[1];
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${encodeURIComponent(state.geminiApiKey)}`;

          const prompt = `ユーザー（きのぴぃ）からの音声録音メッセージです。
以下の手順で処理してください：
1. 音声からユーザーが発言した言葉を正確に文字起こししてください (userText)。無音や聞き取れない場合は「（聞き取れませんでした）」としてください。
2. その発言に対し、きのぴぃの専属相棒（親友×執事）として優しく親身に1〜2文（60文字以内）で返答してください (replyText)。
   - 呼び方：必ず「きのぴぃ」（さん付け不要）
   - トーン：丁寧＋親友（「〜ですね」「〜ですよ」「〜しましょうか」）
   - スタンス：進んでいる時はスマートに後押しし、疲れている・ダメな時こそ正論を言わず全力で寄り添い肯定してください。`;

          const payload = {
            contents: [{
              role: "user",
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: mimeType.split(";")[0] || "audio/mp4",
                    data: base64Data
                  }
                }
              ]
            }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 1000,
              response_mime_type: "application/json",
              response_schema: {
                type: "OBJECT",
                properties: {
                  userText: { type: "STRING" },
                  replyText: { type: "STRING" }
                },
                required: ["userText", "replyText"]
              }
            }
          };

          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });

          const data = await res.json();
          elements.aiStatusIndicator.classList.add("hidden");

          if (data.usageMetadata && data.usageMetadata.totalTokenCount) {
            recordTokenUsage(data.usageMetadata.totalTokenCount);
          }

          const rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawJson) {
            const parsed = JSON.parse(rawJson);
            if (parsed.userText && parsed.userText !== "（聞き取れませんでした）") {
              addMessageBubble("user", parsed.userText, null, true);
            }
            if (parsed.replyText) {
              addMessageBubble("bot", parsed.replyText, null, true);
              speak(parsed.replyText);
            }
          }
        } catch (e) {
          console.error("Audio Gemini parse error:", e);
          elements.aiStatusIndicator.classList.add("hidden");
          const fallback = "うまく聞き取れなかったみたい。もう一度話しかけてね！";
          addMessageBubble("bot", fallback, null, true);
          speak(fallback);
        }
      };
    } catch (err) {
      console.error("Audio process error:", err);
      elements.aiStatusIndicator.classList.add("hidden");
    }
  } else {
    elements.aiStatusIndicator.classList.add("hidden");
    const msg = "音声入力を賢く使うには、設定（⚙️）からGemini API Keyを設定してね！";
    addMessageBubble("bot", msg, null, true);
    speak(msg);
  }
}

// ==========================================
// 音声合成 (VOICEVOX ＆ iOS Web Speech 最適化)
// ==========================================
async function speak(text) {
  if (!state.voiceEnabled) return;

  unlockAudioContext();

  if (state.sharedAudio) {
    state.sharedAudio.pause();
  }
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }

  // VOICEVOX が選択されている場合
  if (state.voiceSpeaker !== "os") {
    try {
      await speakWithVoicevox(text, state.voiceSpeaker);
      return;
    } catch (err) {
      console.warn("VOICEVOX failed, fallback to Web Speech:", err);
    }
  }

  // OS標準音声フォールバック
  speakWithWebSpeech(text);
}

async function speakWithVoicevox(text, speakerId) {
  const cleanText = text.replace(/[*_#`]/g, "").slice(0, 150);
  const webApiUrl = `https://api.tts.quest/v3/voicevox/synthesis?text=${encodeURIComponent(cleanText)}&speaker=${speakerId}`;

  const res = await fetch(webApiUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const audioUrl = data.mp3StreamingUrl || data.mp3DownloadUrl || data.audioStatusUrl;

  if (!audioUrl) throw new Error("No audio URL");

  return new Promise((resolve, reject) => {
    state.sharedAudio.src = audioUrl;
    state.sharedAudio.playbackRate = state.voiceRate;

    state.sharedAudio.onplay = () => {
      state.isSpeaking = true;
      elements.speakingIndicator.classList.remove("hidden");
    };

    state.sharedAudio.onended = () => {
      state.isSpeaking = false;
      elements.speakingIndicator.classList.add("hidden");
      resolve();
    };

    state.sharedAudio.onerror = (e) => {
      state.isSpeaking = false;
      elements.speakingIndicator.classList.add("hidden");
      reject(e);
    };

    state.sharedAudio.play().catch(reject);
  });
}

function speakWithWebSpeech(text) {
  if (!("speechSynthesis" in window)) return;

  const cleanText = text.replace(/[*_#`]/g, "");
  const uttr = new SpeechSynthesisUtterance(cleanText);
  uttr.lang = "ja-JP";
  uttr.pitch = state.voicePitch;
  uttr.rate = state.voiceRate;

  const voices = window.speechSynthesis.getVoices();
  const jpVoice = voices.find(v => v.lang.includes("ja") || v.lang.includes("JP"));
  if (jpVoice) uttr.voice = jpVoice;

  uttr.onstart = () => {
    state.isSpeaking = true;
    elements.speakingIndicator.classList.remove("hidden");
  };

  uttr.onend = () => {
    state.isSpeaking = false;
    elements.speakingIndicator.classList.add("hidden");
  };

  uttr.onerror = () => {
    state.isSpeaking = false;
    elements.speakingIndicator.classList.add("hidden");
  };

  window.speechSynthesis.speak(uttr);
}

// ==========================================
// チャット検索機能
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
// 過去ログ読み込み & タイムライン構築
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

  // 1. 最上部に過去ログ読み込みボタン
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
  senderEl.textContent = role === "user" ? "きのぴぃ" : "コンパニオン君";

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

  // アクション行 (右下寄せ)
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

    // GASクラウド (Google Drive / Vault) への非同期同期
    syncAppendLogToGas(role, text, timeStr);
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

  // 入力欄を完全にクリア
  elements.userInput.value = "";
  elements.userInput.style.height = "auto";

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
  elements.aiStatusIndicator.textContent = "✨ Gemini 思考中...";
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
      speak(errReply);
      return;
    }

    const candidate = data.candidates && data.candidates[0];
    const replyText = candidate?.content?.parts?.[0]?.text || "（返答を生成できませんでした）";

    if (data.usageMetadata && data.usageMetadata.totalTokenCount) {
      recordTokenUsage(data.usageMetadata.totalTokenCount);
    }

    addMessageBubble("bot", replyText, null, true);
    speak(replyText);

  } catch (err) {
    elements.aiStatusIndicator.classList.add("hidden");
    console.error("Fetch Gemini error:", err);
    const fallbackReply = "通信環境が不安定みたい。でもぼくはいつでもきのぴぃの味方だよ！";
    addMessageBubble("bot", fallbackReply, null, true);
    speak(fallbackReply);
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
  speak(reply);
}

function handleSpecialCommands(text) {
  if (text.startsWith("メモ:") || text.startsWith("メモ：") || text.startsWith("memo:")) {
    const memoBody = text.replace(/^(メモ[:：]|memo:)\s*/i, "").trim();
    if (memoBody) {
      addMemo(memoBody);
      const reply = `メモ「${memoBody}」を保管したよ！📋ボタンからいつでも確認・管理できるよ。`;
      addMessageBubble("bot", reply, null, true);
      speak(reply);
      return true;
    }
  }

  const timerMatch = text.match(/(\d+)\s*(分|min)/i);
  if (timerMatch && (text.includes("タイマー") || text.includes("測って") || text.includes("はかって"))) {
    const minutes = parseInt(timerMatch[1], 10);
    startTimer(minutes);
    const reply = `${minutes}分タイマーをセットしたよ！集中して、終わったらチャイムで教えるね。`;
    addMessageBubble("bot", reply, null, true);
    speak(reply);
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
      speak(msg);
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

  // GASクラウド同期
  syncSaveMemoToGas(content);
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
// Kumapy スプレッドシート連携
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
function saveSettings(showBubble = true) {
  state.geminiEnabled = elements.geminiApiToggle.checked;
  state.geminiApiKey = elements.geminiApiKey.value.trim();
  state.kumapyUrl = elements.kumapyUrlInput.value.trim();
  if (elements.companionSyncUrlInput) {
    state.syncGasUrl = elements.companionSyncUrlInput.value.trim() || DEFAULT_SYNC_GAS_URL;
  }
  state.voiceEnabled = elements.voiceToggle.checked;
  state.voiceSpeaker = elements.voiceSpeaker.value;
  state.voicePitch = parseFloat(elements.voicePitch.value);
  state.voiceRate = parseFloat(elements.voiceRate.value);

  localStorage.setItem("gemini_enabled", state.geminiEnabled);
  localStorage.setItem("gemini_api_key", state.geminiApiKey);
  localStorage.setItem("kumapy_url", state.kumapyUrl);
  localStorage.setItem("companion_sync_gas_url", state.syncGasUrl);
  localStorage.setItem("voice_enabled", state.voiceEnabled);
  localStorage.setItem("voice_speaker", state.voiceSpeaker);
  localStorage.setItem("voice_pitch", state.voicePitch);
  localStorage.setItem("voice_rate", state.voiceRate);

  updateBadgeState();
  if (showBubble) {
    elements.settingsPanel.classList.add("hidden");
    addMessageBubble("bot", "設定を保存したよ！ありがとう！", null, true);
  }
  fetchKumapyTasks();

  // クラウドにも設定を同期
  syncSaveSettingsToGas({
    geminiApiKey: state.geminiApiKey,
    geminiEnabled: state.geminiEnabled,
    voiceEnabled: state.voiceEnabled,
    voiceSpeaker: state.voiceSpeaker,
    voicePitch: state.voicePitch,
    voiceRate: state.voiceRate,
    kumapyUrl: state.kumapyUrl
  });
}

// ==========================================
// クラウド同期 (GAS / Google Drive)
// ==========================================

/**
 * 起動時にクラウド（GAS）から設定・ログ・メモを同期取得
 */
async function syncFromCloud() {
  if (!state.syncGasUrl) return;
  const todayYmd = getTodayYmd();
  console.log("☁️ Syncing with GAS cloud...", state.syncGasUrl);

  // 1. クラウド設定の取得 (APIキー・声の設定等がクラウド側にあれば自動適用)
  try {
    const res = await fetch(`${state.syncGasUrl}?action=getSettings`);
    const data = await res.json();
    if (data && data.success && data.settings) {
      const s = data.settings;
      let needUpdateUI = false;

      // Gemini API Key
      if (s.geminiApiKey && s.geminiApiKey !== state.geminiApiKey) {
        state.geminiApiKey = s.geminiApiKey;
        localStorage.setItem("gemini_api_key", s.geminiApiKey);
        needUpdateUI = true;
      }
      if (typeof s.geminiEnabled === "boolean" && s.geminiEnabled !== state.geminiEnabled) {
        state.geminiEnabled = s.geminiEnabled;
        localStorage.setItem("gemini_enabled", s.geminiEnabled.toString());
        needUpdateUI = true;
      }

      // 声の設定同期 (VOICEVOX スピーカー / 高さ / 速度 / ON/OFF)
      if (s.voiceSpeaker && s.voiceSpeaker !== state.voiceSpeaker) {
        state.voiceSpeaker = s.voiceSpeaker;
        localStorage.setItem("voice_speaker", s.voiceSpeaker);
        needUpdateUI = true;
      }
      if (typeof s.voicePitch === "number" && s.voicePitch !== state.voicePitch) {
        state.voicePitch = s.voicePitch;
        localStorage.setItem("voice_pitch", s.voicePitch.toString());
        needUpdateUI = true;
      }
      if (typeof s.voiceRate === "number" && s.voiceRate !== state.voiceRate) {
        state.voiceRate = s.voiceRate;
        localStorage.setItem("voice_rate", s.voiceRate.toString());
        needUpdateUI = true;
      }
      if (typeof s.voiceEnabled === "boolean" && s.voiceEnabled !== state.voiceEnabled) {
        state.voiceEnabled = s.voiceEnabled;
        localStorage.setItem("voice_enabled", s.voiceEnabled.toString());
        needUpdateUI = true;
      }

      // Kumapy
      if (s.kumapyUrl && s.kumapyUrl !== state.kumapyUrl) {
        state.kumapyUrl = s.kumapyUrl;
        localStorage.setItem("kumapy_url", s.kumapyUrl);
        needUpdateUI = true;
      }

      if (needUpdateUI) {
        loadSettingsToUI();
        updateBadgeState();
      }
    }
  } catch (err) {
    console.warn("Cloud settings sync skipped/failed:", err);
  }

  // 2. 本日の会話ログの取得＆マージ
  try {
    const res = await fetch(`${state.syncGasUrl}?action=getLogs&date=${todayYmd}`);
    const data = await res.json();
    if (data && data.success && Array.isArray(data.messages) && data.messages.length > 0) {
      const localLogs = JSON.parse(localStorage.getItem(`companion_chat_${todayYmd}`) || "[]");
      if (data.messages.length > localLogs.length) {
        // クラウド側が最新・またはMacでの発言が含まれている場合はタイムライン再描画
        console.log(`☁️ Synced ${data.messages.length} messages from cloud.`);
        localStorage.setItem(`companion_chat_${todayYmd}`, JSON.stringify(data.messages));
        
        // タイムラインを再描画
        elements.chatTimeline.innerHTML = "";
        if (loadPrevContainerEl) {
          elements.chatTimeline.appendChild(loadPrevContainerEl);
        }
        elements.chatTimeline.appendChild(createDateSeparatorElement(formatDateLabel(new Date())));
        state.conversationHistory = [];
        data.messages.forEach(msg => {
          elements.chatTimeline.appendChild(createMessageBubbleElement(msg.role, msg.text, msg.time));
          state.conversationHistory.push({ role: msg.role === "user" ? "user" : "model", text: msg.text });
        });
        updateLoadPrevButton();
        scrollToBottom();
      }
    }
  } catch (err) {
    console.warn("Cloud logs sync skipped/failed:", err);
  }

  // 3. メモの同期取得＆マージ
  try {
    const res = await fetch(`${state.syncGasUrl}?action=getMemos&date=${todayYmd}`);
    const data = await res.json();
    if (data && data.success && Array.isArray(data.memos) && data.memos.length > 0) {
      let memoAdded = false;
      data.memos.forEach(cm => {
        if (!state.memos.some(m => m.text === cm.text)) {
          state.memos.unshift({
            id: cm.id || Date.now().toString(),
            text: cm.text,
            date: cm.dateTime || new Date().toLocaleDateString("ja-JP"),
            archived: cm.checked
          });
          memoAdded = true;
        }
      });
      if (memoAdded) {
        saveMemos();
      }
    }
  } catch (err) {
    console.warn("Cloud memos sync skipped/failed:", err);
  }
}

/**
 * 会話メッセージをGAS経由でVault（Google Drive）へ追記
 */
function syncAppendLogToGas(role, text, timeStr) {
  if (!state.syncGasUrl || !text) return;
  const todayYmd = getTodayYmd();
  const speaker = role === "user" ? "きのぴィ" : "相棒 (雀松朱司)";

  const payload = {
    action: "appendLog",
    date: todayYmd,
    role: role,
    speaker: speaker,
    text: text,
    time: timeStr || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  };

  try {
    // simple POST (text/plain + mode: no-cors で確実にGASへ届ける)
    fetch(state.syncGasUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(payload)
    }).catch(err => {
      console.warn("syncAppendLogToGas POST error, trying GET fallback:", err);
      // GETフォールバック
      const params = new URLSearchParams(payload);
      fetch(`${state.syncGasUrl}?${params.toString()}`, { mode: "no-cors" }).catch(() => {});
    });
  } catch (e) {
    console.warn("syncAppendLogToGas exception:", e);
  }
}

/**
 * メモをGAS経由でVaultへ保存
 */
function syncSaveMemoToGas(memoText, timeStr) {
  if (!state.syncGasUrl || !memoText) return;
  const todayYmd = getTodayYmd();
  const payload = {
    action: "saveMemo",
    date: todayYmd,
    text: memoText,
    time: timeStr || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  };

  try {
    fetch(state.syncGasUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(payload)
    }).catch(err => {
      const params = new URLSearchParams(payload);
      fetch(`${state.syncGasUrl}?${params.toString()}`, { mode: "no-cors" }).catch(() => {});
    });
  } catch (e) {
    console.warn("syncSaveMemoToGas error:", e);
  }
}

/**
 * 設定をGAS経由でクラウド保存
 */
function syncSaveSettingsToGas(settingsObj) {
  if (!state.syncGasUrl || !settingsObj) return;
  const payload = {
    action: "saveSettings",
    settings: settingsObj
  };

  try {
    fetch(state.syncGasUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(payload)
    }).catch(err => {
      const params = new URLSearchParams({
        action: "saveSettings",
        settings: JSON.stringify(settingsObj)
      });
      fetch(`${state.syncGasUrl}?${params.toString()}`, { mode: "no-cors" }).catch(() => {});
    });
  } catch (e) {
    console.warn("syncSaveSettingsToGas error:", e);
  }
}
