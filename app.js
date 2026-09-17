const DAY_MS = 86_400_000;
const STORAGE = {
  started: 'code100.started',
  completed: 'code100.completed',
  theme: 'code100.theme'
};

const TRACKS = {
  beginner: { label: 'Beginner track', description: 'Build the basics', data: 'data/beginner-challenges.json', storage: 'code100.completed.beginner', started: 'code100.started.beginner' },
  advanced: { label: 'Advanced track', description: 'Level up your problem solving', data: 'data/challenges.json', storage: 'code100.completed.advanced', started: 'code100.started.advanced' }
};
const state = { track: 'advanced', challenges: [], completed: new Set(), unlocked: 1, activeDay: 1, unlockTimer: null };
const resourceState = { query: '', subject: 'All subjects', type: 'All types' };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function safeGet(key, fallback = null) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function safeSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* Progress is best-effort in private browsing. */ }
}
function escapeHTML(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}
function decodeHTML(value = '') {
  const node = document.createElement('textarea'); node.innerHTML = value; return node.value;
}
function formatDay(day) { return `Day ${String(day).padStart(2, '0')}`; }
function startDate() {
  const configured = window.CODE100_CONFIG?.cohortStartDate;
  if (configured && /^\d{4}-\d{2}-\d{2}$/.test(configured)) return new Date(`${configured}T00:00:00`);
  let started = safeGet(TRACKS[state.track].started) || (state.track === 'advanced' ? safeGet(STORAGE.started) : null);
  if (!started) { started = new Date().toISOString(); safeSet(TRACKS[state.track].started, started); }
  return new Date(started);
}
function calculateUnlocked() {
  const elapsed = Math.max(0, Date.now() - startDate().getTime());
  return Math.min(state.challenges.length, Math.floor(elapsed / DAY_MS) + 1);
}
function difficultyClass(value = '') { return value.toLowerCase().replace(/\s+/g, '-'); }

async function init() {
  const theme = safeGet(STORAGE.theme) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.body.classList.toggle('dark', theme === 'dark');
  const name = window.CODE100_CONFIG?.platformName || 'code4you';
  $$('[data-platform-name]').forEach(el => { el.textContent = name; });
  renderResources();

  bindEvents();
  await loadTrack('advanced');
}

