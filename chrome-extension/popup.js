(function initializePopup() {
  'use strict';

  const sync = globalThis.FanzaFavoriteSync;
  const dashboardOrigin = document.querySelector('#dashboard-origin');
  const developerOriginButton = document.querySelector('#enable-developer-origin');
  const openSaleButton = document.querySelector('#open-sale');
  const saleCheckButton = document.querySelector('#sale-check');
  const salePersistButton = document.querySelector('#sale-persist');
  const favoriteCheckButton = document.querySelector('#favorite-check');
  const favoritePersistButton = document.querySelector('#favorite-persist');
  const status = document.querySelector('#status');
  const extractionResult = document.querySelector('#extraction-result');
  const syncResult = document.querySelector('#sync-result');
  const checkedStates = { sale: undefined, favorite: undefined };
  let running = false;

  dashboardOrigin.value = sync.PRODUCTION_DASHBOARD_ORIGIN;
  dashboardOrigin.readOnly = true;

  developerOriginButton.addEventListener('click', () => {
    const enable = dashboardOrigin.readOnly;
    dashboardOrigin.readOnly = !enable;
    dashboardOrigin.setAttribute('aria-readonly', String(!enable));
    developerOriginButton.setAttribute('aria-pressed', String(enable));
    developerOriginButton.textContent = enable ? '正式production URLへ戻す' : '開発用originの編集を有効にする';
    if (enable) {
      dashboardOrigin.focus();
      dashboardOrigin.select();
    } else {
      dashboardOrigin.value = sync.PRODUCTION_DASHBOARD_ORIGIN;
    }
  });

  function setStatus(message, type) {
    status.textContent = message;
    status.className = `status${type ? ` ${type}` : ''}`;
  }

  function setBusy(value) {
    running = value;
    developerOriginButton.disabled = value;
    openSaleButton.disabled = value;
    saleCheckButton.disabled = value;
    favoriteCheckButton.disabled = value;
    salePersistButton.disabled = value || !checkedStates.sale;
    favoritePersistButton.disabled = value || !checkedStates.favorite;
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

  function showSync(result, persistAllowed, persistReason = '安全条件未達') {
    document.querySelector('#matched-count').textContent = number(result.matchedProductCount);
    document.querySelector('#save-candidate-count').textContent = number(result.saveCandidateCount ?? (result.metadataAvailableCount - result.matchedProductCount));
    document.querySelector('#sale-listing-count').textContent = number(result.saleListingCandidateCount);
    document.querySelector('#favorite-sale-count').textContent = number(result.favoriteSaleCandidateCount);
    document.querySelector('#invalid-count').textContent = number(result.invalidCount);
    document.querySelector('#unavailable-count').textContent = number(result.metadataUnavailableCount ?? (result.apiNotListedCount + result.metadataIdMismatchCount + result.invalidMetadataCount));
    document.querySelector('#api-not-listed-count').textContent = number(result.apiNotListedCount);
    document.querySelector('#id-mismatch-count').textContent = number(result.metadataIdMismatchCount);
    document.querySelector('#invalid-metadata-count').textContent = number(result.invalidMetadataCount);
    document.querySelector('#failed-count').textContent = number((result.metadataFailedCount ?? 0) + (result.failedProductCount ?? result.failedCount ?? 0));
    document.querySelector('#persist-state').textContent = persistAllowed ? '可能' : '不可';
    document.querySelector('#persist-reason').textContent = persistAllowed ? '全件確認済み' : persistReason;
    document.querySelector('#persisted-count').textContent = number((result.createdProductCount ?? 0) + (result.updatedProductCount ?? 0));
    syncResult.hidden = false;
  }

  function messageFor(error) {
    switch (error && error.code) {
      case 'invalid_dashboard_origin': return 'Railway DashboardのHTTPS originだけを入力してください。';
      case 'not_favorite_page': return 'FANZAのお気に入りページを開いてください。';
      case 'not_sale_page': return '「FANZAセール一覧を開く」から対象ページを開いてください。';
      case 'age_verification_required': return '年齢確認を手動で完了してから再実行してください。';
      case 'login_required': return 'FANZAのログインを手動で完了してから再実行してください。';
      case 'page_loading': return 'ページの読込み完了後に再実行してください。';
      case 'sale_page_error': return 'セール一覧が正常表示されていません。ページを再読込みしてください。';
      case 'sale_page_not_ready': return 'セール商品を確認できません。年齢確認とページ読込みを確認してください。';
      case 'sale_page_changed': return 'check-only後にページ内容が変わりました。もう一度check-onlyしてください。';
      case 'invalid_urls': return '安全に同期できる公式商品URLがありません。';
      case 'invalid_snapshot_hash': return 'check-only後の商品集合を確認できません。';
      case 'invalid_check_token': return 'check-only結果が無効です。もう一度check-onlyしてください。';
      case 'dashboard_auth_required': return 'Dashboardを同じブラウザーで開き、Basic認証後に再実行してください。';
      case 'sync_rejected': return '同期APIが要求を拒否しました。もう一度check-onlyしてください。';
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

  async function activeSyncTab(mode) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const valid = tab && typeof tab.id === 'number' && (mode === 'sale' || sync.isAllowedFavoritesPage(tab.url));
    if (!valid) throw new sync.SafeSyncError(mode === 'sale' ? 'not_sale_page' : 'not_favorite_page');
    return tab;
  }

  async function extractFromTab(tabId, mode) {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['core.js'] });
    const [execution] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (limit, selectedMode) => {
        try {
          return {
            pageUrl: location.href,
            extraction: selectedMode === 'sale'
              ? globalThis.FanzaFavoriteSync.extractSaleUrls(document, location.href, limit)
              : globalThis.FanzaFavoriteSync.extractFavoriteUrls(document, location.href, limit)
          };
        } catch (error) {
          return { error: error && error.code || 'invalid_urls' };
        }
      },
      args: [sync.MAX_URLS, mode]
    });
    if (!execution || !execution.result) throw new sync.SafeSyncError('invalid_urls');
    if (execution.result.error) throw new sync.SafeSyncError(execution.result.error);
    return execution.result;
  }

  async function send(origin, urls, persist, mode, snapshotComplete, expectedHash, checkToken) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      return mode === 'sale'
        ? await sync.sendManualSaleSync(fetch.bind(globalThis), origin, urls, persist, snapshotComplete, expectedHash, checkToken, controller.signal)
        : await sync.sendFavoriteSync(fetch.bind(globalThis), origin, urls, persist, controller.signal);
    } finally {
      clearTimeout(timeout);
    }
  }

  async function check(mode) {
    if (running) return;
    checkedStates[mode] = undefined;
    extractionResult.hidden = true;
    syncResult.hidden = true;
    setBusy(true);
    setStatus('check-only確認中…');
    try {
      const origin = sync.normalizeDashboardOrigin(dashboardOrigin.value);
      const tab = await activeSyncTab(mode);
      if (!await requestOriginPermission(origin)) throw new sync.SafeSyncError('network_error');
      const page = await extractFromTab(tab.id, mode);
      const extraction = page.extraction;
      showExtraction(extraction);
      if (extraction.urls.length === 0) throw new sync.SafeSyncError('invalid_urls');
      const snapshotComplete = extraction.truncatedCount === 0 && extraction.invalidCandidateCount === 0;
      const result = await send(origin, extraction.urls, false, mode, snapshotComplete);
      const safe = mode === 'sale'
        ? sync.canPersistSale(result, extraction.urls.length, snapshotComplete)
        : sync.canPersist(result, extraction.urls.length);
      const persistReason = extraction.truncatedCount > 0 ? '最大20件を超過'
        : extraction.invalidCandidateCount > 0 ? '不正URLあり'
          : result.apiNotListedCount > 0 ? 'API未掲載あり'
            : result.metadataIdMismatchCount > 0 ? 'ID不一致あり'
              : result.invalidMetadataCount > 0 ? 'metadata不完全あり'
                : result.failedCount > 0 ? '通信・API失敗あり'
                  : result.vrExcludedCount > 0 ? 'server側VR除外あり'
                    : result.schemaReady === false ? '取得経路schema未準備'
                      : '安全条件未達';
      showSync(result, safe, persistReason);
      if (safe) {
        checkedStates[mode] = {
          origin,
          urls: extraction.urls,
          mode,
          tabId: tab.id,
          snapshotComplete,
          expectedHash: result.snapshotHash,
          checkToken: result.checkToken,
          clientSnapshot: mode === 'sale' ? sync.createSaleSnapshot(page.pageUrl, extraction) : undefined
        };
        setStatus('check-only成功。表示件数を確認後、明示操作で1回だけpersistできます。', 'success');
      } else {
        setStatus('check-only完了。ただし安全条件を満たさないためpersistできません。表示された理由別件数を確認してください。', 'error');
      }
    } catch (error) {
      checkedStates[mode] = undefined;
      setStatus(messageFor(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function persist(mode) {
    const state = checkedStates[mode];
    if (running || !state) return;
    const label = mode === 'sale' ? 'セール掲載集合' : 'お気に入り集合';
    if (!confirm(`check-onlyで確認した${label}を1回だけ保存しますか？`)) return;
    checkedStates[mode] = undefined;
    setBusy(true);
    setStatus('persist実行中…');
    try {
      if (mode === 'sale') {
        const current = await extractFromTab(state.tabId, mode);
        if (sync.createSaleSnapshot(current.pageUrl, current.extraction) !== state.clientSnapshot) {
          throw new sync.SafeSyncError('sale_page_changed');
        }
      }
      const result = await send(state.origin, state.urls, true, mode, state.snapshotComplete, state.expectedHash, state.checkToken);
      showSync(result, false, 'persist済み・再確認が必要');
      const count = mode === 'sale'
        ? (result.createdProductCount ?? 0) + (result.updatedProductCount ?? 0)
        : result.currentCount;
      setStatus(`persist成功：${label}${number(count)}件。再実行にはcheck-onlyが必要です。`, 'success');
    } catch (error) {
      showSync({}, false, '再check-onlyが必要');
      setStatus(messageFor(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  openSaleButton.addEventListener('click', async () => {
    if (running) return;
    checkedStates.sale = undefined;
    setBusy(true);
    try {
      await chrome.tabs.create({ url: sync.SALE_PAGE_URL });
    } catch {
      setStatus('セール一覧を開けませんでした。ブラウザー設定を確認してください。', 'error');
    } finally {
      setBusy(false);
    }
  });
  saleCheckButton.addEventListener('click', () => check('sale'));
  favoriteCheckButton.addEventListener('click', () => check('favorite'));
  salePersistButton.addEventListener('click', () => persist('sale'));
  favoritePersistButton.addEventListener('click', () => persist('favorite'));
})();
