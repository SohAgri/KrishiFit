const STORAGE_KEY = 'krishifit_state_v2';
const WATER_GOAL_ML = 4000;
const WATER_GOAL_L = (WATER_GOAL_ML / 1000).toFixed(2);
const STREAK_THRESHOLD = 0.6;
const PERCENT_MULTIPLIER = 100;
const MAX_STREAK_DAYS = 365;
const QUOTES = [
  'Discipline beats motivation when motivation fades.',
  'Small steps every day build massive results.',
  'Progress, not perfection.',
  'Consistency turns routines into results.',
  'You are one habit away from a better life.',
  'Focus on today. Repeat tomorrow.',
  'Every healthy choice is a vote for your future self.'
];

const DEFAULT_ROUTINES = [
  {
    id: 'morning',
    name: 'Morning Routine',
    tasks: [
      { id: 'morning-water', text: 'Drink warm water', reminder: '' },
      { id: 'morning-stretch', text: '5-minute stretch', reminder: '' },
      { id: 'morning-plan', text: 'Plan the day', reminder: '' }
    ]
  },
  {
    id: 'workout',
    name: 'Workout',
    tasks: [
      { id: 'workout-warmup', text: 'Warm-up', reminder: '' },
      { id: 'workout-main', text: 'Main workout set', reminder: '' }
    ]
  },
  {
    id: 'abs',
    name: 'Abs Workout',
    tasks: [
      { id: 'abs-plank', text: 'Plank 60 seconds', reminder: '' },
      { id: 'abs-crunches', text: 'Crunches set', reminder: '' }
    ]
  },
  {
    id: 'belly-fat',
    name: 'Belly Fat Routine',
    tasks: [
      { id: 'belly-walk', text: '30-minute walk', reminder: '' },
      { id: 'belly-core', text: 'Core activation', reminder: '' }
    ]
  },
  {
    id: 'food',
    name: 'Food Tracker',
    tasks: [
      { id: 'food-breakfast', text: 'Log breakfast', reminder: '' },
      { id: 'food-lunch', text: 'Log lunch', reminder: '' },
      { id: 'food-dinner', text: 'Log dinner', reminder: '' }
    ]
  },
  {
    id: 'skincare',
    name: 'Skincare',
    tasks: [
      { id: 'skin-cleanse', text: 'Facewash', reminder: '' },
      { id: 'skin-moisturize', text: 'Moisturize', reminder: '' }
    ]
  },
  {
    id: 'study',
    name: 'Study',
    tasks: [
      { id: 'study-focus', text: 'Focused study session', reminder: '' },
      { id: 'study-review', text: 'Review notes', reminder: '' }
    ]
  },
  {
    id: 'night',
    name: 'Night Routine',
    tasks: [
      { id: 'night-reflect', text: 'Reflect on the day', reminder: '' },
      { id: 'night-sleep', text: 'Sleep on time', reminder: '' }
    ]
  }
];

let state = loadState();
const today = todayISO();
let reminderTimers = new Map();

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  // JSON clone drops Dates/functions/undefined, so keep state JSON-serializable.
  return JSON.parse(JSON.stringify(value));
}

function createDefaultState() {
  return {
    routines: clone(DEFAULT_ROUTINES),
    days: {},
    settings: { theme: 'dark' }
  };
}

function loadState() {
  const base = createDefaultState();
  try {
    const savedRaw = localStorage.getItem(STORAGE_KEY);
    if (!savedRaw) return base;
    return normalizeState(JSON.parse(savedRaw), base);
  } catch (error) {
    console.error('Failed to load saved state', error);
    return base;
  }
}

