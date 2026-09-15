// Bar Chart Race Video Generator & Canvas Renderer
(function() {
  'use strict';

  function formatRaceValue(val, indKey) {
    if (val === null || val === undefined || isNaN(val)) return '0';
    val = Number(val);
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
    const indSelect = document.getElementById('race-indicator-select');
    const provSelect = document.getElementById('race-province-select');
    const aspectSelect = document.getElementById('race-aspect-select');
    const speedSelect = document.getElementById('race-speed-select');
    const topNSelect = document.getElementById('race-topn-select');
    const customTitleInput = document.getElementById('race-custom-title');
    const customSubtitleInput = document.getElementById('race-custom-subtitle');
    const statusText = document.getElementById('race-status-text');
    const progressFill = document.getElementById('race-progress-fill');

    // BGM 오디오 및 보조 툴 버튼들
    const bgmFileInput = document.getElementById('race-bgm-file');
    const selectBgmBtn = document.getElementById('btn-select-bgm');
    const removeBgmBtn = document.getElementById('btn-remove-bgm');
    const bgmFilename = document.getElementById('race-bgm-filename');
    const bgmVolume = document.getElementById('race-bgm-volume');
    const bgmVolumeText = document.getElementById('race-bgm-volume-text');
    const thumbBtn = document.getElementById('btn-race-thumbnail');
    const copyTagsBtn = document.getElementById('btn-race-copy-tags');

    if (!modal || !openBtn || !canvas) return;

    let isPlaying = false;
    let isRecording = false;
    let animFrameId = null;
    let mediaRecorder = null;
    let recordedChunks = [];
    let raceData = null;

    // Web Audio 상태
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

      // 영상 종료 2.5초 전(홀드 구간 진입 시) 페이드아웃
      const fadeStartTime = ctx.currentTime + (totalDurationMs / 1000);
      const fadeEndTime = fadeStartTime + (holdDurationMs / 1000);
      activeGainNode.gain.setValueAtTime(vol, fadeStartTime);
      activeGainNode.gain.linearRampToValueAtTime(0, fadeEndTime);

      activeAudioSource.connect(activeGainNode);
      if (destNode) {
        activeGainNode.connect(destNode);
        activeGainNode.connect(ctx.destination); // 녹화 중에도 모니터링
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

    openBtn.addEventListener('click', () => {
      modal.classList.remove('hidden');
      loadRaceData();
    });

    closeBtn.addEventListener('click', () => {
      stopRace();
      modal.classList.add('hidden');
    });

    indSelect.addEventListener('change', loadRaceData);
    if (provSelect) provSelect.addEventListener('change', loadRaceData);
    topNSelect.addEventListener('change', loadRaceData);
    aspectSelect.addEventListener('change', adjustCanvasResolution);

    if (customTitleInput) {
      customTitleInput.addEventListener('input', () => {
        if (!isPlaying && raceData) renderStaticPreview();
      });
    }
    if (customSubtitleInput) {
      customSubtitleInput.addEventListener('input', () => {
        if (!isPlaying && raceData) renderStaticPreview();
      });
    }

    // BGM 파일 선택 핸들러
    if (selectBgmBtn && bgmFileInput) {
      selectBgmBtn.addEventListener('click', () => {
        bgmFileInput.click();
      });

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
          statusText.textContent = '⚠️ 오디오 디코딩 실패 (지원되지 않는 코덱)';
          audioBuffer = null;
        }
      });
    }

    if (removeBgmBtn) {
      removeBgmBtn.addEventListener('click', () => {
        currentBgmFile = null;
        audioBuffer = null;
        if (bgmFileInput) bgmFileInput.value = '';
        bgmFilename.textContent = '선택 안 됨 (무음 녹화)';
        bgmFilename.classList.remove('text-amber-300', 'font-medium');
        bgmFilename.classList.add('text-slate-400');
        removeBgmBtn.classList.add('hidden');
        stopAudioPlayback();
        statusText.textContent = '배경음악이 제거되었습니다 (무음 모드)';
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

    // 썸네일(PNG) 다운로드 버튼
    if (thumbBtn) {
      thumbBtn.addEventListener('click', () => {
        if (!canvas) return;
        canvas.toBlob(blob => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          const indName = (raceData && raceData.indicatorName) ? raceData.indicatorName : '지표';
          const provName = (raceData && raceData.provinceName) ? raceData.provinceName : '전국';
          const aspectStr = aspectSelect.value === '9:16' ? '쇼츠(9x16)' : '와이드(16x9)';
          a.download = `[썸네일]_${provName}_${indName}_${aspectStr}.png`;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            statusText.textContent = `📸 썸네일 다운로드 완료! (${a.download})`;
          }, 500);
        }, 'image/png');
      });
    }

    // 유튜브 쇼츠 메타데이터(제목/설명/태그) 클립보드 복사
    if (copyTagsBtn) {
      copyTagsBtn.addEventListener('click', () => {
        if (!raceData) return;
        const { mainTitle, subTitle } = getTitles();
        const indName = raceData.indicatorName || '지표';
        const provName = raceData.provinceName || '전국';
        const startY = raceData.startYear || 2010;
        const endY = raceData.endYear || 2024;
        const lastFrame = (raceData.frames && raceData.frames.length > 0) ? raceData.frames[raceData.frames.length - 1] : null;
        const top1Item = lastFrame && lastFrame.items && lastFrame.items[0];
        const top1Name = top1Item ? (top1Item.fullName || top1Item.name) : '1위';

        const clipText = `🔥 ${mainTitle} - ${subTitle} 순위 변천사 (${startY}-${endY})

과연 15년 동안 가장 눈부신 변화를 겪은 지자체는 어디일까요?
${endY}년 최종 1위는 바로 "${top1Name}"입니다! 🏆

여러분의 동네는 지금 몇 위에 위치해 있나요? 댓글로 남겨주세요! 👇

📌 데이터 출처: 행정안전부 지방세 연감 & 통계청 KOSIS
#쇼츠 #shorts #지자체 #순위 #통계 #${provName.replace(/\s+/g, '')} #${indName.replace(/\s+/g, '')} #지역발전 #데이터시각화 #reels #바차트레이스`;

        navigator.clipboard.writeText(clipText).then(() => {
          statusText.textContent = '📋 유튜브 쇼츠용 제목·설명·해시태그가 복사되었습니다!';
          const originalHtml = copyTagsBtn.innerHTML;
          copyTagsBtn.innerHTML = '<span class="material-symbols-outlined text-sm text-emerald-400">check</span><span>복사 완료!</span>';
          setTimeout(() => {
            copyTagsBtn.innerHTML = originalHtml;
          }, 2000);
        }).catch(err => {
          console.error('Clipboard error:', err);
          statusText.textContent = '⚠️ 클립보드 복사 실패';
        });
      });
    }

    function adjustCanvasResolution() {
      const mode = aspectSelect.value;
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
      if (raceData) renderStaticPreview();
    }

    async function loadRaceData() {
      const ind = indSelect.value;
      const prov = provSelect ? (provSelect.value || '') : '';
      const topN = topNSelect ? (topNSelect.value || 10) : 10;
      statusText.textContent = '순위 데이터 불러오는 중...';
      try {
        const res = await fetch(`/api/race-data?indicatorId=${encodeURIComponent(ind)}&topN=${topN}&provinceCode=${encodeURIComponent(prov)}`);
        raceData = await res.json();
        const spanYears = (raceData && raceData.startYear && raceData.endYear) ? (raceData.endYear - raceData.startYear + 1) : 15;
        const regionLabel = raceData.provinceName || (prov ? '지역' : '전국 지자체');
        statusText.textContent = `준비 완료 (${regionLabel} ${raceData.startYear}년 ~ ${raceData.endYear}년, ${spanYears}개년 TOP ${topN})`;

        if (customTitleInput) {
          const prevDefaultPattern = /^.* 지자체 \d+개년$|^.* \d+개년$/;
          if (!customTitleInput.value || prevDefaultPattern.test(customTitleInput.value.trim())) {
            customTitleInput.value = `${regionLabel} ${spanYears}개년`;
          }
          customTitleInput.placeholder = `예: ${regionLabel} ${spanYears}개년, ${raceData.startYear}-${raceData.endYear} 순위 등`;
        }
        if (customSubtitleInput) {
          const indName = raceData.indicatorName || '지표';
          const prevSubPattern = /TOP \d+$/;
          if (!customSubtitleInput.value || prevSubPattern.test(customSubtitleInput.value.trim())) {
            customSubtitleInput.value = `${indName} TOP ${topN}`;
          }
          customSubtitleInput.placeholder = `예: ${indName} TOP ${topN}, 1위~${topN}위 변화 등`;
        }

        adjustCanvasResolution();
        renderStaticPreview();
      } catch (e) {
        statusText.textContent = '데이터 로딩 실패';
        console.error(e);
      }
    }

    function getTitles() {
      const spanYears = (raceData && raceData.startYear && raceData.endYear) ? (raceData.endYear - raceData.startYear + 1) : 15;
      const regionLabel = (raceData && raceData.provinceName) ? raceData.provinceName : '전국 지자체';
      const defaultMain = `${regionLabel} ${spanYears}개년`;
      const mainTitle = (customTitleInput && customTitleInput.value.trim()) ? customTitleInput.value.trim() : defaultMain;
      const topN = topNSelect ? topNSelect.value : '10';
      const indName = (raceData && raceData.indicatorName) ? raceData.indicatorName : '지표';
      let subTitle = (customSubtitleInput && customSubtitleInput.value.trim()) ? customSubtitleInput.value.trim() : `${indName} TOP ${topN}`;
      return { mainTitle, subTitle };
    }

    function renderStaticPreview() {
      if (!raceData || !raceData.frames || raceData.frames.length === 0) return;
      const ctx = canvas.getContext('2d');
      const { mainTitle, subTitle } = getTitles();
      drawFrame(ctx, raceData.frames[0].items, raceData.frames[0].year, 0, mainTitle, subTitle, raceData.indicatorKey);
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
      progressFill.style.width = '0%';
    }

    startBtn.addEventListener('click', () => {
      if (isPlaying) {
        stopRace();
      } else {
        runAnimation(false);
      }
    });

    recordBtn.addEventListener('click', () => {
      if (isRecording) {
        stopRace();
      } else {
        runAnimation(true);
      }
    });

    async function runAnimation(recordMode) {
      if (!raceData || !raceData.frames || raceData.frames.length === 0) return;
      stopRace();
      isPlaying = true;
      isRecording = recordMode;

      const frames = raceData.frames;
      const topN = parseInt(topNSelect.value, 10) || 10;
      const durationPerYear = parseFloat(speedSelect.value) || 1800;
      const totalYears = frames.length - 1;
      const totalDuration = totalYears * durationPerYear;
      const HOLD_DURATION = 2500; // 마지막 2024년 화면을 2.5초간 유지 (영상 끝 끊김 완전 방지)

      const ctx = canvas.getContext('2d');
      const { mainTitle, subTitle } = getTitles();

      if (recordMode) {
        recordedChunks = [];
        const videoStream = canvas.captureStream(60);
        let streamToRecord = videoStream;

        if (audioBuffer) {
          const aCtx = getAudioContext();
          const audioDest = aCtx.createMediaStreamDestination();
          startAudioPlayback(audioDest, totalDuration, HOLD_DURATION);

          const combinedTracks = [
            ...videoStream.getVideoTracks(),
            ...audioDest.stream.getAudioTracks()
          ];
          streamToRecord = new MediaStream(combinedTracks);
        }

        let mimeType = 'video/webm;codecs=vp9,opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/webm;codecs=vp9';
        }
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/webm;codecs=vp8,opus';
        }
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/webm';
        }

        mediaRecorder = new MediaRecorder(streamToRecord, { mimeType, videoBitsPerSecond: 8000000 });
        mediaRecorder.ondataavailable = e => {
          if (e.data.size > 0) recordedChunks.push(e.data);
        };
        mediaRecorder.onstop = saveVideoFile;
        // 1초 단위로 안전하게 chunk 분할 저장
        mediaRecorder.start(1000);

        recordBtn.innerHTML = '<span class="material-symbols-outlined text-sm">stop</span><span>녹화 중지 (완료 시 자동 저장)</span>';
        recordBtn.classList.remove('from-rose-500', 'to-red-600');
        recordBtn.classList.add('bg-rose-600', 'animate-pulse');
        const audioStatus = audioBuffer ? '🎵 BGM 오디오 합성 중 · ' : '';
        statusText.textContent = `🎥 ${audioStatus}60fps 고화질 비디오 녹화 중... (끝까지 감상하시면 자동 저장됩니다)`;
      } else {
        if (audioBuffer) {
          startAudioPlayback(null, totalDuration, HOLD_DURATION);
        }
        startBtn.innerHTML = '<span class="material-symbols-outlined text-sm">pause</span><span>일시정지</span>';
        statusText.textContent = '▶ 순위 변천사 레이스 재생 중...';
      }

      let startTime = null;

      function step(timestamp) {
        if (!isPlaying) return;
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;

        if (elapsed <= totalDuration) {
          const progress = Math.min(1, elapsed / totalDuration);
          progressFill.style.width = (progress * 100).toFixed(1) + '%';

          const exactIndex = (elapsed / durationPerYear);
          const currentIndex = Math.min(Math.floor(exactIndex), frames.length - 2);
          const subProgress = Math.min(1, exactIndex - currentIndex);

          const frameA = frames[currentIndex];
          const frameB = frames[Math.min(currentIndex + 1, frames.length - 1)];

          const interpolatedItems = interpolateRankings(frameA.items, frameB.items, subProgress, topN);
          const displayYear = frameA.year + (frameB.year - frameA.year) * subProgress;

          drawFrame(ctx, interpolatedItems, displayYear, progress, mainTitle, subTitle, raceData.indicatorKey);
          animFrameId = requestAnimationFrame(step);
        } else if (elapsed < totalDuration + HOLD_DURATION) {
          // HOLD 구간: 마지막 프레임을 계속 렌더링하여 비디오 인코더가 끝까지 넉넉히 기록하도록 보장
          progressFill.style.width = '100%';
          const lastFrame = frames[frames.length - 1];
          drawFrame(ctx, lastFrame.items, lastFrame.year, 1, mainTitle, subTitle, raceData.indicatorKey);
          statusText.textContent = '⏳ 최종 순위 확정 중... (잠시 후 영상이 저장됩니다)';
          animFrameId = requestAnimationFrame(step);
        } else {
          // 완료 처리
          const lastFrame = frames[frames.length - 1];
          drawFrame(ctx, lastFrame.items, lastFrame.year, 1, mainTitle, subTitle, raceData.indicatorKey);
          statusText.textContent = '✅ 레이스 완료! 영상 파일 생성 중...';

          if (isRecording && mediaRecorder && mediaRecorder.state !== 'inactive') {
            try {
              mediaRecorder.requestData();
            } catch (e) {}
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
      }

      animFrameId = requestAnimationFrame(step);
    }

    function saveVideoFile() {
      if (recordedChunks.length === 0) return;
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const indName = (raceData && raceData.indicatorName) ? raceData.indicatorName : '순위변천사';
      const provStr = (raceData && raceData.provinceName) ? raceData.provinceName : '전국';
      const topN = topNSelect ? topNSelect.value : '10';
      const aspectStr = aspectSelect.value === '9:16' ? '쇼츠(9x16)' : '와이드(16x9)';
      const spanYears = (raceData && raceData.startYear && raceData.endYear) ? (raceData.endYear - raceData.startYear + 1) : 15;
      a.download = `지자체_${provStr}_${indName}_TOP${topN}_${spanYears}개년순위변천사_${aspectStr}.webm`;
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

    function drawFrame(ctx, items, displayYear, progress, mainTitle, subTitle, indKey) {
      const W = canvas.width;
      const H = canvas.height;
      const isVertical = (W < H);

      // 1. Dark tech mesh background
      const bgGrad = ctx.createLinearGradient(0, 0, W, H);
      bgGrad.addColorStop(0, '#0a0f1d');
      bgGrad.addColorStop(0.5, '#0f172a');
      bgGrad.addColorStop(1, '#020617');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // Subtle grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.lineWidth = 2;
      const gridGap = isVertical ? 120 : 160;
      for (let x = 0; x < W; x += gridGap) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }

      // 2. Ambient background year watermark
      ctx.save();
      const roundedYear = Math.floor(displayYear);
      ctx.font = isVertical ? '900 320px Inter, sans-serif' : '900 240px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = 'rgba(14, 165, 233, 0.07)';
      const yearX = isVertical ? W - 60 : W - 100;
      const yearY = isVertical ? H - 180 : H - 80;
      ctx.fillText(roundedYear.toString(), yearX, yearY);
      ctx.restore();

      // 3. Header title (Customizable)
      ctx.save();
      if (isVertical) {
        // Red badge
        ctx.fillStyle = '#ef4444';
        roundRect(ctx, 60, 70, 180, 50, 25);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 26px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('HOT SHORTS', 150, 95);

        // Punchy Main Title
        ctx.font = '900 64px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(mainTitle, 60, 190);
        
        // Gradient Subtitle
        const titleGrad = ctx.createLinearGradient(60, 210, 800, 280);
        titleGrad.addColorStop(0, '#38bdf8');
        titleGrad.addColorStop(1, '#818cf8');
        ctx.fillStyle = titleGrad;
        ctx.font = '900 56px Inter, sans-serif';
        ctx.fillText(subTitle, 60, 265);

        // Year Tracker
        const startY = (raceData && raceData.startYear) ? raceData.startYear : 2010;
        const endY = (raceData && raceData.endYear) ? raceData.endYear : 2024;
        ctx.font = '700 32px monospace';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(`YEAR: ${roundedYear}년 (${startY} ~ ${endY})`, 60, 325);
      } else {
        const startY = (raceData && raceData.startYear) ? raceData.startYear : 2010;
        const endY = (raceData && raceData.endYear) ? raceData.endYear : 2024;
        ctx.font = '900 48px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`${mainTitle} - ${subTitle}`, 80, 90);

        ctx.font = '700 26px monospace';
        ctx.fillStyle = '#38bdf8';
        ctx.fillText(`기준 연도: ${roundedYear}년 | ${startY}~${endY} longitudinal tracking`, 80, 135);
      }
      ctx.restore();

      // 4. Bar measurements & Dynamic layout for 10, 20, 50
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

      // Font & column sizes based on count
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
        // TOP 50
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
      const maxVal = Math.max(...items.map(i => i.value || 0), 1);

      // Sort items by rank to draw lower ranks first, top ranks on top (prevent z-index clipping during rank overtaking)
      const sortedByRankDesc = [...items].sort((a, b) => {
        const rA = a.rank !== undefined ? a.rank : 999;
        const rB = b.rank !== undefined ? b.rank : 999;
        return rB - rA;
      });

      // 5. Render bars and labels
      sortedByRankDesc.forEach((item) => {
        const rankPos = (item.rank !== undefined ? item.rank : 1) - 1;
        const y = topOffset + rankPos * barSpacing;
        const barW = Math.max(12, ((item.value || 0) / maxVal) * maxBarWidth);

        const shortProv = (item.fullName || '').split(' ')[0] || '';
        const baseColor = getBarColor(shortProv);

        // 5-A. Rank Badge / Number
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

        // 5-B. Region Name (Fixed Dedicated Column - Never overlaps with value or bar)
        ctx.save();
        ctx.font = `700 ${nameFontSize}px Inter, sans-serif`;
        ctx.fillStyle = (rankPos < 2.5) ? '#ffffff' : '#e2e8f0';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const isSingleProv = Boolean(raceData && raceData.provinceCode && raceData.provinceCode.startsWith('KR_'));
        const displayName = (isSingleProv || (count > 25 && isVertical)) ? item.name : (item.fullName || item.name);
        ctx.fillText(displayName, leftMargin + rankColWidth, y + barHeight / 2);
        ctx.restore();

        // 5-C. Bar (Starts cleanly from barStartX)
        ctx.save();
        if (rankPos < 0.5) {
          ctx.shadowColor = 'rgba(239, 68, 68, 0.55)';
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

        // 5-D. Trailing Value Label (Always to the right of the bar, clamped safe distance)
        ctx.save();
        const valX = barStartX + barW + (count > 25 ? 8 : 14);
        ctx.font = `800 ${valFontSize}px monospace`;
        ctx.fillStyle = (rankPos < 0.8) ? '#fde047' : '#cbd5e1';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(formatRaceValue(item.value, indKey), valX, y + barHeight / 2);
        ctx.restore();
      });

      // 6. Bottom attribution
      ctx.save();
      const footY = H - (isVertical ? 65 : 35);
      ctx.font = isVertical ? '600 24px Inter, sans-serif' : '600 20px Inter, sans-serif';
      ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
      ctx.textAlign = 'center';
      ctx.fillText('데이터 출처: 행정안전부 지방세 연감 & 통계청 KOSIS · 제작: 지자체 재정·인구 탐색기', W / 2, footY);
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
