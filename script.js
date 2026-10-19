// Web Audio API Synthesizer Sound Generator
class SoundManager {
  constructor() {
    this.ctx = null;
  }

  initContext() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.ctx = new AudioContext();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Pleasant bell / chime sound on completion
  playAlarm(volume = 0.7) {
    this.initContext();
    if (!this.ctx) return;

    const chords = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 arpeggio
    chords.forEach((freq, index) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime + index * 0.12);

      const startTime = this.ctx.currentTime + index * 0.12;
      const duration = 1.2;

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(volume * 0.4, startTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration);
    });
  }

  // Soft mechanical tick sound for seconds
  playTick(volume = 0.3) {
    this.initContext();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1200, this.ctx.currentTime);

    gain.gain.setValueAtTime(volume * 0.05, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.03);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.03);
  }
}

// App State & Core Logic
const PomodoroApp = {
  // Config & State
  soundManager: new SoundManager(),
  circleRadius: 140,
  circumference: 2 * Math.PI * 140, // ~879.64

  currentMode: 'pomodoro', // 'pomodoro' | 'shortBreak' | 'longBreak'
  isRunning: false,
  timerInterval: null,
  timeLeft: 25 * 60,
  totalTime: 25 * 60,
  completedPomodoros: 0,

  settings: {
    pomodoro: 25,
    shortBreak: 5,
    longBreak: 15,
    longBreakInterval: 4,
    autoStartBreaks: false,
    autoStartPomodoros: false,
    soundEnabled: true,
    tickSoundEnabled: false,
    soundVolume: 0.7,
  },

  tasks: [],

  // DOM Elements
  elements: {},

  init() {
    this.loadState();
    this.cacheDom();
    this.setupProgressRing();
    this.bindEvents();
    this.renderMode(this.currentMode);
    this.renderTasks();
    this.renderTracker();
    this.applySettingsToUI();
  },

  cacheDom() {
    this.elements = {
      body: document.body,
      timeDisplay: document.getElementById('timeDisplay'),
      sessionStatus: document.getElementById('sessionStatus'),
      progressCircle: document.getElementById('progressCircle'),
      startPauseBtn: document.getElementById('startPauseBtn'),
      skipBtn: document.getElementById('skipBtn'),
      resetBtn: document.getElementById('resetBtn'),
      modeTabs: document.querySelectorAll('.tab-btn'),
      tomatoIcons: document.getElementById('tomatoIcons'),
      sessionCountText: document.getElementById('sessionCountText'),
      themeToggleBtn: document.getElementById('themeToggleBtn'),
      settingsBtn: document.getElementById('settingsBtn'),
      settingsModal: document.getElementById('settingsModal'),
      closeSettingsBtn: document.getElementById('closeSettingsBtn'),
      saveSettingsBtn: document.getElementById('saveSettingsBtn'),
      testSoundBtn: document.getElementById('testSoundBtn'),
      requestNotifBtn: document.getElementById('requestNotifBtn'),
      // Settings Inputs
      pomodoroTimeInput: document.getElementById('pomodoroTimeInput'),
      shortBreakTimeInput: document.getElementById('shortBreakTimeInput'),
      longBreakTimeInput: document.getElementById('longBreakTimeInput'),
      longBreakIntervalInput: document.getElementById('longBreakIntervalInput'),
      autoStartBreaks: document.getElementById('autoStartBreaks'),
      autoStartPomodoros: document.getElementById('autoStartPomodoros'),
      soundEnabled: document.getElementById('soundEnabled'),
      tickSoundEnabled: document.getElementById('tickSoundEnabled'),
      soundVolume: document.getElementById('soundVolume'),
      // Task elements
      taskForm: document.getElementById('taskForm'),
      taskInput: document.getElementById('taskInput'),
      taskList: document.getElementById('taskList'),
      taskStats: document.getElementById('taskStats')
    };
  },

  setupProgressRing() {
    this.elements.progressCircle.style.strokeDasharray = `${this.circumference} ${this.circumference}`;
    this.elements.progressCircle.style.strokeDashoffset = '0';
  },

  bindEvents() {
    // Timer Control Buttons
    this.elements.startPauseBtn.addEventListener('click', () => this.toggleStartPause());
    this.elements.resetBtn.addEventListener('click', () => this.resetTimer());
    this.elements.skipBtn.addEventListener('click', () => this.skipSession());

    // Mode Tabs
    this.elements.modeTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        const mode = e.currentTarget.dataset.mode;
        if (mode !== this.currentMode) {
          this.switchMode(mode);
        }
      });
    });

    // Theme Toggle
    this.elements.themeToggleBtn.addEventListener('click', () => this.toggleTheme());

    // Settings Modal
    this.elements.settingsBtn.addEventListener('click', () => this.openSettings());
    this.elements.closeSettingsBtn.addEventListener('click', () => this.closeSettings());
    this.elements.settingsModal.addEventListener('click', (e) => {
      if (e.target === this.elements.settingsModal) this.closeSettings();
    });
    this.elements.saveSettingsBtn.addEventListener('click', () => this.saveSettings());
    this.elements.testSoundBtn.addEventListener('click', () => {
      const vol = this.elements.soundVolume.value / 100;
      this.soundManager.playAlarm(vol);
    });
    this.elements.requestNotifBtn.addEventListener('click', () => this.requestNotificationPermission());

    // Tasks
    this.elements.taskForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.addTask();
    });

    // Page Visibility check (ensure timer stays accurate)
    document.addEventListener('visibilitychange', () => {
      // Keep accurate on return
      if (!document.hidden && this.isRunning) {
        this.updateDisplay();
      }
    });
  },

  // State Management
  loadState() {
    try {
      const savedSettings = localStorage.getItem('pomodoro_settings');
      if (savedSettings) {
        this.settings = { ...this.settings, ...JSON.parse(savedSettings) };
      }

      const savedCount = localStorage.getItem('pomodoro_completed_count');
      if (savedCount !== null) {
        this.completedPomodoros = parseInt(savedCount, 10) || 0;
      }

      const savedTasks = localStorage.getItem('pomodoro_tasks');
      if (savedTasks) {
        this.tasks = JSON.parse(savedTasks);
      }

      const isDarkMode = localStorage.getItem('pomodoro_dark_mode') === 'true';
      if (isDarkMode) {
        document.body.classList.add('dark-mode');
      }
    } catch (e) {
      console.warn('Failed to load saved state from localStorage:', e);
    }
  },

  saveState() {
    try {
      localStorage.setItem('pomodoro_settings', JSON.stringify(this.settings));
      localStorage.setItem('pomodoro_completed_count', this.completedPomodoros.toString());
      localStorage.setItem('pomodoro_tasks', JSON.stringify(this.tasks));
      localStorage.setItem('pomodoro_dark_mode', document.body.classList.contains('dark-mode'));
    } catch (e) {
      console.warn('Failed to save state to localStorage:', e);
    }
  },

  // Timer Mechanics
  switchMode(mode, autoStart = false) {
    this.pauseTimer();
    this.currentMode = mode;

    // Determine duration
    const minutes = this.settings[mode] || 25;
    this.timeLeft = minutes * 60;
    this.totalTime = this.timeLeft;

    this.renderMode(mode);
    this.updateDisplay();

    if (autoStart) {
      this.startTimer();
    }
  },

  renderMode(mode) {
    // Update tabs active state
    this.elements.modeTabs.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.mode === mode);
    });

    // Update body theme classes
    this.elements.body.classList.remove('mode-pomodoro', 'mode-shortBreak', 'mode-longBreak');
    this.elements.body.classList.add(`mode-${mode}`);

    // Update session status message
    if (mode === 'pomodoro') {
      this.elements.sessionStatus.textContent = '집중할 시간입니다! 🔥';
    } else if (mode === 'shortBreak') {
      this.elements.sessionStatus.textContent = '잠시 스트레칭하며 쉬어가세요 ☕';
    } else {
      this.elements.sessionStatus.textContent = '수고하셨어요! 푹 쉬세요 🌿';
    }

    this.updateDisplay();
  },

  toggleStartPause() {
    this.soundManager.initContext();
    if (this.isRunning) {
      this.pauseTimer();
    } else {
      this.startTimer();
    }
  },

  startTimer() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.elements.startPauseBtn.textContent = '일시정지';
    this.elements.startPauseBtn.classList.add('running');

    this.timerInterval = setInterval(() => {
      if (this.timeLeft > 0) {
        this.timeLeft--;
        if (this.settings.tickSoundEnabled) {
          this.soundManager.playTick(this.settings.soundVolume);
        }
        this.updateDisplay();
      } else {
        this.handleSessionCompletion();
      }
    }, 1000);
  },

  pauseTimer() {
    this.isRunning = false;
    clearInterval(this.timerInterval);
    this.elements.startPauseBtn.textContent = '시작';
    this.elements.startPauseBtn.classList.remove('running');
  },

  resetTimer() {
    this.pauseTimer();
    const minutes = this.settings[this.currentMode] || 25;
    this.timeLeft = minutes * 60;
    this.totalTime = this.timeLeft;
    this.updateDisplay();
  },

  skipSession() {
    if (confirm('현재 세션을 건너뛰고 다음 세션으로 넘어가시겠습니까?')) {
      this.handleSessionCompletion(false);
    }
  },

  handleSessionCompletion(countAsCompleted = true) {
    this.pauseTimer();

    if (this.settings.soundEnabled) {
      this.soundManager.playAlarm(this.settings.soundVolume);
    }

    let nextMode = 'pomodoro';
    let alertMsg = '';

    if (this.currentMode === 'pomodoro') {
      if (countAsCompleted) {
        this.completedPomodoros++;
        this.renderTracker();
        this.saveState();
      }

      // Check if long break interval reached
      const isLongBreak = (this.completedPomodoros % this.settings.longBreakInterval === 0);
      nextMode = isLongBreak ? 'longBreak' : 'shortBreak';
      alertMsg = isLongBreak
        ? '🎉 뽀모도로 세션 완료! 충분한 긴 휴식을 취하세요.'
        : '🎉 뽀모도로 세션 완료! 짧은 휴식을 취하세요.';

      this.sendNotification('집중 시간 완료!', alertMsg);
      this.switchMode(nextMode, this.settings.autoStartBreaks);
    } else {
      // Completed break
      nextMode = 'pomodoro';
      alertMsg = '휴식이 끝났습니다! 다시 집중해볼까요? 🍅';
      this.sendNotification('휴식 완료!', alertMsg);
      this.switchMode(nextMode, this.settings.autoStartPomodoros);
    }
  },

  updateDisplay() {
    const minutes = Math.floor(this.timeLeft / 60);
    const seconds = this.timeLeft % 60;
    const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    this.elements.timeDisplay.textContent = formattedTime;

    // Document title update
    const modeName = this.currentMode === 'pomodoro' ? '집중' : '휴식';
    document.title = `(${formattedTime}) ${modeName} - 뽀모타이머`;

    // Circular progress ring update
    const progress = this.totalTime > 0 ? (this.timeLeft / this.totalTime) : 0;
    const offset = this.circumference * (1 - progress);
    this.elements.progressCircle.style.strokeDashoffset = offset;
  },

  renderTracker() {
    this.elements.tomatoIcons.innerHTML = '';
    const displayCount = Math.min(this.completedPomodoros, 8);
    for (let i = 0; i < displayCount; i++) {
      const span = document.createElement('span');
      span.className = 'tomato-icon';
      span.textContent = '🍅';
      this.elements.tomatoIcons.appendChild(span);
    }
    this.elements.sessionCountText.textContent = `${this.completedPomodoros}개`;
  },

  // Notification API
  requestNotificationPermission() {
    if (!('Notification' in window)) {
      alert('이 브라우저는 데스크톱 알림을 지원하지 않습니다.');
      return;
    }
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        alert('알림 권한이 허용되었습니다! 타이머가 끝나면 알림을 보내드립니다.');
      } else {
        alert('알림 권한이 거부되었거나 보류되었습니다.');
      }
    });
  },

  sendNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body: body,
          icon: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🍅</text></svg>'
        });
      } catch (e) {
        console.warn('Failed to dispatch notification:', e);
      }
    }
  },

  // Theme Toggle
  toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    this.elements.themeToggleBtn.querySelector('.theme-icon').textContent = isDark ? '☀️' : '🌙';
    this.saveState();
  },

  // Settings Modal logic
  openSettings() {
    this.elements.pomodoroTimeInput.value = this.settings.pomodoro;
    this.elements.shortBreakTimeInput.value = this.settings.shortBreak;
    this.elements.longBreakTimeInput.value = this.settings.longBreak;
    this.elements.longBreakIntervalInput.value = this.settings.longBreakInterval;
    this.elements.autoStartBreaks.checked = this.settings.autoStartBreaks;
    this.elements.autoStartPomodoros.checked = this.settings.autoStartPomodoros;
    this.elements.soundEnabled.checked = this.settings.soundEnabled;
    this.elements.tickSoundEnabled.checked = this.settings.tickSoundEnabled;
    this.elements.soundVolume.value = Math.round(this.settings.soundVolume * 100);

    this.elements.settingsModal.classList.remove('hidden');
  },

  closeSettings() {
    this.elements.settingsModal.classList.add('hidden');
  },

  saveSettings() {
    this.settings.pomodoro = parseInt(this.elements.pomodoroTimeInput.value, 10) || 25;
    this.settings.shortBreak = parseInt(this.elements.shortBreakTimeInput.value, 10) || 5;
    this.settings.longBreak = parseInt(this.elements.longBreakTimeInput.value, 10) || 15;
    this.settings.longBreakInterval = parseInt(this.elements.longBreakIntervalInput.value, 10) || 4;
    this.settings.autoStartBreaks = this.elements.autoStartBreaks.checked;
    this.settings.autoStartPomodoros = this.elements.autoStartPomodoros.checked;
    this.settings.soundEnabled = this.elements.soundEnabled.checked;
    this.settings.tickSoundEnabled = this.elements.tickSoundEnabled.checked;
    this.settings.soundVolume = (parseInt(this.elements.soundVolume.value, 10) || 70) / 100;

    this.applySettingsToUI();
    this.saveState();
    this.closeSettings();

    // Reset current mode timer with new setting if not running
    if (!this.isRunning) {
      this.resetTimer();
    }
  },

  applySettingsToUI() {
    // Update tab texts
    this.elements.modeTabs[0].textContent = `집중 (${this.settings.pomodoro}분)`;
    this.elements.modeTabs[1].textContent = `짧은 휴식 (${this.settings.shortBreak}분)`;
    this.elements.modeTabs[2].textContent = `긴 휴식 (${this.settings.longBreak}분)`;
    const isDark = document.body.classList.contains('dark-mode');
    this.elements.themeToggleBtn.querySelector('.theme-icon').textContent = isDark ? '☀️' : '🌙';
  },

  // Task List Management
  addTask() {
    const text = this.elements.taskInput.value.trim();
    if (!text) return;

    const newTask = {
      id: Date.now(),
      text: text,
      completed: false
    };

    this.tasks.push(newTask);
    this.elements.taskInput.value = '';
    this.renderTasks();
    this.saveState();
  },

  toggleTask(id) {
    this.tasks = this.tasks.map(task =>
      task.id === id ? { ...task, completed: !task.completed } : task
    );
    this.renderTasks();
    this.saveState();
  },

  deleteTask(id) {
    this.tasks = this.tasks.filter(task => task.id !== id);
    this.renderTasks();
    this.saveState();
  },

  renderTasks() {
    this.elements.taskList.innerHTML = '';
    const completedCount = this.tasks.filter(t => t.completed).length;
    this.elements.taskStats.textContent = `${completedCount}/${this.tasks.length} 완료`;

    if (this.tasks.length === 0) {
      this.elements.taskList.innerHTML = `
        <li style="text-align: center; color: var(--text-muted); padding: 16px 0; font-size: 0.88rem;">
          오늘 집중해서 완수할 목표를 등록해보세요! 🎯
        </li>
      `;
      return;
    }

    this.tasks.forEach(task => {
      const li = document.createElement('li');
      li.className = `task-item ${task.completed ? 'completed' : ''}`;

      const leftDiv = document.createElement('div');
      leftDiv.className = 'task-left';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'task-checkbox';
      checkbox.checked = task.completed;
      checkbox.addEventListener('change', () => this.toggleTask(task.id));

      const title = document.createElement('span');
      title.className = 'task-title';
      title.textContent = task.text;
      title.addEventListener('click', () => this.toggleTask(task.id));

      leftDiv.appendChild(checkbox);
      leftDiv.appendChild(title);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-task-btn';
      deleteBtn.innerHTML = '🗑️';
      deleteBtn.title = '삭제';
      deleteBtn.addEventListener('click', () => this.deleteTask(task.id));

      li.appendChild(leftDiv);
      li.appendChild(deleteBtn);
      this.elements.taskList.appendChild(li);
    });
  }
};

// Initialize app when DOM loaded
document.addEventListener('DOMContentLoaded', () => {
  PomodoroApp.init();
});