function normalizeState(saved, base) {
  const normalized = {
    routines: [],
    days: {},
    settings: { theme: base.settings.theme }
  };

  const savedRoutines = Array.isArray(saved?.routines) ? saved.routines : [];
  const savedMap = new Map(savedRoutines.filter((r) => r && r.id).map((r) => [r.id, r]));

  base.routines.forEach((routine) => {
    const stored = savedMap.get(routine.id);
    normalized.routines.push(normalizeRoutine(stored || routine, routine));
  });

  savedRoutines
    .filter((routine) => routine && routine.id && !base.routines.find((r) => r.id === routine.id))
    .forEach((routine) => normalized.routines.push(normalizeRoutine(routine)));

  normalized.days = typeof saved?.days === 'object' && saved.days ? saved.days : {};
  Object.entries(normalized.days).forEach(([date, day]) => {
    if (!day || typeof day !== 'object') {
      delete normalized.days[date];
      return;
    }
    day.tasks = typeof day.tasks === 'object' && day.tasks ? day.tasks : {};
    day.waterMl = Number(day.waterMl) || 0;
    day.weight = day.weight ?? '';
    day.photo = day.photo ?? '';
  });

  if (saved?.settings?.theme === 'light' || saved?.settings?.theme === 'dark') {
    normalized.settings.theme = saved.settings.theme;
  }

  return normalized;
}

function normalizeRoutine(routine, fallback) {
  const id = routine?.id || fallback?.id || `routine-${uid()}`;
  const name = String(routine?.name || fallback?.name || 'Routine').trim() || 'Routine';
  const tasksSource = Array.isArray(routine?.tasks) ? routine.tasks : fallback?.tasks || [];
  const tasks = tasksSource
    .map((task) => ({
      id: task?.id || `task-${uid()}`,
      text: String(task?.text || '').trim(),
      reminder: typeof task?.reminder === 'string' ? task.reminder : ''
    }))
    .filter((task) => task.text);
  return { id, name, tasks };
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Failed to save state', error);
    showError('Unable to save progress. Check browser storage settings.');
  }
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function getDay(date = today) {
  if (!state.days[date]) {
    state.days[date] = { tasks: {}, waterMl: 0, weight: '', photo: '' };
  }
  return state.days[date];
}

