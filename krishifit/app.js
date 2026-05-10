const STORAGE_KEY = 'krishifit_v1';
const WATER_GOAL_ML = 4000;
const defaults = {
  settings: {
    length: 60,
    startDate: new Date().toISOString().slice(0, 10),
    workoutList: ['Running', 'Push-ups', 'Squats', 'Plank', 'Leg Raises', 'Abs workout', 'Gym session'],
    skincare: {
      morning: ['Cleanser', 'Moisturizer', 'Sunscreen'],
      night: ['Facewash', 'Gulab Jal', 'Moisturizer']
    },
    reminders: { workout: '', water: '', skincare: '', sleep: '' }
  },
  days: {}
};

let state = loadState();
let currentDate = todayISO();
let weeklyChart;
let deferredPrompt;
let reminderTimer;

/**
 * LocalStorage structure:
 * {
 *   settings: { length, startDate, workoutList[], skincare:{morning[],night[]}, reminders:{...} },
 *   days: {
 *     'YYYY-MM-DD': {
 *       workout:{checked:{name:boolean}, reps:{name:string}},
 *       food:{breakfast,lunch,dinner,snacks},
 *       waterMl:number,
 *       skincare:{morningChecked:{item:boolean}, nightChecked:{item:boolean}},
 *       progress:{weight, waist},
 *       photo:dataUrl
 *     }
 *   }
 * }
 */
function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return structuredClone(defaults);
  try {
    return mergeState(JSON.parse(saved));
  } catch {
    return structuredClone(defaults);
  }
}

function mergeState(saved) {
  return {
    settings: {
      ...defaults.settings,
      ...saved.settings,
      skincare: {
        morning: saved.settings?.skincare?.morning?.length ? saved.settings.skincare.morning : defaults.settings.skincare.morning,
        night: saved.settings?.skincare?.night?.length ? saved.settings.skincare.night : defaults.settings.skincare.night
      },
      reminders: { ...defaults.settings.reminders, ...(saved.settings?.reminders || {}) }
    },
    days: saved.days || {}
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function getDayData(date = currentDate) {
  if (!state.days[date]) {
    state.days[date] = {
      workout: { checked: {}, reps: {} },
      food: { breakfast: '', lunch: '', dinner: '', snacks: '' },
      waterMl: 0,
      skincare: { morningChecked: {}, nightChecked: {} },
      progress: { weight: '', waist: '' },
      photo: ''
    };
  }
  return state.days[date];
}

function daysSinceStart() {
  const start = new Date(state.settings.startDate);
  const now = new Date(currentDate);
  return Math.floor((now - start) / 86400000) + 1;
}

function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max);
}

function percent(n) {
  return `${Math.round(n)}%`;
}

function calcWorkoutPct(day) {
  const list = state.settings.workoutList;
  if (!list.length) return 0;
  const done = list.filter((name) => day.workout.checked[name]).length;
  return (done / list.length) * 100;
}

function calcSkinPct(day) {
  const m = state.settings.skincare.morning;
  const n = state.settings.skincare.night;
  const total = m.length + n.length;
  if (!total) return 0;
  const done = [...m.filter((x) => day.skincare.morningChecked[x]), ...n.filter((x) => day.skincare.nightChecked[x])].length;
  return (done / total) * 100;
}

function calcWaterPct(day) {
  return clamp((day.waterMl / WATER_GOAL_ML) * 100, 0, 100);
}

function calcDailyCompletion(day) {
  return (calcWorkoutPct(day) + calcSkinPct(day) + calcWaterPct(day)) / 3;
}

/**
 * Streak calculation logic:
 * iterates backward from current selected date and counts continuous completed days
 * for workout/skincare/water criteria separately.
 */
function calcStreak(type) {
  let streak = 0;
  let date = new Date(currentDate);
  while (true) {
    const iso = date.toISOString().slice(0, 10);
    const d = state.days[iso];
    if (!d) break;
    const met =
      type === 'workout' ? calcWorkoutPct(d) >= 60 :
      type === 'water' ? d.waterMl >= WATER_GOAL_ML :
      calcSkinPct(d) >= 60;
    if (!met) break;
    streak += 1;
    date.setDate(date.getDate() - 1);
  }
  return streak;
}

/** Workout logging system:
 * each exercise checkbox writes boolean completion to day.workout.checked[name]
 * optional reps/distance value stored in day.workout.reps[name].
 */
