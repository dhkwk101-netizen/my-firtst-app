// Public Data Update Manager & Multi-Source Synchronization
(function() {
  'use strict';

  const ICONS = {
    'POPULATION': 'groups',
    'TAX': 'account_balance',
    'FISCAL': 'payments',
    'ECONOMY': 'storefront',
  };

  document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('sync-modal');
    const openBtn = document.getElementById('btn-open-sync-modal');
    const closeBtn = document.getElementById('btn-close-sync-modal');
    const closeBtn2 = document.getElementById('btn-close-sync-modal-btn');
    const refreshBtn = document.getElementById('btn-force-check-updates');
    const listContainer = document.getElementById('sync-categories-list');
    const overallBadge = document.getElementById('sync-overall-badge');
    const notifBadge = document.getElementById('sync-notification-badge');
    const lastCheckedLabel = document.getElementById('sync-last-checked');
    const progressBox = document.getElementById('sync-progress-box');
    const progressText = document.getElementById('sync-progress-text');

    if (!modal || !openBtn) return;

    openBtn.addEventListener('click', () => {
      modal.classList.remove('hidden');
      loadUpdateStatus(false);
    });

    const closeModal = () => {
      modal.classList.add('hidden');
    };
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (closeBtn2) closeBtn2.addEventListener('click', closeModal);

    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = '<span class="material-symbols-outlined text-sm animate-spin">progress_activity</span><span>통계청 조회 중...</span>';
        loadUpdateStatus(true).finally(() => {
          refreshBtn.disabled = false;
          refreshBtn.innerHTML = '<span class="material-symbols-outlined text-sm">refresh</span><span>지금 다시 확인</span>';
        });
      });
    }

    // Auto-check on startup (non-blocking, uses 12h cache or background ping)
    setTimeout(() => {
      loadUpdateStatus(false);
    }, 1200);

    async function loadUpdateStatus(force = false) {
      try {
        const res = await fetch(`/api/check-updates?force=${force ? '1' : '0'}`);
        const data = await res.json();
        renderData(data);
      } catch (err) {
        console.error('Failed to check updates:', err);
        if (overallBadge) {
          overallBadge.textContent = '확인 실패';
          overallBadge.className = 'px-2 py-0.5 text-[11px] font-bold rounded-full bg-rose-100 text-rose-800 border border-rose-200';
        }
      }
    }

    function renderData(data) {
      if (!data) return;

      // 1. Notification dot on Header Button
      if (notifBadge) {
        if (data.overall_update_available) {
          notifBadge.classList.remove('hidden');
          openBtn.classList.add('border-emerald-400', 'bg-emerald-50/60');
        } else {
          notifBadge.classList.add('hidden');
          openBtn.classList.remove('border-emerald-400', 'bg-emerald-50/60');
        }
      }

      // 2. Overall Status Badge in Modal
      if (overallBadge) {
        if (data.overall_update_available) {
          overallBadge.textContent = '🆕 새 공표 데이터 감지!';
          overallBadge.className = 'px-2 py-0.5 text-[11px] font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 animate-pulse';
        } else {
          overallBadge.textContent = '✅ 전체 최신 상태 유지 중';
          overallBadge.className = 'px-2 py-0.5 text-[11px] font-bold rounded-full bg-sky-100 text-sky-800 border border-sky-200';
        }
      }

      if (lastCheckedLabel && data.checked_at_human) {
        lastCheckedLabel.textContent = `마지막 KOSIS 확인: ${data.checked_at_human}`;
      }

      // 3. Render Categories
      if (listContainer && data.categories) {
        listContainer.innerHTML = '';
        data.categories.forEach(cat => {
          const icon = ICONS[cat.key] || 'dataset';
          const card = document.createElement('div');

          if (cat.has_update) {
            // New update available card
            card.className = 'p-3.5 rounded-xl bg-white border-2 border-emerald-300 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-all';
            card.innerHTML = `
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 shadow-inner">
                  <span class="material-symbols-outlined text-xl">${icon}</span>
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <h3 class="font-bold text-slate-900 text-sm">${cat.name}</h3>
                    <span class="px-2 py-0.2 text-[10px] font-bold rounded bg-emerald-100 text-emerald-800 border border-emerald-300">신규 공표</span>
                  </div>
                  <p class="text-[11px] text-slate-500 mt-0.5">${cat.provider} · ${cat.description}</p>
                  <div class="flex items-center gap-2 mt-1 text-[11px] font-mono">
                    <span class="text-slate-400">우리 DB: <strong class="text-slate-700 font-bold">${cat.local_year}년</strong></span>
                    <span class="text-emerald-600 font-bold">➔ 통계청 최신: ${cat.available_year}년 발견!</span>
                  </div>
                </div>
              </div>
              <div class="shrink-0 w-full sm:w-auto">
                <button type="button" class="btn-sync-action w-full sm:w-auto px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 hover:brightness-105 text-white font-bold text-xs shadow-md flex items-center justify-center gap-1.5 transition-all" data-category="${cat.key}" data-year="${cat.available_year}">
                  <span class="material-symbols-outlined text-sm font-bold">cloud_download</span>
                  <span>${cat.available_year}년 데이터 즉시 동기화</span>
                </button>
              </div>
            `;
          } else {
            // Up to date card
            card.className = 'p-3 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3';
            card.innerHTML = `
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center shrink-0 border border-sky-100">
                  <span class="material-symbols-outlined text-lg">${icon}</span>
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <h3 class="font-semibold text-slate-800 text-xs">${cat.name}</h3>
                    <span class="px-1.5 py-0.2 text-[10px] font-semibold rounded bg-slate-100 text-slate-600">최신 유지</span>
                  </div>
                  <p class="text-[11px] text-slate-400 mt-0.5">${cat.provider} · ${cat.description}</p>
                  <div class="flex items-center gap-2 mt-0.5 text-[11px]">
                    <span class="text-slate-500 font-medium">현재 DB: <strong class="text-sky-700 font-bold font-mono">${cat.local_year}년</strong></span>
                    <span class="text-slate-400">(통계청 ${cat.local_year + 1}년 확정치 미공표 대기 중)</span>
                  </div>
                </div>
              </div>
              <div class="shrink-0">
                <span class="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200">
                  <span class="material-symbols-outlined text-xs text-slate-400">hourglass_top</span>
                  <span>발표 대기 중</span>
                </span>
              </div>
            `;
          }
          listContainer.appendChild(card);
        });

        // Attach action handlers to sync buttons
        listContainer.querySelectorAll('.btn-sync-action').forEach(btn => {
          btn.addEventListener('click', () => {
            const catKey = btn.getAttribute('data-category');
            const targetYear = btn.getAttribute('data-year');
            startSync(catKey, targetYear, btn);
          });
        });
      }
    }

    const CATEGORY_NAMES = {
      'POPULATION': '주민등록 인구 통계',
      'TAX': '지방세 세입 통계',
      'FISCAL': '지자체 재정자립도',
      'ECONOMY': '가동 사업체 통계',
    };

    async function startSync(catKey, targetYear, triggerBtn) {
      const catLabel = CATEGORY_NAMES[catKey] || '통계';
      if (!confirm(`통계청(KOSIS)에서 [${targetYear}년 ${catLabel} 데이터]를 수집하여 DB에 적재하시겠습니까?\n(약 2~3초 소요되며, 완료 후 화면이 자동으로 최신화됩니다.)`)) {
        return;
      }

      if (triggerBtn) {
        triggerBtn.disabled = true;
        triggerBtn.classList.add('opacity-60', 'cursor-not-allowed');
      }

      if (progressBox) {
        progressBox.classList.remove('hidden');
        progressBox.className = 'p-3.5 rounded-xl border border-sky-300 bg-sky-50 flex flex-col gap-2 transition-all';
        progressText.innerHTML = `⏳ <strong>통계청 Open API</strong>로부터 ${targetYear}년 ${catLabel}를 수집 및 적재 중입니다...`;
      }

      try {
        const res = await fetch(`/api/sync-updates?category=${encodeURIComponent(catKey)}&year=${encodeURIComponent(targetYear)}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        });
        const result = await res.json();

        if (result.success) {
          if (progressBox) {
            progressBox.className = 'p-3.5 rounded-xl border border-emerald-400 bg-emerald-50 flex flex-col gap-2 transition-all text-emerald-900';
            progressText.innerHTML = `🎉 <strong>${result.message}</strong><br/><span class="text-xs text-emerald-700">새로운 ${targetYear}년 데이터를 화면에 반영하기 위해 페이지를 새로고침합니다...</span>`;
          }
          setTimeout(() => {
            window.location.reload();
          }, 1800);
        } else {
          alert('동기화 실패: ' + (result.message || '알 수 없는 오류'));
          if (progressBox) progressBox.classList.add('hidden');
          if (triggerBtn) {
            triggerBtn.disabled = false;
            triggerBtn.classList.remove('opacity-60', 'cursor-not-allowed');
          }
        }
      } catch (err) {
        console.error('Sync failed:', err);
        alert('동기화 통신 중 오류가 발생했습니다.');
        if (triggerBtn) {
          triggerBtn.disabled = false;
          triggerBtn.classList.remove('opacity-60', 'cursor-not-allowed');
        }
      }
    }

    // Google Drive Full RAW Backup Button Handler
    const backupDriveBtn = document.getElementById('btn-sync-upload-drive-zip');
    const backupStatusEl = document.getElementById('drive-backup-status');

    if (backupDriveBtn) {
      backupDriveBtn.addEventListener('click', async () => {
        const origHtml = backupDriveBtn.innerHTML;
        backupDriveBtn.disabled = true;
        backupDriveBtn.innerHTML = '<span class="material-symbols-outlined text-xs animate-spin">progress_activity</span><span>압축 & 전송 중...</span>';

        if (backupStatusEl) {
          backupStatusEl.classList.remove('hidden');
          backupStatusEl.className = 'text-[11px] font-medium text-sky-700 pt-1';
          backupStatusEl.textContent = '⏳ 로컬 수집 결과물(35개 JSON)을 ZIP 압축하여 구글 드라이브로 전송하고 있습니다...';
        }

        try {
          const res = await fetch('/api/drive-upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'raw_zip', filename: 'kosis_raw_dataset.zip' })
          });
          const result = await res.json();
          if (result.success) {
            if (backupStatusEl) {
              backupStatusEl.className = 'text-[11px] font-semibold text-emerald-700 pt-1';
              backupStatusEl.innerHTML = `🎉 <strong>구글 드라이브 백업 완료!</strong> (${result.message || 'STATRACE 폴더에 저장됨'})`;
            }
            backupDriveBtn.innerHTML = '<span class="material-symbols-outlined text-xs text-emerald-300">check</span><span>백업 완료</span>';
            setTimeout(() => {
              backupDriveBtn.innerHTML = origHtml;
              backupDriveBtn.disabled = false;
            }, 3500);
          } else {
            if (backupStatusEl) {
              backupStatusEl.className = 'text-[11px] font-semibold text-rose-600 pt-1';
              backupStatusEl.textContent = `❌ 구글 드라이브 전송 실패: ${result.error || '권한 또는 할당량 오류'}`;
            }
            backupDriveBtn.innerHTML = origHtml;
            backupDriveBtn.disabled = false;
          }
        } catch (err) {
          console.error(err);
          if (backupStatusEl) {
            backupStatusEl.className = 'text-[11px] font-semibold text-rose-600 pt-1';
            backupStatusEl.textContent = `❌ 통신 오류: ${err.message}`;
          }
          backupDriveBtn.innerHTML = origHtml;
          backupDriveBtn.disabled = false;
        }
      });
    }
  });

})();