function bindEvents() {
  $('#themeToggle').addEventListener('click', () => {
    document.body.classList.toggle('dark');
    safeSet(STORAGE.theme, document.body.classList.contains('dark') ? 'dark' : 'light');
  });
  $('#menuToggle').addEventListener('click', () => {
    const menu = $('#menuPopover');
    menu.hidden = !menu.hidden;
    $('#menuToggle').setAttribute('aria-expanded', String(!menu.hidden));
  });
  $('#openResources').addEventListener('click', () => {
    closeMenu();
    $('#resourcesDialog').showModal();
  });
  $('#openAttendance').addEventListener('click', () => {
    const attendance = (window.CODE100_CONFIG?.resources || []).find(resource => resource.group === 'Attendance & Timetable');
    if (!attendance?.url) {
      showToast('Attendance and timetable link is not available yet');
      return;
    }
    closeMenu();
    window.open(attendance.url, '_blank', 'noopener,noreferrer');
  });
  $('#resourceSearch').addEventListener('input', event => {
    resourceState.query = event.target.value.trim().toLowerCase();
    renderResources();
  });
  $('#resourceSubjects').addEventListener('click', event => {
    const button = event.target.closest('[data-resource-subject]');
    if (!button) return;
    resourceState.subject = button.dataset.resourceSubject;
    renderResources();
  });
  $('#resourceTypes').addEventListener('click', event => {
    const button = event.target.closest('[data-resource-type]');
    if (!button) return;
    resourceState.type = button.dataset.resourceType;
    renderResources();
  });
  $('#closeResources').addEventListener('click', closeResources);
  $('#resourcesDialog').addEventListener('close', closeResources);
  $('#resourcesDialog').addEventListener('click', event => {
    if (event.target === $('#resourcesDialog')) closeResources();
  });
  document.addEventListener('click', event => {
    if (!$('#menuPopover').hidden && !event.target.closest('.nav-actions')) closeMenu();
  });
  $('#continueButton').addEventListener('click', () => openChallenge(state.unlocked));
  $('#openToday').addEventListener('click', () => openChallenge(firstIncompleteUnlocked()));
  $('#closeDialog').addEventListener('click', () => $('#challengeDialog').close());
  $('#challengeDialog').addEventListener('click', e => { if (e.target === $('#challengeDialog')) $('#challengeDialog').close(); });
  $('#completeButton').addEventListener('click', toggleComplete);
  $('#solutionToggle').addEventListener('click', () => $('#solutionPanel').classList.toggle('open'));
  $('#prevChallenge').addEventListener('click', () => openChallenge(state.activeDay - 1));
  $('#nextChallenge').addEventListener('click', () => openChallenge(state.activeDay + 1));
  $$('.track-option').forEach(button => button.addEventListener('click', () => loadTrack(button.dataset.track)));
  document.addEventListener('keydown', e => {
    if (!$('#challengeDialog').open || ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    if (e.key === 'ArrowLeft' && state.activeDay > 1) openChallenge(state.activeDay - 1);
    if (e.key === 'ArrowRight' && state.activeDay < state.unlocked) openChallenge(state.activeDay + 1);
  });
}

function closeResources() {
  if ($('#resourcesDialog').open) $('#resourcesDialog').close();
}
function closeMenu() {
  $('#menuPopover').hidden = true;
  $('#menuToggle').setAttribute('aria-expanded', 'false');
}

function renderResources() {
  const resources = window.CODE100_CONFIG?.resources || [];
  const available = resources.filter(resource => resource.url && resource.group !== 'Attendance & Timetable');
  const subjectFor = resource => {
    const subject = (resource.group || 'General resources').split(' - ')[0];
    return subject === 'Networks' ? 'Computer Networks' : subject;
  };
  const categoryFor = resource => {
    if (resource.type === 'Video') return 'Videos';
    if (resource.type === 'PDF') return 'Notes';
    return 'Documentation';
  };
  const subjects = ['All subjects', ...new Set(available.map(subjectFor))];
  const types = ['All types', ...new Set(available.map(resource => resource.type || 'Resource'))];
  const matches = available.filter(resource => {
    const haystack = `${resource.group} ${resource.title} ${resource.description}`.toLowerCase();
    return (!resourceState.query || haystack.includes(resourceState.query))
      && (resourceState.subject === 'All subjects' || subjectFor(resource) === resourceState.subject)
      && (resourceState.type === 'All types' || (resource.type || 'Resource') === resourceState.type);
  });
  const grouped = matches.reduce((result, resource) => {
    const subject = subjectFor(resource);
    const category = categoryFor(resource);
    (result[subject] ||= {});
    (result[subject][category] ||= []).push(resource);
    return result;
  }, {});
  $('#resourceSubjects').innerHTML = subjects.map(subject => `<button class="resource-filter ${resourceState.subject === subject ? 'active' : ''}" data-resource-subject="${escapeHTML(subject)}" type="button">${escapeHTML(subject)}</button>`).join('');
  $('#resourceTypes').innerHTML = types.map(type => `<button class="resource-filter ${resourceState.type === type ? 'active' : ''}" data-resource-type="${escapeHTML(type)}" type="button">${escapeHTML(type)}</button>`).join('');
  $('#resourceList').innerHTML = matches.length ? Object.entries(grouped).map(([subject, categories]) => `
    <section class="resource-subject">
      <h3>${escapeHTML(subject)}</h3>
      ${Object.entries(categories).map(([category, items]) => `
        <div class="resource-category">
          <h4>${escapeHTML(category)}</h4>
          <div class="resource-set-links">
            ${items.map(resource => `
              <a class="resource-item" href="${escapeHTML(resource.url)}" target="_blank" rel="noopener noreferrer">
                <span class="resource-type resource-type-${escapeHTML((resource.type || 'resource').toLowerCase())}">${escapeHTML(resource.type || 'Resource')}</span>
                <span class="resource-copy"><strong>${escapeHTML(resource.title || 'Open resource')}</strong><small>${escapeHTML(resource.description || '')}</small></span>
                <span class="resource-arrow">↗</span>
              </a>`).join('')}
          </div>
        </div>`).join('')}
    </section>`).join('') : '<p class="resource-empty">No resources match your filters.</p>';
}

async function loadTrack(trackName) {
  const track = TRACKS[trackName];
  if (!track || trackName === state.track && state.challenges.length) return;
  const response = await fetch(track.data);
  if (!response.ok) {
    showToast(`${track.label} data is not available yet`);
    return;
  }
  state.track = trackName;
  state.challenges = (await response.json()).sort((a, b) => a.day - b.day);
  const savedProgress = safeGet(track.storage, trackName === 'advanced' ? safeGet(STORAGE.completed, '[]') : '[]');
  state.completed = new Set(JSON.parse(savedProgress).map(Number));
  state.unlocked = calculateUnlocked();
  state.activeDay = firstIncompleteUnlocked();
  $('#trackHeading').textContent = track.label;
  $$('.track-option').forEach(button => {
    const active = button.dataset.track === trackName;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  render();
}

function firstIncompleteUnlocked() {
  return state.challenges.find(item => item.day <= state.unlocked && !state.completed.has(item.day))?.day || state.unlocked;
}
function unlockedChallenges() {
  return state.challenges.filter(item => item.day <= state.unlocked);
}
function render() {
  renderToday(); renderStats(); renderGrid(); renderUnlockMessage();
}
function renderToday() {
  const item = state.challenges.find(entry => entry.day === firstIncompleteUnlocked()) || state.challenges[0];
  $('#todayDay').textContent = formatDay(item.day);
  $('#todayUnit').textContent = item.unit;
  $('#todayTitle').textContent = item.question2.name;
  $('#todayTopics').innerHTML = item.topics.map(topic => `<span>${escapeHTML(topic)}</span>`).join('');
}
function currentStreak() {
  let streak = 0;
  const available = unlockedChallenges();
  for (let index = available.length - 1; index >= 0; index--) {
    const day = available[index].day;
    if (state.completed.has(day)) streak++;
    else if (streak > 0) break;
  }
  return streak;
}
function renderStats() {
  const total = state.challenges.length;
  const available = unlockedChallenges();
  const availableCount = available.length;
  const validDays = new Set(state.challenges.map(item => item.day));
  const count = [...state.completed].filter(day => validDays.has(day)).length;
  const level = Math.floor(count / 5) + 1;
  const levelStart = (level - 1) * 5;
  const levelProgress = ((count - levelStart) / 5) * 100;
  const xpToNext = level * 500 - count * 100;
  $('#completedStat').textContent = count;
  $('#streakStat').textContent = currentStreak();
  $('#unlockedStat').textContent = availableCount;
  $('#levelNumber').textContent = String(level).padStart(2, '0');
  $('#levelTitle').textContent = level === 1 ? 'Rookie solver' : level < 5 ? 'Pattern hunter' : level < 10 ? 'Logic builder' : 'code4you legend';
  $('#xpValue').textContent = `${count * 100} XP`;
  $('#xpNext').textContent = count >= total ? 'Track complete' : `${xpToNext} XP to Level ${level + 1}`;
  $('#xpBar').style.width = `${count >= total ? 100 : levelProgress}%`;
  $('#badgeFirst').classList.toggle('earned', count >= 1);
  $('#badgeStreak').classList.toggle('earned', currentStreak() >= 7);
  $('#badgeHalf').classList.toggle('earned', count >= 50);
  const percent = total ? Math.round((count / total) * 100) : 0;
  $('#progressText').textContent = `${percent}%`;
  $('#progressBar').style.width = `${percent}%`;
  $('#journeySummary').textContent = `${availableCount} unlocked · ${count} completed · ${total - count} still ahead.`;
}
function renderUnlockMessage() {
  clearInterval(state.unlockTimer);
  state.unlockTimer = null;
  if (state.unlocked >= state.challenges.length) { $('#nextUnlock').textContent = 'Every challenge is unlocked'; return; }
  const next = new Date(startDate().getTime() + state.unlocked * DAY_MS);
  const update = () => {
    const ms = Math.max(0, next - Date.now());
    const hours = Math.floor(ms / 3_600_000);
    const minutes = Math.floor((ms % 3_600_000) / 60_000);
    $('#nextUnlock').textContent = `Day ${state.unlocked + 1} unlocks in ${hours}h ${minutes}m`;
  };
  update(); state.unlockTimer = setInterval(update, 60_000);
}
function renderGrid() {
  const visible = unlockedChallenges().filter(item => item.day < state.unlocked);
  $('#challengeGrid').innerHTML = visible.map(item => {
    const done = state.completed.has(item.day);
    const status = done ? '✓' : '→';
    return `<button class="challenge-card ${done ? 'done' : ''}" data-day="${item.day}">
      <span class="challenge-number"><span>${formatDay(item.day)}</span><span class="status-icon">${status}</span></span>
      <h3>${escapeHTML(item.question2.name)}</h3>
      <p>${escapeHTML(item.unit.replace(/^Unit [^:]+:\s*/, ''))}</p>
    </button>`;
  }).join('');
  $('#emptyState').textContent = 'Your previous questions will appear here after each day ends.';
  $('#emptyState').hidden = visible.length > 0;
  $$('.challenge-card').forEach(card => card.addEventListener('click', () => {
    const day = Number(card.dataset.day);
    openChallenge(day);
  }));
}

function openChallenge(day) {
  if (day < 1 || day > state.unlocked) return;
  const item = state.challenges.find(entry => entry.day === day);
  if (!item) return;
  state.activeDay = day;
  $('#dialogDay').textContent = formatDay(day);
  $('#dialogDifficulty').textContent = item.question2.difficulty || 'Practice';
  $('#dialogDifficulty').className = difficultyClass(item.question2.difficulty);
  $('#dialogUnit').textContent = item.unit;
  $('#dialogTitle').textContent = item.question2.name;
  $('#dialogTopics').innerHTML = item.topics.map(topic => `<span>${escapeHTML(topic)}</span>`).join('');
  $('#problemLink').href = item.question2.link;
  $('#completeButton').textContent = state.completed.has(day) ? 'Completed ✓' : 'Mark complete';
  $('#completeButton').classList.toggle('completed', state.completed.has(day));
  $('#solutionPanel').classList.remove('open');
  renderSolutions(item.solutions?.question2 || []);
  $('#prevChallenge').disabled = day <= 1;
  $('#nextChallenge').disabled = day >= state.unlocked;
  const dialog = $('#challengeDialog');
  if (!dialog.open) dialog.showModal();
}
function renderSolutions(solutions) {
  if (!solutions.length) {
    $('#solutionContent').innerHTML = '<p class="solution-explanation">No solution resources are available for this challenge yet.</p>';
    return;
  }
  $('#solutionContent').innerHTML = solutions.map(solution => {
    if (solution.link) return `<div class="solution-resource"><span>${escapeHTML(solution.label || solution.type || 'Resource')}</span><a href="${escapeHTML(solution.link)}" target="_blank" rel="noopener noreferrer">Open ↗</a></div>`;
    const code = solution.code ? `<pre><code>${escapeHTML(decodeHTML(solution.code))}</code></pre>` : '';
    const complexity = solution.timeComplexity || solution.spaceComplexity ? `<div class="complexity"><span>Time ${escapeHTML(solution.timeComplexity || '—')}</span><span>Space ${escapeHTML(solution.spaceComplexity || '—')}</span></div>` : '';
    return `<div class="solution-writeup"><p class="solution-explanation">${escapeHTML(solution.explanation || '')}</p>${code}${complexity}</div>`;
  }).join('');
}
function toggleComplete() {
  const day = state.activeDay;
  if (state.completed.has(day)) state.completed.delete(day); else state.completed.add(day);
  safeSet(TRACKS[state.track].storage, JSON.stringify([...state.completed].sort((a, b) => a - b)));
  render(); openChallenge(day);
  showToast(state.completed.has(day) ? `${formatDay(day)} complete — keep going!` : `${formatDay(day)} marked incomplete`);
}
function showToast(message) {
  const toast = $('#toast'); toast.textContent = message; toast.classList.add('show');
  clearTimeout(showToast.timeout); showToast.timeout = setTimeout(() => toast.classList.remove('show'), 2600);
}

init().catch(error => {
  console.error(error);
  $('#todayTitle').textContent = 'Unable to load challenges';
  showToast('Challenge data could not be loaded');
});