function renderWorkout() {
  const day = getDayData();
  const wrap = document.getElementById('workoutList');
  wrap.innerHTML = '';
  state.settings.workoutList.forEach((name) => {
    const row = document.createElement('label');
    row.className = 'check-item';
    row.innerHTML = `
      <input type="checkbox" ${day.workout.checked[name] ? 'checked' : ''} data-workout="${escapeAttr(name)}" />
      <span>${name}</span>
      <input placeholder="reps/km" value="${escapeAttr(day.workout.reps[name] || '')}" data-reps="${escapeAttr(name)}" />`;
    wrap.appendChild(row);
  });
  document.getElementById('workoutBar').style.width = percent(calcWorkoutPct(day));
}

function renderSkincare() {
  const day = getDayData();
  const make = (items, target, key) => {
    const wrap = document.getElementById(target);
    wrap.innerHTML = '';
    items.forEach((name) => {
      const checked = day.skincare[key][name];
      const row = document.createElement('label');
      row.className = 'check-item';
      row.innerHTML = `<input type="checkbox" data-skin="${key}" data-item="${escapeAttr(name)}" ${checked ? 'checked' : ''}><span>${name}</span><span></span>`;
      wrap.appendChild(row);
    });
  };
  make(state.settings.skincare.morning, 'skinMorning', 'morningChecked');
  make(state.settings.skincare.night, 'skinNight', 'nightChecked');
}

function renderFood() {
  const day = getDayData();
  document.querySelectorAll('[data-food]').forEach((el) => {
    el.value = day.food[el.dataset.food] || '';
  });
}

function renderWater() {
  const day = getDayData();
  document.getElementById('waterText').textContent = `${(day.waterMl / 1000).toFixed(2)} / 4L`;
  document.getElementById('sumWater').textContent = `${(day.waterMl / 1000).toFixed(2)} / 4L`;
  document.getElementById('waterBar').style.width = percent(calcWaterPct(day));
}

function renderProgress() {
  const day = getDayData();
  document.getElementById('weightInput').value = day.progress.weight;
  document.getElementById('waistInput').value = day.progress.waist;
}

function renderDashboard() {
  const day = getDayData();
  const dayNumber = clamp(daysSinceStart(), 1, state.settings.length);
  document.getElementById('dayCounter').textContent = `Day ${dayNumber} / ${state.settings.length}`;

  const daily = calcDailyCompletion(day);
  const circ = 2 * Math.PI * 52;
  const ring = document.getElementById('dailyRing');
  ring.style.strokeDasharray = `${circ}`;
  ring.style.strokeDashoffset = `${circ - (daily / 100) * circ}`;
  document.getElementById('dailyPct').textContent = percent(daily);

  document.getElementById('sumWorkout').textContent = percent(calcWorkoutPct(day));
  document.getElementById('sumSkin').textContent = percent(calcSkinPct(day));
  document.getElementById('score').textContent = String(calcTransformationScore(day));
  document.getElementById('motivation').textContent = motivationalMessage(daily);
}

function calcTransformationScore(day) {
  const streakBonus = Math.min(calcStreak('workout') + calcStreak('water') + calcStreak('skincare'), 20);
  return Math.round(clamp((calcWorkoutPct(day) * 0.35) + (calcWaterPct(day) * 0.25) + (calcSkinPct(day) * 0.25) + streakBonus, 0, 100));
}

function motivationalMessage(daily) {
  if (daily >= 85) return 'Outstanding consistency. Keep transforming!';
  if (daily >= 60) return 'Great momentum. Stay disciplined.';
  if (daily >= 35) return 'You are building habits. Keep pushing!';
  return 'Small steps daily create big changes.';
}

function renderCalendar() {
  const wrap = document.getElementById('calendar');
  wrap.innerHTML = '';
  const start = new Date(state.settings.startDate);
  for (let i = 0; i < state.settings.length; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const day = state.days[iso];
    const cell = document.createElement('button');
    cell.className = 'day-cell';
    cell.textContent = String(i + 1);
    cell.title = iso;
    if (iso === currentDate) cell.classList.add('day-selected');
    if (!day) {
      cell.classList.add('day-future');
    } else {
      const done = calcDailyCompletion(day);
      cell.classList.add(done >= 75 ? 'day-green' : done >= 35 ? 'day-yellow' : 'day-red');
    }
    cell.addEventListener('click', () => {
      currentDate = iso;
      refreshUI();
    });
    wrap.appendChild(cell);
  }
}

