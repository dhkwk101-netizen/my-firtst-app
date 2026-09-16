// Regional Data Media Factory: Bar Chart Race 2.0, 1vs1 Versus Battle, and 1-Page Report Card
(function() {
  'use strict';

  function formatRaceValue(val, indKey, isGrowthRate) {
    if (val === null || val === undefined || isNaN(val)) return '0';
    val = Number(val);
    if (isGrowthRate) {
      return (val >= 0 ? '+' : '') + val.toFixed(1) + '%';
    }
    if (indKey.includes('RATIO') || indKey.includes('RATE')) {
      return val.toFixed(2) + '%';
    }
    if (indKey === 'AVERAGE_WAGE') {
      return Math.round(val / 10000).toLocaleString() + '만원';
    }
    if (indKey === 'WORKPLACE_WAGE_EARNERS') {
      if (val >= 10000) {
        return (val / 10000).toFixed(1) + '만명';
      }
      return Math.round(val).toLocaleString() + '명';
    }
    if (indKey.includes('PER_CAPITA')) {
      return Math.round(val).toLocaleString() + '원/인';
    }
    if (indKey.includes('PER_THOUSAND')) {
      return val.toFixed(1) + '개';
    }
    if (indKey.includes('TAX') || indKey.includes('PAYROLL')) {
      if (val >= 1e12) {
        return (val / 1e12).toFixed(1) + '조 원';
      }
      if (val >= 1e8) {
        return Math.round(val / 1e8).toLocaleString() + '억 원';
      }
      return Math.round(val).toLocaleString() + '원';
    }
    if (val >= 1e4) {
      return (val / 1e4).toFixed(1) + '만';
    }
    return Math.round(val).toLocaleString();
  }

  const PROV_COLORS = {
    '서울': '#3b82f6',
    '경기': '#06b6d4',
    '인천': '#0284c7',
    '부산': '#6366f1',
    '대구': '#8b5cf6',
    '광주': '#ec4899',
    '대전': '#10b981',
    '울산': '#14b8a6',
    '세종': '#f59e0b',
    '강원': '#84cc16',
    '충북': '#eab308',
    '충남': '#f97316',
    '전북': '#d946ef',
    '전남': '#a855f7',
    '경북': '#ef4444',
    '경남': '#f43f5e',
    '제주': '#22c55e',
  };

  function getBarColor(shortProv) {
    return PROV_COLORS[shortProv] || '#0284c7';
  }

  window.initBarChartRaceModal = function() {
    const modal = document.getElementById('race-modal');
    const openBtn = document.getElementById('btn-open-race-modal');
    const closeBtn = document.getElementById('btn-close-race-modal');
    const startBtn = document.getElementById('btn-race-play');
    const recordBtn = document.getElementById('btn-race-record');
    const canvas = document.getElementById('race-canvas');

    // Tab buttons & Panels
    const tabRace = document.getElementById('tab-mode-race');
    const tabVersus = document.getElementById('tab-mode-versus');
    const tabCard = document.getElementById('tab-mode-card');
    const panelRace = document.getElementById('panel-mode-race');
    const panelVersus = document.getElementById('panel-mode-versus');
    const panelCard = document.getElementById('panel-mode-card');

    // Race Controls
    const indSelect = document.getElementById('race-indicator-select');
    const rankingModeSelect = document.getElementById('race-ranking-mode');
    const provSelect = document.getElementById('race-province-select');
    const aspectSelect = document.getElementById('race-aspect-select');
    const speedSelect = document.getElementById('race-speed-select');
    const topNSelect = document.getElementById('race-topn-select');
    const customTitleInput = document.getElementById('race-custom-title');
    const customSubtitleInput = document.getElementById('race-custom-subtitle');

    // Versus Controls
    const versusSelectA = document.getElementById('versus-select-a');
    const versusSelectB = document.getElementById('versus-select-b');
    const versusPresets = document.querySelectorAll('.btn-versus-preset');

    // Card Controls
    const cardSelectRegion = document.getElementById('card-select-region');
    const downloadCardBtn = document.getElementById('btn-download-card-png');

    // Shared Status, Progress, and Audio
    const statusText = document.getElementById('race-status-text');
    const progressFill = document.getElementById('race-progress-fill');
    const videoActions = document.getElementById('controls-video-actions');
    const cardActions = document.getElementById('controls-card-actions');
    const bgmFileInput = document.getElementById('race-bgm-file');
    const selectBgmBtn = document.getElementById('btn-select-bgm');
    const removeBgmBtn = document.getElementById('btn-remove-bgm');
    const bgmFilename = document.getElementById('race-bgm-filename');
    const bgmVolume = document.getElementById('race-bgm-volume');
    const bgmVolumeText = document.getElementById('race-bgm-volume-text');
    const thumbBtn = document.getElementById('btn-race-thumbnail');
    const copyTagsBtn = document.getElementById('btn-race-copy-tags');
    const labelBtnThumbnail = document.getElementById('label-btn-thumbnail');

    if (!modal || !openBtn || !canvas) return;

    let currentMode = 'RACE'; // 'RACE' | 'VERSUS' | 'CARD'
    let isPlaying = false;
    let isRecording = false;
    let animFrameId = null;
    let mediaRecorder = null;
    let recordedChunks = [];
    let raceData = null;
    let versusData = null;
    let cardData = null;
    let allRegions = [];

    // Web Audio state
    let audioCtx = null;
    let audioBuffer = null;
    let activeAudioSource = null;
    let activeGainNode = null;
    let currentBgmFile = null;

    function getAudioContext() {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      return audioCtx;
    }

    function startAudioPlayback(destNode, totalDurationMs, holdDurationMs) {
      if (!audioBuffer) return;
      const ctx = getAudioContext();
      stopAudioPlayback();

      activeAudioSource = ctx.createBufferSource();
      activeAudioSource.buffer = audioBuffer;
      activeAudioSource.loop = true;

      activeGainNode = ctx.createGain();
      const vol = (parseInt(bgmVolume ? bgmVolume.value : 60, 10) || 60) / 100;
      activeGainNode.gain.setValueAtTime(vol, ctx.currentTime);

      const fadeStartTime = ctx.currentTime + (totalDurationMs / 1000);
      const fadeEndTime = fadeStartTime + (holdDurationMs / 1000);
      activeGainNode.gain.setValueAtTime(vol, fadeStartTime);
      activeGainNode.gain.linearRampToValueAtTime(0, fadeEndTime);

      activeAudioSource.connect(activeGainNode);
      if (destNode) {
        activeGainNode.connect(destNode);
        activeGainNode.connect(ctx.destination);
      } else {
        activeGainNode.connect(ctx.destination);
      }

      activeAudioSource.start(0);
    }

    function stopAudioPlayback() {
      if (activeAudioSource) {
        try {
          activeAudioSource.stop();
          activeAudioSource.disconnect();
        } catch (e) {}
        activeAudioSource = null;
      }
      activeGainNode = null;
    }

    // Modal open/close
    openBtn.addEventListener('click', () => {
      modal.classList.remove('hidden');
      loadAllRegions();
      if (currentMode === 'RACE') loadRaceData();
      else if (currentMode === 'VERSUS') loadVersusData();
      else if (currentMode === 'CARD') loadReportCardData();
    });

    closeBtn.addEventListener('click', () => {
      stopRace();
      modal.classList.add('hidden');
    });

    // Mode Switching Tabs
    function switchMode(mode) {
      currentMode = mode;
      stopRace();

      const activeClasses = ['bg-sky-500/20', 'text-sky-300', 'border-sky-500/40', 'shadow-sm'];
      const inactiveClasses = ['bg-slate-800', 'text-slate-400', 'border-slate-700/60'];

      const tabs = [
        { btn: tabRace, panel: panelRace, m: 'RACE' },
        { btn: tabVersus, panel: panelVersus, m: 'VERSUS' },
        { btn: tabCard, panel: panelCard, m: 'CARD' }
      ];

      tabs.forEach(t => {
        if (t.m === mode) {
          t.btn.classList.remove(...inactiveClasses);
          t.btn.classList.add(...activeClasses);
          t.panel.classList.remove('hidden');
        } else {
          t.btn.classList.remove(...activeClasses);
          t.btn.classList.add(...inactiveClasses);
          t.panel.classList.add('hidden');
        }
      });

      if (mode === 'CARD') {
        if (videoActions) videoActions.classList.add('hidden');
        if (cardActions) cardActions.classList.remove('hidden');
        if (progressFill && progressFill.parentElement) progressFill.parentElement.classList.add('hidden');
        if (labelBtnThumbnail) labelBtnThumbnail.textContent = '카드(PNG) 저장';
      } else {
        if (videoActions) videoActions.classList.remove('hidden');
        if (cardActions) cardActions.classList.add('hidden');
        if (progressFill && progressFill.parentElement) progressFill.parentElement.classList.remove('hidden');
        if (labelBtnThumbnail) labelBtnThumbnail.textContent = '썸네일(PNG) 저장';
      }

      adjustCanvasResolution();

      if (mode === 'RACE') {
        if (!raceData) loadRaceData();
        else renderStaticPreview();
      } else if (mode === 'VERSUS') {
        if (!versusData) loadVersusData();
        else renderStaticPreview();
      } else if (mode === 'CARD') {
        if (!cardData) loadReportCardData();
        else renderStaticPreview();
      }
    }

    if (tabRace) tabRace.addEventListener('click', () => switchMode('RACE'));
    if (tabVersus) tabVersus.addEventListener('click', () => switchMode('VERSUS'));
    if (tabCard) tabCard.addEventListener('click', () => switchMode('CARD'));

    // Load regions for selects
    async function loadAllRegions() {
      if (allRegions.length > 0) return;
      try {
        const res = await fetch('/api/regions');
        const data = await res.json();
        allRegions = data.regions || [];

        const populate = (sel, def) => {
          if (!sel) return;
          sel.innerHTML = allRegions.map(r => `<option value="${r.regionKey}">${r.fullName}</option>`).join('');
          if (def) sel.value = def;
        };

        populate(versusSelectA, 'KR_41130'); // 성남시
        populate(versusSelectB, 'KR_41590'); // 화성시
        populate(cardSelectRegion, 'KR_41590'); // 화성시
      } catch (e) {
        console.error('Failed to load regions', e);
      }
    }

    // Race mode change listeners
    if (indSelect) indSelect.addEventListener('change', loadRaceData);
    if (rankingModeSelect) rankingModeSelect.addEventListener('change', loadRaceData);
    if (provSelect) provSelect.addEventListener('change', loadRaceData);
    if (topNSelect) topNSelect.addEventListener('change', loadRaceData);
    if (aspectSelect) aspectSelect.addEventListener('change', adjustCanvasResolution);

    if (customTitleInput) {
      customTitleInput.addEventListener('input', () => {
        if (!isPlaying && currentMode === 'RACE' && raceData) renderStaticPreview();
      });
    }
    if (customSubtitleInput) {
      customSubtitleInput.addEventListener('input', () => {
        if (!isPlaying && currentMode === 'RACE' && raceData) renderStaticPreview();
      });
    }

    // Versus change listeners
    if (versusSelectA) versusSelectA.addEventListener('change', loadVersusData);
    if (versusSelectB) versusSelectB.addEventListener('change', loadVersusData);

    versusPresets.forEach(btn => {
      btn.addEventListener('click', () => {
        const a = btn.getAttribute('data-a');
        const b = btn.getAttribute('data-b');
        if (versusSelectA) versusSelectA.value = a;
        if (versusSelectB) versusSelectB.value = b;
        loadVersusData();
      });
    });

    // Card change listener
    if (cardSelectRegion) cardSelectRegion.addEventListener('change', loadReportCardData);
    if (downloadCardBtn) {
      downloadCardBtn.addEventListener('click', () => {
        if (!canvas) return;
        canvas.toBlob(blob => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          const name = cardData ? cardData.fullName.replace(/\s+/g, '_') : '지자체';
          a.download = `[성적표]_${name}_2024_카드뉴스.png`;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            statusText.textContent = `🎉 1장 성적표 카드뉴스 다운로드 완료! (${a.download})`;
          }, 500);
        }, 'image/png');
      });
    }

    // BGM Listeners
    if (selectBgmBtn && bgmFileInput) {
      selectBgmBtn.addEventListener('click', () => bgmFileInput.click());
      bgmFileInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        currentBgmFile = file;
        bgmFilename.textContent = file.name;
        bgmFilename.classList.remove('text-slate-400');
        bgmFilename.classList.add('text-amber-300', 'font-medium');
        if (removeBgmBtn) removeBgmBtn.classList.remove('hidden');

        statusText.textContent = '🎵 음악 파일 디코딩 중...';
        try {
          const ctx = getAudioContext();
          const arrayBuffer = await file.arrayBuffer();
          audioBuffer = await ctx.decodeAudioData(arrayBuffer);
          statusText.textContent = `🎵 배경음악 준비 완료: ${file.name} (${Math.round(audioBuffer.duration)}초)`;
        } catch (err) {
          console.error('Audio decode error:', err);
          statusText.textContent = '⚠️ 오디오 디코딩 실패';
          audioBuffer = null;
        }
      });
    }

    if (removeBgmBtn) {
      removeBgmBtn.addEventListener('click', () => {
        currentBgmFile = null;
        audioBuffer = null;
        if (bgmFileInput) bgmFileInput.value = '';
        bgmFilename.textContent = '선택 안 됨 (무음)';
        bgmFilename.classList.remove('text-amber-300', 'font-medium');
        bgmFilename.classList.add('text-slate-400');
        removeBgmBtn.classList.add('hidden');
        stopAudioPlayback();
        statusText.textContent = '배경음악이 제거되었습니다';
      });
    }

    if (bgmVolume) {
      bgmVolume.addEventListener('input', () => {
        const val = bgmVolume.value;
        if (bgmVolumeText) bgmVolumeText.textContent = `볼륨 ${val}%`;
        if (activeGainNode && audioCtx) {
          activeGainNode.gain.setValueAtTime(val / 100, audioCtx.currentTime);
        }
      });
    }

    // Thumbnail / Snapshot button
    if (thumbBtn) {
      thumbBtn.addEventListener('click', () => {
        if (!canvas) return;
        canvas.toBlob(blob => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          if (currentMode === 'CARD') {
            const name = cardData ? cardData.fullName.replace(/\s+/g, '_') : '지자체';
            a.download = `[성적표]_${name}_2024_카드뉴스.png`;
          } else if (currentMode === 'VERSUS') {
            const nameA = versusData ? versusData.regionA.name : 'A';
            const nameB = versusData ? versusData.regionB.name : 'B';
            a.download = `[썸네일]_${nameA}_VS_${nameB}_라이벌배틀_쇼츠.png`;
          } else {
            const indName = (raceData && raceData.indicatorName) ? raceData.indicatorName : '지표';
            const provName = (raceData && raceData.provinceName) ? raceData.provinceName : '전국';
            const aspectStr = aspectSelect.value === '9:16' ? '쇼츠(9x16)' : '와이드(16x9)';
            a.download = `[썸네일]_${provName}_${indName}_${aspectStr}.png`;
          }
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            statusText.textContent = `📸 썸네일 이미지 저장 완료! (${a.download})`;
          }, 500);
        }, 'image/png');
      });
    }

    // Copy Shorts / SNS metadata
    if (copyTagsBtn) {
      copyTagsBtn.addEventListener('click', () => {
        let clipText = '';
        if (currentMode === 'VERSUS' && versusData) {
          const a = versusData.regionA.fullName;
          const b = versusData.regionB.fullName;
          const winName = versusData.overallWinner === 'A' ? versusData.regionA.name : (versusData.overallWinner === 'B' ? versusData.regionB.name : '무승부');
          clipText = `⚔️ [끝장배틀] ${a} vs ${b}! 진짜 승자는 어디일까? 🏆

소득, 기업 일자리, 재산세, 15년 인구성장, 출산율까지 5대 핵심 지표 전격 비교!
최종 스코어 ${versusData.scoreA} : ${versusData.scoreB}로 "${winName}" 판정승!

여러분이 생각하는 최고의 살기 좋은 도시는 어디인가요? 댓글로 응원해주세요! 👇

📌 데이터 출처: 통계청 KOSIS & 국세청 & 행정안전부
#쇼츠 #shorts #라이벌배틀 #${versusData.regionA.name} #${versusData.regionB.name} #지자체 #부동산 #도시비교 #reels`;
        } else if (currentMode === 'CARD' && cardData) {
          clipText = `📊 [우리동네 성적표] ${cardData.fullName} 2024년 전국 랭킹 공개! 🏆

종합 등급: ${cardData.grade}등급 (${cardData.gradeDesc})
전국 백분위: 상위 ${cardData.overallPercentile}%
- 1인당 평균연봉: ${cardData.metrics.wage.formatted} (전국 ${cardData.metrics.wage.rank}위)
- 기업 총급여: ${cardData.metrics.corporate.formatted} (전국 ${cardData.metrics.corporate.rank}위)
- 15개년 인구 증감률: ${cardData.population.growth15y > 0 ? '+' : ''}${cardData.population.growth15y}%

📌 데이터 출처: 통계청 KOSIS & 행정안전부 지방세 연감
#지역통계 #우리동네 #성적표 #${cardData.name} #부동산 #인포그래픽`;
        } else if (raceData) {
          const { mainTitle, subTitle } = getTitles();
          const indName = raceData.indicatorName || '지표';
          const provName = raceData.provinceName || '전국';
          const startY = raceData.startYear || 2010;
          const endY = raceData.endYear || 2024;
          const lastFrame = (raceData.frames && raceData.frames.length > 0) ? raceData.frames[raceData.frames.length - 1] : null;
          const top1Item = lastFrame && lastFrame.items && lastFrame.items[0];
          const top1Name = top1Item ? (top1Item.fullName || top1Item.name) : '1위';

          clipText = `🔥 ${mainTitle} - ${subTitle} 순위 역전 레이스 (${startY}-${endY})

과연 15년 동안 가장 눈부신 변화를 겪은 지자체는 어디일까요?
${endY}년 최종 1위는 바로 "${top1Name}"입니다! 🏆

여러분의 동네는 지금 몇 위에 위치해 있나요? 댓글로 남겨주세요! 👇

📌 데이터 출처: 행정안전부 지방세 연감 & 통계청 KOSIS
#쇼츠 #shorts #지자체 #순위 #통계 #${provName.replace(/\s+/g, '')} #${indName.replace(/\s+/g, '')} #지역발전 #데이터시각화 #reels #바차트레이스`;
        }

        if (!clipText) return;
        navigator.clipboard.writeText(clipText).then(() => {
          statusText.textContent = '📋 업로드용 제목·설명·해시태그가 복사되었습니다!';
          const originalHtml = copyTagsBtn.innerHTML;
          copyTagsBtn.innerHTML = '<span class="material-symbols-outlined text-sm text-emerald-400">check</span><span>복사 완료!</span>';
          setTimeout(() => { copyTagsBtn.innerHTML = originalHtml; }, 2000);
        }).catch(err => {
          console.error('Clipboard error:', err);
        });
      });
    }

    function adjustCanvasResolution() {
      if (currentMode === 'CARD') {
        canvas.width = 1080;
        canvas.height = 1080;
        canvas.style.aspectRatio = '1 / 1';
        canvas.style.maxHeight = '65vh';
        canvas.style.width = 'auto';
      } else if (currentMode === 'VERSUS') {
        canvas.width = 1080;
        canvas.height = 1920;
        canvas.style.aspectRatio = '9 / 16';
        canvas.style.maxHeight = '68vh';
        canvas.style.width = 'auto';
      } else {
        const mode = aspectSelect ? aspectSelect.value : '9:16';
        if (mode === '9:16') {
          canvas.width = 1080;
          canvas.height = 1920;
          canvas.style.aspectRatio = '9 / 16';
          canvas.style.maxHeight = '68vh';
          canvas.style.width = 'auto';
        } else {
          canvas.width = 1920;
          canvas.height = 1080;
          canvas.style.aspectRatio = '16 / 9';
          canvas.style.maxHeight = '68vh';
          canvas.style.width = '100%';
        }
      }
    }

    // Data Loaders
    async function loadRaceData() {
      const ind = indSelect.value;
      const prov = provSelect ? (provSelect.value || '') : '';
      const topN = topNSelect ? (topNSelect.value || 10) : 10;
      const rankingMode = rankingModeSelect ? rankingModeSelect.value : 'VALUE';
      statusText.textContent = '순위 데이터 불러오는 중...';
      try {
        const res = await fetch(`/api/race-data?indicatorId=${encodeURIComponent(ind)}&topN=${topN}&provinceCode=${encodeURIComponent(prov)}&rankingMode=${rankingMode}`);
        raceData = await res.json();
        const spanYears = (raceData && raceData.startYear && raceData.endYear) ? (raceData.endYear - raceData.startYear + 1) : 15;
        const regionLabel = raceData.provinceName || (prov ? '지역' : '전국 지자체');
        const modeLabel = rankingMode === 'GROWTH_RATE' ? '성장률(%) 랭킹' : '절대값 랭킹';
        statusText.textContent = `준비 완료 (${regionLabel} ${spanYears}개년 ${modeLabel} TOP ${topN})`;

        if (customTitleInput) {
          const prevDefaultPattern = /^.* 지자체 \d+개년$|^.* \d+개년$|^.* 성장률.*$/;
          if (!customTitleInput.value || prevDefaultPattern.test(customTitleInput.value.trim())) {
            customTitleInput.value = rankingMode === 'GROWTH_RATE'
              ? `${regionLabel} ${spanYears}개년 폭풍성장률`
              : `${regionLabel} ${spanYears}개년`;
          }
        }
        if (customSubtitleInput) {
          const indName = raceData.indicatorName || '지표';
          const prevSubPattern = /TOP \d+$/;
          if (!customSubtitleInput.value || prevSubPattern.test(customSubtitleInput.value.trim())) {
            customSubtitleInput.value = rankingMode === 'GROWTH_RATE'
              ? `${indName} 성장률 TOP ${topN}`
              : `${indName} TOP ${topN}`;
          }
        }

        adjustCanvasResolution();
        if (currentMode === 'RACE') renderStaticPreview();
      } catch (e) {
        statusText.textContent = '데이터 로딩 실패';
        console.error(e);
      }
    }

    async function loadVersusData() {
      const regA = versusSelectA ? versusSelectA.value : 'KR_41130';
      const regB = versusSelectB ? versusSelectB.value : 'KR_41590';
      statusText.textContent = '라이벌 배틀 데이터 분석 중...';
      try {
        const res = await fetch(`/api/versus-data?regionA=${encodeURIComponent(regA)}&regionB=${encodeURIComponent(regB)}`);
        versusData = await res.json();
        statusText.textContent = `⚔️ 라이벌 매치 준비 완료: ${versusData.regionA.name} vs ${versusData.regionB.name}`;
        adjustCanvasResolution();
        if (currentMode === 'VERSUS') renderStaticPreview();
      } catch (e) {
        statusText.textContent = '배틀 데이터 로딩 실패';
        console.error(e);
      }
    }

    async function loadReportCardData() {
      const regId = cardSelectRegion ? cardSelectRegion.value : 'KR_41590';
      statusText.textContent = '지자체 종합 성적표 산출 중...';
      try {
        const res = await fetch(`/api/report-card?regionId=${encodeURIComponent(regId)}`);
        cardData = await res.json();
        statusText.textContent = `📊 1장 성적표 생성 완료: ${cardData.fullName} (종합 ${cardData.grade}등급)`;
        adjustCanvasResolution();
        if (currentMode === 'CARD') renderStaticPreview();
      } catch (e) {
        statusText.textContent = '성적표 데이터 로딩 실패';
        console.error(e);
      }
    }

    function getTitles() {
      const spanYears = (raceData && raceData.startYear && raceData.endYear) ? (raceData.endYear - raceData.startYear + 1) : 15;
      const regionLabel = (raceData && raceData.provinceName) ? raceData.provinceName : '전국 지자체';
      const isGrowth = rankingModeSelect && rankingModeSelect.value === 'GROWTH_RATE';
      const defaultMain = isGrowth ? `${regionLabel} ${spanYears}개년 폭풍성장` : `${regionLabel} ${spanYears}개년`;
      const mainTitle = (customTitleInput && customTitleInput.value.trim()) ? customTitleInput.value.trim() : defaultMain;
      const topN = topNSelect ? topNSelect.value : '10';
      const indName = (raceData && raceData.indicatorName) ? raceData.indicatorName : '지표';
      const defaultSub = isGrowth ? `${indName} 성장률 TOP ${topN}` : `${indName} TOP ${topN}`;
      let subTitle = (customSubtitleInput && customSubtitleInput.value.trim()) ? customSubtitleInput.value.trim() : defaultSub;
      return { mainTitle, subTitle };
    }

    function renderStaticPreview() {
      const ctx = canvas.getContext('2d');
      if (currentMode === 'CARD') {
        if (cardData) drawReportCard(ctx, cardData);
      } else if (currentMode === 'VERSUS') {
        if (versusData) drawVersusFrame(ctx, versusData, 0.0);
      } else {
        if (!raceData || !raceData.frames || raceData.frames.length === 0) return;
        const { mainTitle, subTitle } = getTitles();
        const isGrowth = raceData.rankingMode === 'GROWTH_RATE';
        drawFrame(ctx, raceData.frames[0].items, raceData.frames[0].year, 0, mainTitle, subTitle, raceData.indicatorKey, isGrowth);
      }
    }

    let endHoldTimeoutId = null;

    function stopRace() {
      isPlaying = false;
      stopAudioPlayback();
      if (animFrameId) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
      }
      if (endHoldTimeoutId) {
        clearTimeout(endHoldTimeoutId);
        endHoldTimeoutId = null;
      }
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        try {
          mediaRecorder.stop();
        } catch (e) {
          console.error(e);
        }
      }
      isRecording = false;
      startBtn.innerHTML = '<span class="material-symbols-outlined text-sm">play_arrow</span><span>미리보기 재생</span>';
      recordBtn.innerHTML = '<span class="material-symbols-outlined text-sm">videocam</span><span>쇼츠 영상 녹화 & 다운로드</span>';
      recordBtn.classList.remove('bg-rose-600', 'animate-pulse');
      recordBtn.classList.add('bg-gradient-to-r', 'from-rose-500', 'to-red-600');
      if (progressFill) progressFill.style.width = '0%';
    }

    startBtn.addEventListener('click', () => {
      if (isPlaying) stopRace();
      else runAnimation(false);
    });

    recordBtn.addEventListener('click', () => {
      if (isRecording) stopRace();
      else runAnimation(true);
    });

    async function runAnimation(recordMode) {
      stopRace();
      isPlaying = true;
      isRecording = recordMode;

      const ctx = canvas.getContext('2d');

      if (currentMode === 'VERSUS') {
        // Versus 15-second battle animation
        if (!versusData) return;
        const TOTAL_DURATION = 12000; // 12 seconds active battle
        const HOLD_DURATION = 3500;   // 3.5 seconds final winner hold

        if (recordMode) setupMediaRecorder(TOTAL_DURATION, HOLD_DURATION, '라이벌배틀');
        else if (audioBuffer) startAudioPlayback(null, TOTAL_DURATION, HOLD_DURATION);

        let startTime = null;
        function stepVersus(timestamp) {
          if (!isPlaying) return;
          if (!startTime) startTime = timestamp;
          const elapsed = timestamp - startTime;

          if (elapsed <= TOTAL_DURATION) {
            const progress = Math.min(1, elapsed / TOTAL_DURATION);
            if (progressFill) progressFill.style.width = (progress * 100).toFixed(1) + '%';
            drawVersusFrame(ctx, versusData, progress);
            animFrameId = requestAnimationFrame(stepVersus);
          } else if (elapsed < TOTAL_DURATION + HOLD_DURATION) {
            if (progressFill) progressFill.style.width = '100%';
            drawVersusFrame(ctx, versusData, 1.0);
            statusText.textContent = '🏆 최종 판정 확정! 승자 발표 중...';
            animFrameId = requestAnimationFrame(stepVersus);
          } else {
            drawVersusFrame(ctx, versusData, 1.0);
            finishRecording();
          }
        }
        animFrameId = requestAnimationFrame(stepVersus);
        return;
      }

      // RACE Mode Animation
      if (!raceData || !raceData.frames || raceData.frames.length === 0) return;
      const frames = raceData.frames;
      const topN = parseInt(topNSelect.value, 10) || 10;
      const durationPerYear = parseFloat(speedSelect.value) || 1800;
      const totalYears = frames.length - 1;
      const totalDuration = totalYears * durationPerYear;
      const HOLD_DURATION = 2500;
      const isGrowth = raceData.rankingMode === 'GROWTH_RATE';
      const { mainTitle, subTitle } = getTitles();

      if (recordMode) setupMediaRecorder(totalDuration, HOLD_DURATION, '순위변천사');
      else if (audioBuffer) startAudioPlayback(null, totalDuration, HOLD_DURATION);

      let startTime = null;
      function stepRace(timestamp) {
        if (!isPlaying) return;
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;

        if (elapsed <= totalDuration) {
          const progress = Math.min(1, elapsed / totalDuration);
          if (progressFill) progressFill.style.width = (progress * 100).toFixed(1) + '%';

          const exactIndex = (elapsed / durationPerYear);
          const currentIndex = Math.min(Math.floor(exactIndex), frames.length - 2);
          const subProgress = Math.min(1, exactIndex - currentIndex);

          const frameA = frames[currentIndex];
          const frameB = frames[Math.min(currentIndex + 1, frames.length - 1)];

          const interpolatedItems = interpolateRankings(frameA.items, frameB.items, subProgress, topN);
          const displayYear = frameA.year + (frameB.year - frameA.year) * subProgress;

          drawFrame(ctx, interpolatedItems, displayYear, progress, mainTitle, subTitle, raceData.indicatorKey, isGrowth);
          animFrameId = requestAnimationFrame(stepRace);
        } else if (elapsed < totalDuration + HOLD_DURATION) {
          if (progressFill) progressFill.style.width = '100%';
          const lastFrame = frames[frames.length - 1];
          drawFrame(ctx, lastFrame.items, lastFrame.year, 1, mainTitle, subTitle, raceData.indicatorKey, isGrowth);
          statusText.textContent = '⏳ 최종 순위 확정 중...';
          animFrameId = requestAnimationFrame(stepRace);
        } else {
          const lastFrame = frames[frames.length - 1];
          drawFrame(ctx, lastFrame.items, lastFrame.year, 1, mainTitle, subTitle, raceData.indicatorKey, isGrowth);
          finishRecording();
        }
      }
      animFrameId = requestAnimationFrame(stepRace);
    }

    function setupMediaRecorder(totalDuration, holdDuration, label) {
      recordedChunks = [];
      const videoStream = canvas.captureStream(60);
      let streamToRecord = videoStream;

      if (audioBuffer) {
        const aCtx = getAudioContext();
        const audioDest = aCtx.createMediaStreamDestination();
        startAudioPlayback(audioDest, totalDuration, holdDuration);

        const combinedTracks = [
          ...videoStream.getVideoTracks(),
          ...audioDest.stream.getAudioTracks()
        ];
        streamToRecord = new MediaStream(combinedTracks);
      }

      let mimeType = 'video/webm;codecs=vp9,opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm;codecs=vp9';
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm;codecs=vp8,opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm';

      mediaRecorder = new MediaRecorder(streamToRecord, { mimeType, videoBitsPerSecond: 8000000 });
      mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) recordedChunks.push(e.data);
      };
      mediaRecorder.onstop = () => saveVideoFile(label);
      mediaRecorder.start(1000);

      recordBtn.innerHTML = '<span class="material-symbols-outlined text-sm">stop</span><span>녹화 중지 (완료 시 자동 저장)</span>';
      recordBtn.classList.remove('from-rose-500', 'to-red-600');
      recordBtn.classList.add('bg-rose-600', 'animate-pulse');
      const audioStatus = audioBuffer ? '🎵 BGM 합성 · ' : '';
      statusText.textContent = `🎥 ${audioStatus}60fps 고화질 비디오 녹화 중...`;
    }

    function finishRecording() {
      statusText.textContent = '✅ 레이스 완료! 영상 파일 생성 중...';
      if (isRecording && mediaRecorder && mediaRecorder.state !== 'inactive') {
        try { mediaRecorder.requestData(); } catch (e) {}
        setTimeout(() => {
          if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
          }
        }, 300);
      }
      stopAudioPlayback();
      isPlaying = false;
      isRecording = false;
      startBtn.innerHTML = '<span class="material-symbols-outlined text-sm">play_arrow</span><span>다시 재생</span>';
      recordBtn.innerHTML = '<span class="material-symbols-outlined text-sm">videocam</span><span>쇼츠 영상 녹화 & 다운로드</span>';
      recordBtn.classList.remove('bg-rose-600', 'animate-pulse');
      recordBtn.classList.add('bg-gradient-to-r', 'from-rose-500', 'to-red-600');
    }

    function saveVideoFile(label) {
      if (recordedChunks.length === 0) return;
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      if (currentMode === 'VERSUS' && versusData) {
        const nameA = versusData.regionA.name;
        const nameB = versusData.regionB.name;
        a.download = `지자체_${nameA}_VS_${nameB}_라이벌배틀_쇼츠.webm`;
      } else {
        const indName = (raceData && raceData.indicatorName) ? raceData.indicatorName : '순위변천사';
        const provStr = (raceData && raceData.provinceName) ? raceData.provinceName : '전국';
        const topN = topNSelect ? topNSelect.value : '10';
        const isGrowth = raceData && raceData.rankingMode === 'GROWTH_RATE';
        const modeStr = isGrowth ? '15개년성장률' : '순위변천사';
        const aspectStr = aspectSelect.value === '9:16' ? '쇼츠(9x16)' : '와이드(16x9)';
        const spanYears = (raceData && raceData.startYear && raceData.endYear) ? (raceData.endYear - raceData.startYear + 1) : 15;
        a.download = `지자체_${provStr}_${indName}_TOP${topN}_${spanYears}개년${modeStr}_${aspectStr}.webm`;
      }

      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        statusText.textContent = `🎉 영상 파일 다운로드 완료! (${a.download})`;
      }, 500);
    }

    function interpolateRankings(itemsA, itemsB, t, topN) {
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      const mapA = new Map(itemsA.map(i => [i.regionKey, i]));
      const mapB = new Map(itemsB.map(i => [i.regionKey, i]));
      const allKeys = Array.from(new Set([...itemsA.map(i => i.regionKey), ...itemsB.map(i => i.regionKey)]));

      const merged = [];
      allKeys.forEach(k => {
        const a = mapA.get(k);
        const b = mapB.get(k);
        const name = (b && b.name) || (a && a.name);
        const fullName = (b && b.fullName) || (a && a.fullName);
        const province = (b && b.province) || (a && a.province);

        const valA = a ? a.value : (b ? b.value * 0.7 : 0);
        const valB = b ? b.value : (a ? a.value * 0.7 : 0);
        const interVal = valA + (valB - valA) * ease;

        const rankA = a ? a.rank : (topN + 3);
        const rankB = b ? b.rank : (topN + 3);
        const interRank = rankA + (rankB - rankA) * ease;

        merged.push({
          regionKey: k,
          name,
          fullName,
          province,
          value: interVal,
          rank: interRank,
        });
      });

      merged.sort((x, y) => x.rank - y.rank);
      return merged.slice(0, topN);
    }

    // ==========================================
    // RENDERER 1: Bar Chart Race (Standard & Growth Rate)
    // ==========================================
    function drawFrame(ctx, items, displayYear, progress, mainTitle, subTitle, indKey, isGrowth) {
      const W = canvas.width;
      const H = canvas.height;
      const isVertical = (W < H);

      // Background
      const bgGrad = ctx.createLinearGradient(0, 0, W, H);
      bgGrad.addColorStop(0, '#0a0f1d');
      bgGrad.addColorStop(0.5, '#0f172a');
      bgGrad.addColorStop(1, '#020617');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // Grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.lineWidth = 2;
      const gridGap = isVertical ? 120 : 160;
      for (let x = 0; x < W; x += gridGap) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }

      // Background watermark year
      ctx.save();
      const roundedYear = Math.floor(displayYear);
      ctx.font = isVertical ? '900 320px Inter, sans-serif' : '900 240px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = isGrowth ? 'rgba(16, 185, 129, 0.07)' : 'rgba(14, 165, 233, 0.07)';
      const yearX = isVertical ? W - 60 : W - 100;
      const yearY = isVertical ? H - 180 : H - 80;
      ctx.fillText(roundedYear.toString(), yearX, yearY);
      ctx.restore();

      // Header
      ctx.save();
      if (isVertical) {
        // Red / Green badge
        ctx.fillStyle = isGrowth ? '#10b981' : '#ef4444';
        roundRect(ctx, 60, 70, 210, 50, 25);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 24px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(isGrowth ? 'GROWTH RACE' : 'HOT SHORTS', 165, 95);

        ctx.font = '900 64px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(mainTitle, 60, 190);

        const titleGrad = ctx.createLinearGradient(60, 210, 800, 280);
        if (isGrowth) {
          titleGrad.addColorStop(0, '#34d399');
          titleGrad.addColorStop(1, '#60a5fa');
        } else {
          titleGrad.addColorStop(0, '#38bdf8');
          titleGrad.addColorStop(1, '#818cf8');
        }
        ctx.fillStyle = titleGrad;
        ctx.font = '900 56px Inter, sans-serif';
        ctx.fillText(subTitle, 60, 265);

        const startY = (raceData && raceData.startYear) ? raceData.startYear : 2010;
        const endY = (raceData && raceData.endYear) ? raceData.endYear : 2024;
        ctx.font = '700 32px monospace';
        ctx.fillStyle = '#94a3b8';
        const modeLabel = isGrowth ? `(시작년도 ${startY}년 대비 누적 성장률)` : `(${startY} ~ ${endY})`;
        ctx.fillText(`YEAR: ${roundedYear}년 ${modeLabel}`, 60, 325);
      } else {
        const startY = (raceData && raceData.startYear) ? raceData.startYear : 2010;
        const endY = (raceData && raceData.endYear) ? raceData.endYear : 2024;
        ctx.font = '900 48px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`${mainTitle} - ${subTitle}`, 80, 90);

        ctx.font = '700 26px monospace';
        ctx.fillStyle = isGrowth ? '#34d399' : '#38bdf8';
        ctx.fillText(`기준 연도: ${roundedYear}년 | ${startY}~${endY} longitudinal tracking`, 80, 135);
      }
      ctx.restore();

      // Bars measurements
      const count = items.length || 10;
      let topOffset = isVertical ? 380 : 175;
      let bottomOffset = isVertical ? 200 : 80;

      if (count > 25) {
        topOffset = isVertical ? 360 : 160;
        bottomOffset = isVertical ? 160 : 60;
      }

      const availableHeight = H - topOffset - bottomOffset;
      const barSpacing = availableHeight / count;
      const barHeight = Math.max(14, barSpacing * (count > 25 ? 0.82 : 0.70));

      let rankFontSize = 28;
      let nameFontSize = 30;
      let valFontSize = 28;
      let rankColWidth = isVertical ? 80 : 70;
      let nameColWidth = isVertical ? 220 : 200;

      if (count <= 12) {
        rankFontSize = isVertical ? 30 : 22;
        nameFontSize = isVertical ? 32 : 24;
        valFontSize = isVertical ? 30 : 22;
        rankColWidth = isVertical ? 85 : 75;
        nameColWidth = isVertical ? 230 : 210;
      } else if (count <= 25) {
        rankFontSize = isVertical ? 22 : 16;
        nameFontSize = isVertical ? 23 : 18;
        valFontSize = isVertical ? 22 : 16;
        rankColWidth = isVertical ? 70 : 60;
        nameColWidth = isVertical ? 190 : 175;
      } else {
        rankFontSize = isVertical ? 14 : 12;
        nameFontSize = isVertical ? 15 : 13;
        valFontSize = isVertical ? 14 : 12;
        rankColWidth = isVertical ? 45 : 40;
        nameColWidth = isVertical ? 140 : 130;
      }

      const leftMargin = isVertical ? (count > 25 ? 24 : 40) : (count > 25 ? 40 : 60);
      const rightPadding = isVertical ? (count > 25 ? 180 : 230) : (count > 25 ? 240 : 290);
      const barStartX = leftMargin + rankColWidth + nameColWidth;
      const maxBarWidth = Math.max(100, W - barStartX - rightPadding);
      const maxVal = Math.max(...items.map(i => Math.abs(i.value || 0)), 1);

      const sortedByRankDesc = [...items].sort((a, b) => {
        const rA = a.rank !== undefined ? a.rank : 999;
        const rB = b.rank !== undefined ? b.rank : 999;
        return rB - rA;
      });

      sortedByRankDesc.forEach((item) => {
        const rankPos = (item.rank !== undefined ? item.rank : 1) - 1;
        const y = topOffset + rankPos * barSpacing;
        const barW = Math.max(12, (Math.max(0, item.value || 0) / maxVal) * maxBarWidth);

        const shortProv = (item.fullName || '').split(' ')[0] || '';
        const baseColor = isGrowth ? (item.value >= 0 ? '#10b981' : '#ef4444') : getBarColor(shortProv);

        // Rank Badge
        ctx.save();
        const displayRankNum = Math.round(rankPos + 1);
        let badgeIcon = `${displayRankNum}`;
        if (count <= 25) {
          if (displayRankNum === 1) badgeIcon = '👑 1';
          else if (displayRankNum === 2) badgeIcon = '🥈 2';
          else if (displayRankNum === 3) badgeIcon = '🥉 3';
        }

        ctx.font = `800 ${rankFontSize}px Inter, sans-serif`;
        ctx.fillStyle = (rankPos < 0.5) ? '#fbbf24' : ((rankPos < 1.5) ? '#94a3b8' : ((rankPos < 2.5) ? '#d97706' : '#64748b'));
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeIcon, leftMargin, y + barHeight / 2);
        ctx.restore();

        // Region Name (Smart single province name)
        ctx.save();
        ctx.font = `700 ${nameFontSize}px Inter, sans-serif`;
        ctx.fillStyle = (rankPos < 2.5) ? '#ffffff' : '#e2e8f0';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const isSingleProv = Boolean(raceData && raceData.provinceCode && raceData.provinceCode.startsWith('KR_'));
        const displayName = (isSingleProv || (count > 25 && isVertical)) ? item.name : (item.fullName || item.name);
        ctx.fillText(displayName, leftMargin + rankColWidth, y + barHeight / 2);
        ctx.restore();

        // Bar
        ctx.save();
        if (rankPos < 0.5) {
          ctx.shadowColor = isGrowth ? 'rgba(16, 185, 129, 0.55)' : 'rgba(239, 68, 68, 0.55)';
          ctx.shadowBlur = count > 25 ? 10 : 20;
        } else if (rankPos < 1.5) {
          ctx.shadowColor = 'rgba(56, 189, 248, 0.4)';
          ctx.shadowBlur = count > 25 ? 8 : 16;
        }

        const barGrad = ctx.createLinearGradient(barStartX, y, barStartX + barW, y);
        barGrad.addColorStop(0, baseColor);
        barGrad.addColorStop(1, lightenColor(baseColor, 35));
        ctx.fillStyle = barGrad;
        roundRect(ctx, barStartX, y, barW, barHeight, Math.min(barHeight / 2, 12));
        ctx.fill();
        ctx.restore();

        // Trailing Value Label
        ctx.save();
        const valX = barStartX + barW + (count > 25 ? 8 : 14);
        ctx.font = `800 ${valFontSize}px monospace`;
        ctx.fillStyle = (rankPos < 0.8) ? '#fde047' : '#cbd5e1';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(formatRaceValue(item.value, indKey, isGrowth), valX, y + barHeight / 2);
        ctx.restore();
      });

      // Bottom attribution
      ctx.save();
      const footY = H - (isVertical ? 65 : 35);
      ctx.font = isVertical ? '600 24px Inter, sans-serif' : '600 20px Inter, sans-serif';
      ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
      ctx.textAlign = 'center';
      ctx.fillText('데이터 출처: 통계청 KOSIS & 행정안전부 지방세 연감 · 제작: 지자체 미디어 팩토리', W / 2, footY);
      ctx.restore();
    }

    // Helper to format animated ticker value during battle round
    function formatAnimatedVersusValue(r, curVal) {
      if (curVal === null || curVal === undefined || isNaN(curVal)) return '-';

      if (r.round === 1 || r.round === 3) {
        // 평균연봉, 1인당 재산세: 만원 단위
        const man = Math.round(curVal / 10000);
        return man.toLocaleString() + '만원';
      }
      if (r.round === 2) {
        // 기업 총급여액: 조원 or 억원
        if (Math.abs(r.valA) >= 1e12 || Math.abs(r.valB) >= 1e12) {
          return (curVal / 1e12).toFixed(1) + '조원';
        }
        return Math.round(curVal / 1e8).toLocaleString() + '억원';
      }
      if (r.round === 4) {
        // 15개년 인구 증감률: +X.X%
        return (curVal >= 0 ? '+' : '') + curVal.toFixed(1) + '%';
      }
      if (r.round === 5) {
        // 합계출산율: X.XX명
        return curVal.toFixed(2) + '명';
      }
      return Math.round(curVal).toLocaleString();
    }

    // ==========================================
    // RENDERER 2: 1 vs 1 Versus Battle Shorts (9:16)
    // ==========================================
    function drawVersusFrame(ctx, data, progress) {
      const W = 1080;
      const H = 1920;

      // Dark futuristic mesh background
      const bgGrad = ctx.createLinearGradient(0, 0, W, H);
      bgGrad.addColorStop(0, '#090d16');
      bgGrad.addColorStop(0.5, '#0f172a');
      bgGrad.addColorStop(1, '#050811');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // Top Header: VS Battle Title
      ctx.save();
      ctx.fillStyle = '#ef4444';
      roundRect(ctx, W / 2 - 120, 60, 240, 52, 26);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 26px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚔️ VERSUS BATTLE', W / 2, 86);

      // Clash Subtitle
      ctx.font = '800 36px Inter, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('대한민국 도시 끝장 라이벌 대결', W / 2, 150);
      ctx.restore();

      // Contenders Cards (Red Corner vs Blue Corner)
      const a = data.regionA;
      const b = data.regionB;

      // Card A (Left - Red)
      ctx.save();
      const gradA = ctx.createLinearGradient(60, 190, 480, 360);
      gradA.addColorStop(0, 'rgba(239, 68, 68, 0.25)');
      gradA.addColorStop(1, 'rgba(239, 68, 68, 0.05)');
      ctx.fillStyle = gradA;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3;
      roundRect(ctx, 60, 190, 440, 170, 24);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fca5a5';
      ctx.font = '700 26px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(a.province, 90, 235);

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 52px Inter, sans-serif';
      ctx.fillText(a.name, 90, 305);
      ctx.restore();

      // VS in Center
      ctx.save();
      ctx.font = '900 68px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const vsGrad = ctx.createLinearGradient(W / 2 - 40, 250, W / 2 + 40, 310);
      vsGrad.addColorStop(0, '#f59e0b');
      vsGrad.addColorStop(1, '#ef4444');
      ctx.fillStyle = vsGrad;
      ctx.shadowColor = 'rgba(245, 158, 11, 0.6)';
      ctx.shadowBlur = 15;
      ctx.fillText('VS', W / 2, 275);
      ctx.restore();

      // Card B (Right - Sky Blue)
      ctx.save();
      const gradB = ctx.createLinearGradient(580, 190, 1020, 360);
      gradB.addColorStop(0, 'rgba(14, 165, 233, 0.25)');
      gradB.addColorStop(1, 'rgba(14, 165, 233, 0.05)');
      ctx.fillStyle = gradB;
      ctx.strokeStyle = '#0ea5e9';
      ctx.lineWidth = 3;
      roundRect(ctx, 580, 190, 440, 170, 24);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#7dd3fc';
      ctx.font = '700 26px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(b.province, 990, 235);

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 52px Inter, sans-serif';
      ctx.fillText(b.name, 990, 305);
      ctx.restore();

      // Live Scoreboard Header
      const numRounds = data.rounds.length; // 5
      const currentRoundProgress = progress * numRounds;
      let liveScoreA = 0;
      let liveScoreB = 0;

      for (let i = 0; i < numRounds; i++) {
        if (currentRoundProgress >= i + 0.82) {
          if (data.rounds[i].winner === 'A') liveScoreA++;
          else if (data.rounds[i].winner === 'B') liveScoreB++;
        }
      }

      ctx.save();
      ctx.font = '900 48px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fbbf24';
      ctx.fillText(`SCORE  [ ${liveScoreA} : ${liveScoreB} ]`, W / 2, 415);
      ctx.restore();

      // 5 Battle Round Cards (Y: 460 ~ 1580)
      const startY = 460;
      const cardH = 200;
      const cardGap = 24;

      data.rounds.forEach((r, idx) => {
        const y = startY + idx * (cardH + cardGap);
        const roundOpenThreshold = idx / numRounds;
        const roundOpenProgress = Math.max(0, Math.min(1, (progress - roundOpenThreshold) * numRounds));

        ctx.save();
        // Card background
        ctx.fillStyle = 'rgba(30, 41, 59, 0.6)';
        ctx.strokeStyle = 'rgba(71, 85, 105, 0.4)';
        ctx.lineWidth = 1.5;
        roundRect(ctx, 60, y, 960, cardH, 20);
        ctx.fill();
        ctx.stroke();

        // Round Label & Title in Center
        ctx.fillStyle = '#94a3b8';
        ctx.font = '800 20px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`ROUND ${r.round} · ${r.category}`, W / 2, y + 36);

        ctx.fillStyle = '#ffffff';
        ctx.font = '900 28px Inter, sans-serif';
        ctx.fillText(r.title, W / 2, y + 74);

        const gaugeW = 900;
        const totalVal = (Math.abs(r.valA) + Math.abs(r.valB)) || 1;
        const ratioA = Math.max(0.08, Math.min(0.92, Math.abs(r.valA) / totalVal));

        if (roundOpenProgress <= 0) {
          // 1. Pending / Waiting Phase (대결 전 - 스포일러 방지)
          ctx.fillStyle = 'rgba(15, 23, 42, 0.5)';
          ctx.strokeStyle = 'rgba(51, 65, 85, 0.3)';
          ctx.lineWidth = 1;
          roundRect(ctx, 90, y + 155, gaugeW, 18, 9);
          ctx.fill();
          ctx.stroke();

          ctx.font = '800 24px monospace';
          ctx.fillStyle = '#475569';
          ctx.textAlign = 'center';
          ctx.fillText('⏳  대  결  대  기  중  ⏳', W / 2, y + 135);
        } else if (roundOpenProgress < 0.82) {
          // 2. Active Charging / Clash Phase (동적 카운팅 & 게이지 돌진)
          const chargeRatio = Math.min(1.0, roundOpenProgress / 0.82);
          const ease = 1 - Math.pow(1 - chargeRatio, 2.2);

          const curValA = r.valA * ease;
          const curValB = r.valB * ease;
          const dispStrA = formatAnimatedVersusValue(r, curValA);
          const dispStrB = formatAnimatedVersusValue(r, curValB);

          // Dynamic Animated Ticker Numbers (동시 상승 - 스포일러 차단)
          ctx.font = '900 36px monospace';
          ctx.fillStyle = '#f1f5f9';
          ctx.textAlign = 'left';
          ctx.fillText(dispStrA, 90, y + 130);

          ctx.textAlign = 'right';
          ctx.fillText(dispStrB, 990, y + 130);

          // Center Clash status
          ctx.font = '800 20px Inter, sans-serif';
          ctx.fillStyle = '#f59e0b';
          ctx.textAlign = 'center';
          ctx.fillText('⚡ 격 돌 중 ⚡', W / 2, y + 130);

          // Gauge slot track
          ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
          ctx.strokeStyle = 'rgba(51, 65, 85, 0.5)';
          ctx.lineWidth = 1;
          roundRect(ctx, 90, y + 155, gaugeW, 18, 9);
          ctx.fill();
          ctx.stroke();

          // Bar A (Red)
          const barW_A = (gaugeW * ratioA) * ease;
          if (barW_A > 0) {
            ctx.fillStyle = '#ef4444';
            roundRect(ctx, 90, y + 155, barW_A, 18, 9);
            ctx.fill();
          }

          // Bar B (Blue)
          const barW_B = (gaugeW * (1 - ratioA)) * ease;
          if (barW_B > 0) {
            ctx.fillStyle = '#0ea5e9';
            roundRect(ctx, 90 + gaugeW - barW_B, y + 155, barW_B, 18, 9);
            ctx.fill();
          }
        } else {
          // 3. Climax & Winner Reveal Phase (충돌 순간 판정 확정 & 승자 발표)
          const isWinnerA = (r.winner === 'A');
          const isWinnerB = (r.winner === 'B');

          // Side A Value (승자 강조, 패자 차분하게)
          ctx.textAlign = 'left';
          if (isWinnerA) {
            ctx.font = '900 40px monospace';
            ctx.fillStyle = '#ef4444';
            ctx.fillText(r.strA, 90, y + 130);
          } else {
            ctx.font = '800 32px monospace';
            ctx.fillStyle = isWinnerB ? '#64748b' : '#cbd5e1';
            ctx.fillText(r.strA, 90, y + 130);
          }

          // Side B Value
          ctx.textAlign = 'right';
          if (isWinnerB) {
            ctx.font = '900 40px monospace';
            ctx.fillStyle = '#38bdf8';
            ctx.fillText(r.strB, 990, y + 130);
          } else {
            ctx.font = '800 32px monospace';
            ctx.fillStyle = isWinnerA ? '#64748b' : '#cbd5e1';
            ctx.fillText(r.strB, 990, y + 130);
          }

          // Center Status: 판정 완료
          ctx.font = '800 20px Inter, sans-serif';
          ctx.fillStyle = '#10b981';
          ctx.textAlign = 'center';
          ctx.fillText('✓ 판정 완료', W / 2, y + 130);

          // Full Gauge Bars
          const barW_A = gaugeW * ratioA;
          const barW_B = gaugeW * (1 - ratioA);

          // Bar A (Red)
          ctx.fillStyle = isWinnerA ? '#ef4444' : '#991b1b';
          roundRect(ctx, 90, y + 155, barW_A, 18, 9);
          ctx.fill();

          // Bar B (Blue)
          ctx.fillStyle = isWinnerB ? '#0ea5e9' : '#075985';
          roundRect(ctx, 90 + gaugeW - barW_B, y + 155, barW_B, 18, 9);
          ctx.fill();

          // Gold Divider Clash line
          ctx.fillStyle = '#fbbf24';
          roundRect(ctx, 90 + barW_A - 3, y + 151, 6, 26, 3);
          ctx.fill();

          // Winner Crown Badge Pop
          ctx.font = '900 24px Inter, sans-serif';
          ctx.textBaseline = 'middle';
          if (isWinnerA) {
            ctx.fillStyle = '#fbbf24';
            ctx.textAlign = 'left';
            ctx.fillText('👑 WIN', 90, y + 80);
          } else if (isWinnerB) {
            ctx.fillStyle = '#fbbf24';
            ctx.textAlign = 'right';
            ctx.fillText('WIN 👑', 990, y + 80);
          } else {
            ctx.fillStyle = '#f59e0b';
            ctx.textAlign = 'center';
            ctx.fillText('🤝 무승부', W / 2, y + 80);
          }
        }
        ctx.restore();
      });

      // Final Hold Announcement (when progress >= 0.95)
      if (progress >= 0.95) {
        ctx.save();
        const bannerGrad = ctx.createLinearGradient(60, H - 280, W - 60, H - 100);
        bannerGrad.addColorStop(0, '#f59e0b');
        bannerGrad.addColorStop(0.5, '#ef4444');
        bannerGrad.addColorStop(1, '#8b5cf6');
        ctx.fillStyle = bannerGrad;
        ctx.shadowColor = 'rgba(245, 158, 11, 0.8)';
        ctx.shadowBlur = 30;
        roundRect(ctx, 60, H - 280, 960, 160, 28);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = '900 32px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🏆 5전 3선승제 최종 승자 🏆', W / 2, H - 235);

        const winCity = data.overallWinner === 'A' ? data.regionA.fullName : (data.overallWinner === 'B' ? data.regionB.fullName : '무승부');
        ctx.font = '900 56px Inter, sans-serif';
        ctx.fillText(`${winCity} 판정승! (${data.scoreA} : ${data.scoreB})`, W / 2, H - 165);
        ctx.restore();
      }

      // Footer
      ctx.save();
      ctx.font = '600 22px Inter, sans-serif';
      ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
      ctx.textAlign = 'center';
      ctx.fillText('데이터 출처: 통계청 KOSIS & 국세청 & 행정안전부 · 제작: 지자체 미디어 팩토리', W / 2, H - 50);
      ctx.restore();
    }

    // ==========================================
    // RENDERER 3: 1-Page Infographic Report Card (1:1 Square 1080x1080)
    // ==========================================
    function drawReportCard(ctx, data) {
      const W = 1080;
      const H = 1080;

      // Dark elegant Cyber-Glass gradient
      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, '#06101e');
      bg.addColorStop(0.5, '#0b1b33');
      bg.addColorStop(1, '#030811');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Subtle glow rings
      ctx.save();
      const glow1 = ctx.createRadialGradient(200, 200, 10, 200, 200, 400);
      glow1.addColorStop(0, 'rgba(14, 165, 233, 0.15)');
      glow1.addColorStop(1, 'rgba(14, 165, 233, 0)');
      ctx.fillStyle = glow1;
      ctx.fillRect(0, 0, W, H);

      const glow2 = ctx.createRadialGradient(880, 880, 10, 880, 880, 400);
      glow2.addColorStop(0, 'rgba(16, 185, 129, 0.15)');
      glow2.addColorStop(1, 'rgba(16, 185, 129, 0)');
      ctx.fillStyle = glow2;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();

      // Top Tag
      ctx.save();
      ctx.fillStyle = '#0284c7';
      roundRect(ctx, 60, 60, 220, 42, 21);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 20px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('2024 지자체 성적표', 170, 81);

      // Region Title
      ctx.font = '900 64px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(data.fullName, 60, 175);

      // Population & Growth Badge
      const popStr = (data.population.value).toLocaleString() + '명';
      const growthStr = (data.population.growth15y >= 0 ? '+' : '') + data.population.growth15y + '% (15년간)';
      ctx.font = '700 26px Inter, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`인구: ${popStr} · 증감률: ${growthStr}`, 60, 225);
      ctx.restore();

      // Center Hero: Grade Badge Card
      ctx.save();
      const heroGrad = ctx.createLinearGradient(60, 270, W - 60, 480);
      heroGrad.addColorStop(0, 'rgba(15, 23, 42, 0.9)');
      heroGrad.addColorStop(1, 'rgba(30, 41, 59, 0.8)');
      ctx.fillStyle = heroGrad;
      ctx.strokeStyle = data.grade === 'S' ? '#f59e0b' : (data.grade.startsWith('A') ? '#10b981' : '#38bdf8');
      ctx.lineWidth = 3;
      roundRect(ctx, 60, 270, 960, 210, 28);
      ctx.fill();
      ctx.stroke();

      // Grade Stamp Box
      ctx.fillStyle = data.grade === 'S' ? '#f59e0b' : (data.grade.startsWith('A') ? '#10b981' : '#38bdf8');
      roundRect(ctx, 95, 305, 140, 140, 24);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 80px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(data.grade, 165, 375);

      // Grade Info
      ctx.textAlign = 'left';
      ctx.font = '900 42px Inter, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(data.gradeDesc, 270, 360);

      ctx.font = '700 28px Inter, sans-serif';
      ctx.fillStyle = '#fde047';
      ctx.fillText(`전국 종합 상위 ${data.overallPercentile}% 권역`, 270, 415);
      ctx.restore();

      // 4 Metrics Grid (2x2)
      const metrics = [
        { label: '주민 1인당 평균연봉', icon: '💰', val: data.metrics.wage.formatted, rank: data.metrics.wage.rank, pct: data.metrics.wage.percentile, color: '#38bdf8' },
        { label: '기업 일자리 총급여 규모', icon: '🏢', val: data.metrics.corporate.formatted, rank: data.metrics.corporate.rank, pct: data.metrics.corporate.percentile, color: '#a78bfa' },
        { label: '1인당 재산세 (부촌지수)', icon: '🏠', val: data.metrics.propertyTax.formatted, rank: data.metrics.propertyTax.rank, pct: data.metrics.propertyTax.percentile, color: '#f43f5e' },
        { label: '지자체 재정자립도', icon: '🏛️', val: data.metrics.fiscal.formatted, rank: data.metrics.fiscal.rank, pct: data.metrics.fiscal.percentile, color: '#34d399' },
      ];

      const gridStartX = 60;
      const gridStartY = 515;
      const colW = 465;
      const rowH = 210;
      const gapX = 30;
      const gapY = 25;

      metrics.forEach((m, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const x = gridStartX + col * (colW + gapX);
        const y = gridStartY + row * (rowH + gapY);

        ctx.save();
        ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
        ctx.strokeStyle = 'rgba(51, 65, 85, 0.6)';
        ctx.lineWidth = 2;
        roundRect(ctx, x, y, colW, rowH, 20);
        ctx.fill();
        ctx.stroke();

        ctx.font = '700 24px Inter, sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(`${m.icon} ${m.label}`, x + 30, y + 45);

        ctx.font = '900 44px monospace';
        ctx.fillStyle = m.color;
        ctx.fillText(m.val, x + 30, y + 115);

        ctx.font = '700 22px Inter, sans-serif';
        ctx.fillStyle = '#cbd5e1';
        const rankStr = m.rank ? `전국 ${m.rank}위` : '-';
        const pctStr = m.pct ? `(상위 ${m.pct}%)` : '';
        ctx.fillText(`${rankStr} ${pctStr}`, x + 30, y + 165);
        ctx.restore();
      });

      // Bottom Watermark
      ctx.save();
      ctx.font = '600 20px Inter, sans-serif';
      ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
      ctx.textAlign = 'center';
      ctx.fillText('데이터 출처: 통계청 KOSIS & 국세청 연말정산 & 행정안전부 · 제작: 지자체 미디어 팩토리', W / 2, 1025);
      ctx.restore();
    }

    function roundRect(ctx, x, y, width, height, radius) {
      if (width < 2 * radius) radius = width / 2;
      if (height < 2 * radius) radius = height / 2;
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.arcTo(x + width, y, x + width, y + height, radius);
      ctx.arcTo(x + width, y + height, x, y + height, radius);
      ctx.arcTo(x, y + height, x, y, radius);
      ctx.arcTo(x, y + height, x, y, radius);
      ctx.closePath();
    }

    function lightenColor(color, percent) {
      const num = parseInt(color.replace('#', ''), 16);
      const amt = Math.round(2.55 * percent);
      const R = (num >> 16) + amt;
      const G = (num >> 8 & 0x00FF) + amt;
      const B = (num & 0x0000FF) + amt;
      return '#' + (
        0x1000000 +
        (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
        (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
        (B < 255 ? (B < 1 ? 0 : B) : 255)
      ).toString(16).slice(1);
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    window.initBarChartRaceModal();
  });
})();
