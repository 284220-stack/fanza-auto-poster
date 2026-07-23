(function initializeFavoriteSync(global) {
  'use strict';

  const MAX_URLS = 20;
  const FAVORITE_PAGE_HOSTS = new Set(['www.dmm.co.jp', 'video.dmm.co.jp', 'www.fanza.com']);
  const FAVORITE_PATH_SEGMENTS = new Set(['favorite', 'favorites', 'bookmark', 'bookmarks']);
  const SALE_PAGE_URL = 'https://video.dmm.co.jp/av/list/';
  const SALE_PAGE_HOST = 'video.dmm.co.jp';
  const SALE_PAGE_PATH = '/av/list/';

  class SafeSyncError extends Error {
    constructor(code, status) {
      super(code);
      this.name = 'SafeSyncError';
      this.code = code;
      this.status = status;
    }
  }

  function parseUrl(value) {
    try {
      return new URL(String(value || '').trim());
    } catch {
      return undefined;
    }
  }

  function isOfficialHost(hostname) {
    const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
    return host === 'dmm.co.jp' || host.endsWith('.dmm.co.jp') || host === 'dmm.com' || host.endsWith('.dmm.com') || host === 'fanza.com' || host.endsWith('.fanza.com');
  }

  function normalizeContentId(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return /^[a-z0-9][a-z0-9_-]{0,127}$/.test(normalized) ? normalized : undefined;
  }

  function extractAnyOfficialContentId(url) {
    const queryKeys = url.hostname.toLowerCase() === 'video.dmm.co.jp'
      ? ['id', 'cid', 'content_id']
      : ['cid', 'content_id'];
    for (const key of queryKeys) {
      const contentId = normalizeContentId(url.searchParams.get(key));
      if (contentId) return contentId;
    }
    const pathMatch = url.pathname.match(/(?:^|\/)cid=([^/]+)(?:\/|$)/i);
    return normalizeContentId(pathMatch && pathMatch[1]);
  }

  function classifyProductLink(value) {
    const url = parseUrl(value);
    if (!url || url.protocol !== 'https:' || !isOfficialHost(url.hostname)) return undefined;
    const looksLikeProduct = /(?:^|\/)(?:content|detail)(?:\/|$)/i.test(url.pathname)
      || /(?:^|\/)cid=/i.test(url.pathname)
      || ['id', 'cid', 'content_id'].some((key) => url.searchParams.has(key));
    if (!looksLikeProduct) return undefined;
    const contentId = extractAnyOfficialContentId(url);
    if (url.hostname.toLowerCase() === 'video.dmm.co.jp' && /^\/av\/content\/?$/i.test(url.pathname)) {
      return { format: 'video_av_content', contentId };
    }
    if (/^\/digital\/videoa\/-\/detail\/=\/cid=[^/]+\/?$/i.test(url.pathname)) {
      return { format: 'legacy_videoa_detail', contentId };
    }
    return { format: 'unsupported_product_type', contentId };
  }

  function extractContentId(value) {
    const classified = classifyProductLink(value);
    return classified && classified.format !== 'unsupported_product_type' ? classified.contentId : undefined;
  }

  function isAllowedFavoritesPage(value) {
    const url = parseUrl(value);
    if (!url || url.protocol !== 'https:' || !FAVORITE_PAGE_HOSTS.has(url.hostname.toLowerCase())) return false;
    return url.pathname.toLowerCase().split('/').filter(Boolean).some((segment) => FAVORITE_PATH_SEGMENTS.has(segment));
  }

  function isAllowedSalePage(value) {
    const url = parseUrl(value);
    return Boolean(url
      && url.protocol === 'https:'
      && url.hostname.toLowerCase() === SALE_PAGE_HOST
      && `${url.pathname.replace(/\/+$/, '')}/` === SALE_PAGE_PATH);
  }

  function validateSalePage(documentValue, pageUrl) {
    const title = String(documentValue && documentValue.title || '').normalize('NFKC').trim().toLowerCase();
    const url = parseUrl(pageUrl);
    if (!isAllowedSalePage(pageUrl)) {
      if ((url && isOfficialHost(url.hostname) && /(?:age|check_age|age_check|adult_check)/i.test(`${url.pathname}${url.search}`)) || /年齢(?:確認|認証)|age\s*(?:check|verification)/i.test(title)) {
        throw new SafeSyncError('age_verification_required');
      }
      if ((url && isOfficialHost(url.hostname) && /(?:login|signin|auth)/i.test(url.pathname)) || /ログイン|sign\s*in/i.test(title)) {
        throw new SafeSyncError('login_required');
      }
      throw new SafeSyncError('not_sale_page');
    }
    if (documentValue && typeof documentValue.readyState === 'string' && documentValue.readyState !== 'complete') {
      throw new SafeSyncError('page_loading');
    }
    if (/年齢(?:確認|認証)|age\s*(?:check|verification)/i.test(title)) throw new SafeSyncError('age_verification_required');
    if (/ログイン|sign\s*in/i.test(title)) throw new SafeSyncError('login_required');
    if (/エラー|error|not\s+found|メンテナンス/i.test(title)) throw new SafeSyncError('sale_page_error');
  }

  function isExplicitVrLabel(value) {
    const normalized = String(value || '').normalize('NFKC').trim().toLowerCase();
    return /^(?:【\s*vr\s*】|\[\s*vr\s*\])/.test(normalized);
  }

  function hasExplicitVrLabel(anchor) {
    const values = [
      anchor.textContent,
      anchor.getAttribute && anchor.getAttribute('title'),
      anchor.getAttribute && anchor.getAttribute('aria-label')
    ];
    const container = anchor.closest && anchor.closest('article, li, [data-product-id], [data-content-id]');
    if (container) {
      values.push(container.getAttribute && container.getAttribute('data-title'));
      values.push(container.textContent);
    }
    return values.some((value) => typeof value === 'string' && isExplicitVrLabel(value));
  }

  function extractFavoriteUrls(documentValue, pageUrl, limit = MAX_URLS) {
    if (!isAllowedFavoritesPage(pageUrl)) throw new SafeSyncError('not_favorite_page');
    return extractProductUrls(documentValue, limit);
  }

  function extractSaleUrls(documentValue, pageUrl, limit = MAX_URLS) {
    validateSalePage(documentValue, pageUrl);
    const result = extractProductUrls(documentValue, limit);
    if (result.urls.length === 0) throw new SafeSyncError('sale_page_not_ready');
    return result;
  }

  function extractProductUrls(documentValue, limit) {
    const boundedLimit = Math.min(MAX_URLS, Math.max(1, Number.isInteger(limit) ? limit : MAX_URLS));
    const products = new Map();
    let scannedLinkCount = 0;
    let candidateLinkCount = 0;
    let invalidCandidateCount = 0;
    let duplicateCount = 0;
    let unsupportedProductLinkCount = 0;
    const unsupportedContentIds = new Set();
    const urlFormatCounts = { videoAvContent: 0, legacyVideoaDetail: 0, unsupportedProductType: 0 };

    for (const anchor of documentValue.querySelectorAll('a[href]')) {
      scannedLinkCount += 1;
      const href = anchor.href || (anchor.getAttribute && anchor.getAttribute('href')) || '';
      const classified = classifyProductLink(href);
      if (!classified) continue;
      candidateLinkCount += 1;
      if (classified.format === 'video_av_content') urlFormatCounts.videoAvContent += 1;
      else if (classified.format === 'legacy_videoa_detail') urlFormatCounts.legacyVideoaDetail += 1;
      else urlFormatCounts.unsupportedProductType += 1;
      if (classified.format === 'unsupported_product_type') {
        unsupportedProductLinkCount += 1;
        if (classified.contentId) unsupportedContentIds.add(classified.contentId);
        else invalidCandidateCount += 1;
        continue;
      }
      const contentId = classified.contentId;
      if (!contentId) {
        invalidCandidateCount += 1;
        continue;
      }
      const vr = hasExplicitVrLabel(anchor);
      const existing = products.get(contentId);
      if (existing) {
        duplicateCount += 1;
        existing.vr = existing.vr || vr;
        continue;
      }
      products.set(contentId, {
        url: `https://video.dmm.co.jp/av/content/?id=${encodeURIComponent(contentId)}`,
        vr
      });
    }

    const nonVr = [...products.values()].filter((product) => !product.vr);
    const urls = nonVr.slice(0, boundedLimit).map((product) => product.url);
    const unsupportedProductTypeCount = [...unsupportedContentIds].filter((contentId) => !products.has(contentId)).length;
    return {
      urls,
      scannedLinkCount,
      candidateLinkCount,
      uniqueProductCount: products.size,
      extractedCount: urls.length,
      invalidCandidateCount,
      duplicateCount,
      unsupportedProductLinkCount,
      unsupportedProductTypeCount,
      urlFormatCounts,
      vrExcludedCount: products.size - nonVr.length,
      truncatedCount: Math.max(0, nonVr.length - urls.length)
    };
  }

  function normalizeDashboardOrigin(value) {
    const url = parseUrl(value);
    if (!url || url.username || url.password || url.search || url.hash) throw new SafeSyncError('invalid_dashboard_origin');
    const localHttp = url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
    const railwayHttps = url.protocol === 'https:' && url.hostname.toLowerCase().endsWith('.up.railway.app');
    if (!railwayHttps && !localHttp) throw new SafeSyncError('invalid_dashboard_origin');
    if (url.pathname !== '/' && url.pathname !== '') throw new SafeSyncError('invalid_dashboard_origin');
    return url.origin;
  }

  function createSyncPayload(urls, persist) {
    if (!Array.isArray(urls) || urls.length < 1 || urls.length > MAX_URLS || urls.some((url) => !extractContentId(url))) {
      throw new SafeSyncError('invalid_urls');
    }
    return { urls: [...urls], persist: persist === true };
  }

  function createSaleSyncPayload(urls, persist, snapshotComplete, expectedHash, checkToken) {
    const payload = createSyncPayload(urls, persist);
    payload.snapshotComplete = snapshotComplete === true;
    if (persist === true) {
      if (typeof expectedHash !== 'string' || !/^[a-f0-9]{64}$/.test(expectedHash)) throw new SafeSyncError('invalid_snapshot_hash');
      if (typeof checkToken !== 'string' || !/^[A-Za-z0-9_-]{32,}$/.test(checkToken)) throw new SafeSyncError('invalid_check_token');
      payload.expectedHash = expectedHash;
      payload.checkToken = checkToken;
    }
    return payload;
  }

  function canPersist(result, expectedCount) {
    if (!result || result.checkOnly !== true || result.receivedCount !== expectedCount || result.uniqueProductCount < 1) return false;
    const zeroFields = ['invalidCount', 'metadataUnavailableCount', 'metadataFailedCount', 'vrExcludedCount', 'failedProductCount'];
    if (zeroFields.some((key) => result[key] !== 0)) return false;
    return result.matchedProductCount + result.saveCandidateCount === result.uniqueProductCount;
  }

  function canPersistSale(result, expectedCount, snapshotComplete) {
    if (!result || result.checkOnly !== true || result.schemaReady !== true || snapshotComplete !== true) return false;
    if (result.snapshotComplete !== true || result.receivedCount !== expectedCount || result.uniqueProductCount !== expectedCount) return false;
    if (result.metadataAvailableCount !== expectedCount || typeof result.snapshotHash !== 'string' || !/^[a-f0-9]{64}$/.test(result.snapshotHash)) return false;
    if (typeof result.checkToken !== 'string' || !/^[A-Za-z0-9_-]{32,}$/.test(result.checkToken)) return false;
    const zeroFields = ['invalidCount', 'apiNotListedCount', 'metadataIdMismatchCount', 'invalidMetadataCount', 'vrExcludedCount', 'failedCount'];
    return zeroFields.every((key) => result[key] === 0);
  }

  async function sendFavoriteSync(fetchValue, originValue, urls, persist, signal) {
    const origin = normalizeDashboardOrigin(originValue);
    const body = createSyncPayload(urls, persist);
    return sendSync(fetchValue, origin, '/api/favorites/sync', body, persist, signal);
  }

  function createSaleSnapshot(pageUrl, extraction) {
    const url = parseUrl(pageUrl);
    if (!url || !isAllowedSalePage(url.href)) throw new SafeSyncError('not_sale_page');
    url.hash = '';
    return JSON.stringify({
      pageUrl: url.href,
      urls: [...extraction.urls],
      extractedCount: extraction.extractedCount,
      duplicateCount: extraction.duplicateCount,
      truncatedCount: extraction.truncatedCount,
      invalidCandidateCount: extraction.invalidCandidateCount,
      unsupportedProductTypeCount: extraction.unsupportedProductTypeCount,
      vrExcludedCount: extraction.vrExcludedCount,
      urlFormatCounts: extraction.urlFormatCounts
    });
  }

  async function sendManualSaleSync(fetchValue, originValue, urls, persist, snapshotComplete, expectedHash, checkToken, signal) {
    const origin = normalizeDashboardOrigin(originValue);
    const body = createSaleSyncPayload(urls, persist, snapshotComplete, expectedHash, checkToken);
    return sendSync(fetchValue, origin, '/api/sales/manual-sync', body, persist, signal);
  }

  async function sendSync(fetchValue, origin, pathname, body, persist, signal) {
    let response;
    try {
      response = await fetchValue(`${origin}${pathname}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal
      });
    } catch {
      throw new SafeSyncError('network_error');
    }
    if (response.status === 401) throw new SafeSyncError('dashboard_auth_required', 401);
    if (!response.ok) throw new SafeSyncError('sync_rejected', response.status);
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new SafeSyncError('invalid_response', response.status);
    }
    if (!payload || typeof payload.result !== 'object' || payload.result === null || payload.result.checkOnly !== !persist) {
      throw new SafeSyncError('invalid_response', response.status);
    }
    return payload.result;
  }

  global.FanzaFavoriteSync = Object.freeze({
    MAX_URLS,
    SALE_PAGE_URL,
    SafeSyncError,
    canPersist,
    canPersistSale,
    createSaleSyncPayload,
    createSaleSnapshot,
    createSyncPayload,
    classifyProductLink,
    extractContentId,
    extractFavoriteUrls,
    extractSaleUrls,
    isAllowedFavoritesPage,
    isAllowedSalePage,
    isExplicitVrLabel,
    normalizeDashboardOrigin,
    sendFavoriteSync,
    sendManualSaleSync,
    validateSalePage
  });
})(globalThis);
