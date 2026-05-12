const BASE_URL = 'http://yushi.tjnu.edu.cn:61004/brmcsf/';
const LOGIN_CODE_PREFIX = '25300901';
/** 完整输入该账号时不拼接 LOGIN_CODE_PREFIX */
const LOGIN_CODE_PREFIX_EXCEPTION = '2430090187';
const LOGIN_PASSWORD = 'ZXCzxc123!@#';
const SESSION_STORAGE_KEY = 'shower-auth-session';
const LAST_CODE_STORAGE_KEY = 'shower-last-code';
const TIME_FORMAT_STORAGE_KEY_PREFIX = 'shower-time-format:';
const DEFAULT_ROOM_ID = '31';
const BOOKED_VIEW_ID = '__booked__';
const PASSWORD_MD5 = 'f1219d2303d63da395244e78b5d5a74d';
const ACCOUNTS_CONF_URL = 'conf/accounts.env';
const FALLBACK_SWAP_ACCOUNTS = [
  { code: '2430090187', loginid: '52561' },
];
const FALLBACK_SWAP_SLOT_IDS = ['1204', '1205', '1206', '1207', '1208', '1209'];

let SWAP_ACCOUNTS = [];
let SWAP_SLOT_MAP = {};
let swapConfigError = '';

function applySwapConfig(accounts, slotIds) {
  SWAP_ACCOUNTS = accounts.map((account) => ({ code: account.code, loginid: account.loginid }));
  SWAP_SLOT_MAP = {};

  for (let index = 0; index < slotIds.length; index += 1) {
    SWAP_SLOT_MAP[slotIds[index]] = SWAP_ACCOUNTS[index % SWAP_ACCOUNTS.length].code;
  }
}

async function loadAccountsConf() {
  try {
    if (window.location.protocol === 'file:') {
      applySwapConfig(FALLBACK_SWAP_ACCOUNTS, FALLBACK_SWAP_SLOT_IDS);
      return;
    }

    const resp = await fetch(ACCOUNTS_CONF_URL);
    if (!resp.ok) {
      throw new Error(`交换配置读取失败（HTTP ${resp.status}）`);
    }
    const text = await resp.text();
    const lines = text.split('\n');
    const loginIds = {};
    let accountCodes = [];
    let slotIds = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.substring(0, eqIdx).trim();
      const val = trimmed.substring(eqIdx + 1).trim();
      if (key === 'ACCOUNTS') {
        accountCodes = val.split(',').map((item) => item.trim()).filter(Boolean);
      }
      if (key === 'SLOT_IDS') {
        slotIds = val.split(',').map((item) => item.trim()).filter(Boolean);
      }
      if (key.startsWith('LOGINID_')) {
        const code = key.substring('LOGINID_'.length);
        loginIds[code] = val;
      }
    }

    SWAP_ACCOUNTS = accountCodes
      .filter((code) => loginIds[code])
      .map((code) => ({ code, loginid: loginIds[code] }));

    if (SWAP_ACCOUNTS.length === 0) {
      throw new Error('交换配置无有效账号');
    }

    if (slotIds.length === 0) {
      throw new Error('交换配置无有效时段');
    }

    applySwapConfig(SWAP_ACCOUNTS, slotIds);
  } catch (e) {
    SWAP_ACCOUNTS = [];
    SWAP_SLOT_MAP = {};
    swapConfigError = e instanceof Error ? e.message : '交换配置读取失败';
    throw e;
  }
}

const state = {
  session: null,
  rooms: [],
  selectedRoomId: '',
  slots: [],
  orders: [],
  bookingSlotId: '',
  timeFormat: '24h',
};

const loginViewEl = document.getElementById('login-view');
const roomsViewEl = document.getElementById('rooms-view');
const form = document.getElementById('login-form');
const codeInput = document.getElementById('code');
const submitBtn = document.getElementById('submit-btn');
const loginStatusEl = document.getElementById('login-status');
const mobileTabsEl = document.getElementById('mobile-tabs');
const timeFormatBtn = document.getElementById('time-format-btn');
const refreshBtn = document.getElementById('refresh-btn');
const logoutBtn = document.getElementById('logout-btn');
const roomsStatusEl = document.getElementById('rooms-status');
const roomCountEl = document.getElementById('room-count');
const roomListEl = document.getElementById('room-list');
const slotCountEl = document.getElementById('slot-count');
const slotNoteEl = document.getElementById('slot-note');
const slotListEl = document.getElementById('slot-list');