function formatDate(iso) {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function formatLiters(ml) {
  return (ml / 1000).toFixed(2);
}

function getCompletion(date = today) {
  const day = getDay(date);
  let total = 0;
  let done = 0;
  state.routines.forEach((routine) => {
    routine.tasks.forEach((task) => {
      total += 1;
      if (day.tasks?.[routine.id]?.[task.id]) done += 1;
    });
  });
  const pct = total ? Math.round((done / total) * PERCENT_MULTIPLIER) : 0;
  return { total, done, pct };
}

function getMotivationMessage(pct) {
  if (pct >= 85) return 'Amazing consistency today!';
  if (pct >= 60) return 'Great momentum. Keep it going.';
  if (pct >= 35) return 'Small wins build big change.';
  return 'Start with one task and build your rhythm.';
}

function quoteOfDay() {
  const date = new Date(today);
  const start = new Date(date.getFullYear(), 0, 1);
  const diff = date - start;
  const dayNumber = Math.floor(diff / 86400000) + 1;
  return QUOTES[dayNumber % QUOTES.length];
}

function renderHome() {
  const day = getDay();
  const { total, done, pct } = getCompletion();
  document.getElementById('todayDate').textContent = formatDate(today);
  document.getElementById('motivation').textContent = getMotivationMessage(pct);
  document.getElementById('quote').textContent = `“${quoteOfDay()}”`;
  document.getElementById('taskSummary').textContent = `${done} / ${total}`;
  document.getElementById('completionPercent').textContent = `${pct}%`;
  document.getElementById('completionBar').style.width = `${pct}%`;
  document.getElementById('waterSummary').textContent = `${formatLiters(day.waterMl)} / ${WATER_GOAL_L}L`;

  const focusList = document.getElementById('todayFocus');
  focusList.innerHTML = '';
  const incomplete = [];
  state.routines.forEach((routine) => {
    routine.tasks.forEach((task) => {
      if (!day.tasks?.[routine.id]?.[task.id]) incomplete.push({ routine, task });
    });
  });

  if (!incomplete.length) {
    const li = document.createElement('li');
    li.className = 'empty-state';
    li.textContent = 'All tasks completed today. Great work!';
    focusList.appendChild(li);
    return;
  }

  incomplete.slice(0, 4).forEach(({ routine, task }) => {
    const li = document.createElement('li');
    li.textContent = `${task.text} · ${routine.name}`;
    focusList.appendChild(li);
  });
}

function renderRoutines() {
  const day = getDay();
  const list = document.getElementById('routineList');
  list.innerHTML = '';

  if (!state.routines.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No routines yet. Add your first routine in Settings.';
    list.appendChild(empty);
    return;
  }

  state.routines.forEach((routine) => {
    const card = document.createElement('div');
    card.className = 'card routine-card';
    card.dataset.routineId = routine.id;

    const header = document.createElement('div');
    header.className = 'routine-header';

    const title = document.createElement('h3');
    title.textContent = routine.name;

    const stats = document.createElement('span');
    const total = routine.tasks.length;
    const completed = routine.tasks.filter((task) => day.tasks?.[routine.id]?.[task.id]).length;
    stats.className = 'muted';
    stats.textContent = total ? `${completed} / ${total} done` : '0 tasks';

    header.appendChild(title);
    header.appendChild(stats);

    const taskList = document.createElement('div');
    taskList.className = 'task-list';

    if (!routine.tasks.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No tasks yet. Add your first habit.';
      taskList.appendChild(empty);
    }

    routine.tasks.forEach((task) => {
      const row = document.createElement('div');
      row.className = 'task-row';
      row.dataset.routineId = routine.id;
      row.dataset.taskId = task.id;

      const main = document.createElement('div');
      main.className = 'task-main';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = Boolean(day.tasks?.[routine.id]?.[task.id]);
      checkbox.dataset.routineId = routine.id;
      checkbox.dataset.taskId = task.id;

      const label = document.createElement('span');
      label.textContent = task.text;

      main.appendChild(checkbox);
      main.appendChild(label);

      const reminder = document.createElement('input');
      reminder.type = 'time';
      reminder.className = 'reminder-input';
      reminder.value = task.reminder || '';
      reminder.dataset.routineId = routine.id;
      reminder.dataset.taskId = task.id;
      reminder.title = 'Reminder time';

      const actions = document.createElement('div');
      actions.className = 'task-actions';

      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.textContent = 'Edit';
      editButton.dataset.action = 'edit-task';
      editButton.dataset.taskId = task.id;

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.textContent = 'Delete';
      deleteButton.dataset.action = 'delete-task';
      deleteButton.dataset.taskId = task.id;

      actions.appendChild(editButton);
      actions.appendChild(deleteButton);

      row.appendChild(main);
      row.appendChild(reminder);
      row.appendChild(actions);
      taskList.appendChild(row);
    });

    const addForm = document.createElement('div');
    addForm.className = 'inline-form';

    const input = document.createElement('input');
    input.placeholder = `Add task to ${routine.name}`;
    input.dataset.newTask = routine.id;

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.textContent = 'Add';
    addButton.dataset.action = 'add-task';

    addForm.appendChild(input);
    addForm.appendChild(addButton);

    card.appendChild(header);
    card.appendChild(taskList);
    card.appendChild(addForm);

    list.appendChild(card);
  });
}

function renderProgress() {
  const day = getDay();
  const { done } = getCompletion();
  document.getElementById('tasksDone').textContent = String(done);
  document.getElementById('dailyStreak').textContent = String(calcStreak());
  document.getElementById('weightToday').textContent = day.weight ? String(day.weight) : '--';
  document.getElementById('weightInput').value = day.weight;
  renderWeeklyChart();
  renderWeightLog();
}

function renderWeeklyChart() {
  const chart = document.getElementById('weeklyChart');
  chart.innerHTML = '';
  const now = new Date();

  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    const iso = date.toISOString().slice(0, 10);
    const { pct } = getCompletion(iso);
    const bar = document.createElement('div');
    bar.className = 'chart-bar';
    bar.style.height = `${Math.max(pct, 6)}%`;

    const value = document.createElement('strong');
    value.textContent = `${pct}%`;
    const label = document.createElement('span');
    label.textContent = iso.slice(5).replace('-', '/');

    bar.appendChild(value);
    bar.appendChild(label);
    chart.appendChild(bar);
  }
}

