(() => {
  'use strict';
  const W = 384, H = 288, START = 7 * 60, END = 22 * 60, SPEED = 78, MINUTE_RATE = 6;
  const canvas = document.getElementById('world');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayCopy = document.getElementById('overlay-copy');
  const overlayStat = document.getElementById('overlay-stat');
  const overlayButton = document.getElementById('overlay-button');
  const overlayFoot = document.getElementById('overlay-foot');
  const clockNode = document.getElementById('clock');
  const locationStatus = document.getElementById('location-status');
  const actionTitle = document.getElementById('action-title');
  const actionHint = document.getElementById('action-hint');
  const actionList = document.getElementById('action-list');
  const moneyNode = document.getElementById('money');
  const progressNode = document.getElementById('day-progress');
  const startButton = document.getElementById('overlay-button');
  const pauseButton = document.getElementById('pause-button');
  const touchInteractButton = document.getElementById('touch-interact');
  const held = new Set();
  const images = {};

  const loadImage = (key, src) => {
    const image = new Image(); image.src = src; image.onload = draw; images[key] = image;
  };
  loadImage('map', 'assets/city.png');
  loadImage('down', 'assets/player-down.png');
  loadImage('up', 'assets/player-up.png');
  loadImage('left', 'assets/player-left.png');
  loadImage('right', 'assets/player-right.png');
  loadImage('neighbor', 'assets/neighbor.png');

  const activities = {
    meal: { label: 'กินข้าวที่คาเฟ่', duration: 45, needs: { hunger: 34, fun: 7 }, money: -35, note: 'อิ่มท้องแล้ว พร้อมเดินเล่นต่อ', key: '1' },
    work: { label: 'ทำงานที่ร้านค้า', duration: 150, needs: { energy: -17, hunger: -11, fun: -5 }, money: 145, note: 'ทำงานเสร็จ ได้ค่าจ้างเพิ่ม', key: '1' },
    rest: { label: 'พักผ่อนที่บ้าน', duration: 90, needs: { energy: 38, hunger: -5 }, money: 0, note: 'ได้พักแรง รู้สึกสดชื่นขึ้น', key: '1' },
    shower: { label: 'อาบน้ำให้สดชื่น', duration: 30, needs: { hygiene: 42, energy: -3 }, money: 0, note: 'สะอาดสดชื่นขึ้นแล้ว', key: '2' },
    chat: { label: 'ทักทายเพื่อนที่สวน', duration: 60, needs: { social: 34, fun: 8, energy: -4 }, money: 0, note: 'ได้คุยกับเพื่อนอย่างสบายใจ', key: '1' },
    read: { label: 'นั่งพักที่สวน', duration: 45, needs: { fun: 31, energy: -3 }, money: 0, note: 'ใช้เวลาสงบ ๆ เติมความสุข', key: '2' }
  };
  const places = [
    { id: 'cafe', name: 'คาเฟ่', x: 72, y: 109, actions: ['meal'] },
    { id: 'shop', name: 'ร้านค้า', x: 310, y: 109, actions: ['work'] },
    { id: 'home', name: 'บ้าน', x: 62, y: 178, actions: ['rest', 'shower'] },
    { id: 'park', name: 'สวน', x: 308, y: 178, actions: ['chat', 'read'] }
  ];
  const state = { mode: 'title', time: START, money: 120, actions: 0, needs: { hunger: 69, energy: 74, hygiene: 68, fun: 62, social: 55 }, player: { x: 190, y: 151, facing: 'down' }, nearby: null, target: null, autoInteract: null, lastHud: 0, lastFrame: 0 };
  const needNames = { hunger: 'ความหิว', energy: 'พลังงาน', hygiene: 'ความสะอาด', fun: 'ความสุข', social: 'ความสัมพันธ์' };

  function clamp(value, min = 0, max = 100) { return Math.max(min, Math.min(max, value)); }
  function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function currentPlace() {
    let best = null, bestDistance = 42;
    for (const place of places) { const d = distance(state.player, place); if (d < bestDistance) { best = place; bestDistance = d; } }
    return best;
  }
  function formatTime(minutes) {
    const h = Math.floor(minutes / 60), m = Math.floor(minutes % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  function showOverlay(mode) {
    state.mode = mode;
    overlay.classList.remove('hidden');
    if (mode === 'title') {
      overlayTitle.textContent = 'เช้าวันใหม่ในเมือง';
      overlayCopy.textContent = 'แตะจุดกิจกรรมบนแผนที่เพื่อเดินไปทำได้ทันที หรือใช้ปุ่มทิศทางที่มุมล่าง';
      overlayStat.textContent = '';
      overlayButton.textContent = 'เริ่มใช้ชีวิต';
      overlayFoot.textContent = 'แตะปุ่มทิศทางหรือใช้ลูกศรเดิน · แตะยืนยันเพื่อทำกิจกรรม';
      overlayButton.onclick = startDay;
    } else if (mode === 'paused') {
      overlayTitle.textContent = 'พักหายใจสักครู่';
      overlayCopy.textContent = 'เวลาในเมืองหยุดเดินแล้ว พร้อมเมื่อไรก็ออกไปใช้ชีวิตต่อ';
      overlayStat.textContent = `เวลาตอนนี้ ${formatTime(state.time)}`;
      overlayButton.textContent = 'กลับไปเล่นต่อ';
      overlayFoot.textContent = 'กด Esc เพื่อกลับเข้าเกม';
      overlayButton.onclick = resumeDay;
    } else if (mode === 'results') {
      const avg = Math.round(Object.values(state.needs).reduce((a, b) => a + b, 0) / 5);
      overlayTitle.textContent = avg >= 72 ? 'วันนี้สมดุลดีมาก' : avg >= 48 ? 'ผ่านไปได้ด้วยดี' : 'พรุ่งนี้เริ่มใหม่ได้';
      overlayCopy.textContent = `ดูแลตัวเองได้หลายอย่าง และใช้เวลาในเมืองจนถึงค่ำ`;
      overlayStat.textContent = `ดุลชีวิต ${avg}% · ทำกิจกรรม ${state.actions} ครั้ง · เงิน ฿${state.money}`;
      overlayButton.textContent = 'เริ่มวันใหม่';
      overlayFoot.textContent = 'แต่ละวันเลือกใช้ชีวิตได้ในแบบของเรา';
      overlayButton.onclick = startDay;
    }
  }
  function hideOverlay() { overlay.classList.add('hidden'); }
  function startDay() {
    state.time = START; state.money = 120; state.actions = 0;
    state.needs = { hunger: 69, energy: 74, hygiene: 68, fun: 62, social: 55 };
    state.player = { x: 190, y: 151, facing: 'down' };
    state.nearby = null; state.target = null; state.autoInteract = null; held.clear(); state.mode = 'playing'; hideOverlay(); renderHud(true); updateActionPanel();
  }
  function resumeDay() { state.mode = 'playing'; held.clear(); hideOverlay(); }
  function pauseDay() { if (state.mode === 'playing') showOverlay('paused'); else if (state.mode === 'paused') resumeDay(); }
  function finishDay() { state.time = END; held.clear(); renderHud(true); showOverlay('results'); }
  function move(dt) {
    let dx = 0, dy = 0;
    if (held.has('ArrowLeft') || held.has('a')) dx--;
    if (held.has('ArrowRight') || held.has('d')) dx++;
    if (held.has('ArrowUp') || held.has('w')) dy--;
    if (held.has('ArrowDown') || held.has('s')) dy++;
    const manual = dx !== 0 || dy !== 0;
    if (manual) { state.target = null; state.autoInteract = null; }
    else if (state.target) {
      dx = state.target.x - state.player.x; dy = state.target.y - state.player.y;
      const remaining = Math.hypot(dx, dy);
      if (remaining < 2) { state.target = null; return; }
      dx /= remaining; dy /= remaining;
    }
    if (!dx && !dy) return;
    const mag = Math.hypot(dx, dy); dx /= mag; dy /= mag;
    if (Math.abs(dx) > Math.abs(dy)) state.player.facing = dx < 0 ? 'left' : 'right';
    else state.player.facing = dy < 0 ? 'up' : 'down';
    const x = clamp(state.player.x + dx * SPEED * dt, 12, W - 12);
    const y = clamp(state.player.y + dy * SPEED * dt, 18, H - 15);
    // Keep the player on streets and courtyards instead of walking through buildings.
    const blocked = (px, py) => (px < 140 && py < 91) || (px > 244 && py < 91) || (px < 133 && py > 198);
    if (!blocked(x, state.player.y)) state.player.x = x;
    if (!blocked(state.player.x, y)) state.player.y = y;
    if (state.target && distance(state.player, state.target) < 3) state.target = null;
  }
  function update(dt, now) {
    if (state.mode !== 'playing') return;
    move(dt);
    const minutes = dt * MINUTE_RATE;
    state.time += minutes;
    state.needs.hunger = clamp(state.needs.hunger - minutes * 0.018);
    state.needs.energy = clamp(state.needs.energy - minutes * 0.009);
    state.needs.hygiene = clamp(state.needs.hygiene - minutes * 0.008);
    state.needs.fun = clamp(state.needs.fun - minutes * 0.006);
    state.needs.social = clamp(state.needs.social - minutes * 0.007);
    if (state.time >= END) { finishDay(); return; }
    const place = currentPlace();
    if ((place && place.id) !== (state.nearby && state.nearby.id)) { state.nearby = place; updateActionPanel(); }
    if (state.autoInteract && place && place.id === state.autoInteract) {
      state.autoInteract = null; state.target = null; perform(place.actions[0]);
    }
    if (now - state.lastHud > 250) { renderHud(); state.lastHud = now; }
  }
  function drawLabel(text, x, y) {
    ctx.font = '700 8px NotoThai, Tahoma, sans-serif';
    const width = Math.ceil(ctx.measureText(text).width) + 8;
    ctx.fillStyle = '#f4edcf'; ctx.fillRect(Math.round(x - width / 2), Math.round(y - 9), width, 12);
    ctx.strokeStyle = '#31594a'; ctx.lineWidth = 1; ctx.strokeRect(Math.round(x - width / 2) + .5, Math.round(y - 9) + .5, width - 1, 11);
    ctx.fillStyle = '#183c34'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, Math.round(x), Math.round(y - 3));
  }
  function draw() {
    ctx.imageSmoothingEnabled = false;
    if (images.map && images.map.complete) ctx.drawImage(images.map, 0, 0, W, H);
    else { ctx.fillStyle = '#bac994'; ctx.fillRect(0, 0, W, H); }
    for (const place of places) {
      const active = state.nearby && state.nearby.id === place.id && state.mode === 'playing';
      ctx.fillStyle = active ? '#e5a550' : '#f3e9c4'; ctx.fillRect(place.x - 5, place.y - 5, 10, 10);
      ctx.strokeStyle = '#274b3e'; ctx.lineWidth = 1; ctx.strokeRect(place.x - 5.5, place.y - 5.5, 11, 11);
      ctx.fillStyle = '#234839'; ctx.fillRect(place.x - 2, place.y - 2, 4, 4);
      drawLabel(place.name, place.x, place.y - 9);
    }
    const player = state.player;
    if (state.nearby && state.nearby.id === 'park' && images.neighbor && images.neighbor.complete) ctx.drawImage(images.neighbor, 287, 190, 24, 30);
    const sprite = images[player.facing] || images.down;
    if (sprite && sprite.complete) ctx.drawImage(sprite, Math.round(player.x - 12), Math.round(player.y - 25), 24, 30);
    else { ctx.fillStyle = '#d96d4e'; ctx.fillRect(player.x - 6, player.y - 16, 12, 16); }
    if (state.mode === 'playing' && state.nearby) {
      ctx.strokeStyle = '#f3d37c'; ctx.lineWidth = 1; ctx.setLineDash([2, 2]); ctx.strokeRect(state.nearby.x - 10.5, state.nearby.y - 10.5, 21, 21); ctx.setLineDash([]);
    }
  }
  function renderHud(force = false) {
    clockNode.textContent = formatTime(state.time);
    moneyNode.textContent = `฿${state.money}`;
    const progress = clamp((state.time - START) / (END - START) * 100);
    progressNode.style.width = `${progress}%`;
    for (const [key, value] of Object.entries(state.needs)) {
      const row = document.querySelector(`.need-row[data-need="${key}"]`);
      const percent = Math.round(value);
      row.querySelector('.need-label b').textContent = `${percent}%`;
      row.querySelector('.meter span').style.width = `${percent}%`;
      row.classList.toggle('low', value < 28); row.classList.toggle('mid', value >= 28 && value < 50);
      row.setAttribute('aria-label', `${needNames[key]} ${percent}%`);
    }
    if (state.mode !== 'playing') locationStatus.textContent = state.mode === 'title' ? 'พร้อมเริ่มวัน' : state.mode === 'paused' ? 'พักเกมอยู่' : 'หมดวันแล้ว';
    else locationStatus.textContent = state.nearby ? `ใกล้${state.nearby.name} · แตะยืนยันเพื่อทำกิจกรรม` : 'เดินสำรวจเมืองเพื่อหากิจกรรม';
  }
  function updateActionPanel() {
    actionList.replaceChildren();
    const place = state.nearby;
    if (!place || state.mode !== 'playing') {
      actionTitle.textContent = 'กิจกรรมใกล้ตัว';
      actionHint.textContent = 'เดินเข้าใกล้สถานที่ แล้วแตะยืนยันหรือเลือกกิจกรรม';
      const labels = [['meal','คาเฟ่'],['work','ร้านค้า'],['rest','บ้าน'],['chat','สวน']];
      for (const [id, placeName] of labels) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'action-button'; button.disabled = true;
        button.innerHTML = `<span>${activities[id].label}</span><span>${placeName}</span>`; actionList.append(button);
      }
      return;
    }
    actionTitle.textContent = `ใกล้${place.name}`;
    actionHint.textContent = place.actions.length > 1 ? 'แตะเลือกกิจกรรม หรือใช้ปุ่มหมายเลข' : 'แตะกิจกรรมหรือปุ่มยืนยันบนแผนที่';
    for (const id of place.actions) {
      const activity = activities[id];
      const button = document.createElement('button'); button.type = 'button'; button.className = 'action-button';
      button.innerHTML = `<span>${activity.label}</span><span>${activity.key} · ${activity.duration} นาที</span>`;
      button.addEventListener('click', () => perform(id)); actionList.append(button);
    }
  }
  function perform(id) {
    if (state.mode !== 'playing') return;
    const place = currentPlace();
    if (!place) { locationStatus.textContent = 'เดินเข้าใกล้สถานที่ก่อนนะ'; return; }
    const activity = activities[id];
    if (!place.actions.includes(id)) return;
    state.time += activity.duration;
    state.money = Math.max(0, state.money + activity.money);
    for (const [key, amount] of Object.entries(activity.needs)) state.needs[key] = clamp(state.needs[key] + amount);
    state.actions++;
    locationStatus.textContent = `${activity.note} · ${formatTime(state.time)}`;
    renderHud(true);
    if (state.time >= END) { finishDay(); return; }
  }
  function interact() {
    if (state.mode !== 'playing') return;
    const place = currentPlace();
    if (!place) { locationStatus.textContent = 'เดินเข้าใกล้บ้าน คาเฟ่ ร้านค้า หรือสวนก่อน'; return; }
    const choice = place.actions[0]; perform(choice);
  }
  function onWorldTap(event) {
    if (state.mode !== 'playing') return;
    const point = event.changedTouches ? event.changedTouches[0] : event;
    const rect = canvas.getBoundingClientRect();
    const x = clamp((point.clientX - rect.left) / rect.width * W, 12, W - 12);
    const y = clamp((point.clientY - rect.top) / rect.height * H, 18, H - 15);
    const destination = places.find(place => distance({ x, y }, place) < 26);
    state.target = destination ? { x: destination.x, y: destination.y } : { x, y };
    state.autoInteract = destination ? destination.id : null;
    held.clear();
    locationStatus.textContent = destination ? `กำลังเดินไป${destination.name}` : 'กำลังเดินไปตำแหน่งที่แตะ';
  }
  function onKeyDown(event) {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(event.key)) event.preventDefault();
    if (event.key === 'Escape') { pauseDay(); return; }
    if (state.mode !== 'playing') { if (event.key === 'Enter' && state.mode === 'title') startDay(); else if (event.key === 'Enter' && state.mode === 'paused') resumeDay(); return; }
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d'].includes(key)) { held.add(key); state.target = null; state.autoInteract = null; }
    else if (event.key === 'Enter' || event.key === ' ') interact();
    else if (event.key === '1' || event.key === '2') {
      const place = currentPlace(); if (place) { const id = place.actions[Number(event.key) - 1]; if (id) perform(id); }
    }
  }
  function onKeyUp(event) { const key = event.key.length === 1 ? event.key.toLowerCase() : event.key; held.delete(key); }
  window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp); window.addEventListener('blur', () => held.clear());
  pauseButton.addEventListener('click', pauseDay);
  if (touchInteractButton) touchInteractButton.addEventListener('click', interact);
  canvas.addEventListener('pointerdown', onWorldTap);
  if (!('PointerEvent' in window)) canvas.addEventListener('touchstart', onWorldTap, { passive: false });
  for (const button of document.querySelectorAll('.dpad button[data-key]')) {
    const key = button.dataset.key;
    const down = (event) => { event.preventDefault(); state.target = null; state.autoInteract = null; held.add(key); if (state.mode === 'playing') move(0.18); button.classList.add('held'); if (button.setPointerCapture) button.setPointerCapture(event.pointerId); };
    const up = () => { held.delete(key); button.classList.remove('held'); };
    button.addEventListener('pointerdown', down); button.addEventListener('pointerup', up); button.addEventListener('pointercancel', up); button.addEventListener('lostpointercapture', up);
  }
  function frame(now) {
    const dt = Math.min((now - (state.lastFrame || now)) / 1000, 0.05); state.lastFrame = now;
    update(dt, now); draw(); requestAnimationFrame(frame);
  }
  updateActionPanel(); renderHud(true); showOverlay('title'); requestAnimationFrame(frame);
})();