function setLoginStatus(message, type) {
  loginStatusEl.textContent = message;
  loginStatusEl.className = `status ${type}`;
}

function setRoomsStatus(message, type) {
  roomsStatusEl.textContent = message;
  roomsStatusEl.className = `rooms-toast status ${type}`;
}

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);

    if (!parsed || !parsed.token || !parsed.loginid) {
      return null;
    }

    return parsed;
  } catch (error) {
    return null;
  }
}

function writeSession(session) {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

function clearSessionStorage() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

function saveLastCode(code) {
  if (code) {
    localStorage.setItem(LAST_CODE_STORAGE_KEY, code);
  }
}

function restoreLastCode() {
  const lastCode = localStorage.getItem(LAST_CODE_STORAGE_KEY);

  if (lastCode) {
    codeInput.value = lastCode;
  }
}

function getTimeFormatStorageKey(code) {
  return `${TIME_FORMAT_STORAGE_KEY_PREFIX}${code}`;
}

function readTimeFormatPreference(code) {
  if (!code) {
    return '24h';
  }

  const stored = localStorage.getItem(getTimeFormatStorageKey(code));
  return stored === '12h' ? '12h' : '24h';
}

function writeTimeFormatPreference(code, format) {
  if (!code) {
    return;
  }

  localStorage.setItem(getTimeFormatStorageKey(code), format === '12h' ? '12h' : '24h');
}

function updateTimeFormatButton() {
  if (!timeFormatBtn) {
    return;
  }

  const is12 = state.timeFormat === '12h';
  timeFormatBtn.setAttribute('aria-label', is12 ? '当前12小时制，切换为24小时制' : '当前24小时制，切换为12小时制');
  timeFormatBtn.setAttribute('title', is12 ? '当前12小时制，点击改为24小时制' : '当前24小时制，点击改为12小时制');
}

function formatSingleTime(timeText) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(timeText || '').trim());

  if (!match) {
    return String(timeText || '');
  }

  const hour = Number(match[1]);
  const minute = match[2];

  if (state.timeFormat !== '12h') {
    return `${String(hour).padStart(2, '0')}:${minute}`;
  }

  const period = hour < 12 ? '上午' : '下午';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${period}${hour12}:${minute}`;
}

function formatPeriod(periodText) {
  const text = String(periodText || '').trim();

  if (!text.includes('-')) {
    return formatSingleTime(text);
  }

  const parts = text.split('-');

  if (parts.length !== 2) {
    return text;
  }

  return `${formatSingleTime(parts[0])}-${formatSingleTime(parts[1])}`;
}

function resolveLoginCode(rawValue) {
  const value = rawValue.trim();

  if (!value) {
    return '';
  }

  if (value === LOGIN_CODE_PREFIX_EXCEPTION) {
    return value;
  }

  return `${LOGIN_CODE_PREFIX}${value}`;
}

function isCompactLayout() {
  return window.matchMedia('(max-width: 640px)').matches;
}

function renderMobileTabs() {
  if (!mobileTabsEl) {
    return;
  }

  if (!isCompactLayout()) {
    mobileTabsEl.innerHTML = '';
    return;
  }

  const roomTabs = state.rooms.map((room) => {
    const roomId = getRoomId(room);
    const activeClass = roomId === state.selectedRoomId ? ' active' : '';
    return `<button class="secondary tab-btn${activeClass}" type="button" data-room-tab="${escapeHtml(roomId)}">${escapeHtml(simplifyRoomName(getRoomName(room)))}</button>`;
  });

  const bookedActiveClass = isBookedViewSelected() ? ' active' : '';
  roomTabs.push(`<button class="secondary tab-btn${bookedActiveClass}" type="button" data-room-tab="${BOOKED_VIEW_ID}">已预约</button>`);
  mobileTabsEl.innerHTML = roomTabs.join('');
}

function setSession(session) {
  state.session = session;
  state.timeFormat = session ? readTimeFormatPreference(session.code) : '24h';
  updateTimeFormatButton();
  renderMobileTabs();
  loginViewEl.classList.toggle('hidden', !!session);
  roomsViewEl.classList.toggle('hidden', !session);

  if (!session) {
    state.rooms = [];
    state.selectedRoomId = '';
    state.slots = [];
    state.orders = [];
    state.bookingSlotId = '';
    renderRooms();
    renderSlots();
  }
}

function simplifyRoomName(name) {
  const text = String(name || '').trim();

  if (!text) {
    return '未命名浴室';
  }

  const ordinalRoom = /^第([一二三四五六七八九十0-9]+)浴室(?:男浴|女浴)?$/.exec(text);
  if (ordinalRoom) {
    return `${ordinalRoom[1]}浴`;
  }

  const buildingRoom = /^(\d+)号楼公寓浴室$/.exec(text);
  if (buildingRoom) {
    return `${buildingRoom[1]}#浴室`;
  }

  return text.replace('号楼公寓浴室', '#浴室').replace('公寓浴室', '浴室');
}

