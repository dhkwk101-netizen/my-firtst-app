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

  // Comprehensive knowledge base for 20 KOSIS indicators for in-depth blog posts
  const INDICATOR_EXPLANATIONS = {
    'FISCAL_INDEPENDENCE': {
      title: '재정자립도 (Fiscal Independence Ratio)',
      what: '지방자치단체가 한 해 동안 집행하는 일반회계 세입 예산 중, 중앙정부(행정안전부·기획재정부)에 손벌리지 않고 지역 내에서 스스로 걷어 들이는 자체수입(지방세 + 세외수입)이 차지하는 백분율(%)입니다.',
      why: '지자체의 경제적 독립성과 행정 자치 역량을 가늠하는 절대적인 척도입니다. 재정자립도가 높을수록 중앙정부의 교부세나 국고보조금 조건에 휘둘리지 않고, 지역 주민이 진정으로 원하는 독자적인 복지 혜택, 교통 인프라 확충, 교육 지원 정책을 소신 있게 펼칠 수 있습니다.',
      role: '재정자립도가 취약한 지자체는 중앙정부 세수 결손이나 예산 삭감 시 복지 사업이나 인프라 유지보수가 직격탄을 맞게 됩니다. 반면 재정자립도가 높은 도시는 우수한 공공 서비스와 쾌적한 도시 정주 여건을 선순환시키며 기업과 인구를 끌어들이는 강력한 도시 경쟁력을 발휘합니다.'
    },
    'AVERAGE_WAGE': {
      title: '주민 1인당 평균 연봉 (Average Annual Wage)',
      what: '국세청 근로소득 연말정산 신고 데이터를 기준으로, 해당 시·군·구에 실제 주민등록을 두고 거주하는 급여 생활자들의 1인당 평균 연간 총급여액(세전)을 의미합니다.',
      why: '지역 내 거주민들의 실질적인 소득 수준과 가계의 부유도를 가장 직접적이고 정밀하게 보여주는 척도입니다. 통계적 착시가 적으며 고연봉 전문직, 첨단 IT/제조업 종사자들의 밀집도를 여실히 드러냅니다.',
      role: '주민 소득 수준은 지역 내 상권 소비력, 사교육 인프라 형성, 주거지 선호도 및 아파트 시세를 결정짓는 핵심 기초체력으로 작용합니다. 즉, 살기 좋은 부촌과 신흥 부촌을 판가름하는 핵심 잣대입니다.'
    },
    'CORPORATE_TOTAL_PAYROLL': {
      title: '사업장 총급여액 (Corporate Payroll Volume)',
      what: '관내에 본사나 공장, 사업장을 둔 기업체들이 소속 근로자들에게 1년 동안 지급한 인건비 총액(원천징수의무자 납부 총급여)을 뜻합니다.',
      why: '단순히 베드타운(잠만 자는 도시)인지, 아니면 스스로 양질의 일자리와 경제적 부가가치를 생산하는 자족도시인지를 가르는 일자리 경제 규모의 총량입니다.',
      role: '사업장 총급여 규모가 큰 도시는 법인 지방소득세 수입이 풍부해져 지자체 곳간이 두둑해지고, 주간 활동 인구 유입으로 자영업과 지역 상권이 활기를 띠며 지속 가능한 도시 발전의 심장 역할을 합니다.'
    },
    'PROPERTY_TAX_PER_CAPITA': {
      title: '1인당 재산세 (Property Tax Per Capita)',
      what: '관내 토지, 주택, 일반 건축물 등 보유 자산에 부과된 재산세 총 세입액을 해당 지역 주민등록 인구수로 나눈 1인당 평균 납부액입니다.',
      why: '부동산 자산 가치를 반영하는 가장 객관적인 부촌 지수(Wealth Index)입니다. 공시가격이 높고 고가 주택 및 대형 상업용 빌딩이 밀집할수록 1인당 재산세 수치가 급격히 치솟습니다.',
      role: '지역 내 고가 자산의 밀집도를 대변하며, 지자체 입장에서는 매년 가장 안정적으로 들어오는 자주재원의 핵심 원천으로서 양질의 공공시설 및 도로망 구축에 재투자되는 바탕이 됩니다.'
    },
    'PROPERTY_TAX': {
      title: '재산세 세입액 (Property Tax Total)',
      what: '시·군·구 지자체 관할 구역 내에 위치한 아파트, 단독주택, 토지, 빌딩 등에 부과되어 결산된 재산세 세입의 총합계입니다.',
      why: '해당 도시 전체에 축적된 부동산 자산 가치의 총량을 가늠할 수 있는 핵심 지표입니다.',
      role: '부동산 경기에 따른 부침이 비교적 적어 기초지자체 일반재정의 든든한 버팀목 역할을 하며, 지자체의 도시 관리 및 공공서비스 공급 능력의 근간이 됩니다.'
    },
    'ACQUISITION_TAX': {
      title: '취득세 세입액 (Acquisition Tax)',
      what: '부동산(아파트, 토지, 상가) 매매, 신축 건물 준공, 차량 취득 등 자산의 소유권 이전 및 거래 행위가 발생할 때 부과되는 지방세입니다.',
      why: '지역 내 부동산 거래 활성도와 신규 분양/입주 물량, 건설 경기 호황 여부를 실시간으로 보여주는 가장 역동적인 지표입니다.',
      role: '대규모 신도시 개발이나 아파트 입주가 쏟아질 때 취득세가 폭증하여 지자체에 막대한 재정적 보너스를 제공하지만, 부동산 침체기에는 세수가 급감하는 변동성을 지닙니다.'
    },
    'ACQUISITION_TAX_PER_CAPITA': {
      title: '1인당 취득세 (Acquisition Tax Per Capita)',
      what: '1년 동안 징수된 취득세 총액을 주민등록 인구수로 나눈 값으로, 주민 1인당 환산한 자산 거래 활력도입니다.',
      why: '도시 규모와 무관하게 신도시 개발, 재건축·재개발 입주, 고가 부동산 손바뀜이 주민 대비 얼마나 왕성하게 일어났는지를 공평하게 비교할 수 있습니다.',
      role: '젊은 인구 유입과 주택 시장의 신선한 공급 활력을 나타내며, 신흥 주거 벨트로서의 부상 여부를 조기에 포착하는 풍향계 역할을 합니다.'
    },
    'LOCAL_TAX_TOTAL': {
      title: '지방세 총 세입액 (Local Tax Total)',
      what: '취득세, 재산세, 지방소득세, 자동차세, 주민세 등 지자체가 관할 구역에서 최종 징수한 모든 지방세목의 총 결산 합계액입니다.',
      why: '해당 지역의 종합적인 경제 규모와 세원(Tax Base)의 크기를 총체적으로 증명하는 최종 성적표입니다.',
      role: '지자체가 자체 역량으로 수행할 수 있는 모든 공공 인프라 투자와 행정 서비스의 총자본이 되며, 대도시와 군소 지자체 간의 체급 차이를 단적으로 보여줍니다.'
    },
    'LOCAL_TAX_TOTAL_PER_CAPITA': {
      title: '1인당 지방세 (Local Tax Per Capita)',
      what: '지방세 총 결산액을 주민등록 인구수로 나눈 수치로, 시민 1인당 지자체 곳간에 기여하는 평균 세금 액수입니다.',
      why: '인구 규모에 따른 착시를 제거하고, 지자체 주민과 기업들의 1인당 세금 기여도 및 경제적 밀도를 가장 객관적으로 측정합니다.',
      role: '1인당 지방세가 높은 지자체일수록 주민 1인에게 돌아가는 복지 혜택과 공공 도서관, 공원, 체육시설 등 1인당 인프라 수혜 수준이 월등히 높아집니다.'
    },
    'LOCAL_INCOME_TAX': {
      title: '지방소득세 세입액 (Local Income Tax)',
      what: '개인의 종합소득·근로소득·양도소득 및 법인의 각 사업연도 소득에 부과되는 세금(국세인 소득세·법인세의 약 10% 수준)입니다.',
      why: '해당 지역에 거주하는 주민들의 소득과 관내에 둥지를 튼 기업들의 영업이익이 합쳐진 실질적인 벌이(Earning Power)의 총합입니다.',
      role: '대기업이나 알짜 중소기업의 본사·연구소가 관내에 유치되었을 때 법인 지방소득세가 급증하여 도시 재정을 획기적으로 도약시키는 엔진이 됩니다.'
    },
    'LOCAL_INCOME_TAX_PER_CAPITA': {
      title: '1인당 지방소득세 (Local Income Tax Per Capita)',
      what: '지방소득세 총액을 주민등록 인구수로 나눈 값입니다.',
      why: '주민들의 고소득 성향과 관내 기업들의 탄탄한 수익성이 결합된 알짜배기 경제 도시인지를 증명합니다.',
      role: '주민 소득과 기업 활력이 모두 뛰어난 양질의 자족도시 여부를 판별하는 핵심 지표로 활용됩니다.'
    },
    'POPULATION': {
      title: '주민등록인구 (Resident Population)',
      what: '행정안전부 주민등록 전산망에 정식 등재되어 해당 시·군·구에 거주하는 정주 인구의 총수입니다.',
      why: '모든 도시 정책과 행정 규모, 선거구 획정, 국비 교부금 산정의 가장 근본이 되는 기초 단위입니다.',
      role: '인구가 늘어나는 도시는 일자리, 상권, 주택 수요가 동반 성장하는 활력 도시가 되며, 인구가 줄어드는 도시는 지역 소멸 위험과 학교 폐교, 인프라 황폐화의 위기에 직면합니다.'
    },
    'TOTAL_FERTILITY_RATE': {
      title: '합계출산율 (Total Fertility Rate)',
      what: '여성 1명이 가임기간(15~49세) 동안 낳을 것으로 예상되는 평균 출생아 수입니다.',
      why: '지역 사회의 미래 활력과 지속 가능성, 젊은 부부들의 정주 만족도를 대변하는 국가적 초미의 관심 지표입니다.',
      role: '신혼부부를 위한 양질의 주거, 안정된 일자리, 안심할 수 있는 보육·교육 환경이 잘 갖추어진 지자체일수록 높은 출산율을 기록하며 지속 가능한 미래 경쟁력을 확보합니다.'
    },
    'ELDERLY_POPULATION_RATIO': {
      title: '고령인구 비율 (Elderly Population Ratio)',
      what: '전체 주민등록 인구 중 만 65세 이상 고령층 인구가 차지하는 백분율(%)입니다.',
      why: '초고령 사회 진입 속도와 생산연령인구의 감소, 노인 부양 부담을 가늠하는 고령화 진단 지표입니다.',
      role: '고령인구 비율이 급등하는 지자체는 세수를 낼 경제활동 인구가 줄어드는 반면 의료·복지 예산 지출은 급증하여 지자체 재정 건전성을 위협받게 됩니다.'
    },
    'BUSINESS_ESTABLISHMENTS': {
      title: '가동 사업체 수 (Business Establishments)',
      what: '국세청 사업자등록 기준, 해당 관내에서 실제 경제활동과 사업을 영위하고 있는 개인 및 법인 사업체의 총수입니다.',
      why: '지역 내 창업 열기와 소상공인 생태계, 산업 클러스터의 두터움을 보여주는 척도입니다.',
      role: '사업체 수가 풍부할수록 주민들의 근거리 일자리가 늘어나고 골목 상권과 지역 내 자금 회전이 원활해집니다.'
    },
    'BUSINESSES_PER_THOUSAND': {
      title: '인구 천명당 사업체 수 (Businesses Per 1,000 Capita)',
      what: '주민등록인구 1,000명당 존재하는 가동 사업체(개인+법인)의 개수입니다.',
      why: '인구 대비 비즈니스 밀도와 상업·산업 집적도를 나타내며, 베드타운과 산업 중심지를 명확히 구분해 줍니다.',
      role: '수치가 높을수록 외부 유동인구를 끌어들이는 상업·업무 중심지 역할을 수행함을 뜻합니다.'
    },
    'WITHHOLDING_TAX': {
      title: '원천징수세액 (Withholding Tax Volume)',
      what: '관내 사업장들이 매월 임직원 급여 지급 시 원천징수하여 국세청에 납부한 근로소득세의 총 규모입니다.',
      why: '지역 내 기업들이 지급하는 실제 고임금 일자리의 순도와 고용의 질을 직접 증명합니다.',
      role: '관내 양질의 일자리가 얼마나 많은 세금을 창출하는지 나타내며, 기업 유치 성과를 입증하는 핵심 데이터입니다.'
    },
    'WORKPLACE_WAGE_EARNERS': {
      title: '사업장 근로자수 (Workplace Wage Earners)',
      what: '해당 시·군·구에 소재한 기업 및 사업장에 소속되어 일하는 연말정산 신고 근로자의 총 인원수입니다.',
      why: '단순 거주자가 아닌, 그 도시의 일터로 매일 출근하는 일자리 수요와 고용 창출 규모를 의미합니다.',
      role: '낮 시간대 활동 인구를 지탱하며 외식업, 대중교통 등 도시 주간 활력의 근간이 됩니다.'
    },
    'NET_MIGRATION': {
      title: '순이동인구 (Net Migration)',
      what: '해당 지역으로 전입해 온 총 인구수에서 타 지역으로 빠져나간 전출자 수를 뺀 순수 인구 유입·유출량입니다.',
      why: '도시의 매력도와 인구 흡인력을 나타내는 가장 즉각적인 반응 지표입니다.',
      role: '순이동이 지속적인 플러스(+)인 지역은 신규 아파트 분양, 일자리 확충 등으로 인구가 빨려 들어오는 성장 도시임을 방증합니다.'
    },
    'NET_MIGRATION_RATE': {
      title: '순이동률 (Net Migration Rate)',
      what: '주민등록인구 대비 순이동자의 백분율(%)입니다.',
      why: '인구 규모 대비 인구의 상대적 유입 및 유출 강도를 공정하게 비교합니다.',
      role: '도시의 급성장이나 급격한 인구 이탈(소멸 위기)을 진단하는 조기 경보 지표로 작동합니다.'
    }
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
    const copyBlogBtn = document.getElementById('btn-race-copy-blog');
    const downloadCsvBtn = document.getElementById('btn-race-download-csv');
    const uploadDriveBtn = document.getElementById('btn-race-upload-drive');
    const labelBtnThumbnail = document.getElementById('label-btn-thumbnail');


    // Official StatRace Korea Branding & SNS Controls
    const brandToggleLogo = document.getElementById('brand-toggle-logo');
    const brandToggleBg = document.getElementById('brand-toggle-bg');
    const brandToggleSns = document.getElementById('brand-toggle-sns');
    const brandToggleCta = document.getElementById('brand-toggle-cta');
    const brandToggleIntro = document.getElementById('brand-toggle-intro');
    const btnToggleIntroPreview = document.getElementById('btn-toggle-intro-preview');
    const labelToggleIntro = document.getElementById('label-toggle-intro');
    let showIntroPreview = false;

    const brandConfig = {
      showLogo: true,
      showBgTexture: true,
      showSnsBar: true,
      showEndingCta: true,
      showIntroBanner: true,
    };

    function updateBrandConfig() {
      if (brandToggleLogo) brandConfig.showLogo = brandToggleLogo.checked;
      if (brandToggleBg) brandConfig.showBgTexture = brandToggleBg.checked;
      if (brandToggleSns) brandConfig.showSnsBar = brandToggleSns.checked;
      if (brandToggleCta) brandConfig.showEndingCta = brandToggleCta.checked;
      if (brandToggleIntro) brandConfig.showIntroBanner = brandToggleIntro.checked;
      if (!isPlaying) renderStaticPreview();
    }

    if (brandToggleLogo) brandToggleLogo.addEventListener('change', updateBrandConfig);
    if (brandToggleBg) brandToggleBg.addEventListener('change', updateBrandConfig);
    if (brandToggleSns) brandToggleSns.addEventListener('change', updateBrandConfig);
    if (brandToggleCta) brandToggleCta.addEventListener('change', updateBrandConfig);
    if (brandToggleIntro) brandToggleIntro.addEventListener('change', updateBrandConfig);

    if (btnToggleIntroPreview) {
      btnToggleIntroPreview.addEventListener('click', () => {
        if (isPlaying) stopRace();
        showIntroPreview = !showIntroPreview;
        if (labelToggleIntro) {
          labelToggleIntro.textContent = showIntroPreview ? '차트 화면 복귀' : '인트로 썸네일 보기';
        }
        btnToggleIntroPreview.classList.toggle('bg-cyan-500/30', showIntroPreview);
        btnToggleIntroPreview.classList.toggle('border-cyan-400', showIntroPreview);
        renderStaticPreview();
      });
    }

    // Preload brand assets
    const BRAND_ASSETS = {
      logo: '/static/explorer/branding/logo.png',
      watermark: '/static/explorer/branding/watermark.png',
      bgTexture: '/static/explorer/branding/bg_texture.jpg',
      banner: '/static/explorer/branding/banner.png',
    };
    const brandImages = {};
    function preloadBrandAssets() {
      for (const [key, src] of Object.entries(BRAND_ASSETS)) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = src;
        img.onload = () => {
          brandImages[key] = img;
          if (!isPlaying) renderStaticPreview();
        };
      }
    }
    preloadBrandAssets();

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

        if (currentMode === 'RACE') {
          // RACE Mode: Render high-impact Intro Thumbnail (Dark blur backdrop + Center headline card)
          const offCanvas = document.createElement('canvas');
          offCanvas.width = canvas.width;
          offCanvas.height = canvas.height;
          const offCtx = offCanvas.getContext('2d');
          const W = offCanvas.width;
          const H = offCanvas.height;
          const isVertical = (W < H);
          const { mainTitle, subTitle } = getTitles();
          const isGrowth = raceData && raceData.rankingMode === 'GROWTH_RATE';
          const firstItems = (raceData && raceData.frames && raceData.frames.length > 0) ? raceData.frames[0].items : [];
          const firstYear = (raceData && raceData.frames && raceData.frames.length > 0) ? raceData.frames[0].year : 2010;

          // 1. Draw base frame
          drawFrame(offCtx, firstItems, firstYear, 0, mainTitle, subTitle, raceData ? raceData.indicatorKey : '', isGrowth);
          // 2. Overlay intro banner (Background blur + Center headline card)
          drawIntroBanner(offCtx, W, H, isVertical, mainTitle, subTitle, isGrowth, 1.0);

          offCanvas.toBlob(blob => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const indName = (raceData && raceData.indicatorName) ? raceData.indicatorName : '지표';
            const provName = (raceData && raceData.provinceName) ? raceData.provinceName : '전국';
            const aspectStr = isVertical ? '쇼츠(9x16)' : '와이드(16x9)';
            a.download = `[썸네일]_${provName}_${indName}_${aspectStr}.png`;
            document.body.appendChild(a);
            a.click();
            const thumbFilename = a.download;
            setTimeout(() => {
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
              statusText.textContent = `📸 썸네일 다운로드 완료! (${thumbFilename}) → ☁️ 구글 드라이브(STATRACE) 전송 시작...`;
            }, 500);

            // Auto-upload Thumbnail to Google Drive (STATRACE folder)
            const formData = new FormData();
            formData.append('action', 'image');
            formData.append('filename', thumbFilename);
            formData.append('file', blob, thumbFilename);
            fetch('/api/drive-upload', { method: 'POST', body: formData })
              .then(r => r.json())
              .then(res => {
                if (res.success) {
                  statusText.textContent = `🎉 [완료] 썸네일 이미지 PC 저장 & 구글 드라이브(STATRACE) 백업 성공! (${thumbFilename})`;
                }
              })
              .catch(err => console.error('Drive thumbnail upload failed:', err));
          }, 'image/png');
          return;
        }

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
          }
          document.body.appendChild(a);
          a.click();
          const imgFilename = a.download;
          setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            statusText.textContent = `📸 이미지 저장 완료! (${imgFilename}) → ☁️ 구글 드라이브(STATRACE) 전송 시작...`;
          }, 500);

          // Auto-upload Canvas/Card Image to Google Drive (STATRACE folder)
          const formData = new FormData();
          formData.append('action', 'image');
          formData.append('filename', imgFilename);
          formData.append('file', blob, imgFilename);
          fetch('/api/drive-upload', { method: 'POST', body: formData })
            .then(r => r.json())
            .then(res => {
              if (res.success) {
                statusText.textContent = `🎉 [완료] 이미지 PC 저장 & 구글 드라이브(STATRACE) 백업 성공! (${imgFilename})`;
              }
            })
            .catch(err => console.error('Drive image upload failed:', err));
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