function renderWeightLog() {
  const log = document.getElementById('weightLog');
  log.innerHTML = '';
  const entries = Object.entries(state.days)
    .filter(([, day]) => day.weight)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 7);

  if (!entries.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No weight entries yet.';
    log.appendChild(empty);
    return;
  }

  entries.forEach(([date, day]) => {
    const row = document.createElement('div');
    const label = document.createElement('span');
    label.textContent = formatDate(date);
    const value = document.createElement('strong');
    value.textContent = `${day.weight} kg`;
    row.appendChild(label);
    row.appendChild(value);
    log.appendChild(row);
  });
}

function renderGallery() {
  const day = getDay();
  const todayPhoto = document.getElementById('todayPhoto');
  const removeBtn = document.getElementById('removePhoto');
  todayPhoto.innerHTML = '';

  if (day.photo) {
    const img = document.createElement('img');
    img.src = day.photo;
    img.alt = 'Today progress photo';
    todayPhoto.appendChild(img);
    removeBtn.classList.remove('hidden');
  } else {
    todayPhoto.textContent = 'No photo uploaded yet. Capture today to track progress.';
    removeBtn.classList.add('hidden');
  }

  const timeline = document.getElementById('photoTimeline');
  timeline.innerHTML = '';
  const photos = Object.entries(state.days)
    .filter(([, value]) => value.photo)
    .sort(([a], [b]) => b.localeCompare(a));

  if (!photos.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No progress photos yet.';
    timeline.appendChild(empty);
    return;
  }

  photos.forEach(([date, value]) => {
    const img = document.createElement('img');
    img.src = value.photo;
    img.alt = `Progress photo ${date}`;
    img.title = formatDate(date);
    timeline.appendChild(img);
  });
}

function renderSettings() {
  applyTheme();
  const manager = document.getElementById('routineManager');
  manager.innerHTML = '';

  state.routines.forEach((routine) => {
    const row = document.createElement('div');
    row.className = 'manager-row';
    row.dataset.routineId = routine.id;

    const input = document.createElement('input');
    input.value = routine.name;
    input.dataset.routineName = routine.id;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.dataset.action = 'delete-routine';
    remove.dataset.routineId = routine.id;

    row.appendChild(input);
    row.appendChild(remove);
    manager.appendChild(row);
  });
}

function refreshUI() {
  renderHome();
  renderRoutines();
  renderProgress();
  renderGallery();
  renderSettings();
}

function persistAndRefresh() {
  saveState();
  refreshUI();
  scheduleReminders();
}

function switchTab(tabId) {
  document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.id === tabId));
  document.querySelectorAll('.bottom-nav [data-tab]').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabId));
}

function calcStreak() {
  let streak = 0;
  const date = new Date(today);
  for (let i = 0; i < MAX_STREAK_DAYS; i += 1) {
    const iso = date.toISOString().slice(0, 10);
    if (!state.days[iso]) break;
    const { total, pct } = getCompletion(iso);
    if (!total || pct < STREAK_THRESHOLD * PERCENT_MULTIPLIER) break;
    streak += 1;
    date.setDate(date.getDate() - 1);
  }
  return streak;
}

function updateTaskCompletion(routineId, taskId, isDone) {
  const day = getDay();
  if (!day.tasks[routineId]) day.tasks[routineId] = {};
  day.tasks[routineId][taskId] = isDone;
}

