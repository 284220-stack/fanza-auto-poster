import { splitActressAliases } from './actress-ui-utils.js';

const labels = { sale: 'セール', newRelease: '新製品' };

function formatDate(value) {
  return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function setMessage(message, error = false) {
  const target = document.querySelector('#formMessage');
  target.textContent = message;
  target.style.color = error ? '#b42318' : '#167b65';
}

function applySettings(status) {
  document.querySelector('#yahooUser').value = status.yahooUser || '';
  document.querySelector('#settingPoll').value = status.pollMinutes;
  document.querySelector('#settingSale').value = status.saleLimit;
  document.querySelector('#settingNew').value = status.newReleaseLimit;
  document.querySelector('#settingDisclosure').value = status.disclosure;
  document.querySelector('#dryRun').checked = status.dryRun;
  document.querySelector('#officialSaleMonitor').checked = Boolean(status.officialSaleMonitor?.enabled);
  document.querySelector('#officialSaleUrls').value = status.officialSaleMonitor?.urls || '';
  const complete = Object.values(status.configured).every(Boolean);
  document.querySelector('#setupBadge').textContent = complete ? '設定済み' : '入力が必要';
}

async function refresh() {
  const button = document.querySelector('#refresh');
  button.textContent = '更新中';
  try {
    const status = await (await fetch('/api/status')).json();
    document.querySelector('#saleCount').textContent = status.daily.sale;
    document.querySelector('#newCount').textContent = status.daily.newRelease;
    document.querySelector('#saleLimit').textContent = `/ ${status.limits.sale} 件`;
    document.querySelector('#newLimit').textContent = `/ ${status.limits.newRelease} 件`;
    document.querySelector('#pollInterval').textContent = status.pollMinutes;
    document.querySelector('#mode').textContent = status.dryRun ? 'テスト運転中' : '自動投稿中';
    document.querySelector('#historyCount').textContent = `${status.history.length} 件`;
    applySettings(status);
    const tbody = document.querySelector('#history');
    tbody.innerHTML = '';
    if (!status.history.length) tbody.innerHTML = '<tr><td colspan="5" class="empty">まだ投稿履歴はありません</td></tr>';
    for (const item of status.history) {
      const row = document.querySelector('#historyRow').content.cloneNode(true);
      row.querySelector('.type').textContent = labels[item.type];
      row.querySelector('.title').textContent = item.title;
      row.querySelector('.state').textContent = item.status === 'posted' ? '投稿済み' : 'テスト';
      row.querySelector('.date').textContent = formatDate(item.postedAt);
      row.querySelector('.open').href = item.url;
      tbody.append(row);
    }
  } catch { document.querySelector('#mode').textContent = '接続待ち'; }
  finally { button.textContent = '更新'; }
}

async function post(path, data) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || '操作に失敗しました。');
  return result;
}

document.querySelector('#settingsForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const values = Object.fromEntries(form.entries());
  values.DRY_RUN = document.querySelector('#dryRun').checked ? 'true' : 'false';
  values.OFFICIAL_SALE_MONITOR_ENABLED = document.querySelector('#officialSaleMonitor').checked ? 'true' : 'false';
  try {
    await post('/api/settings', values);
    event.currentTarget.querySelectorAll('input[type="password"]').forEach((input) => { input.value = ''; });
    setMessage('設定を保存しました。続けて接続テストを実行してください。');
    await refresh();
  } catch (error) { setMessage(error.message, true); }
});

document.querySelector('#testYahoo').addEventListener('click', async () => {
  try { setMessage('Yahoo!メールへ接続しています。'); setMessage((await post('/api/test/yahoo')).message); }
  catch (error) { setMessage(error.message, true); }
});
document.querySelector('#testX').addEventListener('click', async () => {
  try { setMessage('Xへ接続しています。'); setMessage((await post('/api/test/x')).message); }
  catch (error) { setMessage(error.message, true); }
});

document.querySelector('#testOfficialSales').addEventListener('click', async () => {
  try { setMessage('公式セールページへ接続しています。'); setMessage((await post('/api/test/official-sales')).message); }
  catch (error) { setMessage(error.message, true); }
});
document.querySelector('#refresh').addEventListener('click', refresh);
refresh();