📊 [StatRace Korea 공식 채널]
- 블로그 (심층 분석 리포트): https://statracekorea.blogspot.com/
- 인스타그램: @statrace_kr
- 유튜브: StatRace Korea (https://www.youtube.com/channel/UCKZKptmZNrSnB1CaFVhnpvQ)

📌 데이터 출처: 통계청 KOSIS & 국세청 & 행정안전부
#쇼츠 #shorts #라이벌배틀 #${versusData.regionA.name} #${versusData.regionB.name} #지자체 #부동산 #도시비교 #reels #statrace`;
        } else if (currentMode === 'CARD' && cardData) {
          clipText = `📊 [우리동네 성적표] ${cardData.fullName} 2024년 전국 랭킹 공개! 🏆

종합 등급: ${cardData.grade}등급 (${cardData.gradeDesc})
전국 백분위: 상위 ${cardData.overallPercentile}%
- 1인당 평균연봉: ${cardData.metrics.wage.formatted} (전국 ${cardData.metrics.wage.rank}위)
- 기업 총급여: ${cardData.metrics.corporate.formatted} (전국 ${cardData.metrics.corporate.rank}위)
- 15개년 인구 증감률: ${cardData.population.growth15y > 0 ? '+' : ''}${cardData.population.growth15y}%

📊 [StatRace Korea 공식 채널]
- 블로그 (전국 지자체 상세 리포트): https://statracekorea.blogspot.com/
- 인스타그램: @statrace_kr

📌 데이터 출처: 통계청 KOSIS & 행정안전부 지방세 연감
#지역통계 #우리동네 #성적표 #${cardData.name} #부동산 #인포그래픽 #statrace`;
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

📊 [StatRace Korea 공식 채널]
- 블로그 (시계열 상세 데이터): https://statracekorea.blogspot.com/
- 인스타그램: @statrace_kr
- 유튜브: StatRace Korea (https://www.youtube.com/channel/UCKZKptmZNrSnB1CaFVhnpvQ)

📌 데이터 출처: 행정안전부 지방세 연감 & 통계청 KOSIS
#쇼츠 #shorts #지자체 #순위 #통계 #${provName.replace(/\s+/g, '')} #${indName.replace(/\s+/g, '')} #지역발전 #데이터시각화 #reels #바차트레이스 #statrace`;
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

    // Helper: Copy Rich Text (HTML + Plain text) to clipboard
    async function copyRichText(htmlContent, plainContent) {
      if (navigator.clipboard && window.ClipboardItem) {
        try {
          const blobHtml = new Blob([htmlContent], { type: 'text/html' });
          const blobText = new Blob([plainContent], { type: 'text/plain' });
          await navigator.clipboard.write([
            new ClipboardItem({
              'text/html': blobHtml,
              'text/plain': blobText,
            })
          ]);
          return true;
        } catch (e) {
          console.warn('ClipboardItem failed, falling back to writeText:', e);
        }
      }
      await navigator.clipboard.writeText(plainContent);
      return true;
    }

    // [Feature] Copy Formatted Blog Post (In-depth Explanations + HTML Table + Attachment Note + Channel Links)
    if (copyBlogBtn) {
      copyBlogBtn.addEventListener('click', async () => {
        let htmlText = '';
        let plainText = '';

        if (currentMode === 'RACE') {
          if (!raceData || !raceData.frames || raceData.frames.length === 0) {
            statusText.textContent = '⚠️ 순위 데이터가 로드되지 않았습니다.';
            return;
          }

          const { mainTitle, subTitle } = getTitles();
          const indKey = raceData.indicatorKey || '';
          const indName = raceData.indicatorName || '지표';
          const provName = raceData.provinceName || '전국';
          const startY = raceData.startYear || 2010;
          const endY = raceData.endYear || 2024;
          const isGrowth = raceData.rankingMode === 'GROWTH_RATE';
          const frames = raceData.frames || [];
          const frameFirst = frames.length > 0 ? frames[0] : null;
          const frameLast = frames.length > 0 ? frames[frames.length - 1] : null;

          if (!frameLast || !frameLast.items || frameLast.items.length === 0) {
            statusText.textContent = '⚠️ 순위 데이터가 비어 있습니다.';
            return;
          }

          const firstMap = {};
          if (frameFirst && frameFirst.items) {
            frameFirst.items.forEach(it => {
              firstMap[it.regionKey] = it;
            });
          }

          const topItems = frameLast.items;
          const top1 = topItems[0];
          const top1Name = top1.fullName || top1.name;
          const top1Val = formatRaceValue(top1.value, raceData.indicatorKey, isGrowth);

          // Find biggest rank climber among topItems
          let biggestClimber = null;
          let maxClimb = -999;
          topItems.forEach(it => {
            const fItem = firstMap[it.regionKey];
            if (fItem && fItem.rank) {
              const climb = fItem.rank - it.rank;
              if (climb > maxClimb) {
                maxClimb = climb;
                biggestClimber = { item: it, climb: climb, fromRank: fItem.rank, toRank: it.rank };
              }
            }
          });

          // Retrieve In-Depth Indicator Knowledge
          const exp = INDICATOR_EXPLANATIONS[indKey] || {
            title: `${indName} (${indKey})`,
            what: raceData.indicatorDescription || `${indName}에 대한 통계청/행정안전부 공식 지표입니다.`,
            why: `${indName}는 각 지방자치단체의 경제 활력과 주민 복지 및 정주 여건을 측정하는 핵심 기준입니다.`,
            role: `지역별 ${indName}의 격차는 산업 기반, 일자리 유치, 주거 환경의 차이로 직결되며 미래 도시 경쟁력을 좌우합니다.`
          };

          // Build Table Rows
          let tableRowsHtml = '';
          let tableRowsMd = '';

          topItems.forEach((it, idx) => {
            const rank = idx + 1;
            const fItem = firstMap[it.regionKey];
            const startValStr = fItem ? formatRaceValue(fItem.value, raceData.indicatorKey, false) : '-';
            const endValStr = formatRaceValue(it.value, raceData.indicatorKey, isGrowth);

            let rankChangeStr = '-';
            let rankChangeColor = '#64748b';
            if (fItem && fItem.rank) {
              const diff = fItem.rank - it.rank;
              if (diff > 0) {
                rankChangeStr = `▲ ${diff}`;
                rankChangeColor = '#ef4444';
              } else if (diff < 0) {
                rankChangeStr = `▼ ${Math.abs(diff)}`;
                rankChangeColor = '#0ea5e9';
              }
            }

            let rankBadge = `${rank}위`;
            if (rank === 1) rankBadge = '👑 1위';
            else if (rank === 2) rankBadge = '🥈 2위';
            else if (rank === 3) rankBadge = '🥉 3위';

            const bgCol = (idx % 2 === 0) ? '#f8fafc' : '#ffffff';
            tableRowsHtml += `
              <tr style="background-color: ${bgCol}; border-bottom: 1px solid #e2e8f0; text-align: center;">
                <td style="padding: 10px 8px; font-weight: bold; color: #1e293b;">${rankBadge}</td>
                <td style="padding: 10px 12px; font-weight: bold; text-align: left; color: #0f172a;">${it.fullName || it.name}</td>
                <td style="padding: 10px 8px; color: #64748b; font-family: monospace;">${startValStr}</td>
                <td style="padding: 10px 8px; font-weight: bold; color: #0284c7; font-family: monospace;">${endValStr}</td>
                <td style="padding: 10px 8px; font-weight: bold; color: ${rankChangeColor};">${rankChangeStr}</td>
              </tr>`;

            tableRowsMd += `| ${rankBadge} | ${it.fullName || it.name} | ${startValStr} | ${endValStr} | ${rankChangeStr} |\n`;
          });

          const climberDesc = (biggestClimber && biggestClimber.climb > 0)
            ? `<b>15년간 최대 순위 도약:</b> ${biggestClimber.item.fullName || biggestClimber.item.name} (${biggestClimber.fromRank}위 ➔ ${biggestClimber.toRank}위, ▲${biggestClimber.climb}계단 상승)`
            : `<b>지표 동향:</b> ${provName} 전반에 걸친 지속적 지표 변화 및 양극화 진행`;

          const allCount = (raceData.allRegionsSummary && raceData.allRegionsSummary.length > 0)
            ? raceData.allRegionsSummary.length
            : (provName === '전국' ? 228 : '해당 지역 전체');
          const csvFileName = `[StatRace]_${provName}_${indName}_${startY}-${endY}_전체_원본데이터.csv`;

          htmlText = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', Pretendard, Roboto, sans-serif; line-height: 1.75; color: #1e293b; max-width: 820px; margin: 0 auto;">
  <!-- 헤더 타이틀 -->
  <h2 style="font-size: 26px; font-weight: 800; color: #0f172a; border-bottom: 3px solid #0ea5e9; padding-bottom: 12px; margin-bottom: 20px;">
    [2024 공식 통계] ${mainTitle} - ${subTitle} 15개년 순위 대역전 심층 분석
  </h2>

  <p style="font-size: 16px; color: #334155; margin-bottom: 24px;">
    대한민국 통계청(KOSIS)과 행정안전부의 15개년(<b>${startY}년 ~ ${endY}년</b>) 공식 공공데이터를 바탕으로, 
    <b>${provName}</b> 시·군·구 기초자치단체들의 <b>"${indName}"</b> 지표 순위 변천사와 성장 격차를 분석했습니다.
  </p>

  <!-- [심층 정보 전달] 지표 1분 완벽 정복 카드 -->
  <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 12px; padding: 22px 24px; margin: 28px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
    <h3 style="margin: 0 0 16px 0; font-size: 19px; font-weight: 800; color: #0369a1; display: flex; align-items: center; gap: 8px;">
      💡 지표 1분 완벽 정복: "${exp.title}"
    </h3>
    
    <div style="margin-bottom: 14px;">
      <h4 style="margin: 0 0 4px 0; font-size: 15px; font-weight: 700; color: #0f172a;">1️⃣ "${indName}"이란 무엇인가요? (개념 정의)</h4>
      <p style="margin: 0; font-size: 14.5px; color: #334155; line-height: 1.65;">${exp.what}</p>
    </div>

    <div style="margin-bottom: 14px;">
      <h4 style="margin: 0 0 4px 0; font-size: 15px; font-weight: 700; color: #0f172a;">2️⃣ 왜 이 지표를 주목해야 할까요? (중요성)</h4>
      <p style="margin: 0; font-size: 14.5px; color: #334155; line-height: 1.65;">${exp.why}</p>
    </div>

    <div>
      <h4 style="margin: 0 0 4px 0; font-size: 15px; font-weight: 700; color: #0f172a;">3️⃣ 지자체와 주민 생활에 어떤 영향을 미치나요? (역할 및 시사점)</h4>
      <p style="margin: 0; font-size: 14.5px; color: #334155; line-height: 1.65;">${exp.role}</p>
    </div>
  </div>

  <!-- 핵심 요약 브리핑 박스 -->
  <div style="background-color: #f0f9ff; border-left: 5px solid #0ea5e9; border-radius: 8px; padding: 18px 20px; margin: 24px 0;">
    <h4 style="margin: 0 0 10px 0; font-size: 17px; font-weight: 800; color: #0369a1;">📌 3대 핵심 분석 요약</h4>
    <ul style="margin: 0; padding-left: 20px; font-size: 15px; color: #0c4a6e;">
      <li style="margin-bottom: 6px;"><b>최종 부동의 1위:</b> ${top1Name} (${top1Val})</li>
      <li style="margin-bottom: 6px;">${climberDesc}</li>
      <li><b>분석 시사점:</b> 산업 클러스터 및 주거 정주여건 변화에 따른 지자체 간 순위 격차 확대</li>
    </ul>
  </div>

  <!-- 데이터 표 -->
  <h3 style="font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 32px; margin-bottom: 12px;">
    📊 15개년 순위 변천사 종합 데이터 (${startY}년 vs ${endY}년)
  </h3>
  <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 14px; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden;">
    <thead>
      <tr style="background-color: #0f172a; color: #ffffff; text-align: center;">
        <th style="padding: 12px 8px; width: 15%;">순위</th>
        <th style="padding: 12px 12px; width: 30%; text-align: left;">지자체명</th>
        <th style="padding: 12px 8px; width: 20%;">${startY}년 수치</th>
        <th style="padding: 12px 8px; width: 20%;">${endY}년 수치</th>
        <th style="padding: 12px 8px; width: 15%;">순위 변동</th>
      </tr>
    </thead>
    <tbody>
      ${tableRowsHtml}
    </tbody>
  </table>

  <!-- [데이터 원본 첨부파일 안내 박스] -->
  <div style="background-color: #ecfdf5; border: 1.5px dashed #059669; border-radius: 12px; padding: 18px 22px; margin: 30px 0;">
    <h4 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 800; color: #065f46; display: flex; align-items: center; gap: 6px;">
      📁 [데이터 원본 첨부파일 안내]
    </h4>
    <p style="margin: 0 0 10px 0; font-size: 14px; color: #047857; line-height: 1.6;">
      본 포스팅에 수록된 분석 결과는 통계청 및 행정안전부의 15개년(<b>${startY}년 ~ ${endY}년</b>) 전수 데이터에 기반하고 있습니다.<br/>
      <b>${provName} ${allCount}개 전체 기초자치단체</b>의 연도별 원본 수치 및 순위 변천사가 모두 담긴 엑셀 분석용 원본 CSV 파일을 글 하단에 첨부해 두었으니 자유롭게 다운로드하여 연구·학습에 활용하시기 바랍니다.
    </p>
    <div style="font-size: 13px; font-family: monospace; background-color: #ffffff; padding: 8px 12px; border-radius: 6px; border: 1px solid #a7f3d0; color: #065f46; word-break: break-all;">
      📎 첨부파일명: <b>${csvFileName}</b>
    </div>
  </div>

  <!-- 영상 임베드 및 공식 채널 박스 -->
  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 30px 0; text-align: center;">
    <h4 style="margin: 0 0 8px 0; font-size: 17px; font-weight: 800; color: #0f172a;">🎬 유튜브 쇼츠 영상으로 다이나믹한 역전 레이스를 확인해보세요!</h4>
    <p style="font-size: 14px; color: #64748b; margin: 0 0 16px 0;">15년 동안 엎치락뒤치락 요동치는 실제 바 차트 레이스(Bar Chart Race) 영상을 지금 감상하세요.</p>
    <div style="display: inline-flex; gap: 12px; flex-wrap: wrap; justify-content: center;">
      <a href="https://www.youtube.com/channel/UCKZKptmZNrSnB1CaFVhnpvQ" target="_blank" style="display: inline-flex; align-items: center; padding: 10px 18px; border-radius: 8px; background-color: #ef4444; color: #ffffff; font-weight: bold; text-decoration: none; font-size: 14px;">▶ YouTube 구독하기</a>
      <a href="https://instagram.com/statrace_kr" target="_blank" style="display: inline-flex; align-items: center; padding: 10px 18px; border-radius: 8px; background-color: #8b5cf6; color: #ffffff; font-weight: bold; text-decoration: none; font-size: 14px;">📸 Instagram @statrace_kr</a>
      <a href="https://statracekorea.blogspot.com/" target="_blank" style="display: inline-flex; align-items: center; padding: 10px 18px; border-radius: 8px; background-color: #0284c7; color: #ffffff; font-weight: bold; text-decoration: none; font-size: 14px;">🌐 공식 블로그 방문</a>
    </div>
  </div>

  <p style="font-size: 13px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 14px;">
    📌 <b>데이터 출처:</b> 통계청(KOSIS) 국가통계포털 & 행정안전부 지방세 연감 결산 자료<br/>
    제작 및 분석: <b>StatRace Korea (스탯레이스 코리아)</b>
  </p>
</div>`;

          plainText = `# [2024 공식 통계] ${mainTitle} - ${subTitle} 15개년 순위 대역전 심층 분석

대한민국 통계청(KOSIS)과 행정안전부의 15개년(${startY}년 ~ ${endY}년) 공식 공공데이터를 바탕으로, ${provName} 시·군·구 기초자치단체들의 "${indName}" 지표 순위 변천사와 성장 격차를 분석했습니다.

### 💡 지표 1분 완벽 정복: "${exp.title}"
1. "${indName}"이란 무엇인가요? (개념 정의)
${exp.what}

2. 왜 이 지표를 주목해야 할까요? (중요성)
${exp.why}

3. 지자체와 주민 생활에 어떤 영향을 미치나요? (역할 및 시사점)
${exp.role}

### 📌 3대 핵심 분석 요약
- 최종 부동의 1위: ${top1Name} (${top1Val})
- ${climberDesc.replace(/<[^>]*>/g, '')}
- 분석 시사점: 산업 클러스터 및 주거 정주여건 변화에 따른 지자체 간 순위 격차 확대

### 📊 15개년 순위 변천사 종합 데이터 (${startY}년 vs ${endY}년)
| 순위 | 지자체명 | ${startY}년 수치 | ${endY}년 수치 | 순위 변동 |
| :---: | :--- | :---: | :---: | :---: |
${tableRowsMd}

📁 [데이터 원본 첨부파일 안내]
본 포스팅에 수록된 ${provName} ${allCount}개 전체 기초자치단체의 15개년(${startY}~${endY}) 연도별 원본 수치 및 순위 변천사 데이터는 글 하단 첨부파일("${csvFileName}")에서 다운로드하실 수 있습니다.

---
🎬 유튜브 쇼츠 영상으로 다이나믹한 역전 레이스를 확인해보세요!
- 유튜브 채널: https://www.youtube.com/channel/UCKZKptmZNrSnB1CaFVhnpvQ
- 인스타그램: @statrace_kr
- 공식 블로그: https://statracekorea.blogspot.com/

📌 데이터 출처: 통계청(KOSIS) 국가통계포털 & 행정안전부 지방세 연감
제작 및 분석: StatRace Korea (스탯레이스 코리아)
#통계 #지자체 #순위 #데이터분석 #StatRaceKorea #${indName.replace(/\s+/g, '')}`;

        } else if (currentMode === 'VERSUS' && versusData) {
          const a = versusData.regionA;
          const b = versusData.regionB;
          const winName = versusData.overallWinner === 'A' ? a.fullName : (versusData.overallWinner === 'B' ? b.fullName : '무승부');

          let rowsHtml = '';
          let rowsMd = '';
          versusData.rounds.forEach(r => {
            const w = r.winner === 'A' ? a.name : (r.winner === 'B' ? b.name : '무승부');
            rowsHtml += `
              <tr style="border-bottom: 1px solid #e2e8f0; text-align: center;">
                <td style="padding: 10px; font-weight: bold;">ROUND ${r.round} (${r.category})</td>
                <td style="padding: 10px; text-align: left;">${r.title}</td>
                <td style="padding: 10px; font-weight: bold; color: #ef4444;">${r.strA}</td>
                <td style="padding: 10px; font-weight: bold; color: #0284c7;">${r.strB}</td>
                <td style="padding: 10px; font-weight: bold; color: #f59e0b;">${w}</td>
              </tr>`;
            rowsMd += `| ROUND ${r.round} (${r.category}) | ${r.title} | ${r.strA} | ${r.strB} | ${w} |\n`;
          });

          htmlText = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', Pretendard, sans-serif; line-height: 1.7; color: #1e293b; max-width: 800px; margin: 0 auto;">
  <h2 style="font-size: 26px; font-weight: 800; color: #0f172a; border-bottom: 3px solid #ef4444; padding-bottom: 12px; margin-bottom: 20px;">
    ⚔️ [끝장배틀] ${a.fullName} vs ${b.fullName} 5대 핵심 지표 라이벌 전격 비교
  </h2>
  <p style="font-size: 16px;">주민 평균연봉, 기업 일자리 총급여, 1인당 재산세, 15년 인구성장, 출산율까지 5대 핵심 지표를 종합 비교한 결과, <b>최종 스코어 ${versusData.scoreA} : ${versusData.scoreB}로 "${winName}" 판정승!</b></p>
  <table style="width: 100%; border-collapse: collapse; margin: 20px 0; border: 1px solid #cbd5e1;">
    <thead>
      <tr style="background-color: #0f172a; color: white;">
        <th style="padding: 10px;">구분</th>
        <th style="padding: 10px; text-align: left;">지표명</th>
        <th style="padding: 10px;">${a.name} (RED)</th>
        <th style="padding: 10px;">${b.name} (BLUE)</th>
        <th style="padding: 10px;">판정</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <p>📌 <b>데이터 출처:</b> 통계청 KOSIS & 국세청 & 행정안전부 | <b>분석:</b> StatRace Korea (https://statracekorea.blogspot.com/)</p>
</div>`;

          plainText = `# ⚔️ [끝장배틀] ${a.fullName} vs ${b.fullName} 라이벌 전격 비교
최종 스코어 ${versusData.scoreA} : ${versusData.scoreB}로 "${winName}" 판정승!

| 구분 | 지표명 | ${a.name} | ${b.name} | 판정 |
| :---: | :--- | :---: | :---: | :---: |
${rowsMd}

📌 데이터 출처: 통계청 KOSIS & 국세청 & 행정안전부
StatRace Korea: https://statracekorea.blogspot.com/`;

        } else if (currentMode === 'CARD' && cardData) {
          const m = cardData.metrics;
          htmlText = `
<div style="font-family: -apple-system, BlinkMacSystemFont, Pretendard, sans-serif; line-height: 1.7; max-width: 800px; margin: 0 auto;">
  <h2 style="font-size: 26px; font-weight: 800; color: #0f172a; border-bottom: 3px solid #10b981; padding-bottom: 12px;">
    📊 [2024 지자체 성적표] ${cardData.fullName} 종합 등급 및 4대 정주 여건 분석
  </h2>
  <p><b>종합 등급:</b> ${cardData.grade}등급 (${cardData.gradeDesc}) · <b>전국 백분위:</b> 상위 ${cardData.overallPercentile}%</p>
  <ul>
    <li><b>주민 1인당 평균연봉:</b> ${m.wage.formatted} (전국 ${m.wage.rank}위, 상위 ${m.wage.percentile}%)</li>
    <li><b>기업 일자리 총급여 규모:</b> ${m.corporate.formatted} (전국 ${m.corporate.rank}위, 상위 ${m.corporate.percentile}%)</li>
    <li><b>1인당 재산세 (부촌지수):</b> ${m.propertyTax.formatted} (전국 ${m.propertyTax.rank}위, 상위 ${m.propertyTax.percentile}%)</li>
    <li><b>지자체 재정자립도:</b> ${m.fiscal.formatted} (전국 ${m.fiscal.rank}위, 상위 ${m.fiscal.percentile}%)</li>
  </ul>
  <p>📌 출처: 통계청 KOSIS & 국세청 연말정산 & 행정안전부 | StatRace Korea</p>
</div>`;

          plainText = `# 📊 [2024 지자체 성적표] ${cardData.fullName}
종합 등급: ${cardData.grade}등급 (${cardData.gradeDesc}) · 전국 백분위: 상위 ${cardData.overallPercentile}%
- 주민 평균연봉: ${m.wage.formatted} (전국 ${m.wage.rank}위)
- 기업 총급여: ${m.corporate.formatted} (전국 ${m.corporate.rank}위)
- 1인당 재산세: ${m.propertyTax.formatted} (전국 ${m.propertyTax.rank}위)
- 재정자립도: ${m.fiscal.formatted} (전국 ${m.fiscal.rank}위)
출처: 통계청 KOSIS & 행정안전부 | StatRace Korea (https://statracekorea.blogspot.com/)`;
        }

        try {
          await copyRichText(htmlText, plainText);
          statusText.textContent = '📝 블로그 포스팅용 서식(표·심층해설·첨부파일안내)이 복사되었습니다!';
          const orig = copyBlogBtn.innerHTML;
          copyBlogBtn.innerHTML = '<span class="material-symbols-outlined text-sm text-amber-300">check</span><span>블로그 복사 완료!</span>';
          setTimeout(() => { copyBlogBtn.innerHTML = orig; }, 2500);
        } catch (err) {
          console.error(err);
          statusText.textContent = '클립보드 복사 실패';
        }
      });
    }

    // [Feature] Download Analytical CSV File (Excel BOM UTF-8, Full Regional Dataset)
    if (downloadCsvBtn) {
      downloadCsvBtn.addEventListener('click', () => {
        if (currentMode === 'RACE') {
          if (!raceData || !raceData.frames || raceData.frames.length === 0) {
            statusText.textContent = '⚠️ 순위 데이터가 로드되지 않았습니다.';
            return;
          }

          const frames = raceData.frames;
          const years = frames.map(f => f.year);
          const startY = years[0];
          const endY = years[years.length - 1];
          const indName = (raceData && raceData.indicatorName) ? raceData.indicatorName : '지표';
          const provName = (raceData && raceData.provinceName) ? raceData.provinceName : '전국';
          const allSummary = raceData.allRegionsSummary;

          let rows = [];

          if (allSummary && allSummary.length > 0) {
            // Full comprehensive regional dataset
            const headers = [
              '최종순위',
              '지자체코드',
              '지자체명',
              '상위시도',
              `${startY}년_순위`,
              `${startY}년_수치`,
              `${endY}년_수치`,
              '15개년_순위변동',
              ...years.map(y => `${y}년_수치`),
              ...years.map(y => `${y}년_원본값`)
            ];
            rows.push(headers.join(','));

            allSummary.forEach(it => {
              const regCode = it.regionKey;
              const regName = (it.fullName || it.name).replace(/,/g, ' ');
              const prov = (it.province || '').replace(/,/g, ' ');
              const startRank = it.startRank !== null && it.startRank !== undefined ? it.startRank : '-';
              const startVal = it.startValue !== null && it.startValue !== undefined ? it.startValue : '-';
              const endVal = it.finalValue !== null && it.finalValue !== undefined ? it.finalValue : '-';

              let rankDiffStr = '-';
              if (it.rankDiff !== null && it.rankDiff !== undefined) {
                if (it.rankDiff > 0) rankDiffStr = `+${it.rankDiff}`;
                else if (it.rankDiff < 0) rankDiffStr = `${it.rankDiff}`;
                else rankDiffStr = '0';
              }

              const yearlyVals = years.map(y => {
                const v = it.yearlyValues ? it.yearlyValues[y] : null;
                return v !== null && v !== undefined ? v : '';
              });

              const yearlyRaws = years.map(y => {
                const r = it.yearlyRawValues ? it.yearlyRawValues[y] : null;
                return r !== null && r !== undefined ? r : '';
              });

              const row = [
                it.finalRank,
                `"${regCode}"`,
                `"${regName}"`,
                `"${prov}"`,
                startRank,
                startVal,
                endVal,
                `"${rankDiffStr}"`,
                ...yearlyVals,
                ...yearlyRaws
              ];
              rows.push(row.join(','));
            });

          } else {
            // Fallback to frames if allSummary not present
            const yearMaps = {};
            frames.forEach(f => {
              const m = {};
              f.items.forEach(it => {
                m[it.regionKey] = it;
              });
              yearMaps[f.year] = m;
            });

            const lastItems = frames[frames.length - 1].items;
            const headers = [
              '최종순위',
              '지자체명',
              '시도',
              `${startY}년_순위`,
              `${startY}년_수치`,
              `${endY}년_수치`,
              '15개년_순위변동',
              ...years.map(y => `${y}년_수치`)
            ];
            rows.push(headers.join(','));

            lastItems.forEach((it, idx) => {
              const finalRank = idx + 1;
              const regName = (it.fullName || it.name).replace(/,/g, ' ');
              const prov = (it.province || '').replace(/,/g, ' ');

              const firstInfo = yearMaps[startY] ? yearMaps[startY][it.regionKey] : null;
              const startRank = firstInfo ? firstInfo.rank : '-';
              const startVal = firstInfo ? firstInfo.value : '-';
              const endVal = it.value;

              let rankDiff = '-';
              if (firstInfo && firstInfo.rank) {
                const d = firstInfo.rank - finalRank;
                if (d > 0) rankDiff = `+${d}`;
                else if (d < 0) rankDiff = `${d}`;
                else rankDiff = '0';
              }

              const yearlyValues = years.map(y => {
                const yInfo = yearMaps[y] ? yearMaps[y][it.regionKey] : null;
                return yInfo ? yInfo.value : '';
              });

              const row = [
                finalRank,
                `"${regName}"`,
                `"${prov}"`,
                startRank,
                startVal,
                endVal,
                `"${rankDiff}"`,
                ...yearlyValues
              ];
              rows.push(row.join(','));
            });
          }

          const csvContent = '\uFEFF' + rows.join('\r\n');
          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `[StatRace]_${provName}_${indName}_${startY}-${endY}_전체_원본데이터.csv`;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            statusText.textContent = `📊 전체 원본 데이터 CSV 다운로드 완료! (${a.download})`;
          }, 500);
          return;
        }

        if (currentMode === 'VERSUS' && versusData) {
          const a = versusData.regionA;
          const b = versusData.regionB;
          const headers = ['라운드', '카테고리', '지표명', `${a.fullName}_수치`, `${b.fullName}_수치`, '승자'];
          const rows = [headers.join(',')];
          versusData.rounds.forEach(r => {
            const winName = r.winner === 'A' ? a.name : (r.winner === 'B' ? b.name : '무승부');
            rows.push([
              r.round,
              `"${r.category}"`,
              `"${r.title}"`,
              `"${r.strA}"`,
              `"${r.strB}"`,
              `"${winName}"`
            ].join(','));
          });
          const csvContent = '\uFEFF' + rows.join('\r\n');
          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const el = document.createElement('a');
          el.href = url;
          el.download = `[라이벌배틀]_${a.name}_VS_${b.name}_비교데이터.csv`;
          document.body.appendChild(el);
          el.click();
          setTimeout(() => {
            document.body.removeChild(el);
            URL.revokeObjectURL(url);
            statusText.textContent = `📊 라이벌 배틀 CSV 저장 완료! (${el.download})`;
          }, 500);
          return;
        }

        if (currentMode === 'CARD' && cardData) {
          const headers = ['구분', '지표명', '수치', '전국순위', '백분위'];
          const rows = [headers.join(',')];
          const m = cardData.metrics;
          rows.push([cardData.fullName, '주민 1인당 평균연봉', `"${m.wage.formatted}"`, m.wage.rank, `상위 ${m.wage.percentile}%`].join(','));
          rows.push([cardData.fullName, '기업 일자리 총급여액', `"${m.corporate.formatted}"`, m.corporate.rank, `상위 ${m.corporate.percentile}%`].join(','));
          rows.push([cardData.fullName, '1인당 재산세 (부촌지수)', `"${m.propertyTax.formatted}"`, m.propertyTax.rank, `상위 ${m.propertyTax.percentile}%`].join(','));
          rows.push([cardData.fullName, '지자체 재정자립도', `"${m.fiscal.formatted}"`, m.fiscal.rank, `상위 ${m.fiscal.percentile}%`].join(','));
          const csvContent = '\uFEFF' + rows.join('\r\n');
          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const el = document.createElement('a');
          el.href = url;
          el.download = `[성적표]_${cardData.fullName}_2024_분석데이터.csv`;
          document.body.appendChild(el);
          el.click();
          setTimeout(() => {
            document.body.removeChild(el);
            URL.revokeObjectURL(url);
            statusText.textContent = `📊 지자체 성적표 CSV 저장 완료! (${el.download})`;
          }, 500);
        }
      });
    }

    // [Feature] Direct Upload to Google Drive (STATRACE Folder)
    if (uploadDriveBtn) {
      uploadDriveBtn.addEventListener('click', async () => {
        let filename = '';
        let csvContent = '';

        if (currentMode === 'RACE') {
          if (!raceData || !raceData.frames || raceData.frames.length === 0) {
            statusText.textContent = '⚠️ 순위 데이터가 로드되지 않았습니다.';
            return;
          }
          const frames = raceData.frames;
          const years = frames.map(f => f.year);
          const startY = years[0];
          const endY = years[years.length - 1];
          const indName = (raceData && raceData.indicatorName) ? raceData.indicatorName : '지표';
          const provName = (raceData && raceData.provinceName) ? raceData.provinceName : '전국';
          const allSummary = raceData.allRegionsSummary;
          let rows = [];

          if (allSummary && allSummary.length > 0) {
            const headers = [
              '최종순위', '지자체코드', '지자체명', '상위시도',
              `${startY}년_순위`, `${startY}년_수치`, `${endY}년_수치`, '15개년_순위변동',
              ...years.map(y => `${y}년_수치`), ...years.map(y => `${y}년_원본값`)
            ];
            rows.push(headers.join(','));
            allSummary.forEach(it => {
              const regCode = it.regionKey;
              const regName = (it.fullName || it.name).replace(/,/g, ' ');
              const prov = (it.province || '').replace(/,/g, ' ');
              const startRank = it.startRank ?? '-';
              const startVal = it.startValue ?? '-';
              const endVal = it.finalValue ?? '-';
              let rankDiffStr = '-';
              if (it.rankDiff !== null && it.rankDiff !== undefined) {
                rankDiffStr = it.rankDiff > 0 ? `+${it.rankDiff}` : `${it.rankDiff}`;
              }
              const yearlyVals = years.map(y => it.yearlyValues ? (it.yearlyValues[y] ?? '') : '');
              const yearlyRaws = years.map(y => it.yearlyRawValues ? (it.yearlyRawValues[y] ?? '') : '');
              rows.push([it.finalRank, `"${regCode}"`, `"${regName}"`, `"${prov}"`, startRank, startVal, endVal, `"${rankDiffStr}"`, ...yearlyVals, ...yearlyRaws].join(','));
            });
          }
          csvContent = '\uFEFF' + rows.join('\r\n');
          filename = `[StatRace]_${provName}_${indName}_${startY}-${endY}_전체_원본데이터.csv`;

        } else if (currentMode === 'VERSUS' && versusData) {
          const a = versusData.regionA;
          const b = versusData.regionB;
          const headers = ['라운드', '카테고리', '지표명', `${a.fullName}_수치`, `${b.fullName}_수치`, '승자'];
          const rows = [headers.join(',')];
          versusData.rounds.forEach(r => {
            const winName = r.winner === 'A' ? a.name : (r.winner === 'B' ? b.name : '무승부');
            rows.push([r.round, `"${r.category}"`, `"${r.title}"`, `"${r.strA}"`, `"${r.strB}"`, `"${winName}"`].join(','));
          });
          csvContent = '\uFEFF' + rows.join('\r\n');
          filename = `[라이벌배틀]_${a.name}_VS_${b.name}_비교데이터.csv`;

        } else if (currentMode === 'CARD' && cardData) {
          const headers = ['구분', '지표명', '수치', '전국순위', '백분위'];
          const rows = [headers.join(',')];
          const m = cardData.metrics;
          rows.push([cardData.fullName, '주민 1인당 평균연봉', `"${m.wage.formatted}"`, m.wage.rank, `상위 ${m.wage.percentile}%`].join(','));
          rows.push([cardData.fullName, '기업 일자리 총급여액', `"${m.corporate.formatted}"`, m.corporate.rank, `상위 ${m.corporate.percentile}%`].join(','));
          rows.push([cardData.fullName, '1인당 재산세 (부촌지수)', `"${m.propertyTax.formatted}"`, m.propertyTax.rank, `상위 ${m.propertyTax.percentile}%`].join(','));
          rows.push([cardData.fullName, '지자체 재정자립도', `"${m.fiscal.formatted}"`, m.fiscal.rank, `상위 ${m.fiscal.percentile}%`].join(','));
          csvContent = '\uFEFF' + rows.join('\r\n');
          filename = `[성적표]_${cardData.fullName}_2024_분석데이터.csv`;
        }

        if (!csvContent || !filename) {
          statusText.textContent = '⚠️ 업로드할 분석 데이터가 없습니다.';
          return;
        }

        const origHtml = uploadDriveBtn.innerHTML;
        uploadDriveBtn.innerHTML = '<span class="material-symbols-outlined text-sm animate-spin">progress_activity</span><span>드라이브 저장 중...</span>';
        uploadDriveBtn.disabled = true;
        statusText.textContent = `☁️ 구글 드라이브(STATRACE 폴더)로 '${filename}' 전송 중...`;

        try {
          const res = await fetch('/api/drive-upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'csv', filename, content: csvContent })
          });
          const result = await res.json();
          if (result.success) {
            statusText.textContent = `🎉 구글 드라이브 저장 완료! (${filename})`;
            uploadDriveBtn.innerHTML = '<span class="material-symbols-outlined text-sm text-emerald-400">check_circle</span><span>저장 완료</span>';
            setTimeout(() => {
              uploadDriveBtn.innerHTML = origHtml;
              uploadDriveBtn.disabled = false;
            }, 3000);
          } else {
            statusText.textContent = `❌ 드라이브 업로드 실패: ${result.error || result.message}`;
            uploadDriveBtn.innerHTML = origHtml;
            uploadDriveBtn.disabled = false;
          }
        } catch (err) {
          console.error(err);
          statusText.textContent = `❌ 구글 드라이브 통신 오류: ${err.message}`;
          uploadDriveBtn.innerHTML = origHtml;
          uploadDriveBtn.disabled = false;
        }
      });
    }


    const stagePlayBtn = document.getElementById('btn-race-play-stage');
    if (stagePlayBtn) {
      stagePlayBtn.addEventListener('click', () => {
        if (isPlaying) stopRace();
        else runAnimation(false);
      });
    }

    function adjustCanvasResolution() {
      const badge = document.getElementById('preview-aspect-badge');
      if (currentMode === 'CARD') {
        canvas.width = 1080;
        canvas.height = 1080;
        canvas.style.aspectRatio = '1 / 1';
        canvas.style.maxHeight = '100%';
        canvas.style.maxWidth = '100%';
        canvas.style.width = 'auto';
        canvas.style.height = 'auto';
        if (badge) badge.textContent = '1:1 Square (1080×1080)';
      } else if (currentMode === 'VERSUS') {
        canvas.width = 1080;
        canvas.height = 1920;
        canvas.style.aspectRatio = '9 / 16';
        canvas.style.maxHeight = '100%';
        canvas.style.maxWidth = '100%';
        canvas.style.width = 'auto';
        canvas.style.height = 'auto';
        if (badge) badge.textContent = '9:16 Shorts (1080×1920)';
      } else {
        const mode = aspectSelect ? aspectSelect.value : '9:16';
        if (mode === '9:16') {
          canvas.width = 1080;
          canvas.height = 1920;
          canvas.style.aspectRatio = '9 / 16';
          canvas.style.maxHeight = '100%';
          canvas.style.maxWidth = '100%';
          canvas.style.width = 'auto';
          canvas.style.height = 'auto';
          if (badge) badge.textContent = '9:16 Shorts (1080×1920)';
        } else {
          canvas.width = 1920;
          canvas.height = 1080;
          canvas.style.aspectRatio = '16 / 9';
          canvas.style.maxHeight = '100%';
          canvas.style.maxWidth = '100%';
          canvas.style.width = '100%';
          canvas.style.height = 'auto';
          if (badge) badge.textContent = '16:9 Landscape (1920×1080)';
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
        if (showIntroPreview) {
          const W = canvas.width;
          const H = canvas.height;
          const isVertical = (W < H);
          drawIntroBanner(ctx, W, H, isVertical, mainTitle, subTitle, isGrowth, 1.0);
        }
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
      startBtn.innerHTML = '<span class="material-symbols-outlined text-sm">play_arrow</span><span>미리보기</span>';
      recordBtn.innerHTML = '<span class="material-symbols-outlined text-sm">videocam</span><span>영상 제작 (다운로드)</span>';
      recordBtn.classList.remove('bg-rose-600', 'animate-pulse');
      recordBtn.classList.add('bg-gradient-to-r', 'from-rose-500', 'to-red-600');
      if (stagePlayBtn) {
        stagePlayBtn.innerHTML = '<span class="material-symbols-outlined text-sm">play_circle</span><span>처음부터 재생</span>';
        stagePlayBtn.classList.remove('bg-rose-500/20', 'text-rose-300', 'border-rose-500/40');
        stagePlayBtn.classList.add('bg-sky-500/20', 'text-sky-300', 'border-sky-500/40');
      }
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

      if (!recordMode) {
        startBtn.innerHTML = '<span class="material-symbols-outlined text-sm">pause</span><span>일시정지</span>';
        if (stagePlayBtn) {
          stagePlayBtn.innerHTML = '<span class="material-symbols-outlined text-sm">stop_circle</span><span>재생 중지</span>';
          stagePlayBtn.classList.remove('bg-sky-500/20', 'text-sky-300', 'border-sky-500/40');
          stagePlayBtn.classList.add('bg-rose-500/20', 'text-rose-300', 'border-rose-500/40');
        }
      }

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
      const INTRO_DURATION = brandConfig.showIntroBanner ? 1800 : 0;
      const fullActiveDuration = INTRO_DURATION + totalDuration;
      const HOLD_DURATION = 2500;
      const isGrowth = raceData.rankingMode === 'GROWTH_RATE';
      const { mainTitle, subTitle } = getTitles();

      if (recordMode) setupMediaRecorder(fullActiveDuration, HOLD_DURATION, '순위변천사');
      else if (audioBuffer) startAudioPlayback(null, fullActiveDuration, HOLD_DURATION);

      let startTime = null;
      function stepRace(timestamp) {
        if (!isPlaying) return;
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;

        if (elapsed < INTRO_DURATION) {
          // 1. INTRO PHASE: Dark blur background + Center Hero Headline Thumbnail Card
          const frame0 = frames[0];
          drawFrame(ctx, frame0.items, frame0.year, 0, mainTitle, subTitle, raceData.indicatorKey, isGrowth);

          let introAlpha = 1.0;
          if (elapsed > INTRO_DURATION - 450) {
            introAlpha = Math.max(0, (INTRO_DURATION - elapsed) / 450);
          }
          const W = canvas.width;
          const H = canvas.height;
          const isVertical = (W < H);
          drawIntroBanner(ctx, W, H, isVertical, mainTitle, subTitle, isGrowth, introAlpha);

          if (progressFill) progressFill.style.width = ((elapsed / fullActiveDuration) * 100).toFixed(1) + '%';
          statusText.textContent = '🎬 인트로 타이틀... (곧 레이스가 시작됩니다)';
          animFrameId = requestAnimationFrame(stepRace);
        } else if (elapsed <= fullActiveDuration) {
          // 2. ACTIVE RACE INTERPOLATION PHASE
          const raceElapsed = elapsed - INTRO_DURATION;
          const progress = Math.min(1, raceElapsed / totalDuration);
          if (progressFill) progressFill.style.width = ((elapsed / fullActiveDuration) * 100).toFixed(1) + '%';

          const exactIndex = (raceElapsed / durationPerYear);
          const currentIndex = Math.min(Math.floor(exactIndex), frames.length - 2);
          const subProgress = Math.min(1, exactIndex - currentIndex);

          const frameA = frames[currentIndex];
          const frameB = frames[Math.min(currentIndex + 1, frames.length - 1)];

          const interpolatedItems = interpolateRankings(frameA.items, frameB.items, subProgress, topN);
          const displayYear = frameA.year + (frameB.year - frameA.year) * subProgress;

          drawFrame(ctx, interpolatedItems, displayYear, progress, mainTitle, subTitle, raceData.indicatorKey, isGrowth);
          animFrameId = requestAnimationFrame(stepRace);
        } else if (elapsed < fullActiveDuration + HOLD_DURATION) {
          // 3. FINAL HOLD & ENDING CTA CENTER BANNER PHASE
          if (progressFill) progressFill.style.width = '100%';
          const lastFrame = frames[frames.length - 1];
          drawFrame(ctx, lastFrame.items, lastFrame.year, 1.0, mainTitle, subTitle, raceData.indicatorKey, isGrowth);
          statusText.textContent = '⏳ 최종 순위 확정 & 엔딩 배너 노출 중...';
          animFrameId = requestAnimationFrame(stepRace);
        } else {
          // 4. FINISH
          const lastFrame = frames[frames.length - 1];
          drawFrame(ctx, lastFrame.items, lastFrame.year, 1.0, mainTitle, subTitle, raceData.indicatorKey, isGrowth);
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
      const downloadedFilename = a.download;
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        statusText.textContent = `🎉 영상 로컬 다운로드 완료! (${downloadedFilename}) → ☁️ 구글 드라이브(STATRACE) 전송 시작...`;
      }, 500);

      // Automatic Google Drive Upload for recorded video
      const formData = new FormData();
      formData.append('action', 'video');
      formData.append('filename', downloadedFilename);
      formData.append('file', blob, downloadedFilename);

      fetch('/api/drive-upload', {
        method: 'POST',
        body: formData
      })
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          statusText.textContent = `🎉 [완료] PC 저장 & 구글 드라이브(STATRACE) 영상 백업 성공! (${downloadedFilename})`;
        } else {
          console.warn('Drive upload returned error:', res);
        }
      })
      .catch(err => {
        console.error('Drive video upload failed:', err);
      });
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
    // STATRACE KOREA OFFICIAL BRANDING RENDERERS
    // ==========================================
    function drawSvgIconYoutube(ctx, x, y, size) {
      ctx.save();
      const h = size * 0.72;
      ctx.fillStyle = '#ff0000';
      roundRect(ctx, x, y, size, h, size * 0.22);
      ctx.fill();

      // White play triangle
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      const triLeft = x + size * 0.38;
      const triRight = x + size * 0.68;
      const triTop = y + h * 0.26;
      const triBottom = y + h * 0.74;
      const triMidY = y + h * 0.5;
      ctx.moveTo(triLeft, triTop);
      ctx.lineTo(triRight, triMidY);
      ctx.lineTo(triLeft, triBottom);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    function drawSvgIconInstagram(ctx, x, y, size) {
      ctx.save();
      const grad = ctx.createLinearGradient(x, y + size, x + size, y);
      grad.addColorStop(0, '#f59e0b');
      grad.addColorStop(0.3, '#ec4899');
      grad.addColorStop(0.7, '#d946ef');
      grad.addColorStop(1, '#8b5cf6');
      ctx.fillStyle = grad;
      roundRect(ctx, x, y, size, size, size * 0.25);
      ctx.fill();

      // Outer camera ring
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1.5, size * 0.08);
      const pad = size * 0.22;
      roundRect(ctx, x + pad, y + pad, size - pad * 2, size - pad * 2, (size - pad * 2) * 0.3);
      ctx.stroke();

      // Center lens circle
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, size * 0.18, 0, Math.PI * 2);
      ctx.stroke();

      // Flash dot
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x + size * 0.73, y + size * 0.27, size * 0.05, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawSvgIconBlog(ctx, x, y, size) {
      ctx.save();
      ctx.fillStyle = '#f97316';
      roundRect(ctx, x, y, size, size, size * 0.24);
      ctx.fill();

      // White 'B' Letter
      ctx.fillStyle = '#ffffff';
      ctx.font = `900 ${Math.round(size * 0.66)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('B', x + size / 2, y + size / 2 + 1);
      ctx.restore();
    }

    function drawBrandBackground(ctx, W, H, isGrowth) {
      // 1. Base dark background gradient
      const bgGrad = ctx.createLinearGradient(0, 0, W, H);
      bgGrad.addColorStop(0, '#070c18');
      bgGrad.addColorStop(0.5, '#0c1424');
      bgGrad.addColorStop(1, '#030611');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // 2. Texture overlay (배경2.jpg)
      if (brandConfig.showBgTexture && brandImages.bgTexture && brandImages.bgTexture.complete) {
        ctx.save();
        ctx.globalAlpha = 0.28;
        const img = brandImages.bgTexture;
        const imgAspect = img.width / img.height;
        const canvasAspect = W / H;
        let sW, sH, sx, sy;
        if (imgAspect > canvasAspect) {
          sH = img.height;
          sW = sH * canvasAspect;
          sx = (img.width - sW) / 2;
          sy = 0;
        } else {
          sW = img.width;
          sH = sW / canvasAspect;
          sx = 0;
          sy = (img.height - sH) / 2;
        }
        ctx.drawImage(img, sx, sy, sW, sH, 0, 0, W, H);
        ctx.restore();

        // Dark vignette overlay
        ctx.save();
        const vigGrad = ctx.createLinearGradient(0, 0, 0, H);
        vigGrad.addColorStop(0, 'rgba(3, 7, 18, 0.45)');
        vigGrad.addColorStop(0.2, 'rgba(3, 7, 18, 0.1)');
        vigGrad.addColorStop(0.8, 'rgba(3, 7, 18, 0.1)');
        vigGrad.addColorStop(1, 'rgba(3, 7, 18, 0.6)');
        ctx.fillStyle = vigGrad;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }

      // 3. Grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
      ctx.lineWidth = 1.5;
      const isVertical = (W < H);
      const gridGap = isVertical ? 120 : 160;
      for (let x = 0; x < W; x += gridGap) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }

      // 4. Subtle cyber radial glow
      ctx.save();
      const radGlow = ctx.createRadialGradient(W / 2, H * 0.35, 50, W / 2, H * 0.35, W * 0.7);
      radGlow.addColorStop(0, isGrowth ? 'rgba(16, 185, 129, 0.09)' : 'rgba(56, 189, 248, 0.09)');
      radGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = radGlow;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    function drawBrandWatermark(ctx, W, H, isVertical, mode) {
      if (!brandConfig.showLogo) return;
      const logo = brandImages.logo;
      if (!logo || !logo.complete) return;

      ctx.save();
      if (mode === 'CARD') {
        // 1:1 Report Card (1080x1080) - Right Top Official Seal
        const size = 95;
        const x = W - size - 55;
        const y = 50;

        ctx.shadowColor = 'rgba(245, 158, 11, 0.45)';
        ctx.shadowBlur = 16;
        ctx.drawImage(logo, x, y, size, size);
        ctx.restore();
        return;
      }

      if (isVertical) {
        // 9:16 Shorts (1080x1920)
        const size = 96;
        const x = W - size - 50;
        const y = 60;

        // Subtle golden glow around circular emblem
        ctx.shadowColor = 'rgba(251, 191, 36, 0.45)';
        ctx.shadowBlur = 18;
        ctx.drawImage(logo, x, y, size, size);

        // Channel badge text to the left of the logo
        ctx.shadowBlur = 0;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';

        ctx.font = '900 22px Inter, sans-serif';
        ctx.fillStyle = '#f8fafc';
        ctx.fillText('STATRACE KOREA', x - 14, y + 36);

        ctx.font = '700 16px Inter, sans-serif';
        ctx.fillStyle = '#38bdf8';
        ctx.fillText('스탯레이스 코리아', x - 14, y + 64);
      } else {
        // 16:9 Landscape (1920x1080)
        const size = 74;
        const x = W - size - 60;
        const y = 45;

        ctx.shadowColor = 'rgba(251, 191, 36, 0.35)';
        ctx.shadowBlur = 14;
        ctx.drawImage(logo, x, y, size, size);

        ctx.shadowBlur = 0;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.font = '900 20px Inter, sans-serif';
        ctx.fillStyle = '#f8fafc';
        ctx.fillText('STATRACE KOREA', x - 12, y + 26);

        ctx.font = '700 14px Inter, sans-serif';
        ctx.fillStyle = '#38bdf8';
        ctx.fillText('공식 통계 데이터 레이스', x - 12, y + 50);
      }
      ctx.restore();
    }

    function drawBrandFooter(ctx, W, H, isVertical, progress) {
      ctx.save();
      if (isVertical) {
        // 9:16 Shorts (1080x1920)
        // 1. Data Attribution line
        ctx.font = '600 20px Inter, sans-serif';
        ctx.fillStyle = 'rgba(148, 163, 184, 0.65)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('데이터 출처: 통계청 KOSIS · 국세청 · 행정안전부', W / 2, H - 120);

        if (brandConfig.showSnsBar) {
          // 2. Premium Glassmorphism SNS Capsule Bar
          const barW = 960;
          const barH = 54;
          const barX = (W - barW) / 2;
          const barY = H - 80;

          // Capsule Background & Border
          const barGrad = ctx.createLinearGradient(barX, barY, barX + barW, barY);
          barGrad.addColorStop(0, 'rgba(15, 23, 42, 0.88)');
          barGrad.addColorStop(0.5, 'rgba(30, 41, 59, 0.82)');
          barGrad.addColorStop(1, 'rgba(15, 23, 42, 0.88)');
          ctx.fillStyle = barGrad;
          ctx.strokeStyle = 'rgba(71, 85, 105, 0.6)';
          ctx.lineWidth = 1.5;
          roundRect(ctx, barX, barY, barW, barH, 27);
          ctx.fill();
          ctx.stroke();

          // 3 Sections: YouTube | Instagram | Blog
          const secW = barW / 3;
          const midY = barY + barH / 2;

          // Section 1: YouTube
          const s1X = barX + 22;
          drawSvgIconYoutube(ctx, s1X, midY - 10, 24);
          ctx.font = '800 18px Inter, sans-serif';
          ctx.fillStyle = '#f1f5f9';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText('StatRace Korea', s1X + 32, midY);

          // Divider 1
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
          ctx.beginPath();
          ctx.moveTo(barX + secW, barY + 12);
          ctx.lineTo(barX + secW, barY + barH - 12);
          ctx.stroke();

          // Section 2: Instagram
          const s2X = barX + secW + 22;
          drawSvgIconInstagram(ctx, s2X, midY - 11, 22);
          ctx.font = '800 18px Inter, sans-serif';
          ctx.fillStyle = '#f1f5f9';
          ctx.textAlign = 'left';
          ctx.fillText('@statrace_kr', s2X + 30, midY);

          // Divider 2
          ctx.beginPath();
          ctx.moveTo(barX + secW * 2, barY + 12);
          ctx.lineTo(barX + secW * 2, barY + barH - 12);
          ctx.stroke();

          // Section 3: Blog
          const s3X = barX + secW * 2 + 20;
          drawSvgIconBlog(ctx, s3X, midY - 11, 22);
          ctx.font = '700 17px Inter, sans-serif';
          ctx.fillStyle = '#f1f5f9';
          ctx.textAlign = 'left';
          ctx.fillText('statracekorea.blogspot.com', s3X + 28, midY);
        }
      } else {
        // 16:9 Landscape (1920x1080)
        const footY = H - 42;
        ctx.font = '600 20px Inter, sans-serif';
        ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('데이터: 통계청 KOSIS & 국세청 | 제작: StatRace Korea', 60, footY);

        if (brandConfig.showSnsBar) {
          const barW = 720;
          const barH = 44;
          const barX = W - barW - 60;
          const barY = H - 64;

          ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
          ctx.strokeStyle = 'rgba(71, 85, 105, 0.6)';
          ctx.lineWidth = 1.5;
          roundRect(ctx, barX, barY, barW, barH, 22);
          ctx.fill();
          ctx.stroke();

          const secW = barW / 3;
          const midY = barY + barH / 2;

          // S1: YouTube
          drawSvgIconYoutube(ctx, barX + 16, midY - 9, 20);
          ctx.font = '800 16px Inter, sans-serif';
          ctx.fillStyle = '#f1f5f9';
          ctx.textAlign = 'left';
          ctx.fillText('StatRace Korea', barX + 44, midY);

          // S2: Instagram
          drawSvgIconInstagram(ctx, barX + secW + 16, midY - 9, 18);
          ctx.font = '800 16px Inter, sans-serif';
          ctx.fillText('@statrace_kr', barX + secW + 42, midY);

          // S3: Blog
          drawSvgIconBlog(ctx, barX + secW * 2 + 14, midY - 9, 18);
          ctx.font = '700 15px Inter, sans-serif';
          ctx.fillText('statracekorea.blogspot.com', barX + secW * 2 + 38, midY);
        }
      }
      ctx.restore();
    }

    // ==========================================
    // INTRO HERO THUMBNAIL BANNER (Opening & Thumbnail Export)
    // ==========================================
    function drawIntroBanner(ctx, W, H, isVertical, mainTitle, subTitle, isGrowth, alpha = 1.0) {
      if (alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

      // 1. Dark Blur & Spotlight Backdrop (Behind chart silhouette)
      ctx.fillStyle = 'rgba(2, 6, 23, 0.82)';
      ctx.fillRect(0, 0, W, H);

      const spot = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.7);
      spot.addColorStop(0, isGrowth ? 'rgba(16, 185, 129, 0.28)' : 'rgba(56, 189, 248, 0.28)');
      spot.addColorStop(0.45, 'rgba(245, 158, 11, 0.14)');
      spot.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = spot;
      ctx.fillRect(0, 0, W, H);

      if (isVertical) {
        // 9:16 Shorts (1080x1920) - Vertical Hero Intro Card
        const cardW = 960;
        const cardH = 880;
        const cardX = (W - cardW) / 2;
        const cardY = Math.round((H - cardH) / 2);

        // Glassmorphism Hero Box
        const cardGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
        cardGrad.addColorStop(0, 'rgba(10, 18, 38, 0.96)');
        cardGrad.addColorStop(0.5, 'rgba(15, 23, 42, 0.94)');
        cardGrad.addColorStop(1, 'rgba(6, 12, 24, 0.97)');
        ctx.fillStyle = cardGrad;
        ctx.shadowColor = 'rgba(245, 158, 11, 0.55)';
        ctx.shadowBlur = 40;
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 3.5;
        roundRect(ctx, cardX, cardY, cardW, cardH, 32);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Top Circular Emblem Logo
        const lsize = 130;
        const lx = W / 2 - lsize / 2;
        const ly = cardY + 48;

        if (brandImages.logo && brandImages.logo.complete) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(lx + lsize / 2, ly + lsize / 2, lsize / 2, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(brandImages.logo, lx, ly, lsize, lsize);
          ctx.restore();

          // Gold ring
          ctx.save();
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(W / 2, ly + lsize / 2, lsize / 2, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        // Brand Text
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.font = '900 25px Inter, sans-serif';
        ctx.fillStyle = '#f8fafc';
        ctx.fillText('STATRACE KOREA', W / 2, ly + lsize + 24);

        ctx.font = '700 16px Inter, sans-serif';
        ctx.fillStyle = '#38bdf8';
        ctx.fillText('스탯레이스 코리아 · 대한민국 지자체 공식 통계 분석', W / 2, ly + lsize + 50);

        // Badge pill
        const tagY = ly + lsize + 85;
        const tagW = 440;
        const tagH = 42;
        ctx.fillStyle = 'rgba(245, 158, 11, 0.18)';
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.5)';
        ctx.lineWidth = 1.5;
        roundRect(ctx, W / 2 - tagW / 2, tagY, tagW, tagH, 21);
        ctx.fill();
        ctx.stroke();

        ctx.font = '800 18px Inter, sans-serif';
        ctx.fillStyle = '#fde047';
        const startY = (raceData && raceData.startYear) ? raceData.startYear : 2010;
        const endY = (raceData && raceData.endYear) ? raceData.endYear : 2024;
        ctx.fillText(`🔥 ${endY - startY + 1}개년 순위 대역전 레이스 (${startY}~${endY})`, W / 2, tagY + tagH / 2);

        // Main Headline (White bold)
        ctx.save();
        ctx.font = '900 56px Inter, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
        ctx.shadowBlur = 14;
        ctx.fillText(mainTitle, W / 2, tagY + 95);
        ctx.restore();

        // Sub Headline (Vibrant Gradient)
        ctx.save();
        const subGrad = ctx.createLinearGradient(cardX + 60, tagY + 140, cardX + cardW - 60, tagY + 200);
        if (isGrowth) {
          subGrad.addColorStop(0, '#34d399');
          subGrad.addColorStop(0.5, '#6ee7b7');
          subGrad.addColorStop(1, '#38bdf8');
        } else {
          subGrad.addColorStop(0, '#38bdf8');
          subGrad.addColorStop(0.5, '#fde047');
          subGrad.addColorStop(1, '#f59e0b');
        }
        ctx.fillStyle = subGrad;
        ctx.font = '900 64px Inter, sans-serif';
        ctx.shadowColor = 'rgba(245, 158, 11, 0.55)';
        ctx.shadowBlur = 24;
        ctx.fillText(subTitle, W / 2, tagY + 175);
        ctx.restore();

        // Curiosity hook
        ctx.font = '800 22px Inter, sans-serif';
        ctx.fillStyle = '#cbd5e1';
        ctx.fillText('과연 15년 동안 부동의 1위를 지킨 도시는 어디일까?', W / 2, tagY + 235);

        // Bottom Channels Capsule Bar
        const innerBarW = cardW - 60;
        const innerBarH = 68;
        const innerBarX = cardX + 30;
        const innerBarY = cardY + cardH - innerBarH - 28;

        ctx.fillStyle = 'rgba(2, 6, 23, 0.88)';
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
        ctx.lineWidth = 1.5;
        roundRect(ctx, innerBarX, innerBarY, innerBarW, innerBarH, 18);
        ctx.fill();
        ctx.stroke();

        const secW = innerBarW / 3;
        const midY = innerBarY + innerBarH / 2;

        // S1: YouTube
        drawSvgIconYoutube(ctx, innerBarX + 18, midY - 14, 28);
        ctx.font = '900 19px Inter, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.fillText('StatRace Korea', innerBarX + 54, midY);

        // Divider 1
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.25)';
        ctx.beginPath();
        ctx.moveTo(innerBarX + secW, innerBarY + 14);
        ctx.lineTo(innerBarX + secW, innerBarY + innerBarH - 14);
        ctx.stroke();

        // S2: Instagram
        drawSvgIconInstagram(ctx, innerBarX + secW + 18, midY - 13, 26);
        ctx.font = '900 19px Inter, sans-serif';
        ctx.fillText('@statrace_kr', innerBarX + secW + 52, midY);

        // Divider 2
        ctx.beginPath();
        ctx.moveTo(innerBarX + secW * 2, innerBarY + 14);
        ctx.lineTo(innerBarX + secW * 2, innerBarY + innerBarH - 14);
        ctx.stroke();

        // S3: Blog
        drawSvgIconBlog(ctx, innerBarX + secW * 2 + 16, midY - 13, 26);
        ctx.font = '800 18px Inter, sans-serif';
        ctx.fillText('공식 블로그 방문', innerBarX + secW * 2 + 50, midY);

      } else {
        // 16:9 Landscape (1920x1080) - Horizontal Hero Intro Card
        const cardW = 1280;
        const cardH = 680;
        const cardX = (W - cardW) / 2;
        const cardY = Math.round((H - cardH) / 2);

        const cardGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
        cardGrad.addColorStop(0, 'rgba(10, 18, 38, 0.96)');
        cardGrad.addColorStop(1, 'rgba(6, 12, 24, 0.97)');
        ctx.fillStyle = cardGrad;
        ctx.shadowColor = 'rgba(245, 158, 11, 0.5)';
        ctx.shadowBlur = 35;
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 3.5;
        roundRect(ctx, cardX, cardY, cardW, cardH, 28);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Logo
        const lsize = 110;
        const lx = W / 2 - lsize / 2;
        const ly = cardY + 36;
        if (brandImages.logo && brandImages.logo.complete) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(lx + lsize / 2, ly + lsize / 2, lsize / 2, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(brandImages.logo, lx, ly, lsize, lsize);
          ctx.restore();

          ctx.save();
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(W / 2, ly + lsize / 2, lsize / 2, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '900 22px Inter, sans-serif';
        ctx.fillStyle = '#f8fafc';
        ctx.fillText('STATRACE KOREA', W / 2, ly + lsize + 20);

        ctx.font = '900 48px Inter, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(mainTitle, W / 2, ly + lsize + 80);

        const subGrad = ctx.createLinearGradient(cardX + 100, 0, cardX + cardW - 100, 0);
        subGrad.addColorStop(0, '#38bdf8');
        subGrad.addColorStop(0.5, '#fde047');
        subGrad.addColorStop(1, '#f59e0b');
        ctx.fillStyle = subGrad;
        ctx.font = '900 58px Inter, sans-serif';
        ctx.fillText(subTitle, W / 2, ly + lsize + 150);

        ctx.font = '800 20px Inter, sans-serif';
        ctx.fillStyle = '#cbd5e1';
        ctx.fillText('과연 15년 동안 부동의 1위를 차지한 지자체는 어디일까요?', W / 2, ly + lsize + 210);

        // Channels bar
        const innerBarW = cardW - 80;
        const innerBarH = 60;
        const innerBarX = cardX + 40;
        const innerBarY = cardY + cardH - innerBarH - 24;

        ctx.fillStyle = 'rgba(2, 6, 23, 0.88)';
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
        ctx.lineWidth = 1.5;
        roundRect(ctx, innerBarX, innerBarY, innerBarW, innerBarH, 16);
        ctx.fill();
        ctx.stroke();

        const secW = innerBarW / 3;
        const midY = innerBarY + innerBarH / 2;

        drawSvgIconYoutube(ctx, innerBarX + 24, midY - 12, 26);
        ctx.font = '900 18px Inter, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.fillText('StatRace Korea', innerBarX + 60, midY);

        drawSvgIconInstagram(ctx, innerBarX + secW + 24, midY - 12, 24);
        ctx.font = '900 18px Inter, sans-serif';
        ctx.fillText('@statrace_kr', innerBarX + secW + 58, midY);

        drawSvgIconBlog(ctx, innerBarX + secW * 2 + 20, midY - 12, 24);
        ctx.font = '800 17px Inter, sans-serif';
        ctx.fillText('statracekorea.blogspot.com', innerBarX + secW * 2 + 54, midY);
      }

      ctx.restore();
    }

    // ==========================================
    // ENDING CALL-TO-ACTION FLOATING CARD (Center Screen Placement)
    // ==========================================
    function drawEndingCta(ctx, W, H, isVertical, progress) {
      if (!brandConfig.showEndingCta || progress < 0.91) return;

      const alpha = Math.min(1, (progress - 0.91) / 0.035);
      ctx.save();
      ctx.globalAlpha = alpha;

      // 1. Full Screen Dark Backdrop Dim (Focus attention on center card)
      ctx.fillStyle = 'rgba(2, 6, 23, 0.74)';
      ctx.fillRect(0, 0, W, H);

      if (isVertical) {
        // 9:16 Shorts Ending Floating CTA Card (Exact Screen Center)
        const cardW = 960;
        const cardH = 340;
        const cardX = (W - cardW) / 2;
        const cardY = Math.round((H - cardH) / 2); // Screen Center!

        // Dark cyberpunk glowing glass card
        const cardGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
        cardGrad.addColorStop(0, 'rgba(10, 18, 38, 0.96)');
        cardGrad.addColorStop(0.5, 'rgba(15, 23, 42, 0.94)');
        cardGrad.addColorStop(1, 'rgba(8, 14, 28, 0.97)');
        ctx.fillStyle = cardGrad;
        ctx.shadowColor = 'rgba(251, 191, 36, 0.6)';
        ctx.shadowBlur = 38;
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 3.5;
        roundRect(ctx, cardX, cardY, cardW, cardH, 30);
        ctx.fill();
        ctx.stroke();

        ctx.shadowBlur = 0;

        // Circular clipped logo emblem (No checkerboard square background!)
        if (brandImages.logo && brandImages.logo.complete) {
          ctx.save();
          const lx = cardX + 40;
          const ly = cardY + 36;
          const lsize = 140;

          // Circular clip mask
          ctx.beginPath();
          ctx.arc(lx + lsize / 2, ly + lsize / 2, lsize / 2, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();

          ctx.drawImage(brandImages.logo, lx, ly, lsize, lsize);
          ctx.restore();

          // Circular gold border ring around emblem
          ctx.save();
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(lx + lsize / 2, ly + lsize / 2, lsize / 2, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        // Title & Call to action text
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        ctx.font = '900 36px Inter, sans-serif';
        ctx.fillStyle = '#fde047';
        ctx.fillText('🔔 STATRACE KOREA (스탯레이스)', cardX + 210, cardY + 40);

        ctx.font = '800 25px Inter, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('구독 & 좋아요 누르고 다음 도시 랭킹을 확인하세요!', cardX + 210, cardY + 90);

        ctx.font = '600 20px Inter, sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('전국 지자체 소득·재정·세금 심층 분석 공식 데이터 채널', cardX + 210, cardY + 130);

        // Bottom Channels Badge Bar inside card
        const innerBarW = cardW - 60;
        const innerBarH = 70;
        const innerBarX = cardX + 30;
        const innerBarY = cardY + cardH - innerBarH - 24;

        ctx.fillStyle = 'rgba(2, 6, 23, 0.88)';
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
        ctx.lineWidth = 1.5;
        roundRect(ctx, innerBarX, innerBarY, innerBarW, innerBarH, 18);
        ctx.fill();
        ctx.stroke();

        const secW = innerBarW / 3;
        const midY = innerBarY + innerBarH / 2;

        // S1: YouTube
        drawSvgIconYoutube(ctx, innerBarX + 20, midY - 14, 30);
        ctx.font = '900 20px Inter, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'middle';
        ctx.fillText('YouTube 구독', innerBarX + 58, midY);

        // S2: Instagram
        drawSvgIconInstagram(ctx, innerBarX + secW + 20, midY - 13, 28);
        ctx.font = '900 20px Inter, sans-serif';
        ctx.fillText('@statrace_kr', innerBarX + secW + 56, midY);

        // S3: Blog
        drawSvgIconBlog(ctx, innerBarX + secW * 2 + 18, midY - 13, 28);
        ctx.font = '800 19px Inter, sans-serif';
        ctx.fillText('공식 블로그 방문', innerBarX + secW * 2 + 54, midY);
      } else {
        // 16:9 Landscape (1920x1080) - Exact Screen Center
        const cardW = 1120;
        const cardH = 300;
        const cardX = (W - cardW) / 2;
        const cardY = Math.round((H - cardH) / 2); // Screen Center!

        const cardGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
        cardGrad.addColorStop(0, 'rgba(10, 18, 38, 0.96)');
        cardGrad.addColorStop(1, 'rgba(8, 14, 28, 0.97)');
        ctx.fillStyle = cardGrad;
        ctx.shadowColor = 'rgba(251, 191, 36, 0.5)';
        ctx.shadowBlur = 32;
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 3;
        roundRect(ctx, cardX, cardY, cardW, cardH, 26);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        if (brandImages.logo && brandImages.logo.complete) {
          ctx.save();
          const lx = cardX + 45;
          const ly = cardY + 35;
          const lsize = 130;
          ctx.beginPath();
          ctx.arc(lx + lsize / 2, ly + lsize / 2, lsize / 2, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(brandImages.logo, lx, ly, lsize, lsize);
          ctx.restore();

          ctx.save();
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(lx + lsize / 2, ly + lsize / 2, lsize / 2, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.font = '900 32px Inter, sans-serif';
        ctx.fillStyle = '#fde047';
        ctx.fillText('🔔 STATRACE KOREA (스탯레이스)', cardX + 210, cardY + 38);

        ctx.font = '800 24px Inter, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('구독 & 좋아요 누르고 다음 도시 랭킹을 확인하세요!', cardX + 210, cardY + 80);

        ctx.font = '600 18px Inter, sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('전국 지자체 소득·재정·세금 심층 분석 공식 데이터 채널', cardX + 210, cardY + 115);

        const innerBarW = cardW - 60;
        const innerBarH = 64;
        const innerBarX = cardX + 30;
        const innerBarY = cardY + cardH - innerBarH - 20;

        ctx.fillStyle = 'rgba(2, 6, 23, 0.88)';
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
        ctx.lineWidth = 1.5;
        roundRect(ctx, innerBarX, innerBarY, innerBarW, innerBarH, 16);
        ctx.fill();
        ctx.stroke();

        const secW = innerBarW / 3;
        const midY = innerBarY + innerBarH / 2;

        drawSvgIconYoutube(ctx, innerBarX + 20, midY - 12, 26);
        ctx.font = '900 19px Inter, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'middle';
        ctx.fillText('YouTube 구독', innerBarX + 56, midY);

        drawSvgIconInstagram(ctx, innerBarX + secW + 20, midY - 12, 24);
        ctx.font = '900 19px Inter, sans-serif';
        ctx.fillText('@statrace_kr', innerBarX + secW + 54, midY);

        drawSvgIconBlog(ctx, innerBarX + secW * 2 + 18, midY - 12, 24);
        ctx.font = '800 18px Inter, sans-serif';
        ctx.fillText('statracekorea.blogspot.com', innerBarX + secW * 2 + 50, midY);
      }
      ctx.restore();
    }

    // ==========================================
    // RENDERER 1: Bar Chart Race (Standard & Growth Rate)
    // ==========================================
    function drawFrame(ctx, items, displayYear, progress, mainTitle, subTitle, indKey, isGrowth) {
      const W = canvas.width;
      const H = canvas.height;
      const isVertical = (W < H);

      // Background with Brand Texture
      drawBrandBackground(ctx, W, H, isGrowth);

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
        // Clean Sleek Brand Header: STATRACE KOREA (No box)
        if (brandConfig.showLogo) {
          ctx.save();
          ctx.fillStyle = '#38bdf8';
          ctx.beginPath();
          ctx.arc(68, 86, 5, 0, Math.PI * 2);
          ctx.fill();

          ctx.font = '900 28px Inter, sans-serif';
          ctx.fillStyle = '#f8fafc';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText('STATRACE KOREA', 84, 86);
          ctx.restore();
        }

        ctx.font = '900 64px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(mainTitle, 60, 185);

        const titleGrad = ctx.createLinearGradient(60, 205, 800, 275);
        if (isGrowth) {
          titleGrad.addColorStop(0, '#34d399');
          titleGrad.addColorStop(1, '#60a5fa');
        } else {
          titleGrad.addColorStop(0, '#38bdf8');
          titleGrad.addColorStop(1, '#818cf8');
        }
        ctx.fillStyle = titleGrad;
        ctx.font = '900 56px Inter, sans-serif';
        ctx.fillText(subTitle, 60, 260);

        const startY = (raceData && raceData.startYear) ? raceData.startYear : 2010;
        const endY = (raceData && raceData.endYear) ? raceData.endYear : 2024;
        ctx.font = '700 32px monospace';
        ctx.fillStyle = '#94a3b8';
        const modeLabel = isGrowth ? `(시작년도 ${startY}년 대비 누적 성장률)` : `(${startY} ~ ${endY})`;
        ctx.fillText(`YEAR: ${roundedYear}년 ${modeLabel}`, 60, 320);
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
      const barHeight = Math.max(16, Math.min(isVertical ? 58 : 46, (availableHeight / count) * 0.72));
      const rowGap = Math.max(6, (availableHeight - barHeight * count) / (count - 1));

      const leftMargin = isVertical ? (count > 25 ? 30 : 60) : 80;
      const rightMargin = isVertical ? (count > 25 ? 140 : 160) : 200;
      const rankColWidth = isVertical ? (count > 25 ? 50 : 65) : 75;
      const nameColWidth = isVertical ? (count > 25 ? 150 : 170) : 210;
      const barStartX = leftMargin + rankColWidth + nameColWidth;
      const maxBarWidth = W - barStartX - rightMargin;

      const maxValue = Math.max(...items.map(d => Math.abs(d.value)), 1);

      const nameFontSize = count > 25 ? (isVertical ? 18 : 16) : (isVertical ? 28 : 22);
      const valFontSize = count > 25 ? (isVertical ? 18 : 16) : (isVertical ? 28 : 22);
      const rankFontSize = count > 25 ? (isVertical ? 20 : 18) : (isVertical ? 32 : 26);

      items.forEach((item) => {
        const rankPos = item.rank - 1;
        const y = topOffset + rankPos * (barHeight + rowGap);

        if (y < topOffset - barHeight || y > H - bottomOffset + 20) return;

        const barW = Math.max(12, (Math.abs(item.value) / maxValue) * maxBarWidth);
        const shortProv = (item.province || item.fullName || item.name).slice(0, 2);
        const baseColor = getBarColor(shortProv);

        // Rank Number
        ctx.save();
        ctx.font = `900 ${rankFontSize}px Inter, sans-serif`;
        if (rankPos < 0.8) {
          ctx.fillStyle = '#fbbf24';
        } else if (rankPos < 1.8) {
          ctx.fillStyle = '#94a3b8';
        } else if (rankPos < 2.8) {
          ctx.fillStyle = '#cd7f32';
        } else {
          ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
        }
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const displayRank = Math.round(item.rank);
        ctx.fillText(displayRank.toString(), leftMargin, y + barHeight / 2);
        ctx.restore();

        // Region Name
        ctx.save();
        ctx.font = `800 ${nameFontSize}px Inter, sans-serif`;
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

      // Official Brand Footer (Attribution & SNS Capsule Bar)
      drawBrandFooter(ctx, W, H, isVertical, progress);

      // Ending Call-To-Action Floating Card (When video completes/holds)
      drawEndingCta(ctx, W, H, isVertical, progress);
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

      // Dark futuristic mesh background with Brand Texture
      drawBrandBackground(ctx, W, H, false);

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

      // Top Left Sleek Brand Text: STATRACE KOREA
      if (brandConfig.showLogo) {
        ctx.save();
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(68, 86, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = '900 24px Inter, sans-serif';
        ctx.fillStyle = '#f8fafc';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('STATRACE KOREA', 84, 86);
        ctx.restore();
      }

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

      // Official Brand Footer (Attribution & SNS Capsule Bar)
      drawBrandFooter(ctx, W, H, true, progress);
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

      // Top Right Official Brand Seal
      drawBrandWatermark(ctx, W, H, false, 'CARD');

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

      // Bottom Brand Attribution & Official SNS Bar
      ctx.save();
      ctx.font = '600 18px Inter, sans-serif';
      ctx.fillStyle = 'rgba(148, 163, 184, 0.65)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('데이터 출처: 통계청 KOSIS · 국세청 연말정산 · 행정안전부 | 공식 분석: StatRace Korea', W / 2, 990);

      if (brandConfig.showSnsBar) {
        const barW = 960;
        const barH = 46;
        const barX = (W - barW) / 2;
        const barY = 1014;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.strokeStyle = 'rgba(71, 85, 105, 0.6)';
        ctx.lineWidth = 1.5;
        roundRect(ctx, barX, barY, barW, barH, 23);
        ctx.fill();
        ctx.stroke();

        const secW = barW / 3;
        const midY = barY + barH / 2;

        // S1: YouTube
        const s1X = barX + 26;
        drawSvgIconYoutube(ctx, s1X, midY - 9, 22);
        ctx.font = '800 16px Inter, sans-serif';
        ctx.fillStyle = '#f1f5f9';
        ctx.textAlign = 'left';
        ctx.fillText('StatRace Korea', s1X + 32, midY);

        // Divider 1
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
        ctx.beginPath();
        ctx.moveTo(barX + secW, barY + 10);
        ctx.lineTo(barX + secW, barY + barH - 10);
        ctx.stroke();

        // S2: Instagram
        const s2X = barX + secW + 26;
        drawSvgIconInstagram(ctx, s2X, midY - 10, 20);
        ctx.font = '800 16px Inter, sans-serif';
        ctx.fillText('@statrace_kr', s2X + 28, midY);

        // Divider 2
        ctx.beginPath();
        ctx.moveTo(barX + secW * 2, barY + 10);
        ctx.lineTo(barX + secW * 2, barY + barH - 10);
        ctx.stroke();

        // S3: Blog
        const s3X = barX + secW * 2 + 24;
        drawSvgIconBlog(ctx, s3X, midY - 10, 20);
        ctx.font = '700 15px Inter, sans-serif';
        ctx.fillText('statracekorea.blogspot.com', s3X + 26, midY);
      }
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