function removeTaskFromDays(routineId, taskId) {
  Object.values(state.days).forEach((day) => {
    if (day.tasks?.[routineId]) delete day.tasks[routineId][taskId];
  });
}

function removeRoutineFromDays(routineId) {
  Object.values(state.days).forEach((day) => {
    if (day.tasks?.[routineId]) delete day.tasks[routineId];
  });
}

function handleRoutineClick(event) {
  const action = event.target.dataset.action;
  if (!action) return;
  const card = event.target.closest('[data-routine-id]');
  if (!card) return;
  const routineId = card.dataset.routineId;
  const routine = state.routines.find((r) => r.id === routineId);
  if (!routine) return;

  if (action === 'add-task') {
    const input = card.querySelector('[data-new-task]');
    const value = input?.value.trim();
    if (!value) return;
    routine.tasks.push({ id: `task-${uid()}`, text: value, reminder: '' });
    if (input) input.value = '';
    persistAndRefresh();
  }

  if (action === 'edit-task') {
    const taskId = event.target.dataset.taskId;
    const task = routine.tasks.find((t) => t.id === taskId);
    if (!task) return;
    const next = prompt('Edit task', task.text);
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed) return;
    task.text = trimmed;
    persistAndRefresh();
  }

  if (action === 'delete-task') {
    const taskId = event.target.dataset.taskId;
    const task = routine.tasks.find((t) => t.id === taskId);
    if (!task) return;
    if (!confirm('Delete this task?')) return;
    routine.tasks = routine.tasks.filter((t) => t.id !== taskId);
    removeTaskFromDays(routineId, taskId);
    persistAndRefresh();
  }
}

function handleRoutineChange(event) {
  const routineId = event.target.dataset.routineId;
  const taskId = event.target.dataset.taskId;
  if (!routineId || !taskId) return;
  const routine = state.routines.find((r) => r.id === routineId);
  const task = routine?.tasks.find((t) => t.id === taskId);
  if (!task) return;

  if (event.target.type === 'checkbox') {
    updateTaskCompletion(routineId, taskId, event.target.checked);
    persistAndRefresh();
  }

  if (event.target.type === 'time') {
    task.reminder = event.target.value;
    saveState();
    scheduleReminders();
  }
}

function handleRoutineKeydown(event) {
  if (event.key !== 'Enter') return;
  if (!event.target.matches('[data-new-task]')) return;
  const routineId = event.target.dataset.newTask;
  const routine = state.routines.find((r) => r.id === routineId);
  if (!routine) return;
  const value = event.target.value.trim();
  if (!value) return;
  routine.tasks.push({ id: `task-${uid()}`, text: value, reminder: '' });
  event.target.value = '';
  persistAndRefresh();
}

function handleRoutineManagerInput(event) {
  if (!event.target.matches('[data-routine-name]')) return;
  const routineId = event.target.dataset.routineName;
  const routine = state.routines.find((r) => r.id === routineId);
  if (!routine) return;
  const value = event.target.value.trim();
  routine.name = value || 'Routine';
  saveState();
  renderRoutines();
}

function handleRoutineManagerClick(event) {
  if (event.target.dataset.action !== 'delete-routine') return;
  const routineId = event.target.dataset.routineId;
  const routine = state.routines.find((r) => r.id === routineId);
  if (!routine) return;
  if (!confirm(`Remove ${routine.name}?`)) return;
  state.routines = state.routines.filter((r) => r.id !== routineId);
  removeRoutineFromDays(routineId);
  persistAndRefresh();
}

function scheduleReminders() {
  reminderTimers.forEach((timerId) => clearTimeout(timerId));
  reminderTimers.clear();

  const now = new Date();
  state.routines.forEach((routine) => {
    routine.tasks.forEach((task) => {
      if (!task.reminder) return;
      const parts = task.reminder.split(':');
      if (parts.length !== 2) return;
      const [hours, minutes] = parts.map(Number);
      if (Number.isNaN(hours) || Number.isNaN(minutes)) return;
      const target = new Date();
      target.setHours(hours, minutes, 0, 0);
      if (target < now) target.setDate(target.getDate() + 1);
      const delay = target - now;
      const id = setTimeout(() => {
        notify(`${task.text} · ${routine.name}`);
        scheduleReminders();
      }, delay);
      reminderTimers.set(`${routine.id}-${task.id}`, id);
    });
  });
}