let actressBusy = false;
const actressElements = {
  form: document.querySelector('#actressForm'), id: document.querySelector('#actressId'), name: document.querySelector('#actressName'), aliases: document.querySelector('#actressAliases'), priority: document.querySelector('#actressPriority'), interval: document.querySelector('#actressInterval'), weeklyLimit: document.querySelector('#actressWeeklyLimit'), enabled: document.querySelector('#actressEnabled'), newReleases: document.querySelector('#actressNewReleases'), sales: document.querySelector('#actressSales'), search: document.querySelector('#actressSearch'), filter: document.querySelector('#actressEnabledFilter'), list: document.querySelector('#actressList'), message: document.querySelector('#actressMessage'), save: document.querySelector('#saveActress'), cancel: document.querySelector('#cancelActressEdit'), reload: document.querySelector('#reloadActresses'), searchButton: document.querySelector('#searchActresses')
};

function actressMessage(message, error = false) { actressElements.message.textContent = message; actressElements.message.className = error ? 'message error' : 'message success'; }
function apiMessage(result) { return typeof result?.message === 'string' ? result.message : '操作に失敗しました。'; }
function setActressBusy(busy, message) {
  actressBusy = busy;
  actressElements.form.querySelectorAll('input, textarea, button').forEach((element) => { element.disabled = busy; });
  actressElements.reload.disabled = busy;
  actressElements.searchButton.disabled = busy;
  if (message) actressMessage(message);
}
async function actressRequest(path, options = {}) {
  const response = await fetch(path, options);
  let result = {};
  try { result = await response.json(); } catch { /* 安全な固定メッセージを使用する */ }
  if (!response.ok) throw new Error(apiMessage(result));
  return result;
}
function setCell(row, text) { const cell = document.createElement('td'); cell.textContent = text; row.append(cell); return cell; }
function actionButton(text, className, handler) { const button = document.createElement('button'); button.type = 'button'; button.className = `button ${className}`; button.textContent = text; button.addEventListener('click', handler); return button; }
function renderActresses(actresses) {
  actressElements.list.replaceChildren();
  if (!actresses.length) { const row = document.createElement('tr'); const cell = setCell(row, '条件に一致する女優はいません。'); cell.colSpan = 6; cell.className = 'empty'; actressElements.list.append(row); return; }
  for (const actress of actresses) {
    const row = document.createElement('tr');
    setCell(row, actress.aliases.length ? `${actress.name}\n別名: ${actress.aliases.join('、')}` : actress.name).className = 'actress-name';
    setCell(row, actress.enabled ? '有効' : '無効').className = actress.enabled ? 'state' : 'muted';
    setCell(row, String(actress.priority));
    setCell(row, `${actress.targetNewReleases ? '新作' : ''}${actress.targetNewReleases && actress.targetSales ? '・' : ''}${actress.targetSales ? 'セール' : ''}` || '対象外');
    setCell(row, `${actress.minimumPostIntervalHours}時間ごと / 週${actress.weeklyPostLimit}件`);
    const actions = document.createElement('td'); actions.className = 'row-actions';
    actions.append(actionButton('編集', 'secondary', () => editActress(actress.id)), actionButton(actress.enabled ? '無効にする' : '有効にする', 'secondary', () => toggleActress(actress)), actionButton('削除', 'danger', () => deleteActress(actress)));
    row.append(actions); actressElements.list.append(row);
  }
}
async function loadActresses() {
  if (actressBusy) return;
  setActressBusy(true, '女優一覧を読み込んでいます。');
  try {
    const params = new URLSearchParams(); const search = actressElements.search.value.trim(); const enabled = actressElements.filter.value;
    if (search) params.set('search', search); if (enabled) params.set('enabled', enabled);
    const result = await actressRequest(`/api/actresses${params.size ? `?${params}` : ''}`);
    renderActresses(Array.isArray(result.actresses) ? result.actresses : []); actressMessage('女優一覧を更新しました。');
  } catch (error) { renderActresses([]); actressMessage(error instanceof Error ? error.message : '女優一覧を読み込めませんでした。', true); }
  finally { setActressBusy(false); }
}
function resetActressForm() {
  actressElements.form.reset(); actressElements.id.value = ''; actressElements.priority.value = '100'; actressElements.interval.value = '24'; actressElements.weeklyLimit.value = '2'; actressElements.enabled.checked = true; actressElements.newReleases.checked = true; actressElements.sales.checked = true; actressElements.save.textContent = '女優を追加'; actressElements.cancel.hidden = true;
}
function actressPayload() { return { name: actressElements.name.value, aliases: splitActressAliases(actressElements.aliases.value), enabled: actressElements.enabled.checked, priority: Number(actressElements.priority.value), target_new_releases: actressElements.newReleases.checked, target_sales: actressElements.sales.checked, minimum_post_interval_hours: Number(actressElements.interval.value), weekly_post_limit: Number(actressElements.weeklyLimit.value) }; }
async function editActress(id) {
  if (actressBusy) return; setActressBusy(true, '女優情報を読み込んでいます。');
  try { const { actress } = await actressRequest(`/api/actresses/${id}`); actressElements.id.value = actress.id; actressElements.name.value = actress.name; actressElements.aliases.value = actress.aliases.join(', '); actressElements.enabled.checked = actress.enabled; actressElements.priority.value = actress.priority; actressElements.newReleases.checked = actress.targetNewReleases; actressElements.sales.checked = actress.targetSales; actressElements.interval.value = actress.minimumPostIntervalHours; actressElements.weeklyLimit.value = actress.weeklyPostLimit; actressElements.save.textContent = '変更を保存'; actressElements.cancel.hidden = false; actressMessage('編集内容を変更して保存してください。'); actressElements.name.focus(); }
  catch (error) { actressMessage(error instanceof Error ? error.message : '女優情報を読み込めませんでした。', true); }
  finally { setActressBusy(false); }
}
async function toggleActress(actress) {
  if (actressBusy) return; setActressBusy(true, '有効状態を変更しています。');
  let changed = false;
  try { await actressRequest(`/api/actresses/${actress.id}/enabled`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !actress.enabled }) }); actressMessage(`${actress.name}を${actress.enabled ? '無効' : '有効'}にしました。`); changed = true; }
  catch (error) { actressMessage(error instanceof Error ? error.message : '有効状態を変更できませんでした。', true); }
  finally { setActressBusy(false); if (changed) await loadActresses(); }
}
async function deleteActress(actress) {
  if (actressBusy || !window.confirm(`「${actress.name}」を削除しますか？\n通常は削除ではなく無効化をおすすめします。`)) return;
  setActressBusy(true, '女優を削除しています。');
  let deleted = false;
  try { await actressRequest(`/api/actresses/${actress.id}`, { method: 'DELETE' }); actressMessage('女優を削除しました。'); deleted = true; }
  catch (error) { actressMessage(error instanceof Error ? error.message : '女優を削除できませんでした。', true); }
  finally { setActressBusy(false); if (deleted) await loadActresses(); }
}
actressElements.form.addEventListener('submit', async (event) => {
  event.preventDefault(); if (actressBusy) return;
  const id = actressElements.id.value; setActressBusy(true, id ? '変更を保存しています。' : '女優を追加しています。');
  let saved = false;
  try { await actressRequest(id ? `/api/actresses/${id}` : '/api/actresses', { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(actressPayload()) }); actressMessage(id ? '変更を保存しました。' : '女優を追加しました。'); resetActressForm(); saved = true; }
  catch (error) { actressMessage(error instanceof Error ? error.message : '保存に失敗しました。', true); }
  finally { setActressBusy(false); if (saved) await loadActresses(); }
});
actressElements.cancel.addEventListener('click', resetActressForm);
actressElements.reload.addEventListener('click', loadActresses);
actressElements.searchButton.addEventListener('click', loadActresses);
actressElements.search.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); loadActresses(); } });
loadActresses();