function getDisplayRoomName(room) {
  const roomName = getRoomName(room);
  return isCompactLayout() ? simplifyRoomName(roomName) : roomName;
}

function getAuthHeaders() {
  if (!state.session) {
    return {};
  }

  return {
    token: state.session.token,
    loginid: String(state.session.loginid),
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toId(value) {
  if (value === null || typeof value === 'undefined') {
    return '';
  }

  return String(value);
}

function getListFromData(data, candidateKeys) {
  if (Array.isArray(data)) {
    return data;
  }

  if (!data || typeof data !== 'object') {
    return [];
  }

  for (let index = 0; index < candidateKeys.length; index += 1) {
    const key = candidateKeys[index];

    if (Array.isArray(data[key])) {
      return data[key];
    }
  }

  return [];
}

function getRoomId(room) {
  return toId(room && (room.id || room.bathRoomId || room.bathroomid || room.roomId));
}

function getRoomName(room) {
  if (!room || typeof room !== 'object') {
    return '未命名浴室';
  }

  return room.bathRoomName || room.name || room.roomName || room.title || `浴室 ${getRoomId(room) || ''}`;
}

function getRoomMeta(room) {
  if (!room || typeof room !== 'object') {
    return '未提供附加信息';
  }

  const pieces = [];

  if (room.address) {
    pieces.push(room.address);
  }

  if (room.position) {
    pieces.push(room.position);
  }

  if (room.areaName) {
    pieces.push(room.areaName);
  }

  if (!isCompactLayout()) {
    const roomId = getRoomId(room);

    if (roomId) {
      pieces.push(`ID ${roomId}`);
    }
  }

  return pieces.length > 0 ? pieces.join(' / ') : '未提供附加信息';
}

function getSlotList(data) {
  return getListFromData(data, ['bookStatusList', 'list']);
}

function getOrderList(data) {
  return getListFromData(data, ['bookOrderList', 'orderList', 'list']);
}

function isSlotBookedByCurrentUser(slotId) {
  return state.orders.some((order) => toId(order && order.bookStatusId) === slotId);
}

function getBookedOrderForSlot(slotId) {
  return state.orders.find((order) => toId(order && order.bookStatusId) === slotId) || null;
}

function isBookedViewSelected() {
  return state.selectedRoomId === BOOKED_VIEW_ID;
}

function getSlotState(slot) {
  const remain = Number(slot && slot.remain);
  const enabled = slot && slot.state !== false;

  if (!enabled) {
    return { label: '不可预约', className: 'warning' };
  }

  if (!Number.isNaN(remain) && remain <= 0) {
    return { label: '已约满', className: 'warning' };
  }

  return { label: '可预约', className: 'success' };
}

function canBookSlot(slot) {
  const remain = Number(slot && slot.remain);
  const enabled = slot && slot.state !== false;

  if (!enabled) {
    return false;
  }

  if (!Number.isNaN(remain) && remain <= 0) {
    return false;
  }

  return true;
}

function getBookingResultMessage(succeed) {
  if (succeed === 'Y') {
    return { text: '预约成功。', type: 'success' };
  }

  if (succeed === 'N') {
    return { text: '预约失败，时段可能已满或未通过后端校验。', type: 'error' };
  }

  if (succeed === 'P') {
    return { text: '预约失败，此时间段已过去。', type: 'error' };
  }

  if (succeed === 'Q') {
    return { text: '预约失败，你已经预约过此时段。', type: 'error' };
  }

  return { text: '预约失败，接口返回了未识别的状态。', type: 'error' };
}

function getCancelResultMessage(succeed) {
  if (succeed === 'Y') {
    return { text: '取消预约成功。', type: 'success' };
  }

  return { text: '取消预约失败。', type: 'error' };
}

function isSwapSlot(slotId) {
  return slotId in SWAP_SLOT_MAP;
}

function getOrderStatusMeta(order) {
  const status = toId(order && order.status);

  if (status === '0') {
    return { label: '已预约', className: 'success' };
  }

  if (status === '1') {
    return { label: '已扫码进入', className: 'success' };
  }

  if (status === '2') {
    return { label: '已完成', className: 'success' };
  }

  if (status === '3') {
    return { label: '已超时', className: 'warning' };
  }

  if (status === '4') {
    return { label: '已归档', className: 'warning' };
  }

  return { label: '你已预约', className: 'success' };
}

function renderSlots() {
  slotCountEl.textContent = `${state.slots.length} 个时段`;

  if (!state.session) {
    slotNoteEl.textContent = '请先登录。';
    slotListEl.innerHTML = '';
    return;
  }

  if (!state.selectedRoomId) {
    slotNoteEl.textContent = '请选择一个浴室。';
    slotListEl.innerHTML = '<div class="empty">选择左侧浴室后，这里会显示对应的可预约时段。</div>';
    return;
  }

  if (isBookedViewSelected()) {
    slotNoteEl.textContent = '当前显示：已预约';

    if (state.orders.length === 0) {
      slotListEl.innerHTML = '<div class="empty">当前没有已预约项目。</div>';
      return;
    }

    slotListEl.innerHTML = state.orders.map((order) => {
      const orderId = toId(order && order.id);
      const slotId = toId(order && order.bookStatusId);
      const roomName = order && (order.bathRoomName || order.roomName || '未返回浴室名称');
      const period = formatPeriod(order && order.period ? order.period : '未返回时段');
      const orderStatusMeta = getOrderStatusMeta(order);
      const loading = state.bookingSlotId === slotId;
      const buttonLabel = loading ? '处理中...' : '取消预约';
      const canSwap = isSwapSlot(slotId);

      return `
        <article class="slot-card">
          <div class="slot-top">
            <div class="slot-title">${escapeHtml(period)}</div>
            <div class="meta ${orderStatusMeta.className}">${escapeHtml(orderStatusMeta.label)}</div>
          </div>
          <div class="slot-meta">
            <div class="meta">${escapeHtml(roomName)}</div>
            <div class="meta">订单 ID ${escapeHtml(orderId || '未知')}</div>
            <div class="meta">时段 ID ${escapeHtml(slotId || '未知')}</div>
          </div>
          <div class="slot-actions">
            <button class="cancel" type="button" data-slot-id="${escapeHtml(slotId)}"${loading ? ' disabled' : ''}>${buttonLabel}</button>
            ${canSwap ? `<button class="swap" type="button" data-swap-slot-id="${escapeHtml(slotId)}"${loading ? ' disabled' : ''}>尝试交换</button>` : ''}
          </div>
        </article>
      `;
    }).join('');
    renderMobileTabs();
    return;
  }

  const selectedRoom = state.rooms.find((room) => getRoomId(room) === state.selectedRoomId);
  slotNoteEl.textContent = selectedRoom ? `当前浴室：${getDisplayRoomName(selectedRoom)}` : '正在加载对应时段。';

  if (state.slots.length === 0) {
    slotListEl.innerHTML = '<div class="empty">当前浴室没有返回可展示的预约时段。</div>';
    return;
  }

  slotListEl.innerHTML = state.slots.map((slot) => {
    const slotId = toId(slot && slot.id);
    const status = getSlotState(slot);
    const remain = typeof slot?.remain === 'undefined' ? '未知' : String(slot.remain);
    const booked = typeof slot?.bookNum === 'undefined' ? '未知' : String(slot.bookNum);
    const maxBookNum = typeof slot?.maxBookNum === 'undefined' ? '未知' : String(slot.maxBookNum);
    const alreadyBooked = isSlotBookedByCurrentUser(slotId);
    const bookable = canBookSlot(slot);
    const loading = state.bookingSlotId === slotId;
    const buttonDisabled = (alreadyBooked || bookable) && !loading ? '' : ' disabled';
    const buttonLabel = loading ? '处理中...' : (alreadyBooked ? '取消预约' : '预约');
    const buttonClass = alreadyBooked ? 'cancel' : 'primary';
    const canSwap = isSwapSlot(slotId);

    return `
      <article class="slot-card">
        <div class="slot-top">
          <div class="slot-title">${escapeHtml(formatPeriod(slot && slot.period ? slot.period : '未返回时段'))}</div>
          <div class="meta ${status.className}">${escapeHtml(status.label)}</div>
        </div>
        <div class="slot-meta">
          <div class="meta">剩余 ${escapeHtml(remain)}</div>
          <div class="meta">已约 ${escapeHtml(booked)}/${escapeHtml(maxBookNum)}</div>
          <div class="meta">ID ${escapeHtml(slotId || '未知')}</div>
          ${alreadyBooked ? '<div class="meta success">你已预约</div>' : ''}
        </div>
        <div class="slot-actions">
          <button class="${buttonClass}" type="button" data-slot-id="${escapeHtml(slotId)}"${buttonDisabled}>${buttonLabel}</button>
          ${canSwap ? `<button class="swap" type="button" data-swap-slot-id="${escapeHtml(slotId)}"${loading ? ' disabled' : ''}>尝试交换</button>` : ''}
        </div>
      </article>
    `;
  }).join('');
  renderMobileTabs();
}

async function requestJson(path, options) {
  const method = options && options.method ? options.method : 'GET';
  const body = options && Object.prototype.hasOwnProperty.call(options, 'body') ? options.body : undefined;
  const withAuth = !options || options.auth !== false;
  const headers = {};

  if (withAuth) {
    Object.assign(headers, getAuthHeaders());
  }

  if (typeof body !== 'undefined') {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: typeof body === 'undefined' ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch (error) {
    throw new Error(`接口未返回 JSON（HTTP ${response.status}）。`);
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} 请求失败。`);
  }

  return json;
}

function buildBusinessError(json, fallbackMessage) {
  const code = json && typeof json.code !== 'undefined' ? json.code : 'unknown';
  const message = json && typeof json.message === 'string' ? json.message.trim() : '';

  if (message) {
    return `${fallbackMessage}${message}（code=${code}）`;
  }

  return `${fallbackMessage}接口返回 code=${code}。`;
}

function renderRooms() {
  roomCountEl.textContent = `${state.rooms.length} 个浴室`;

  if (!state.session) {
    roomListEl.innerHTML = '';
    return;
  }

  if (state.rooms.length === 0) {
    roomListEl.innerHTML = '<div class="empty">当前没有拿到浴室列表。可尝试刷新列表。</div>';
    return;
  }

  const roomButtons = state.rooms.map((room) => {
    const roomId = getRoomId(room);
    const activeClass = roomId === state.selectedRoomId ? ' active' : '';
    return `
      <button class="room-card${activeClass}" type="button" data-room-id="${escapeHtml(roomId)}">
        <strong>${escapeHtml(getDisplayRoomName(room))}</strong>
        <span>${escapeHtml(getRoomMeta(room))}</span>
      </button>
    `;
  });

  const bookedActiveClass = isBookedViewSelected() ? ' active' : '';
  roomButtons.push(`
    <button class="room-card${bookedActiveClass}" type="button" data-room-id="${BOOKED_VIEW_ID}">
      <strong>已预约</strong>
      <span>查看并取消当前账号已预约的项目</span>
    </button>
  `);

  roomListEl.innerHTML = roomButtons.join('');
  renderMobileTabs();
}

async function selectRoom(roomId) {
  if (!roomId || roomId === state.selectedRoomId) {
    return;
  }

  state.selectedRoomId = roomId;
  state.slots = [];
  renderRooms();
  renderSlots();

  if (isBookedViewSelected()) {
    setRoomsStatus('已切换到已预约列表。', 'success');
    return;
  }

  const selectedRoom = state.rooms.find((room) => getRoomId(room) === state.selectedRoomId);
  const selectedRoomName = selectedRoom ? getDisplayRoomName(selectedRoom) : '当前浴室';
  setRoomsStatus(`已选中${selectedRoomName}，正在加载可预约项...`, 'info');

  try {
    await loadSlots(state.selectedRoomId);
    setRoomsStatus(`已选中${selectedRoomName}。`, 'success');
  } catch (error) {
    setRoomsStatus(error.message, 'error');
  }
}

async function loadRooms() {
  const json = await requestJson(`api/bathRoom/listRoom?time=${Date.now()}`, {
    method: 'POST',
    body: {},
  });

  if (!json || json.code !== 200) {
    throw new Error(buildBusinessError(json, '获取浴室列表失败：'));
  }

  state.rooms = getListFromData(json.data, ['bathRoomList', 'roomList', 'list']);

  if (state.rooms.length === 0) {
    state.selectedRoomId = '';
  } else {
    const stillExists = state.rooms.some((room) => getRoomId(room) === state.selectedRoomId);

    if (!stillExists) {
      const defaultRoom = state.rooms.find((room) => getRoomId(room) === DEFAULT_ROOM_ID);
      state.selectedRoomId = defaultRoom ? DEFAULT_ROOM_ID : getRoomId(state.rooms[0]);
    }
  }

  renderRooms();
}

async function loadSlots(roomId) {
  if (!roomId) {
    state.slots = [];
    state.bookingSlotId = '';
    renderSlots();
    return;
  }

  const json = await requestJson(`api/bathRoom/listBookStatus?time=${Date.now()}&bathroomid=${encodeURIComponent(roomId)}`, {
    method: 'POST',
    body: {},
  });

  if (!json || json.code !== 200) {
    throw new Error(buildBusinessError(json, '获取可预约项失败：'));
  }

  state.slots = getSlotList(json.data);
  state.bookingSlotId = '';
  renderSlots();
}

async function loadOrders() {
  const json = await requestJson(`api/bathRoom/getBookOrderList?time=${Date.now()}`, {
    method: 'GET',
  });

  if (!json || json.code !== 200) {
    throw new Error(buildBusinessError(json, '获取当前预约状态失败：'));
  }

  state.orders = getOrderList(json.data);
  renderSlots();
}

async function handleBook(slotId) {
  if (!state.session || !state.selectedRoomId || !slotId) {
    return;
  }

  const bookedOrder = getBookedOrderForSlot(slotId);

  if (bookedOrder) {
    state.bookingSlotId = slotId;
    renderSlots();
    setRoomsStatus('正在取消预约...', 'info');

    try {
      const json = await requestJson(`api/bathRoom/cancelOrder?time=${Date.now()}&bookorderid=${encodeURIComponent(toId(bookedOrder.id))}`, {
        method: 'POST',
        body: {},
      });

      if (!json || json.code !== 200) {
        throw new Error(buildBusinessError(json, '取消预约失败：'));
      }

      const succeed = json.data && json.data.succeed ? String(json.data.succeed) : '';
      const result = getCancelResultMessage(succeed);
      await Promise.all([loadOrders(), loadSlots(state.selectedRoomId)]);
      setRoomsStatus(result.text, result.type);

      if (succeed === 'Y' && isSwapSlot(slotId)) {
        const reserveAccount = SWAP_ACCOUNTS.find((a) => a.code === SWAP_SLOT_MAP[slotId]);
        if (reserveAccount) {
          setRoomsStatus('已取消，正在为固定账号重新预约...', 'info');
          try {
            const reserveSession = await loginAsAccount(reserveAccount.code);
            const bookSucceed = await bookSlotAs(reserveSession, slotId);
            const bookMsg = bookSucceed === 'Y' ? '固定账号已重新预约成功。' : '固定账号重新预约未成功。';
            await Promise.all([loadOrders(), loadSlots(state.selectedRoomId)]);
            setRoomsStatus(result.text + bookMsg, bookSucceed === 'Y' ? 'success' : 'error');
          } catch (swapErr) {
            setRoomsStatus(result.text + '固定账号重新预约失败：' + swapErr.message, 'error');
          }
        }
      }
    } catch (error) {
      state.bookingSlotId = '';
      renderSlots();
      setRoomsStatus(error.message, 'error');
    }

    return;
  }

  state.bookingSlotId = slotId;
  renderSlots();
  setRoomsStatus('正在提交预约...', 'info');

  try {
    const json = await requestJson(`api/bathRoom/bookOrder?time=${Date.now()}&bookstatusid=${encodeURIComponent(slotId)}`, {
      method: 'POST',
      body: {},
    });

    if (!json || json.code !== 200) {
      throw new Error(buildBusinessError(json, '预约失败：'));
    }

    const succeed = json.data && json.data.succeed ? String(json.data.succeed) : '';
    const result = getBookingResultMessage(succeed);
    await Promise.all([loadOrders(), loadSlots(state.selectedRoomId)]);
    setRoomsStatus(result.text, result.type);
  } catch (error) {
    state.bookingSlotId = '';
    renderSlots();
    setRoomsStatus(error.message, 'error');
  }
}

async function loginAsAccount(code) {
  const json = await requestJson(`api/logon/login?time=${Date.now()}`, {
    method: 'POST',
    body: { code, password: PASSWORD_MD5 },
    auth: false,
  });

  if (!json || json.code !== 200 || !json.data || !json.data.token) {
    throw new Error(`登录 ${code} 失败：${json && json.message ? json.message : '未知错误'}`);
  }

  return { code, loginid: String(json.data.loginid), token: json.data.token };
}

async function cancelOrderAs(session, orderId) {
  const json = await fetch(`${BASE_URL}api/bathRoom/cancelOrder?time=${Date.now()}&bookorderid=${encodeURIComponent(orderId)}`, {
    method: 'POST',
    headers: { token: session.token, loginid: session.loginid, 'Content-Type': 'application/json' },
    body: '{}',
  }).then((r) => r.json());

  if (!json || json.code !== 200) {
    throw new Error(buildBusinessError(json, '取消预约失败：'));
  }

  return json.data && json.data.succeed ? String(json.data.succeed) : '';
}

async function bookSlotAs(session, slotId) {
  const json = await fetch(`${BASE_URL}api/bathRoom/bookOrder?bookstatusid=${slotId}&time=${Date.now()}`, {
    method: 'POST',
    headers: { token: session.token, loginid: session.loginid, 'Content-Type': 'application/json' },
    body: '{}',
  }).then((r) => r.json());

  if (!json || json.code !== 200) {
    throw new Error(buildBusinessError(json, '预约失败：'));
  }

  return json.data && json.data.succeed ? String(json.data.succeed) : '';
}

async function loadOrdersAs(session) {
  const json = await fetch(`${BASE_URL}api/bathRoom/getBookOrderList?time=${Date.now()}`, {
    method: 'GET',
    headers: { token: session.token, loginid: session.loginid },
  }).then((r) => r.json());

  if (!json || json.code !== 200) {
    return [];
  }

  return getOrderList(json.data);
}

async function handleSwap(slotId) {
  if (!state.session || !slotId) {
    return;
  }

  const targetCode = SWAP_SLOT_MAP[slotId];

  if (!targetCode) {
    setRoomsStatus('此时段不支持交换。', 'error');
    return;
  }

  const targetAccount = SWAP_ACCOUNTS.find((a) => a.code === targetCode);

  if (!targetAccount) {
    setRoomsStatus('未找到目标账号信息。', 'error');
    return;
  }

  state.bookingSlotId = slotId;
  renderSlots();
  setRoomsStatus('正在准备交换...', 'info');

  try {
    const targetSession = await loginAsAccount(targetCode);
    const targetOrders = await loadOrdersAs(targetSession);
    const orderToCancel = targetOrders.find((o) => toId(o && o.bookStatusId) === slotId);

    if (!orderToCancel) {
      throw new Error('交换目标当前没有预约此时段。');
    }

    const cancelSucceed = await cancelOrderAs(targetSession, toId(orderToCancel.id));

    if (cancelSucceed !== 'Y') {
      throw new Error('交换目标取消预约失败。');
    }

    setRoomsStatus('已释放原预约，正在为你预约...', 'info');

    const bookSucceed = await bookSlotAs(state.session, slotId);
    const myResult = getBookingResultMessage(bookSucceed);

    setRoomsStatus('正在尝试为原账号重新预约...', 'info');

    let targetRetryMsg = '';
    try {
      const retrySucceed = await bookSlotAs(targetSession, slotId);
      targetRetryMsg = retrySucceed === 'Y' ? '，对方也已重新预约成功' : '，对方重新预约未成功';
    } catch {
      targetRetryMsg = '，对方重新预约失败';
    }

    await Promise.all([loadOrders(), loadSlots(state.selectedRoomId)]);
    setRoomsStatus(myResult.text + targetRetryMsg, myResult.type);
  } catch (error) {
    state.bookingSlotId = '';
    renderSlots();
    setRoomsStatus(error.message, 'error');
  }
}

async function refreshRooms(message) {
  if (!state.session) {
    return;
  }

  refreshBtn.disabled = true;
  setRoomsStatus(message || '正在加载浴室和可预约项...', 'info');

  try {
    await loadRooms();
    await loadOrders();

    if (state.selectedRoomId && !isBookedViewSelected()) {
      await loadSlots(state.selectedRoomId);
    } else {
      state.slots = [];
      renderSlots();
    }

    setRoomsStatus('浴室列表和可预约项已更新。', 'success');
  } catch (error) {
    setRoomsStatus(error.message, 'error');
  } finally {
    refreshBtn.disabled = false;
  }
}

async function handleLogin(event) {
  event.preventDefault();

  const rawCode = codeInput.value.trim();
  const code = resolveLoginCode(rawCode);

  if (!code) {
    setLoginStatus('请输入账号。', 'error');
    return;
  }

  if (typeof md5 !== 'function') {
    setLoginStatus('MD5 脚本加载失败，当前无法登录。', 'error');
    return;
  }
  submitBtn.disabled = true;
  setLoginStatus('登录中...', 'info');

  try {
    const json = await requestJson(`api/logon/login?time=${Date.now()}`, {
      method: 'POST',
      body: {
        code,
        password: md5(LOGIN_PASSWORD),
      },
      auth: false,
    });

    if (!json || json.code !== 200 || !json.data || !json.data.token || !json.data.loginid) {
      throw new Error(buildBusinessError(json, '登录失败：'));
    }

    const session = {
      code,
      loginid: json.data.loginid,
      token: json.data.token,
      savedAt: Date.now(),
    };

    writeSession(session);
    saveLastCode(rawCode);
    setSession(session);
    setRoomsStatus('登录成功，正在加载浴室列表和可预约项...', 'info');
    await refreshRooms('正在加载浴室列表和可预约项...');
  } catch (error) {
    setLoginStatus(error.message, 'error');
  } finally {
    submitBtn.disabled = false;
  }
}

function handleLogout(message) {
  clearSessionStorage();
  if (roomsStatusEl) {
    roomsStatusEl.textContent = '';
  }
  setSession(null);
  setLoginStatus(message || '已退出登录。', 'info');
  codeInput.focus();
}

function toggleTimeFormat() {
  if (!state.session) {
    return;
  }

  state.timeFormat = state.timeFormat === '12h' ? '24h' : '12h';
  writeTimeFormatPreference(state.session.code, state.timeFormat);
  updateTimeFormatButton();
  renderSlots();
  setRoomsStatus(`已切换为 ${state.timeFormat === '12h' ? '12' : '24'} 小时制。`, 'success');
}

form.addEventListener('submit', handleLogin);
timeFormatBtn.addEventListener('click', () => {
  toggleTimeFormat();
});
refreshBtn.addEventListener('click', async () => {
  await refreshRooms('正在刷新浴室列表...');
});
logoutBtn.addEventListener('click', () => {
  handleLogout('已退出登录。');
});
roomListEl.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-room-id]');

  if (!target) {
    return;
  }

  await selectRoom(target.getAttribute('data-room-id') || '');
});
mobileTabsEl.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-room-tab]');

  if (!target) {
    return;
  }

  await selectRoom(target.getAttribute('data-room-tab') || '');
});
window.addEventListener('resize', () => {
  renderRooms();
  renderSlots();
  renderMobileTabs();
});
slotListEl.addEventListener('click', async (event) => {
  const swapTarget = event.target.closest('[data-swap-slot-id]');

  if (swapTarget && !swapTarget.disabled) {
    await handleSwap(swapTarget.getAttribute('data-swap-slot-id') || '');
    return;
  }

  const target = event.target.closest('[data-slot-id]');

  if (!target || target.disabled) {
    return;
  }

  await handleBook(target.getAttribute('data-slot-id') || '');
});

restoreLastCode();
renderRooms();
renderSlots();

loadAccountsConf()
  .catch(() => {
    setRoomsStatus(swapConfigError || '交换配置读取失败。', 'error');
  })
  .finally(() => {
    const initialSession = readSession();

    if (initialSession) {
      setSession(initialSession);
      refreshRooms('正在恢复浴室列表和可预约项...');
    } else {
      setSession(null);
      setLoginStatus('请输入账号和密码登录。', 'info');
    }
  });

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}