function notify(message) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification('KrishiFit Reminder', { body: message });
      return;
    } catch (error) {
      console.error('Notification failed', error);
    }
  }
  alert(`KrishiFit reminder: ${message}`);
}

function applyTheme() {
  const theme = state.settings.theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  const toggle = document.getElementById('themeToggle');
  const toggleInput = document.getElementById('themeToggleInput');
  toggle.textContent = theme === 'dark' ? '🌙' : '☀️';
  toggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  toggleInput.checked = theme === 'dark';
}

function toggleTheme() {
  state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
  saveState();
  applyTheme();
}

function showError(message) {
  const banner = document.getElementById('errorBanner');
  banner.textContent = `${message} If you have access to developer tools, check the console for details.`;
  banner.classList.remove('hidden');
}

function bindEvents() {
  document.querySelectorAll('.bottom-nav [data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.querySelectorAll('[data-jump]').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.jump));
  });

  document.querySelectorAll('[data-water]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const day = getDay();
      day.waterMl += Number(btn.dataset.water);
      persistAndRefresh();
    });
  });

  const routineList = document.getElementById('routineList');
  routineList.addEventListener('click', handleRoutineClick);
  routineList.addEventListener('change', handleRoutineChange);
  routineList.addEventListener('keydown', handleRoutineKeydown);

  document.getElementById('weightInput').addEventListener('input', (event) => {
    getDay().weight = event.target.value;
    saveState();
    renderProgress();
  });

  document.getElementById('photoInput').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    getDay().photo = dataUrl;
    event.target.value = '';
    persistAndRefresh();
  });

  document.getElementById('removePhoto').addEventListener('click', () => {
    getDay().photo = '';
    persistAndRefresh();
  });

  document.getElementById('addRoutine').addEventListener('click', () => {
    const input = document.getElementById('newRoutineInput');
    const name = input.value.trim();
    if (!name) return;
    state.routines.push({ id: `routine-${uid()}`, name, tasks: [] });
    input.value = '';
    persistAndRefresh();
  });

  const routineManager = document.getElementById('routineManager');
  routineManager.addEventListener('input', handleRoutineManagerInput);
  routineManager.addEventListener('click', handleRoutineManagerClick);

  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  document.getElementById('themeToggleInput').addEventListener('change', toggleTheme);

  document.getElementById('enableNotifications').addEventListener('click', async () => {
    if (!('Notification' in window)) {
      alert('Notifications are not supported in this browser.');
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      alert('Notifications are blocked. Enable them in browser settings.');
      return;
    }
    alert('Notifications enabled! Reminders will use them when possible.');
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function init() {
  bindEvents();
  refreshUI();
  scheduleReminders();
}

window.addEventListener('error', (event) => {
  console.error('Runtime error', event.error || event.message);
  const detail = event.message ? event.message.replace(/\.+$/, '') : '';
  const message = detail ? `App error: ${detail}.` : 'App error encountered.';
  showError(message);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled rejection', event.reason);
  const reason = event.reason?.message || event.reason;
  const detail = reason ? String(reason).replace(/\.+$/, '') : '';
  const message = detail ? `App error: ${detail}.` : 'App error encountered.';
  showError(message);
});

window.addEventListener('DOMContentLoaded', () => {
  try {
    init();
  } catch (error) {
    console.error('Failed to initialize app', error);
    const detail = error?.message ? error.message.replace(/\.+$/, '') : '';
    showError(detail ? `Unable to start the app: ${detail}.` : 'Unable to start the app.');
  }
});