function renderCoach() {
  const day = getDayData();
  const tips = [];
  tips.push(calcWorkoutPct(day) >= 60 ? 'You completed your workout today. Great discipline.' : 'Your workout is pending. Start with one exercise now.');
  tips.push(day.waterMl >= WATER_GOAL_ML ? 'Hydration goal achieved. Excellent consistency.' : 'You are behind on water intake. Drink one glass now.');
  tips.push(calcSkinPct(day) >= 60 ? 'Skincare routine done. Skin health compounds daily.' : 'Complete your skincare routine before sleep.');
  const totalStreak = calcStreak('workout');
  if (totalStreak >= 5) tips.push(`You have a ${totalStreak} day workout streak. Keep going.`);
  tips.push('Consistency creates transformation.');

  const list = document.getElementById('coachTips');
  list.innerHTML = '';
  tips.forEach((t) => {
    const li = document.createElement('li');
    li.textContent = t;
    list.appendChild(li);
  });

  document.getElementById('streakWorkout').textContent = String(calcStreak('workout'));
  document.getElementById('streakWater').textContent = String(calcStreak('water'));
  document.getElementById('streakSkin').textContent = String(calcStreak('skincare'));
}

/** Photo storage logic:
 * selected image is read as base64 DataURL and saved in day.photo within LocalStorage.
 */
function renderPhotos() {
  const timeline = document.getElementById('photoTimeline');
  timeline.innerHTML = '';
  const sorted = Object.entries(state.days)
    .filter(([, v]) => v.photo)
    .sort(([a], [b]) => a.localeCompare(b));

  sorted.forEach(([date, val]) => {
    const img = document.createElement('img');
    img.src = val.photo;
    img.alt = `Progress ${date}`;
    img.title = date;
    timeline.appendChild(img);
  });

  const first = sorted[0]?.[1]?.photo;
  const last = sorted.at(-1)?.[1]?.photo;
  const wrap = document.getElementById('compareWrap');
  const msg = document.getElementById('compareMsg');
  if (first && last && sorted.length >= 2) {
    wrap.classList.remove('hidden');
    msg.classList.add('hidden');
    document.getElementById('compareBase').src = first;
    document.getElementById('compareOverlay').src = last;
    updateCompareSlider();
  } else {
    wrap.classList.add('hidden');
    msg.classList.remove('hidden');
  }
}

function updateCompareSlider() {
  const value = Number(document.getElementById('compareSlider').value);
  document.getElementById('compareOverlayWrap').style.width = `${value}%`;
}

function renderChart() {
  const labels = [];
  const values = [];
  const date = new Date(currentDate);
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(date);
    d.setDate(date.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    labels.push(iso.slice(5));
    values.push(Math.round(calcDailyCompletion(state.days[iso] || getDayData(iso))));
  }

  if (weeklyChart) {
    weeklyChart.data.labels = labels;
    weeklyChart.data.datasets[0].data = values;
    weeklyChart.update();
    return;
  }

  weeklyChart = new Chart(document.getElementById('weeklyChart'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Completion %',
        data: values,
        borderColor: '#22d3ee',
        backgroundColor: 'rgba(34,211,238,0.2)',
        tension: 0.35,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#e5e7eb' } } },
      scales: { x: { ticks: { color: '#9ca3af' } }, y: { ticks: { color: '#9ca3af' }, min: 0, max: 100 } }
    }
  });
}

/** Reminder logic:
 * checks every 30s if current time matches configured reminder times,
 * then triggers browser Notification.
 */
function scheduleReminders() {
  clearInterval(reminderTimer);
  reminderTimer = setInterval(() => {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const messages = {
      workout: 'Time for your workout.',
      water: 'Drink water and stay hydrated.',
      skincare: 'Complete your skincare routine.',
      sleep: 'Wind down and sleep on time for recovery.'
    };

    Object.entries(state.settings.reminders).forEach(([key, time]) => {
      if (time && time === hhmm) notify(messages[key] || 'KrishiFit reminder');
    });
  }, 30000);
}

function notify(message) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') new Notification(message);
}

