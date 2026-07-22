(function initializePopup() {
  'use strict';

  const sync = globalThis.FanzaFavoriteSync;
  const dashboardOrigin = document.querySelector('#dashboard-origin');
  const checkButton = document.querySelector('#check');
  const persistButton = document.querySelector('#persist');
  const status = document.querySelector('#status');
  const extractionResult = document.querySelector('#extraction-result');
  const syncResult = document.querySelector('#sync-result');
  let checkedState;
  let running = false;

  function setStatus(message, type) {
    status.textContent = message;
    status.className = `status${type ? ` ${type}` : ''}`;
  }

  function setBusy(value) {
    running = value;
    checkButton.disabled = value;
    persistButton.disabled = value || !checkedState;
  }

  function number(value) {
    return Number.isFinite(value) ? String(value) : '0';
  }

  function showExtraction(result) {
    document.querySelector('#extracted-count').textContent = number(result.extractedCount);
    document.querySelector('#duplicate-count').textContent = number(result.duplicateCount);
    document.querySelector('#vr-count').textContent = number(result.vrExcludedCount);
    document.querySelector('#truncated-count').textContent = number(result.truncatedCount);
    document.querySelector('#modern-format-count').textContent = number(result.urlFormatCounts && result.urlFormatCounts.videoAvContent);
    document.querySelector('#legacy-format-count').textContent = number(result.urlFormatCounts && result.urlFormatCounts.legacyVideoaDetail);
    document.querySelector('#unsupported-product-count').textContent = number(result.unsupportedProductTypeCount);
    extractionResult.hidden = false;
  }

  function showSync(result) {
    document.querySelector('#matched-count').textContent = number(result.matchedProductCount);
    document.querySelector('#save-candidate-count').textContent = number(result.saveCandidateCount);
    document.querySelector('#invalid-count').textContent = number(result.invalidCount);
    document.querySelector('#unavailable-count').textContent = number(result.metadataUnavailableCount);
    document.querySelector('#api-not-listed-count').textContent = number(result.apiNotListedCount);
    document.querySelector('#id-mismatch-count').textContent = number(result.metadataIdMismatchCount);
    document.querySelector('#invalid-metadata-count').textContent = number(result.invalidMetadataCount);
    document.querySelector('#failed-count').textContent = number(result.metadataFailedCount + result.failedProductCount);
    syncResult.hidden = false;
  }

  function messageFor(error) {
    switch (error && error.code) {
      case 'invalid_dashboard_origin': return 'Railway DashboardのHTTPS originだけを入力してください。';
      case 'not_favorite_page': return 'FANZAのお気に入りページで実行してください。';
      case 'invalid_urls': return '安全に同期できる公式商品URLがありません。';
      case 'dashboard_auth_required': return 'Dashboardを同じブラウザーで開き、Basic認証後に再実行してください。';
      case 'sync_rejected': return '同期APIが要求を拒否しました。Dashboardで状態を確認してください。';
      case 'invalid_response': return '同期APIの応答を確認できませんでした。';
      case 'network_error': return 'Dashboardへ接続できませんでした。';
      default: return '安全に処理できなかったため停止しました。';
    }
  }

  async function requestOriginPermission(origin) {
    const origins = [`${origin}/*`];
    if (await chrome.permissions.contains({ origins })) return true;
    return chrome.permissions.request({ origins });
  }

  async function activeFavoriteTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || typeof tab.id !== 'number' || !sync.isAllowedFavoritesPage(tab.url)) throw new sync.SafeSyncError('not_favorite_page');
    return tab;
  }

  async function extractFromTab(tabId) {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['core.js'] });
    const [execution] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (limit) => globalThis.FanzaFavoriteSync.extractFavoriteUrls(document, location.href, limit),
      args: [sync.MAX_URLS]
    });
    if (!execution || !execution.result) throw new sync.SafeSyncError('invalid_urls');
    return execution.result;
  }

  async function send(origin, urls, persist) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      return await sync.sendFavoriteSync(fetch.bind(globalThis), origin, urls, persist, controller.signal);
    } finally {
      clearTimeout(timeout);
    }
  }

  checkButton.addEventListener('click', async () => {
    if (running) return;
    checkedState = undefined;
    extractionResult.hidden = true;
    syncResult.hidden = true;
    setBusy(true);
    setStatus('確認中…');
    try {
      const origin = sync.normalizeDashboardOrigin(dashboardOrigin.value);
      const tab = await activeFavoriteTab();
      if (!await requestOriginPermission(origin)) throw new sync.SafeSyncError('network_error');
      const extraction = await extractFromTab(tab.id);
      showExtraction(extraction);
      if (extraction.urls.length === 0) throw new sync.SafeSyncError('invalid_urls');
      const result = await send(origin, extraction.urls, false);
      showSync(result);
      if (sync.canPersist(result, extraction.urls.length)) {
        checkedState = { origin, urls: extraction.urls };
        setStatus('check-only成功。件数確認後にpersistできます。', 'success');
      } else {
        setStatus('check-onlyは完了しましたが、安全条件を満たさないためpersistできません。', 'error');
      }
    } catch (error) {
      checkedState = undefined;
      setStatus(messageFor(error), 'error');
    } finally {
      setBusy(false);
    }
  });

  persistButton.addEventListener('click', async () => {
    if (running || !checkedState) return;
    if (!confirm('check-onlyで確認したお気に入り集合を1回だけ保存しますか？')) return;
    const state = checkedState;
    checkedState = undefined;
    setBusy(true);
    setStatus('persist実行中…');
    try {
      const result = await send(state.origin, state.urls, true);
      showSync(result);
      setStatus(`persist成功：お気に入り${number(result.currentCount)}件`, 'success');
    } catch (error) {
      setStatus(messageFor(error), 'error');
    } finally {
      setBusy(false);
    }
  });
})();
