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