function bindEvents() {
  document.querySelectorAll('.bottom-nav [data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  document.querySelectorAll('[data-jump]').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.jump));
  });

  document.getElementById('quickWater').addEventListener('click', () => {
    const day = getDayData();
    day.waterMl += 250;
    persistAndRefresh();
  });
  document.getElementById('quickPhoto').addEventListener('click', () => switchTab('progress'));

  document.getElementById('workoutList').addEventListener('change', (e) => {
    const day = getDayData();
    if (e.target.matches('[data-workout]')) day.workout.checked[e.target.dataset.workout] = e.target.checked;
    if (e.target.matches('[data-reps]')) day.workout.reps[e.target.dataset.reps] = e.target.value;
    persistAndRefresh(false);
  });
  document.getElementById('workoutList').addEventListener('input', (e) => {
    const day = getDayData();
    if (e.target.matches('[data-reps]')) {
      day.workout.reps[e.target.dataset.reps] = e.target.value;
      saveState();
    }
  });

  document.getElementById('addExercise').addEventListener('click', () => {
    const input = document.getElementById('exerciseInput');
    const value = input.value.trim();
    if (!value || state.settings.workoutList.includes(value)) return;
    state.settings.workoutList.push(value);
    input.value = '';
    persistAndRefresh();
  });

  document.querySelectorAll('[data-food]').forEach((el) => {
    el.addEventListener('input', () => {
      const day = getDayData();
      day.food[el.dataset.food] = el.value;
      saveState();
    });
  });

  document.querySelectorAll('[data-water]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const day = getDayData();
      day.waterMl += Number(btn.dataset.water);
      persistAndRefresh(false);
    });
  });
  document.getElementById('waterReset').addEventListener('click', () => {
    getDayData().waterMl = 0;
    persistAndRefresh();
  });

  document.getElementById('skinMorning').addEventListener('change', (e) => {
    if (!e.target.matches('[data-skin]')) return;
    getDayData().skincare[e.target.dataset.skin][e.target.dataset.item] = e.target.checked;
    persistAndRefresh(false);
  });
  document.getElementById('skinNight').addEventListener('change', (e) => {
    if (!e.target.matches('[data-skin]')) return;
    getDayData().skincare[e.target.dataset.skin][e.target.dataset.item] = e.target.checked;
    persistAndRefresh(false);
  });

  document.getElementById('addMorning').addEventListener('click', () => addSkin('morning', 'morningInput'));
  document.getElementById('addNight').addEventListener('click', () => addSkin('night', 'nightInput'));

  document.getElementById('weightInput').addEventListener('input', (e) => {
    getDayData().progress.weight = e.target.value;
    saveState();
  });
  document.getElementById('waistInput').addEventListener('input', (e) => {
    getDayData().progress.waist = e.target.value;
    saveState();
  });

  document.getElementById('photoInput').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    getDayData().photo = dataUrl;
    e.target.value = '';
    persistAndRefresh();
  });
  document.getElementById('compareSlider').addEventListener('input', updateCompareSlider);

  document.getElementById('lengthInput').value = state.settings.length;
  document.getElementById('saveSettings').addEventListener('click', () => {
    const length = Number(document.getElementById('lengthInput').value);
    state.settings.length = clamp(length || 60, 7, 365);
    persistAndRefresh();
  });

  document.querySelectorAll('[data-reminder]').forEach((input) => {
    input.value = state.settings.reminders[input.dataset.reminder] || '';
  });
  document.getElementById('saveReminders').addEventListener('click', async () => {
    if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
    document.querySelectorAll('[data-reminder]').forEach((input) => {
      state.settings.reminders[input.dataset.reminder] = input.value;
    });
    persistAndRefresh();
    scheduleReminders();
  });

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('installBtn').hidden = false;
  });
  document.getElementById('installBtn').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    document.getElementById('installBtn').hidden = true;
  });
}

function addSkin(type, inputId) {
  const input = document.getElementById(inputId);
  const value = input.value.trim();
  const list = state.settings.skincare[type];
  if (!value || list.includes(value)) return;
  list.push(value);
  input.value = '';
  persistAndRefresh();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function switchTab(tabId) {
  document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.id === tabId));
  document.querySelectorAll('.bottom-nav [data-tab]').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabId));
}

function persistAndRefresh(withChart = true) {
  saveState();
  refreshUI(withChart);
}

function refreshUI(withChart = true) {
  renderDashboard();
  renderWorkout();
  renderFood();
  renderWater();
  renderSkincare();
  renderProgress();
  renderPhotos();
  renderCoach();
  renderCalendar();
  if (withChart) renderChart();
}

function escapeAttr(str) {
  return String(str).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js');
}

function init() {
  bindEvents();
  getDayData();
  refreshUI();
  scheduleReminders();
  registerServiceWorker();
}

window.addEventListener('DOMContentLoaded', init);
