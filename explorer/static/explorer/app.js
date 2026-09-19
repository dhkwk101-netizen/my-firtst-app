document.addEventListener("DOMContentLoaded", () => {
  let taxChart = null;
  let popChart = null;
  let demographicsChart = null;
  let mapInstance = null;
  let geoLayer = null;
  let currentAbortController = null;

  // State
  let allRegions = [];
  let allRankings = [];
  let currentScope = "ALL"; // "ALL" or "PROVINCE"
  let cachedTaxSeries = [];
  let cachedPopSeries = [];

  // DOM Elements
  const provinceSelect = document.getElementById("province-select");
  const macroProvinceSelect = document.getElementById("macro-province-select");
  const regionSelect = document.getElementById("region-select");
  const regionSearch = document.getElementById("region-search");
  const regionSearchClear = document.getElementById("region-search-clear");
  const searchCountBadge = document.getElementById("search-count-badge");
  const yearSelect = document.getElementById("year-select");
  const macroYearSelect = document.getElementById("macro-year-select");
  const microYearSelect = document.getElementById("micro-year-select");
  const indicatorSelect = document.getElementById("indicator-select");
  const macroIndicatorSelect = document.getElementById("macro-indicator-select");
  const liveStatus = document.getElementById("live-status");

  // Sidebar dynamic mode elements
  const sidebarMacro = document.getElementById("sidebar-macro");
  const sidebarMicro = document.getElementById("sidebar-micro");
  const sidebarModeBadge = document.getElementById("sidebar-mode-badge");
  const btnSidebarModeToggle = document.getElementById("btn-sidebar-mode-toggle");
  const btnSidebarModeText = document.getElementById("btn-sidebar-mode-text");
  const btnSidebarModeIcon = document.getElementById("btn-sidebar-mode-icon");

  // Subheader dynamic mode elements
  const headerMacroSummary = document.getElementById("header-macro-summary");
  const headerMicroSummary = document.getElementById("header-micro-summary");
  const headerMacroIndicatorName = document.getElementById("header-macro-indicator-name");
  const headerMacroSelectedRegionChip = document.getElementById("header-macro-selected-region-chip");
  const headerMacroSelectedName = document.getElementById("header-macro-selected-name");
  const headerMacroSelectedRank = document.getElementById("header-macro-selected-rank");
  const btnResetRegionSelection = document.getElementById("btn-reset-region-selection");
  const btnClearTableSelection = document.getElementById("btn-clear-table-selection");
  const quickSelectedName = document.getElementById("quick-selected-name");
  const tabRegionTag = document.getElementById("tab-region-tag");

  // Macro stats summary elements
  const macroStatAvg = document.getElementById("macro-stat-avg");
  const macroStatMedian = document.getElementById("macro-stat-median");
  const macroStatTop = document.getElementById("macro-stat-top");
  const macroStatMin = document.getElementById("macro-stat-min");
  const macroStatYearPill = document.getElementById("macro-stat-year-pill");

  let currentViewMode = "MACRO";

  function getCurrentIndicatorKey() {
    return (macroIndicatorSelect && macroIndicatorSelect.value) || (indicatorSelect && indicatorSelect.value) || "ACQUISITION_TAX";
  }

  function syncIndicator(val) {
    if (macroIndicatorSelect && macroIndicatorSelect.value !== val) macroIndicatorSelect.value = val;
    if (indicatorSelect) {
      if (!indicatorSelect.querySelector(`option[value="${val}"]`)) {
        const opt = document.createElement("option");
        opt.value = val;
        opt.textContent = val;
        indicatorSelect.appendChild(opt);
      }
      indicatorSelect.value = val;
    }
  }

  function syncProvince(val) {
    if (provinceSelect && provinceSelect.value !== val) provinceSelect.value = val;
    if (macroProvinceSelect && macroProvinceSelect.value !== val) macroProvinceSelect.value = val;
  }

  function syncYear(val) {
    if (yearSelect && yearSelect.value !== val) yearSelect.value = val;
    if (macroYearSelect && macroYearSelect.value !== val) macroYearSelect.value = val;
    if (microYearSelect && microYearSelect.value !== val) microYearSelect.value = val;
  }

  // Hero elements
  const heroProvinceTag = document.getElementById("hero-province-tag");
  const heroRegionName = document.getElementById("hero-region-name");
  const heroRegionKey = document.getElementById("hero-region-key");
  const heroYear = document.getElementById("hero-year");
  const heroDesc = document.getElementById("hero-desc");
  const heroNationalRank = document.getElementById("hero-national-rank");

  // Ranking elements
  const rankingTitle = document.getElementById("ranking-title");
  const rankingCount = document.getElementById("ranking-count");
  const rankingSearch = document.getElementById("ranking-search");
  const btnScopeAll = document.getElementById("btn-scope-all");
  const btnScopeProv = document.getElementById("btn-scope-prov");

  // Map controls
  const btnResetMap = document.getElementById("btn-reset-map");
  const btnZoomRegion = document.getElementById("btn-zoom-region");

  const PROVINCE_COORDS = {
    "KR_11": { center: [37.5665, 126.9780], zoom: 11, name: "서울특별시" },
    "KR_26": { center: [35.1796, 129.0756], zoom: 11, name: "부산광역시" },
    "KR_27": { center: [35.8714, 128.6014], zoom: 11, name: "대구광역시" },
    "KR_28": { center: [37.4563, 126.7052], zoom: 10, name: "인천광역시" },
    "KR_29": { center: [35.1595, 126.8526], zoom: 11, name: "광주광역시" },
    "KR_30": { center: [36.3504, 127.3845], zoom: 11, name: "대전광역시" },
    "KR_31": { center: [35.5384, 129.3114], zoom: 11, name: "울산광역시" },
    "KR_36": { center: [36.4800, 127.2890], zoom: 11, name: "세종특별자치시" },
    "KR_41": { center: [37.4138, 127.5183], zoom: 9, name: "경기도" },
    "KR_43": { center: [36.6357, 127.4912], zoom: 9, name: "충청북도" },
    "KR_44": { center: [36.5184, 126.8000], zoom: 9, name: "충청남도" },
    "KR_46": { center: [34.8679, 126.9910], zoom: 8, name: "전라남도" },
    "KR_47": { center: [36.5760, 128.5056], zoom: 8, name: "경상북도" },
    "KR_48": { center: [35.4606, 128.2132], zoom: 9, name: "경상남도" },
    "KR_50": { center: [33.4996, 126.5312], zoom: 10, name: "제주특별자치도" },
    "KR_51": { center: [37.8228, 128.1555], zoom: 8, name: "강원특별자치도" },
    "KR_52": { center: [35.7175, 127.1530], zoom: 9, name: "전북특별자치도" },
  };

  const NATIONAL_VIEW = { center: [36.2, 127.8], zoom: 7 };

  // Initialize Leaflet Map
  function initMap() {
    mapInstance = L.map("map").setView(NATIONAL_VIEW.center, NATIONAL_VIEW.zoom);
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
      attribution: "Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ",
      maxZoom: 16,
    }).addTo(mapInstance);
  }

  // Load Regions from API
  async function loadRegions() {
    try {
      const res = await fetch("/api/regions");
      const data = await res.json();
      allRegions = (data.regions || []).filter(r => !r.regionKey.startsWith("TEST_"));

      // Sort by provinceCode then name
      allRegions.sort((a, b) => {
        const provA = a.provinceName || "";
        const provB = b.provinceName || "";
        if (provA !== provB) return provA.localeCompare(provB, "ko");
        return (a.name || "").localeCompare(b.name || "", "ko");
      });

      renderRegionOptions();

      // Initial state: Nationwide view without forced district selection
      regionSelect.value = "";

      const navTotalCount = document.getElementById("nav-total-count");
      if (navTotalCount) {
        navTotalCount.textContent = `${allRegions.length}개`;
      }
    } catch (err) {
      console.error("Failed to load regions:", err);
    }
  }

  // Render Region Options based on province and search filter
  function renderRegionOptions() {
    const selectedProv = provinceSelect.value;
    const searchVal = (regionSearch.value || "").trim().toLowerCase();

    const filtered = allRegions.filter(r => {
      if (selectedProv && r.provinceCode !== selectedProv) {
        return false;
      }
      if (searchVal) {
        const matchName = (r.name || "").toLowerCase().includes(searchVal);
        const matchFull = (r.fullName || "").toLowerCase().includes(searchVal);
        const matchKey = (r.regionKey || "").toLowerCase().includes(searchVal);
        return matchName || matchFull || matchKey;
      }
      return true;
    });

    searchCountBadge.textContent = `${filtered.length}개`;
    searchCountBadge.title = `${filtered.length}개 자치단체 검색됨`;
    regionSearchClear.style.display = searchVal ? "block" : "none";

    const currentVal = regionSelect.value;
    regionSelect.innerHTML = '<option value="">지역을 선택하세요</option>';

    // Group by province
    const grouped = {};
    filtered.forEach(r => {
      const provName = r.provinceName || "기타";
      if (!grouped[provName]) grouped[provName] = [];
      grouped[provName].push(r);
    });

    Object.keys(grouped).forEach(provName => {
      const optgroup = document.createElement("optgroup");
      optgroup.label = provName;
      grouped[provName].forEach(r => {
        const opt = document.createElement("option");
        opt.value = r.regionKey;
        opt.textContent = `${r.fullName || r.name} (${r.regionKey})`;
        optgroup.appendChild(opt);
      });
      regionSelect.appendChild(optgroup);
    });

    // Retain previous selection if still available
    const hasCurrent = filtered.some(r => r.regionKey === currentVal);
    if (hasCurrent) {
      regionSelect.value = currentVal;
    } else {
      regionSelect.value = "";
    }
  }

  const INDICATOR_CONFIG = {
    "ACQUISITION_TAX": { name: "취득세 세입액", unit: "원", type: "CURRENCY", color: "#0284c7", bg: "rgba(2, 132, 199, 0.12)", minYear: 2010, maxYear: 2024 },
    "ACQUISITION_TAX_PER_CAPITA": { name: "1인당 취득세", unit: "원/인", type: "CURRENCY", color: "#0284c7", bg: "rgba(2, 132, 199, 0.12)", minYear: 2010, maxYear: 2024 },
    "LOCAL_TAX_TOTAL": { name: "지방세 총 세입액", unit: "원", type: "CURRENCY", color: "#2563eb", bg: "rgba(37, 99, 235, 0.12)", minYear: 2010, maxYear: 2024 },
    "LOCAL_TAX_TOTAL_PER_CAPITA": { name: "1인당 지방세", unit: "원/인", type: "CURRENCY", color: "#2563eb", bg: "rgba(37, 99, 235, 0.12)", minYear: 2010, maxYear: 2024 },
    "PROPERTY_TAX": { name: "재산세 세입액", unit: "원", type: "CURRENCY", color: "#4f46e5", bg: "rgba(79, 70, 229, 0.12)", minYear: 2010, maxYear: 2024 },
    "PROPERTY_TAX_PER_CAPITA": { name: "1인당 재산세", unit: "원/인", type: "CURRENCY", color: "#4f46e5", bg: "rgba(79, 70, 229, 0.12)", minYear: 2010, maxYear: 2024 },
    "LOCAL_INCOME_TAX": { name: "지방소득세 세입액", unit: "원", type: "CURRENCY", color: "#059669", bg: "rgba(5, 150, 105, 0.12)", minYear: 2010, maxYear: 2024 },
    "LOCAL_INCOME_TAX_PER_CAPITA": { name: "1인당 지방소득세", unit: "원/인", type: "CURRENCY", color: "#059669", bg: "rgba(5, 150, 105, 0.12)", minYear: 2010, maxYear: 2024 },
    "FISCAL_INDEPENDENCE": { name: "재정자립도", unit: "%", type: "PERCENT", color: "#d97706", bg: "rgba(217, 119, 6, 0.12)", minYear: 2010, maxYear: 2024 },
    "ELDERLY_POPULATION_RATIO": { name: "고령인구 비율", unit: "%", type: "PERCENT", color: "#dc2626", bg: "rgba(220, 38, 38, 0.12)", minYear: 2010, maxYear: 2024 },
    "TOTAL_FERTILITY_RATE": { name: "합계출산율", unit: "명", type: "FLOAT", color: "#db2777", bg: "rgba(219, 39, 119, 0.12)", minYear: 2010, maxYear: 2024 },
    "NET_MIGRATION_RATE": { name: "순이동률", unit: "%", type: "PERCENT", color: "#0d9488", bg: "rgba(13, 148, 136, 0.12)", minYear: 2010, maxYear: 2024 },
    "NET_MIGRATION": { name: "순이동인구", unit: "명", type: "COUNT", color: "#0d9488", bg: "rgba(13, 148, 136, 0.12)", minYear: 2010, maxYear: 2024 },
    "POPULATION": { name: "주민등록인구", unit: "명", type: "COUNT", color: "#9333ea", bg: "rgba(147, 51, 234, 0.12)", minYear: 2010, maxYear: 2024 },
    "BUSINESS_ESTABLISHMENTS": { name: "가동 사업체 수", unit: "개", type: "COUNT", color: "#7c3aed", bg: "rgba(124, 58, 237, 0.12)", minYear: 2010, maxYear: 2024 },
    "BUSINESSES_PER_THOUSAND": { name: "인구 천명당 사업체 수", unit: "개/천명", type: "FLOAT", color: "#0284c7", bg: "rgba(2, 132, 199, 0.12)", minYear: 2010, maxYear: 2024 },
    "BUSINESS_EMPLOYEES": { name: "사업체 종사자 수", unit: "명", type: "COUNT", color: "#ea580c", bg: "rgba(234, 88, 12, 0.12)", minYear: 2010, maxYear: 2024 },
    "AVERAGE_WAGE": { name: "주민 1인당 평균 연봉 (근로소득)", unit: "원/인", type: "CURRENCY", color: "#059669", bg: "rgba(5, 150, 105, 0.12)", minYear: 2016, maxYear: 2023 },
    "CORPORATE_TOTAL_PAYROLL": { name: "관내 기업 총급여액 (일자리 규모)", unit: "원", type: "CURRENCY", color: "#0284c7", bg: "rgba(2, 132, 199, 0.12)", minYear: 2016, maxYear: 2023 },
    "WITHHOLDING_TAX": { name: "원천징수세액", unit: "원", type: "CURRENCY", color: "#4f46e5", bg: "rgba(79, 70, 229, 0.12)", minYear: 2016, maxYear: 2023 },
    "WORKPLACE_WAGE_EARNERS": { name: "사업장 원천징수 근로자 수", unit: "명", type: "COUNT", color: "#d97706", bg: "rgba(217, 119, 6, 0.12)", minYear: 2016, maxYear: 2023 },
  };

  // Merge dynamic server bounds if provided
  try {
    const boundsEl = document.getElementById("indicator-bounds-data");
    if (boundsEl && boundsEl.textContent) {
      const serverBounds = JSON.parse(boundsEl.textContent);
      for (const [key, b] of Object.entries(serverBounds)) {
        if (INDICATOR_CONFIG[key]) {
          if (b.min !== undefined) INDICATOR_CONFIG[key].minYear = b.min;
          if (b.max !== undefined) INDICATOR_CONFIG[key].maxYear = b.max;
        }
      }
    }
  } catch (err) {
    console.warn("Failed to parse indicator-bounds-data:", err);
  }

  function getIndicatorMeta(indKey) {
    return INDICATOR_CONFIG[indKey] || { name: indKey, unit: "", type: "COUNT", color: "#38bdf8", bg: "rgba(56, 189, 248, 0.12)", minYear: 2010, maxYear: 2026 };
  }

  function updateYearSelectorAvailability(indKey) {
    const meta = getIndicatorMeta(indKey);
    const minYear = meta.minYear || 2010;
    const maxYear = meta.maxYear || 2024;

    if (macroYearSelect) {
      Array.from(macroYearSelect.options).forEach(opt => {
        const y = parseInt(opt.value, 10);
        if (y < minYear || y > maxYear) {
          opt.disabled = true;
          opt.text = `${y}년 (미공표)`;
        } else {
          opt.disabled = false;
          opt.text = `${y}년 ${y === maxYear ? '(최신 확정)' : ''}`.trim();
        }
      });
    }

    document.querySelectorAll(".year-pill").forEach(btn => {
      const y = parseInt(btn.getAttribute("data-year"), 10);
      if (y < minYear || y > maxYear) {
        btn.classList.add("opacity-30", "pointer-events-none");
      } else {
        btn.classList.remove("opacity-30", "pointer-events-none");
      }
    });
  }

  // Format indicator values nicely according to type
  function formatIndicatorValue(val, indKey, compact = false) {
    if (val === null || val === undefined) return "-";
    const meta = getIndicatorMeta(indKey);
    const num = Number(val);
    if (isNaN(num)) return "-";

    if (meta.type === "PERCENT") {
      return `${num.toFixed(2)} %`;
    }
    if (meta.type === "FLOAT") {
      return `${num.toFixed(2)} ${meta.unit}`.trim();
    }
    if (indKey === "AVERAGE_WAGE") {
      return `${Math.round(num / 10000).toLocaleString()}만원`;
    }
    if (meta.type === "CURRENCY") {
      if (compact && Math.abs(num) >= 1e8) {
        if (Math.abs(num) >= 1e12) {
          const jo = Math.floor(num / 1e12);
          const eok = Math.round((num % 1e12) / 1e8);
          return eok > 0 ? `${jo}조 ${eok.toLocaleString()}억 원` : `${jo}조 원`;
        }
        const eok = Math.round(num / 1e8);
        return `${eok.toLocaleString()}억 원`;
      }
      const rounded = Math.round(num);
      return `${rounded.toLocaleString()} 원`;
    }
    return `${Math.round(num).toLocaleString()} ${meta.unit}`.trim();
  }

  function formatNumber(val) {
    if (val === null || val === undefined) return "-";
    return Number(val).toLocaleString();
  }

  function getIndicatorUnit(indKey) {
    const meta = getIndicatorMeta(indKey);
    return meta.unit || "";
  }

  // State for Regional 4-Pillar Charts
  let currentRegionalDashData = null;
  let currentLeftChartTab = "DEMO"; // "DEMO" or "INCOME"
  let currentRightChartTab = "FISC"; // "FISC" or "HOUSE"

  // Render Regional Executive Dashboard (4-Pillar Livability & Vitality Diagnosis)
  function renderRegionalDashboard(dashData) {
    if (!dashData || !dashData.region) return;
    currentRegionalDashData = dashData;
    const { region, baselineYear, diagnosis, kpis, charts, table } = dashData;

    // 1. Header Information
    const microRegionTitle = document.getElementById("micro-region-title");
    if (microRegionTitle) microRegionTitle.textContent = region.name;
    const microRegionCode = document.getElementById("micro-region-code");
    if (microRegionCode) microRegionCode.textContent = `(${region.regionKey})`;
    const microProv = document.getElementById("hero-province-tag-micro");
    if (microProv) microProv.textContent = region.provinceName || "대한민국";
    const microBaselineText = document.getElementById("micro-baseline-year-text");
    if (microBaselineText) microBaselineText.textContent = `${baselineYear}년`;
    const microTblName = document.getElementById("micro-table-region-name");
    if (microTblName) microTblName.textContent = region.name;

    // 2. Executive Diagnosis Banner & Traffic Lights
    if (diagnosis) {
      const verdictBadge = document.getElementById("diag-verdict-badge");
      if (verdictBadge) {
        verdictBadge.textContent = diagnosis.verdictTitle;
        verdictBadge.className = `px-2.5 py-0.5 rounded-full text-xs font-bold border ${diagnosis.verdictClass || 'bg-emerald-400/20 text-emerald-300 border-emerald-400/40'}`;
      }
      const briefingText = document.getElementById("diag-briefing-text");
      if (briefingText) briefingText.textContent = diagnosis.briefing;

      // 4-Pillar Traffic Lights
      const setPillarLight = (lightId, scoreId, pillarKey) => {
        const p = diagnosis.pillars ? diagnosis.pillars[pillarKey] : null;
        const lightEl = document.getElementById(lightId);
        const scoreEl = document.getElementById(scoreId);
        if (!p) return;
        if (scoreEl) scoreEl.textContent = `${p.grade} (${p.score})`;
        if (lightEl) {
          let dotColor = "bg-slate-400";
          if (p.status === "good") dotColor = "bg-emerald-400 animate-pulse";
          else if (p.status === "normal") dotColor = "bg-sky-400";
          else if (p.status === "neutral") dotColor = "bg-amber-400";
          else if (p.status === "warning") dotColor = "bg-rose-400 animate-pulse";
          lightEl.className = `w-2 h-2 rounded-full ${dotColor}`;
        }
      };

      setPillarLight("pill-light-demo", "pill-score-demo", "demography");
      setPillarLight("pill-light-inc", "pill-score-inc", "incomeJobs");
      setPillarLight("pill-light-house", "pill-score-house", "housingAssets");
      setPillarLight("pill-light-fisc", "pill-score-fisc", "fiscalCapacity");
    }

    // Helper for YoY badge rendering
    function renderYoYText(pct, diff, unit = "") {
      if (pct === null || pct === undefined) return '<span class="text-slate-400">-</span>';
      const sign = pct > 0 ? "+" : "";
      const colorClass = pct >= 0 ? "text-emerald-600" : "text-rose-600";
      const arrow = pct >= 0 ? "▲" : "▼";
      const diffStr = diff !== undefined && diff !== null ? ` (${sign}${Number(diff).toLocaleString()}${unit})` : "";
      return `<span class="${colorClass} font-bold">${arrow} ${sign}${pct}%${diffStr}</span>`;
    }

    // 3. 4 Big Question Cards
    const p1 = kpis.pillar1_demography || {};
    const p2 = kpis.pillar2_incomeJobs || {};
    const p3 = kpis.pillar3_housingAssets || {};
    const p4 = kpis.pillar4_fiscalCapacity || {};

    // CARD 1: [👥 1. 인구 활력]
    const kpiPopYear = document.getElementById("kpi-pop-year");
    if (kpiPopYear) kpiPopYear.textContent = `${p1.year || baselineYear}년`;

    const migObj = p1.netMigration || {};
    const kpiMigVal = document.getElementById("kpi-mig-val");
    if (kpiMigVal) {
      if (migObj.value !== null && migObj.value !== undefined) {
        const sign = migObj.value > 0 ? "+" : "";
        kpiMigVal.textContent = `${sign}${Number(migObj.value).toLocaleString()} 명`;
      } else {
        kpiMigVal.textContent = "-";
      }
    }
    const kpiMigStatus = document.getElementById("kpi-mig-status");
    if (kpiMigStatus) {
      if (migObj.value !== null && migObj.value !== undefined) {
        if (migObj.value >= 0) {
          kpiMigStatus.className = "px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300";
          kpiMigStatus.textContent = "인구 순유입";
        } else {
          kpiMigStatus.className = "px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300";
          kpiMigStatus.textContent = "인구 순유출";
        }
      }
    }
    const kpiMigRate = document.getElementById("kpi-mig-rate");
    if (kpiMigRate) {
      kpiMigRate.textContent = migObj.rate !== null && migObj.rate !== undefined ? `순이동률 ${migObj.rate}%` : "-";
    }
    const kpiMigRank = document.getElementById("kpi-mig-rank");
    if (kpiMigRank) {
      kpiMigRank.textContent = migObj.rank ? `전국 ${migObj.rank}위 (상위 ${migObj.topPct}%)` : "-";
    }

    const fertObj = p1.fertilityRate || {};
    const kpiFertVal = document.getElementById("kpi-fert-val");
    if (kpiFertVal) {
      kpiFertVal.textContent = fertObj.value !== null && fertObj.value !== undefined ? `${fertObj.value} 명 (전국 ${fertObj.rank || '-'}위)` : "-";
    }

    const elderObj = p1.elderlyRatio || {};
    const kpiElderVal = document.getElementById("kpi-elder-val");
    if (kpiElderVal) {
      kpiElderVal.textContent = elderObj.value !== null && elderObj.value !== undefined ? `${elderObj.value}%` : "-";
    }

    const popObj = p1.population || {};
    const kpiPopVal = document.getElementById("kpi-pop-val");
    if (kpiPopVal) {
      if (popObj.value !== null && popObj.value !== undefined) {
        const sign = (popObj.yoyPct || 0) >= 0 ? "+" : "";
        kpiPopVal.textContent = `${Number(popObj.value).toLocaleString()}명 (${sign}${popObj.yoyPct || 0}%)`;
      } else {
        kpiPopVal.textContent = "-";
      }
    }

    // CARD 2: [💼 2. 소득 & 일자리]
    const kpiIncYear = document.getElementById("kpi-inc-year");
    if (kpiIncYear) kpiIncYear.textContent = `${p2.year || 2023}년`;

    // 1. Hero: 주민 1인당 평균 연봉 (진짜 주민 소득)
    const avgWageObj = p2.averageWage || {};
    const kpiAvgWageVal = document.getElementById("kpi-avg-wage-val");
    if (kpiAvgWageVal) {
      kpiAvgWageVal.textContent = avgWageObj.value !== null ? formatIndicatorValue(avgWageObj.value, "AVERAGE_WAGE", false) : "-";
    }
    const kpiAvgWageYoY = document.getElementById("kpi-avg-wage-yoy");
    if (kpiAvgWageYoY) {
      kpiAvgWageYoY.innerHTML = renderYoYText(avgWageObj.yoyPct);
    }
    const kpiAvgWageRank = document.getElementById("kpi-avg-wage-rank");
    if (kpiAvgWageRank) {
      kpiAvgWageRank.textContent = avgWageObj.rank ? `전국 ${avgWageObj.rank}위 (상위 ${avgWageObj.topPct}%)` : "-";
    }

    // 2. Sub-details: 기업 총급여액 & 원천징수세액 & 1인당 소득세 & 가동 사업체
    const corpObj = p2.corporatePayroll || {};
    const kpiCorpPayroll = document.getElementById("kpi-corp-payroll");
    if (kpiCorpPayroll) {
      const corpText = corpObj.value !== null ? formatIndicatorValue(corpObj.value, "CORPORATE_TOTAL_PAYROLL", true) : "-";
      const corpRankText = corpObj.rank ? ` (${corpObj.rank}위)` : "";
      kpiCorpPayroll.textContent = corpObj.value !== null ? `${corpText}${corpRankText}` : "-";
    }

    const withholdObj = p2.withholdingTax || {};
    const kpiWithholdTax = document.getElementById("kpi-withhold-tax");
    if (kpiWithholdTax) {
      kpiWithholdTax.textContent = withholdObj.value !== null ? formatIndicatorValue(withholdObj.value, "WITHHOLDING_TAX", true) : "-";
    }

    const pcIncObj = p2.pcIncomeTax || {};
    const kpiPcIncVal = document.getElementById("kpi-pc-inc-val");
    if (kpiPcIncVal) {
      const pcIncText = pcIncObj.value !== null ? `${Math.round(pcIncObj.value / 10000).toLocaleString()}만원` : "-";
      const pcIncRankText = pcIncObj.rank ? ` (${pcIncObj.rank}위)` : "";
      kpiPcIncVal.textContent = pcIncObj.value !== null ? `${pcIncText}${pcIncRankText}` : "-";
    }

    const bizObj = p2.businesses || {};
    const bizThouObj = p2.businessesPerThousand || {};
    const kpiBizCount = document.getElementById("kpi-biz-count");
    if (kpiBizCount) {
      const bCnt = bizObj.value !== null ? Number(bizObj.value).toLocaleString() : "-";
      const bThou = bizThouObj.value !== null ? `${bizThouObj.value}개/천명` : "";
      kpiBizCount.textContent = bThou ? `${bCnt}개 (${bThou})` : `${bCnt}개`;
    }

    // CARD 3: [🏠 3. 자산 & 주거 매력]
    const kpiHouseYear = document.getElementById("kpi-house-year");
    if (kpiHouseYear) kpiHouseYear.textContent = `${p3.year || 2024}년`;

    const acqObj = p3.acquisitionTax || {};
    const kpiAcqVal = document.getElementById("kpi-acq-val");
    if (kpiAcqVal) {
      kpiAcqVal.textContent = acqObj.value !== null ? formatIndicatorValue(acqObj.value, "ACQUISITION_TAX", true) : "-";
    }
    const kpiAcqYoY = document.getElementById("kpi-acq-yoy");
    if (kpiAcqYoY) {
      kpiAcqYoY.innerHTML = renderYoYText(acqObj.yoyPct);
    }
    const kpiAcqRank = document.getElementById("kpi-acq-rank");
    if (kpiAcqRank) {
      kpiAcqRank.textContent = acqObj.rank ? `전국 ${acqObj.rank}위 (상위 ${acqObj.topPct}%)` : "-";
    }

    const propObj = p3.propertyTax || {};
    const kpiPropVal = document.getElementById("kpi-prop-val");
    if (kpiPropVal) {
      kpiPropVal.textContent = propObj.value !== null ? formatIndicatorValue(propObj.value, "PROPERTY_TAX", true) : "-";
    }
    const pcAcqObj = p3.pcAcquisitionTax || {};
    const kpiPcAcqVal = document.getElementById("kpi-pc-acq-val");
    if (kpiPcAcqVal) {
      kpiPcAcqVal.textContent = pcAcqObj.value !== null ? `${Math.round(pcAcqObj.value / 10000).toLocaleString()}만원` : "-";
    }
    const kpiPropRank = document.getElementById("kpi-prop-rank");
    if (kpiPropRank) {
      kpiPropRank.textContent = propObj.rank ? `전국 ${propObj.rank}위 (상위 ${propObj.topPct}%)` : "-";
    }

    // CARD 4: [💰 4. 지자체 행정 여력]
    const kpiTaxYear = document.getElementById("kpi-tax-year");
    if (kpiTaxYear) kpiTaxYear.textContent = `${p4.year || 2024}년`;

    const taxTotObj = p4.localTaxTotal || {};
    const kpiTaxVal = document.getElementById("kpi-tax-val");
    if (kpiTaxVal) {
      kpiTaxVal.textContent = taxTotObj.value !== null ? formatIndicatorValue(taxTotObj.value, "LOCAL_TAX_TOTAL", true) : "-";
    }
    const kpiTaxYoY = document.getElementById("kpi-tax-yoy");
    if (kpiTaxYoY) {
      kpiTaxYoY.innerHTML = renderYoYText(taxTotObj.yoyPct);
    }
    const kpiTaxRank = document.getElementById("kpi-tax-rank");
    if (kpiTaxRank) {
      kpiTaxRank.textContent = taxTotObj.rank ? `전국 ${taxTotObj.rank}위 (상위 ${taxTotObj.topPct}%)` : "-";
    }

    const fiscObj = p4.fiscalIndependence || {};
    const kpiFiscVal = document.getElementById("kpi-fisc-val");
    if (kpiFiscVal) {
      kpiFiscVal.textContent = fiscObj.value !== null ? `${Number(fiscObj.value).toFixed(1)} %` : "-";
    }
    const pcTaxObj = p4.perCapitaTax || {};
    const kpiPcTaxVal = document.getElementById("kpi-pc-tax-val");
    if (kpiPcTaxVal) {
      kpiPcTaxVal.textContent = pcTaxObj.value !== null ? formatIndicatorValue(pcTaxObj.value, "LOCAL_TAX_TOTAL_PER_CAPITA", false) : "-";
    }
    const kpiFiscRank = document.getElementById("kpi-fisc-rank");
    if (kpiFiscRank) {
      kpiFiscRank.textContent = fiscObj.rank ? `전국 ${fiscObj.rank}위 (상위 ${fiscObj.topPct}%)` : "-";
    }

    // 4. Render Dual Interactive Tabbed Charts
    renderRegionalLeftChart();
    renderRegionalRightChart();

    // 5. Render 14-Column Multi-Tier Historical Matrix Table
    const tbody = document.getElementById("micro-dashboard-tbody");
    if (tbody && Array.isArray(table)) {
      tbody.innerHTML = "";
      table.forEach(r => {
        const isCurrent = String(r.year) === String(baselineYear);
        const tr = document.createElement("tr");
        tr.className = isCurrent
          ? "bg-sky-50/95 font-bold text-sky-950 border-l-4 border-l-sky-600"
          : "hover:bg-slate-50/90 text-slate-700 transition-colors";

        function renderTblYoY(pct) {
          if (pct === null || pct === undefined) return '<span class="text-slate-300">-</span>';
          if (pct > 0) return `<span class="text-emerald-600 font-bold">▲ +${pct}%</span>`;
          if (pct < 0) return `<span class="text-rose-600 font-bold">▼ ${pct}%</span>`;
          return '<span class="text-slate-400">0.0%</span>';
        }

        // 1. 인구 활력
        const popStr = r.population !== null ? `${Number(r.population).toLocaleString()}명` : '<span class="text-slate-300">-</span>';
        const migStr = r.netMigration !== null ? `${r.netMigration > 0 ? '+' : ''}${Number(r.netMigration).toLocaleString()}명` : '<span class="text-slate-300">-</span>';
        const fertElderStr = (r.fertilityRate !== null || r.elderlyRatio !== null)
          ? `${r.fertilityRate !== null ? r.fertilityRate : '-'}명 / ${r.elderlyRatio !== null ? r.elderlyRatio + '%' : '-'}`
          : '<span class="text-slate-300">-</span>';

        // 2. 소득 & 일자리
        const avgWageStr = r.averageWage !== null ? `${Math.round(r.averageWage / 10000).toLocaleString()}만원` : '<span class="text-slate-300">-</span>';
        const corpPayStr = r.corporatePayroll !== null ? formatIndicatorValue(r.corporatePayroll, "CORPORATE_TOTAL_PAYROLL", true) : '<span class="text-slate-300">-</span>';
        const pcIncStr = r.pcIncomeTax !== null ? `${Math.round(r.pcIncomeTax / 10000).toLocaleString()}만원` : '<span class="text-slate-300">-</span>';
        const bizStr = r.businesses !== null ? `${Number(r.businesses).toLocaleString()}개` : '<span class="text-slate-300">-</span>';
        const bizThouStr = r.businessesPerThousand !== null ? `${r.businessesPerThousand}개` : '<span class="text-slate-300">-</span>';

        // 3. 자산 & 주거
        const acqStr = r.acquisitionTax !== null ? formatIndicatorValue(r.acquisitionTax, "ACQUISITION_TAX", true) : '<span class="text-slate-300">-</span>';
        const propStr = r.propertyTax !== null ? formatIndicatorValue(r.propertyTax, "PROPERTY_TAX", true) : '<span class="text-slate-300">-</span>';
        const pcAcqStr = r.pcAcquisitionTax !== null ? `${Math.round(r.pcAcquisitionTax / 10000).toLocaleString()}만원` : '<span class="text-slate-300">-</span>';

        // 4. 지자체 행정
        const taxTotStr = r.localTaxTotal !== null ? formatIndicatorValue(r.localTaxTotal, "LOCAL_TAX_TOTAL", true) : '<span class="text-slate-300">-</span>';
        const fiscStr = r.fiscalIndependence !== null ? `${Number(r.fiscalIndependence).toFixed(1)}%` : '<span class="text-slate-300">-</span>';

        tr.innerHTML = `
          <td class="py-2.5 px-3 text-center whitespace-nowrap border-r border-sky-100 ${isCurrent ? 'text-sky-700 font-bold' : ''}">${r.year}년 ${isCurrent ? '★' : ''}</td>
          <!-- Pillar 1 -->
          <td class="py-2 px-2.5 text-right whitespace-nowrap">${popStr}</td>
          <td class="py-2 px-2 text-center whitespace-nowrap">${renderTblYoY(r.populationYoYPct)}</td>
          <td class="py-2 px-2.5 text-right whitespace-nowrap font-medium ${r.netMigration < 0 ? 'text-rose-700' : 'text-teal-700'}">${migStr}</td>
          <td class="py-2 px-2 text-center whitespace-nowrap text-[11px] border-r border-purple-100">${fertElderStr}</td>
          <!-- Pillar 2 -->
          <td class="py-2 px-2.5 text-right whitespace-nowrap font-bold text-emerald-900">${avgWageStr}</td>
          <td class="py-2 px-2.5 text-right whitespace-nowrap font-medium text-sky-800">${corpPayStr}</td>
          <td class="py-2 px-2.5 text-right whitespace-nowrap text-emerald-800">${pcIncStr}</td>
          <td class="py-2 px-2.5 text-right whitespace-nowrap">${bizStr}</td>
          <td class="py-2 px-2 text-right whitespace-nowrap border-r border-emerald-100">${bizThouStr}</td>
          <!-- Pillar 3 -->
          <td class="py-2 px-2.5 text-right whitespace-nowrap text-amber-900">${acqStr}</td>
          <td class="py-2 px-2.5 text-right whitespace-nowrap">${propStr}</td>
          <td class="py-2 px-2.5 text-right whitespace-nowrap border-r border-amber-100">${pcAcqStr}</td>
          <!-- Pillar 4 -->
          <td class="py-2 px-2.5 text-right whitespace-nowrap font-bold text-sky-900">${taxTotStr}</td>
          <td class="py-2 px-2 text-center whitespace-nowrap">${renderTblYoY(r.taxYoYPct)}</td>
          <td class="py-2 px-2.5 text-right whitespace-nowrap font-semibold text-slate-800">${fiscStr}</td>
        `;
        tbody.appendChild(tr);
      });
    }
  }

  // Render Chart 1: Left Chart (Demographics vs Income/Jobs)
  function renderRegionalLeftChart() {
    if (!currentRegionalDashData || !currentRegionalDashData.charts) return;
    const { charts } = currentRegionalDashData;
    const canvas = document.getElementById("dashboard-demographics-chart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (demographicsChart) demographicsChart.destroy();

    const titleEl = document.getElementById("chart-left-title");
    const labels = charts.years.map(y => `${y}년`);

    if (currentLeftChartTab === "DEMO") {
      if (titleEl) titleEl.textContent = "👥 1. 인구 활력 & 순이동 시계열 (15개년)";
      demographicsChart = new Chart(ctx, {
        type: "bar",
        data: {
          labels: labels,
          datasets: [
            {
              label: "주민등록인구 (명)",
              type: "bar",
              data: charts.population,
              yAxisID: "y",
              backgroundColor: "rgba(147, 51, 234, 0.22)",
              borderColor: "#9333ea",
              borderWidth: 1.5,
              borderRadius: 4,
              order: 2,
            },
            {
              label: "순이동인구 (명)",
              type: "line",
              data: charts.netMigration,
              yAxisID: "y1",
              borderColor: "#0d9488",
              backgroundColor: "#0d9488",
              borderWidth: 2.5,
              pointRadius: 3.5,
              pointHoverRadius: 6,
              tension: 0.2,
              order: 1,
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { display: true, position: "top", labels: { boxWidth: 12, font: { size: 11, weight: "bold" } } },
            tooltip: {
              backgroundColor: "rgba(255, 255, 255, 0.96)",
              titleColor: "#0f172a",
              bodyColor: "#1e293b",
              borderColor: "rgba(147, 51, 234, 0.4)",
              borderWidth: 1.5,
              padding: 10,
              cornerRadius: 8,
              callbacks: {
                label: ctx => {
                  if (ctx.dataset.label.includes("주민등록")) {
                    return ` 주민등록인구: ${ctx.parsed.y ? Number(ctx.parsed.y).toLocaleString() + ' 명' : '미공표'}`;
                  }
                  const sign = ctx.parsed.y > 0 ? "+" : "";
                  return ` 순이동인구: ${ctx.parsed.y !== null && ctx.parsed.y !== undefined ? sign + Number(ctx.parsed.y).toLocaleString() + ' 명' : '미공표'}`;
                }
              }
            }
          },
          scales: {
            x: { grid: { color: "rgba(148, 163, 184, 0.15)" }, ticks: { color: "#64748b", font: { size: 10 } } },
            y: {
              type: "linear",
              position: "left",
              grid: { color: "rgba(148, 163, 184, 0.2)" },
              ticks: {
                color: "#7e22ce",
                callback: v => (v >= 10000 ? `${(v / 10000).toFixed(0)}만명` : v.toLocaleString())
              }
            },
            y1: {
              type: "linear",
              position: "right",
              grid: { drawOnChartArea: false },
              ticks: {
                color: "#0d9488",
                callback: v => `${v.toLocaleString()}명`
              }
            }
          }
        }
      });
    } else {
      // INCOME & JOBS
      if (titleEl) titleEl.textContent = "💼 2. 주민 평균 연봉 & 기업 총급여액 시계열 (국세청)";
      let validIndices = charts.years.map((y, idx) => (charts.averageWage && charts.averageWage[idx] !== null) ? idx : -1).filter(idx => idx !== -1);
      if (validIndices.length === 0) {
        validIndices = charts.years.map((y, idx) => (charts.pcIncomeTax && charts.pcIncomeTax[idx] !== null) ? idx : -1).filter(idx => idx !== -1);
      }
      const incLabels = validIndices.map(idx => `${charts.years[idx]}년`);

      const wageData = validIndices.map(i => charts.averageWage && charts.averageWage[i] !== null ? Math.round(charts.averageWage[i] / 10000) : null);
      const corpData = validIndices.map(i => charts.corporatePayroll && charts.corporatePayroll[i] !== null ? Math.round(charts.corporatePayroll[i] / 1e8) : null);

      demographicsChart = new Chart(ctx, {
        type: "bar",
        data: {
          labels: incLabels,
          datasets: [
            {
              label: "관내 기업 총급여액 (억원)",
              type: "bar",
              data: corpData,
              yAxisID: "y1",
              backgroundColor: "rgba(2, 132, 199, 0.25)",
              borderColor: "#0284c7",
              borderWidth: 1.5,
              borderRadius: 4,
              order: 2,
            },
            {
              label: "주민 1인당 평균 연봉 (만원)",
              type: "line",
              data: wageData,
              yAxisID: "y",
              borderColor: "#059669",
              backgroundColor: "#059669",
              borderWidth: 2.8,
              pointRadius: 4,
              pointHoverRadius: 6,
              tension: 0.2,
              order: 1,
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { display: true, position: "top", labels: { boxWidth: 12, font: { size: 11, weight: "bold" } } },
            tooltip: {
              backgroundColor: "rgba(255, 255, 255, 0.96)",
              titleColor: "#0f172a",
              bodyColor: "#1e293b",
              borderColor: "rgba(5, 150, 105, 0.5)",
              borderWidth: 1.5,
              padding: 10,
              cornerRadius: 8,
              callbacks: {
                label: ctx => {
                  if (ctx.dataset.label.includes("기업 총급여액")) {
                    const rawVal = ctx.parsed.y ? ctx.parsed.y * 1e8 : 0;
                    return ` 기업 총급여: ${formatIndicatorValue(rawVal, "CORPORATE_TOTAL_PAYROLL", true)}`;
                  }
                  return ` 주민 평균연봉: ${Number(ctx.parsed.y).toLocaleString()} 만원`;
                }
              }
            }
          },
          scales: {
            x: { grid: { color: "rgba(148, 163, 184, 0.15)" }, ticks: { color: "#64748b", font: { size: 10 } } },
            y: {
              type: "linear",
              position: "left",
              grid: { color: "rgba(148, 163, 184, 0.2)" },
              ticks: {
                color: "#059669",
                callback: v => `${v.toLocaleString()}만`
              }
            },
            y1: {
              type: "linear",
              position: "right",
              grid: { drawOnChartArea: false },
              ticks: {
                color: "#0284c7",
                callback: v => (v >= 10000 ? `${(v / 10000).toFixed(0)}조` : `${v.toLocaleString()}억`)
              }
            }
          }
        }
      });
    }
  }

  // Render Chart 2: Right Chart (Fiscal Capacity vs Housing/Assets)
  function renderRegionalRightChart() {
    if (!currentRegionalDashData || !currentRegionalDashData.charts) return;
    const { charts } = currentRegionalDashData;
    const canvas = document.getElementById("dashboard-tax-chart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (taxChart) taxChart.destroy();

    const titleEl = document.getElementById("chart-right-title");
    const validIndices = charts.years.map((y, idx) => y <= 2024 ? idx : -1).filter(idx => idx !== -1);
    const taxLabels = validIndices.map(idx => `${charts.years[idx]}년`);

    if (currentRightChartTab === "FISC") {
      if (titleEl) titleEl.textContent = "💰 4. 지자체 행정 & 세수 총액 시계열 (15개년)";
      taxChart = new Chart(ctx, {
        type: "bar",
        data: {
          labels: taxLabels,
          datasets: [
            {
              label: "지방세 총세입 (원)",
              type: "bar",
              data: validIndices.map(i => charts.localTaxTotal[i]),
              yAxisID: "y",
              backgroundColor: "rgba(2, 132, 199, 0.25)",
              borderColor: "#0284c7",
              borderWidth: 1.5,
              borderRadius: 4,
              order: 2,
            },
            {
              label: "재정자립도 (%)",
              type: "line",
              data: validIndices.map(i => charts.fiscalIndependence[i]),
              yAxisID: "y1",
              borderColor: "#d97706",
              backgroundColor: "#d97706",
              borderWidth: 2.8,
              pointRadius: 3.5,
              tension: 0.2,
              order: 1,
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { display: true, position: "top", labels: { boxWidth: 12, font: { size: 11, weight: "bold" } } },
            tooltip: {
              backgroundColor: "rgba(255, 255, 255, 0.96)",
              titleColor: "#0f172a",
              bodyColor: "#1e293b",
              borderColor: "rgba(2, 132, 199, 0.5)",
              borderWidth: 1.5,
              padding: 10,
              cornerRadius: 8,
              callbacks: {
                label: ctx => {
                  if (ctx.dataset.label.includes("지방세")) {
                    return ` 지방세 총액: ${formatIndicatorValue(ctx.parsed.y, "LOCAL_TAX_TOTAL", true)}`;
                  }
                  return ` 재정자립도: ${ctx.parsed.y !== null ? ctx.parsed.y.toFixed(1) + '%' : '-'}`;
                }
              }
            }
          },
          scales: {
            x: { grid: { color: "rgba(148, 163, 184, 0.15)" }, ticks: { color: "#64748b", font: { size: 10 } } },
            y: {
              type: "linear",
              position: "left",
              grid: { color: "rgba(148, 163, 184, 0.2)" },
              ticks: {
                color: "#0284c7",
                callback: v => {
                  if (v >= 1e12) return `${(v / 1e12).toFixed(1)}조원`;
                  if (v >= 1e8) return `${(v / 1e8).toFixed(0)}억원`;
                  return v.toLocaleString();
                }
              }
            },
            y1: {
              type: "linear",
              position: "right",
              grid: { drawOnChartArea: false },
              ticks: {
                color: "#d97706",
                callback: v => `${v.toFixed(0)}%`
              }
            }
          }
        }
      });
    } else {
      // HOUSING & ASSETS
      if (titleEl) titleEl.textContent = "🏠 3. 취득세(매매) & 재산세(보유) 시계열 (15개년)";
      taxChart = new Chart(ctx, {
        type: "line",
        data: {
          labels: taxLabels,
          datasets: [
            {
              label: "취득세 (매매 활력)",
              data: validIndices.map(i => charts.acquisitionTax[i]),
              borderColor: "#f59e0b",
              backgroundColor: "rgba(245, 158, 11, 0.12)",
              fill: true,
              borderWidth: 2.2,
              pointRadius: 3.5,
              tension: 0.2,
            },
            {
              label: "재산세 (보유 자산가치)",
              data: validIndices.map(i => charts.propertyTax[i]),
              borderColor: "#6366f1",
              backgroundColor: "rgba(99, 102, 241, 0.12)",
              fill: true,
              borderWidth: 2.2,
              pointRadius: 3.5,
              tension: 0.2,
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { display: true, position: "top", labels: { boxWidth: 12, font: { size: 11, weight: "bold" } } },
            tooltip: {
              backgroundColor: "rgba(255, 255, 255, 0.96)",
              titleColor: "#0f172a",
              bodyColor: "#1e293b",
              borderColor: "rgba(245, 158, 11, 0.5)",
              borderWidth: 1.5,
              padding: 10,
              cornerRadius: 8,
              callbacks: {
                label: ctx => ` ${ctx.dataset.label}: ${formatIndicatorValue(ctx.parsed.y, "LOCAL_TAX_TOTAL", true)}`
              }
            }
          },
          scales: {
            x: { grid: { color: "rgba(148, 163, 184, 0.15)" }, ticks: { color: "#64748b", font: { size: 10 } } },
            y: {
              grid: { color: "rgba(148, 163, 184, 0.2)" },
              ticks: {
                color: "#64748b",
                callback: v => {
                  if (v >= 1e12) return `${(v / 1e12).toFixed(1)}조원`;
                  if (v >= 1e8) return `${(v / 1e8).toFixed(0)}억원`;
                  return v.toLocaleString();
                }
              }
            }
          }
        }
      });
    }
  }

  // Update Selected District Hero Banner across Macro and Micro views
  function updateHeroBanner(currentRegion, year, indKey) {
    const meta = getIndicatorMeta(indKey);
    const tabRegionTag = document.getElementById("tab-region-tag");
    const quickSelectedName = document.getElementById("quick-selected-name");
    const btnGotoMicro = document.getElementById("btn-goto-micro");
    const btnClearTableSelection = document.getElementById("btn-clear-table-selection");
    const btnResetRegionSelection = document.getElementById("btn-reset-region-selection");

    if (!currentRegion) {
      if (tabRegionTag) tabRegionTag.textContent = "전국 미선택";
      if (quickSelectedName) {
        quickSelectedName.textContent = "전국 전체 (미선택)";
        quickSelectedName.className = "text-slate-600 font-bold";
      }
      if (btnClearTableSelection) btnClearTableSelection.classList.add("hidden");
      if (btnResetRegionSelection) btnResetRegionSelection.classList.add("hidden");
      if (btnGotoMicro) {
        btnGotoMicro.disabled = true;
        btnGotoMicro.classList.add("opacity-60", "cursor-not-allowed");
      }
      if (heroProvinceTag) heroProvinceTag.textContent = "대한민국";
      if (heroRegionName) heroRegionName.textContent = "선택된 지역 없음";
      if (heroRegionKey) heroRegionKey.textContent = "";
      if (heroNationalRank) heroNationalRank.textContent = "-";
      if (heroYear) heroYear.textContent = year;
      if (heroDesc) heroDesc.textContent = `${year}년 기준 전국 지자체 분포 및 통계를 탐색 중입니다.`;
      return;
    }

    // Region is selected:
    if (tabRegionTag) tabRegionTag.textContent = currentRegion.name;
    if (quickSelectedName) {
      quickSelectedName.textContent = currentRegion.name;
      quickSelectedName.className = "text-sky-800 font-bold";
    }
    if (btnClearTableSelection) btnClearTableSelection.classList.remove("hidden");
    if (btnResetRegionSelection) btnResetRegionSelection.classList.remove("hidden");
    if (btnGotoMicro) {
      btnGotoMicro.disabled = false;
      btnGotoMicro.classList.remove("opacity-60", "cursor-not-allowed");
    }

    if (heroProvinceTag) heroProvinceTag.textContent = currentRegion.provinceName || "대한민국";
    if (heroRegionName) heroRegionName.textContent = currentRegion.name;
    if (heroRegionKey) heroRegionKey.textContent = `(${currentRegion.regionKey})`;
    if (heroYear) heroYear.textContent = year;

    const microProv = document.getElementById("hero-province-tag-micro");
    if (microProv) microProv.textContent = currentRegion.provinceName || "대한민국";
    const microTitle = document.getElementById("micro-region-title");
    if (microTitle) microTitle.textContent = currentRegion.name;
    const microCode = document.getElementById("micro-region-code");
    if (microCode) microCode.textContent = `(${currentRegion.regionKey})`;
    const microTblName = document.getElementById("micro-table-region-name");
    if (microTblName) microTblName.textContent = currentRegion.name;

    const found = allRankings.find(r => r.regionKey === currentRegion.regionKey);
    const microRankPill = document.getElementById("hero-national-rank-micro");

    if (found && found.rank) {
      if (heroNationalRank) heroNationalRank.textContent = `${found.rank}위`;
      const valStr = formatIndicatorValue(found.value, indKey);
      const totalCount = allRankings.filter(r => r.value !== null).length;
      const topPct = ((found.rank / totalCount) * 100).toFixed(1);

      if (microRankPill) microRankPill.textContent = `전국 ${found.rank}위 (상위 ${topPct}%)`;
      if (heroDesc) heroDesc.innerHTML = `${year}년 기준 전국 ${totalCount}개 기초자치단체 중 <strong>${meta.name} 전국 ${found.rank}위</strong> (상위 ${topPct}%, ${valStr})`;
    } else {
      if (heroNationalRank) heroNationalRank.textContent = "-";
      if (microRankPill) microRankPill.textContent = "순위 산정 중";
      if (heroDesc) heroDesc.textContent = `${year}년 해당 지표 데이터 분석 준비 중`;
    }
  }

  // Update Macro Summary Widget in Sidebar and Header Mini-chip
  function updateMacroSummary(rankings, currentRegion, year, indKey) {
    if (macroStatYearPill) macroStatYearPill.textContent = `${year}년`;
    const meta = getIndicatorMeta(indKey);
    if (headerMacroIndicatorName) {
      headerMacroIndicatorName.textContent = meta.name + (meta.unit ? ` (${meta.unit})` : "");
    }

    const valid = (rankings || []).filter(r => r.value !== null && !isNaN(Number(r.value)));
    if (valid.length > 0) {
      const sum = valid.reduce((acc, cur) => acc + Number(cur.value), 0);
      const avg = sum / valid.length;
      if (macroStatAvg) macroStatAvg.textContent = formatIndicatorValue(avg, indKey, true);

      const sorted = [...valid].sort((a, b) => Number(a.value) - Number(b.value));
      const mid = Math.floor(sorted.length / 2);
      const medianVal = sorted.length % 2 !== 0 ? Number(sorted[mid].value) : (Number(sorted[mid - 1].value) + Number(sorted[mid].value)) / 2;
      if (macroStatMedian) macroStatMedian.textContent = formatIndicatorValue(medianVal, indKey, true);

      const topRow = sorted[sorted.length - 1]; // highest
      const minRow = sorted[0]; // lowest
      const topName = topRow.regionName || topRow.name || topRow.regionKey;
      const minName = minRow.regionName || minRow.name || minRow.regionKey;
      if (macroStatTop) macroStatTop.textContent = `${topName} (${formatIndicatorValue(topRow.value, indKey, true)})`;
      if (macroStatMin) macroStatMin.textContent = `${minName} (${formatIndicatorValue(minRow.value, indKey, true)})`;
    } else {
      if (macroStatAvg) macroStatAvg.textContent = "-";
      if (macroStatMedian) macroStatMedian.textContent = "-";
      if (macroStatTop) macroStatTop.textContent = "-";
      if (macroStatMin) macroStatMin.textContent = "-";
    }

    // Selected region mini-chip in macro header
    if (currentRegion) {
      const regionRow = (rankings || []).find(r => r.regionKey === currentRegion.regionKey);
      if (headerMacroSelectedName) headerMacroSelectedName.textContent = currentRegion.name;
      if (headerMacroSelectedRank) headerMacroSelectedRank.textContent = (regionRow && regionRow.rank) ? `${regionRow.rank}위` : "-";
      if (headerMacroSelectedRegionChip) headerMacroSelectedRegionChip.classList.remove("hidden");
    } else {
      if (headerMacroSelectedRegionChip) headerMacroSelectedRegionChip.classList.add("hidden");
    }
  }

  // Render High-Density Ranking Table with Search & Scope
  function renderRankings() {
    const tbody = document.querySelector("#ranking-table tbody");
    const currentRegionKey = regionSelect.value;
    const selectedRegion = allRegions.find(r => r.regionKey === currentRegionKey);
    const activeProvCode = (macroProvinceSelect && macroProvinceSelect.value) || (provinceSelect && provinceSelect.value) || (selectedRegion ? selectedRegion.provinceCode : "");
    const indKey = getCurrentIndicatorKey();
    const meta = getIndicatorMeta(indKey);

    // Update table header with unit
    const valHeader = document.getElementById("ranking-val-col-title");
    if (valHeader) {
      valHeader.textContent = meta.unit ? `지표값 (${meta.unit})` : "지표값";
    }

    let displayed = [...allRankings];

    // Filter by Scope
    if (currentScope === "PROVINCE" && activeProvCode) {
      displayed = displayed.filter(r => r.regionKey.startsWith(activeProvCode));
      // Re-assign localized rank within province
      displayed.sort((a, b) => (b.value || 0) - (a.value || 0));
      displayed.forEach((r, idx) => {
        r.displayRank = r.value !== null ? idx + 1 : null;
      });
      const provObj = PROVINCE_COORDS[activeProvCode];
      rankingTitle.textContent = `${provObj ? provObj.name : (selectedRegion ? selectedRegion.provinceName : "시·도")} 내 순위표`;
    } else {
      displayed.forEach(r => {
        r.displayRank = r.rank;
      });
      rankingTitle.textContent = "전국 기초자치단체 순위표";
    }

    // Filter by ranking search keyword
    const searchVal = (rankingSearch.value || "").trim().toLowerCase();
    if (searchVal) {
      displayed = displayed.filter(r => {
        const nameMatch = (r.regionName || "").toLowerCase().includes(searchVal);
        const fullMatch = (r.fullName || "").toLowerCase().includes(searchVal);
        const provMatch = (r.provinceName || "").toLowerCase().includes(searchVal);
        const keyMatch = (r.regionKey || "").toLowerCase().includes(searchVal);
        return nameMatch || fullMatch || provMatch || keyMatch;
      });
    }

    rankingCount.textContent = `${displayed.length}개 자치단체`;

    if (displayed.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding: 2rem; color: var(--text-muted);">조건에 맞는 순위 데이터가 없습니다.</td></tr>';
      return;
    }

    tbody.innerHTML = "";
    displayed.forEach(r => {
      const tr = document.createElement("tr");
      const isSelected = r.regionKey === currentRegionKey;
      if (isSelected) {
        tr.classList.add("selected-row");
      }

      // Rank style
      let rankDisplay = r.displayRank !== null ? `${r.displayRank}` : "-";
      let rankClass = "";
      if (r.displayRank === 1) {
        rankDisplay = `🥇 1`;
        rankClass = "rank-gold";
      } else if (r.displayRank === 2) {
        rankDisplay = `🥈 2`;
        rankClass = "rank-silver";
      } else if (r.displayRank === 3) {
        rankDisplay = `🥉 3`;
        rankClass = "rank-bronze";
      }

      const provShort = r.shortProvinceName || (r.provinceName ? r.provinceName.slice(0, 2) : "-");
      const valStr = r.value !== null ? formatIndicatorValue(r.value, indKey) : "-";

      tr.innerHTML = `
        <td class="${rankClass}"><strong>${rankDisplay}</strong></td>
        <td>
          <strong>${r.regionName || r.regionKey}</strong>
          <span style="font-size: 0.72rem; color: var(--text-muted); margin-left: 0.25rem;">(${r.regionKey})</span>
        </td>
        <td><span class="prov-pill">${provShort}</span></td>
        <td style="text-align: right; font-family: var(--font-mono); font-weight: 600;">${valStr}</td>
        <td style="text-align: center;"><span class="badge ${r.status ? r.status.toLowerCase() : 'present'}">${r.status || 'PRESENT'}</span></td>
      `;

      tr.addEventListener("click", () => {
        if (regionSelect.value !== r.regionKey) {
          selectRegionByKey(r.regionKey);
        }
      });

      tr.addEventListener("dblclick", () => {
        if (regionSelect.value !== r.regionKey) {
          selectRegionByKey(r.regionKey);
        }
        switchViewMode("MICRO");
      });

      tbody.appendChild(tr);
    });

    // Auto-scroll within ranking table container only (NEVER scroll the outer window)
    const activeRow = tbody.querySelector(".selected-row");
    if (activeRow) {
      const scrollParent = tbody.closest(".overflow-y-auto");
      if (scrollParent) {
        const rowTop = activeRow.offsetTop - tbody.offsetTop;
        const targetScroll = Math.max(0, rowTop - (scrollParent.clientHeight / 2) + (activeRow.clientHeight / 2));
        scrollParent.scrollTo({ top: targetScroll, behavior: "smooth" });
      }
    }
  }

  // Select a region programmatically
  function selectRegionByKey(targetKey) {
    const target = allRegions.find(r => r.regionKey === targetKey);
    if (!target) return;

    // If province filter doesn't match, update province filter
    if (provinceSelect.value && target.provinceCode !== provinceSelect.value) {
      syncProvince("");
      renderRegionOptions();
    }

    regionSelect.value = targetKey;
    refreshData();

    // Pan map to target province
    zoomToRegion(targetKey);
  }

  // Zoom map to region or province
  function zoomToRegion(regionKey) {
    if (!mapInstance) return;
    const target = allRegions.find(r => r.regionKey === regionKey);
    if (!target || !target.provinceCode) return;

    const coords = PROVINCE_COORDS[target.provinceCode];
    if (coords) {
      mapInstance.flyTo(coords.center, coords.zoom, { duration: 1.2 });
    }
  }

  // Refresh entire dashboard data
  async function refreshData() {
    if (currentAbortController) {
      currentAbortController.abort();
    }
    currentAbortController = new AbortController();
    const signal = currentAbortController.signal;

    const regionKey = regionSelect.value;
    const indKey = getCurrentIndicatorKey();
    const meta = getIndicatorMeta(indKey);

    let year = (macroYearSelect && macroYearSelect.value) || (microYearSelect && microYearSelect.value) || (yearSelect && yearSelect.value) || "2024";
    if (meta.maxYear && parseInt(year, 10) > meta.maxYear) {
      year = String(meta.maxYear);
      syncYearState(year);
    } else if (meta.minYear && parseInt(year, 10) < meta.minYear) {
      year = String(meta.minYear);
      syncYearState(year);
    }

    // Synchronize select values across macro/micro
    syncIndicator(indKey);
    syncYear(year);
    updateYearSelectorAvailability(indKey);

    const mapYearLabel = document.getElementById("map-year-label");
    if (mapYearLabel) mapYearLabel.textContent = year;
    const kpiYearPrimary = document.getElementById("kpi-year-primary");
    if (kpiYearPrimary) kpiYearPrimary.textContent = year;
    const kpiYearSecondary = document.getElementById("kpi-year-secondary");
    if (kpiYearSecondary) kpiYearSecondary.textContent = year;
    const kpiYearPop = document.getElementById("kpi-year-pop");
    if (kpiYearPop) kpiYearPop.textContent = year;

    const currentRegion = regionKey ? allRegions.find(r => r.regionKey === regionKey) : null;

    // STEP 1 [최우선 실행]: 거시 랭킹, 통계 요약, 순위표, 히트맵 지도를 먼저 즉시 렌더링!
    try {
      const rankRes = await fetch(`/api/rankings?indicatorId=${encodeURIComponent(indKey)}&year=${encodeURIComponent(year)}`, { signal });
      const rankJson = await rankRes.json();
      allRankings = rankJson.rankings || [];
      const actualYear = rankJson.year || year;
      if (String(actualYear) !== String(year)) {
        year = String(actualYear);
        syncYearState(actualYear);
      }

      // Update UI
      updateHeroBanner(currentRegion, year, indKey);
      updateMacroSummary(allRankings, currentRegion, year, indKey);
      renderRankings();

      // Update Leaflet Map Layer (히트맵 렌더링)
      const boundaryUrl = rankJson.boundaryUrl || `/static/geo/boundaries/${year}.geojson`;
      await updateMapLayer(boundaryUrl, allRankings, indKey);

      if (liveStatus) {
        liveStatus.textContent = `${year}년 전국 데이터 갱신 완료`;
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("Macro data refresh failed:", err);
      }
    }

    // STEP 2: 지역 원스톱 종합 대시보드 (지자체가 선택된 경우 단일 고속 쿼리 실행)
    if (regionKey && currentRegion) {
      try {
        const dashRes = await fetch(`/api/regional-dashboard?regionId=${encodeURIComponent(regionKey)}&year=${encodeURIComponent(year)}`, { signal });
        const dashData = await dashRes.json();
        if (!dashData.error) {
          renderRegionalDashboard(dashData);
        }
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Regional dashboard refresh failed:", err);
        }
      }
    }
  }

  let legendControl = null;

  function getChoroplethTier(rank, totalCount) {
    if (!rank || !totalCount) return { color: "#e2e8f0", stroke: "#cbd5e1", label: "데이터 없음", tag: "없음" };
    const pct = rank / totalCount;
    if (pct <= 0.05) {
      return { color: "#7c3aed", stroke: "#6d28d9", label: "상위 5% 이내", tag: "상위 5%" };
    }
    if (pct <= 0.20) {
      return { color: "#ef4444", stroke: "#dc2626", label: "상위 5% ~ 20%", tag: "상위 20%" };
    }
    if (pct <= 0.40) {
      return { color: "#f97316", stroke: "#ea580c", label: "상위 20% ~ 40%", tag: "상위 40%" };
    }
    if (pct <= 0.60) {
      return { color: "#06b6d4", stroke: "#0891b2", label: "상위 40% ~ 60%", tag: "상위 60%" };
    }
    return { color: "#cbd5e1", stroke: "#94a3b8", label: "하위 40%", tag: "하위 40%" };
  }

  // Update Map Layer with Red-First Granular Choropleth Heatmap
  async function updateMapLayer(boundaryUrl, rankings, indKey) {
    try {
      const res = await fetch(boundaryUrl);
      if (!res.ok) {
        console.error("Failed to fetch boundary GeoJSON from:", boundaryUrl, res.status);
        return;
      }
      const geojson = await res.json();

      const rankMap = new Map(rankings.map(row => [row.featureKey, row]));
      const totalRanked = rankings.filter(r => r.value !== null).length;
      const currentSelectedKey = regionSelect.value;
      const activeInd = indKey || getCurrentIndicatorKey();

      if (geoLayer) {
        mapInstance.removeLayer(geoLayer);
      }

      function getFeatureStyle(feature) {
        const row = rankMap.get(feature.properties.featureKey);
        const hasVal = row && row.value !== null;
        const isSelected = row && row.regionKey === currentSelectedKey;
        const tier = getChoroplethTier(row ? row.rank : null, totalRanked);

        return {
          fillColor: hasVal ? tier.color : "#e2e8f0",
          weight: isSelected ? 3.5 : (row && row.rank <= 5 ? 2 : 1),
          opacity: 1,
          color: isSelected ? "#0284c7" : (row && row.rank <= 5 ? "#7c3aed" : "#ffffff"),
          fillOpacity: isSelected ? 0.95 : (hasVal ? 0.82 : 0.35),
        };
      }

      geoLayer = L.geoJSON(geojson, {
        style: getFeatureStyle,
        onEachFeature: (feature, layer) => {
          const row = rankMap.get(feature.properties.featureKey);
          const name = feature.properties.name || feature.properties.featureKey;
          const valStr = row && row.value !== null ? formatIndicatorValue(row.value, activeInd) : "데이터 없음";
          const rankStr = row && row.rank ? `${row.rank}위` : "-";
          const provName = row && row.provinceName ? row.provinceName : "";
          const tier = getChoroplethTier(row ? row.rank : null, totalRanked);
          const topPct = row && row.rank ? ((row.rank / totalRanked) * 100).toFixed(1) : null;
          const pctStr = topPct ? `(상위 ${topPct}%, ${tier.tag})` : "";

          layer.bindTooltip(`
            <div style="font-family: Inter, sans-serif; font-size: 0.85rem; padding: 2px; color: #0f172a;">
              <strong style="color: #0f172a; font-size: 0.9rem;">${provName} ${name}</strong><br>
              <span style="color: #64748b;">전국 순위:</span> <strong style="color: ${tier.color};">${rankStr}</strong> <span style="font-size: 0.75rem; color: #4f46e5;">${pctStr}</span><br>
              <span style="color: #0284c7;">지표값:</span> <strong style="font-family: monospace; color: #0f172a;">${valStr}</strong>
            </div>
          `);

          layer.on("mouseover", e => {
            const l = e.target;
            l.setStyle({
              weight: 3,
              color: "#0284c7",
              fillOpacity: 0.95,
            });
            if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
              l.bringToFront();
            }
          });

          layer.on("mouseout", e => {
            geoLayer.resetStyle(e.target);
          });

          layer.on("click", () => {
            if (row && row.regionKey) {
              selectRegionByKey(row.regionKey);
            }
          });
        },
      }).addTo(mapInstance);

      // Add or update Neon Thermal 5-tier Leaflet Legend
      if (legendControl) {
        mapInstance.removeControl(legendControl);
      }

      legendControl = L.control({ position: "bottomright" });
      legendControl.onAdd = function () {
        const div = L.DomUtil.create("div", "map-legend");
        div.innerHTML = `
          <strong style="display:block; margin-bottom: 6px; color: #0f172a; font-size: 0.8rem;">전국 순위 5분위 히트맵</strong>
          <div class="legend-grid" style="display: flex; flex-direction: column; gap: 4px;">
            <div class="legend-item"><i style="background: #7c3aed;"></i>상위 5% 이내 (특급)</div>
            <div class="legend-item"><i style="background: #ef4444;"></i>상위 5% ~ 20% (우수)</div>
            <div class="legend-item"><i style="background: #f97316;"></i>상위 20% ~ 40% (중상위)</div>
            <div class="legend-item"><i style="background: #06b6d4;"></i>상위 40% ~ 60% (중위권)</div>
            <div class="legend-item"><i style="background: #cbd5e1;"></i>하위 40% (평균 이하)</div>
          </div>
        `;
        return div;
      };
      legendControl.addTo(mapInstance);

    } catch (err) {
      console.warn("Boundary layer update warning:", err);
    }
  }

  // Event Listeners
  function onProvinceChange(newVal) {
    syncProvince(newVal);
    renderRegionOptions();

    // Automatically synchronize Scope with Province Filter
    if (newVal && PROVINCE_COORDS[newVal]) {
      currentScope = "PROVINCE";
      if (btnScopeProv) btnScopeProv.classList.add("active");
      if (btnScopeAll) btnScopeAll.classList.remove("active");
      mapInstance.flyTo(PROVINCE_COORDS[newVal].center, PROVINCE_COORDS[newVal].zoom, { duration: 1 });
    } else {
      currentScope = "ALL";
      if (btnScopeAll) btnScopeAll.classList.add("active");
      if (btnScopeProv) btnScopeProv.classList.remove("active");
      mapInstance.flyTo(NATIONAL_VIEW.center, NATIONAL_VIEW.zoom, { duration: 1 });
    }
    refreshData();
  }

  // Clear region selection and return to pure nationwide view
  function clearRegionSelection() {
    regionSelect.value = "";
    currentScope = "ALL";
    if (btnScopeAll) btnScopeAll.classList.add("active");
    if (btnScopeProv) btnScopeProv.classList.remove("active");

    syncProvince("");
    renderRegionOptions();

    if (tabRegionTag) tabRegionTag.textContent = "전국 미선택";
    if (headerMacroSelectedRegionChip) headerMacroSelectedRegionChip.classList.add("hidden");
    if (btnResetRegionSelection) btnResetRegionSelection.classList.add("hidden");
    if (quickSelectedName) {
      quickSelectedName.textContent = "전국 전체 (미선택)";
      quickSelectedName.className = "text-slate-600 font-bold";
    }
    if (btnClearTableSelection) btnClearTableSelection.classList.add("hidden");
    if (btnGotoMicro) {
      btnGotoMicro.disabled = true;
      btnGotoMicro.classList.add("opacity-60", "cursor-not-allowed");
    }

    // Unselect rows in table
    const tbody = document.querySelector("#ranking-table tbody");
    if (tbody) {
      tbody.querySelectorAll("tr").forEach(tr => tr.classList.remove("selected-row"));
    }

    refreshData();
    mapInstance.flyTo(NATIONAL_VIEW.center, NATIONAL_VIEW.zoom, { duration: 1 });
  }

  if (btnResetRegionSelection) {
    btnResetRegionSelection.addEventListener("click", clearRegionSelection);
  }
  if (btnClearTableSelection) {
    btnClearTableSelection.addEventListener("click", clearRegionSelection);
  }

  if (provinceSelect) {
    provinceSelect.addEventListener("change", () => onProvinceChange(provinceSelect.value));
  }
  if (macroProvinceSelect) {
    macroProvinceSelect.addEventListener("change", () => onProvinceChange(macroProvinceSelect.value));
  }

  regionSearch.addEventListener("input", () => {
    renderRegionOptions();
  });

  regionSearchClear.addEventListener("click", () => {
    regionSearch.value = "";
    renderRegionOptions();
    regionSearch.focus();
  });

  regionSelect.addEventListener("change", () => {
    refreshData();
    zoomToRegion(regionSelect.value);
  });

  // Year sync helper between select and timeline pills
  function syncYearState(selectedYear) {
    syncYear(String(selectedYear));
    document.querySelectorAll(".year-pill").forEach(btn => {
      if (btn.getAttribute("data-year") === String(selectedYear)) {
        btn.className = "year-pill px-2.5 py-1 rounded text-label-sm font-label-sm bg-gradient-to-r from-sky-600 to-cyan-600 text-white font-bold shadow-[0_3px_10px_rgba(2,132,199,0.35)] transition-all";
      } else {
        btn.className = "year-pill px-2 py-1 rounded text-label-sm font-label-sm text-slate-600 hover:text-sky-800 hover:bg-sky-100/60 font-medium transition-all";
      }
    });
  }

  if (yearSelect) {
    yearSelect.addEventListener("change", () => {
      syncYearState(yearSelect.value);
      refreshData();
    });
  }

  if (macroYearSelect) {
    macroYearSelect.addEventListener("change", () => {
      syncYearState(macroYearSelect.value);
      refreshData();
    });
  }

  document.querySelectorAll(".year-pill").forEach(btn => {
    btn.addEventListener("click", () => {
      const y = btn.getAttribute("data-year");
      if (y) {
        syncYearState(y);
        refreshData();
      }
    });
  });

  function onIndicatorChange(newVal) {
    syncIndicator(newVal);
    const meta = getIndicatorMeta(newVal);
    const curYear = parseInt((macroYearSelect && macroYearSelect.value) || (microYearSelect && microYearSelect.value) || "2024", 10);
    if (meta.maxYear && curYear > meta.maxYear) {
      syncYearState(meta.maxYear);
    } else if (meta.minYear && curYear < meta.minYear) {
      syncYearState(meta.minYear);
    }
    updateYearSelectorAvailability(newVal);
    refreshData();
  }

  if (indicatorSelect) {
    indicatorSelect.addEventListener("change", () => onIndicatorChange(indicatorSelect.value));
  }
  if (macroIndicatorSelect) {
    macroIndicatorSelect.addEventListener("change", () => onIndicatorChange(macroIndicatorSelect.value));
  }

  if (microYearSelect) {
    microYearSelect.addEventListener("change", () => {
      syncYearState(microYearSelect.value);
      refreshData();
    });
  }

  // View Mode Switcher: Macro (Map & Rankings), Micro (Deep-Dive Regional Dashboard), Compare (1:1 Match)
  const tabMacro = document.getElementById("tab-macro");
  const tabMicro = document.getElementById("tab-micro");
  const tabCompare = document.getElementById("tab-compare");
  const viewMacro = document.getElementById("view-macro");
  const viewMicro = document.getElementById("view-micro");
  const viewCompare = document.getElementById("view-compare");
  const headerCompareSummary = document.getElementById("header-compare-summary");
  const btnGotoMicro = document.getElementById("btn-goto-micro");
  const btnGotoMacro = document.getElementById("btn-goto-macro");
  const btnCompareBackToExplorer = document.getElementById("btn-compare-back-to-explorer");

  function switchViewMode(mode) {
    currentViewMode = mode;

    const inactiveClass = "mode-tab flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-700 hover:text-sky-800 transition-all";
    const activeSkyClass = "mode-tab active flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all bg-gradient-to-r from-sky-600 to-cyan-600 text-white shadow-sm";
    const activeAmberClass = "mode-tab active flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-white shadow-sm";

    if (tabMacro) tabMacro.className = (mode === "MACRO") ? activeSkyClass : inactiveClass;
    if (tabMicro) tabMicro.className = (mode === "MICRO") ? activeSkyClass : inactiveClass;
    if (tabCompare) tabCompare.className = (mode === "COMPARE") ? activeAmberClass : inactiveClass;

    // Toggle main view containers
    if (viewMacro) viewMacro.classList.toggle("hidden", mode !== "MACRO");
    if (viewMicro) viewMicro.classList.toggle("hidden", mode !== "MICRO");
    if (viewCompare) viewCompare.classList.toggle("hidden", mode !== "COMPARE");

    // Toggle subheader contextual summaries
    if (headerMacroSummary) headerMacroSummary.classList.toggle("hidden", mode !== "MACRO");
    if (headerMicroSummary) headerMicroSummary.classList.toggle("hidden", mode !== "MICRO");
    if (headerCompareSummary) headerCompareSummary.classList.toggle("hidden", mode !== "COMPARE");

    if (mode === "MACRO") {
      // Sidebar context switch
      if (sidebarMacro) sidebarMacro.classList.remove("hidden");
      if (sidebarMicro) sidebarMicro.classList.add("hidden");
      if (sidebarModeBadge) {
        sidebarModeBadge.textContent = "전국 거시 비교";
        sidebarModeBadge.className = "px-2 py-0.5 text-[10px] font-bold rounded-full bg-sky-100 text-sky-700 border border-sky-200 whitespace-nowrap";
      }
      if (btnSidebarModeText) btnSidebarModeText.textContent = "지역별 심층 진단 보기";
      if (btnSidebarModeIcon) btnSidebarModeIcon.textContent = "analytics";

      setTimeout(() => {
        if (mapInstance) mapInstance.invalidateSize();
      }, 80);
    } else if (mode === "MICRO") {
      // Sidebar context switch
      if (sidebarMacro) sidebarMacro.classList.add("hidden");
      if (sidebarMicro) sidebarMicro.classList.remove("hidden");
      if (sidebarModeBadge) {
        sidebarModeBadge.textContent = "지역별 심층 진단";
        sidebarModeBadge.className = "px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-200 whitespace-nowrap";
      }
      if (btnSidebarModeText) btnSidebarModeText.textContent = "전국 거시 비교 보기";
      if (btnSidebarModeIcon) btnSidebarModeIcon.textContent = "public";

      setTimeout(() => {
        if (demographicsChart) demographicsChart.resize();
        if (taxChart) taxChart.resize();
      }, 80);
    } else if (mode === "COMPARE") {
      // Sidebar context switch
      if (sidebarMacro) sidebarMacro.classList.add("hidden");
      if (sidebarMicro) sidebarMicro.classList.add("hidden");
      if (sidebarModeBadge) {
        sidebarModeBadge.textContent = "1:1 맞대결 비교";
        sidebarModeBadge.className = "px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-200 whitespace-nowrap";
      }

      if (window.CompareManager) {
        window.CompareManager.activate();
      }
    }
  }

  // Backward compatibility alias
  function setTopMode(mode) {
    if (mode === "COMPARE") {
      switchViewMode("COMPARE");
    } else {
      switchViewMode(currentViewMode === "COMPARE" ? "MACRO" : (currentViewMode || "MACRO"));
    }
  }

  if (tabMacro) tabMacro.addEventListener("click", () => switchViewMode("MACRO"));
  if (tabMicro) tabMicro.addEventListener("click", () => switchViewMode("MICRO"));
  if (tabCompare) tabCompare.addEventListener("click", () => switchViewMode("COMPARE"));
  if (btnGotoMicro) btnGotoMicro.addEventListener("click", () => switchViewMode("MICRO"));
  if (btnGotoMacro) btnGotoMacro.addEventListener("click", () => switchViewMode("MACRO"));
  if (btnCompareBackToExplorer) btnCompareBackToExplorer.addEventListener("click", () => switchViewMode("MACRO"));
  if (headerMacroSelectedRegionChip) {
    headerMacroSelectedRegionChip.addEventListener("click", () => switchViewMode("MICRO"));
  }
  if (btnSidebarModeToggle) {
    btnSidebarModeToggle.addEventListener("click", () => {
      switchViewMode(currentViewMode === "MACRO" ? "MICRO" : "MACRO");
    });
  }

  // Scope toggle
  btnScopeAll.addEventListener("click", () => {
    currentScope = "ALL";
    btnScopeAll.classList.add("active");
    btnScopeProv.classList.remove("active");
    renderRankings();
  });

  btnScopeProv.addEventListener("click", () => {
    currentScope = "PROVINCE";
    btnScopeProv.classList.add("active");
    btnScopeAll.classList.remove("active");
    renderRankings();
  });

  // Ranking search
  rankingSearch.addEventListener("input", renderRankings);

  // Quick Compare Chips
  document.querySelectorAll(".chip-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-key");
      if (key) {
        selectRegionByKey(key);
      }
    });
  });

  // Map action buttons
  btnResetMap.addEventListener("click", () => {
    mapInstance.flyTo(NATIONAL_VIEW.center, NATIONAL_VIEW.zoom, { duration: 1 });
  });

  if (btnZoomRegion) {
    btnZoomRegion.addEventListener("click", () => {
      zoomToRegion(regionSelect.value);
    });
  }

  // Regional 4-Pillar Chart Tabs Event Listeners
  const btnChartTabDemo = document.getElementById("btn-chart-tab-demo");
  const btnChartTabIncome = document.getElementById("btn-chart-tab-income");
  const btnChartTabFisc = document.getElementById("btn-chart-tab-fisc");
  const btnChartTabHouse = document.getElementById("btn-chart-tab-house");

  if (btnChartTabDemo && btnChartTabIncome) {
    btnChartTabDemo.addEventListener("click", () => {
      currentLeftChartTab = "DEMO";
      btnChartTabDemo.className = "px-2.5 py-1 rounded-md font-bold text-purple-900 bg-white shadow-xs transition-all";
      btnChartTabIncome.className = "px-2.5 py-1 rounded-md font-medium text-purple-700 hover:text-purple-900 transition-all";
      renderRegionalLeftChart();
    });
    btnChartTabIncome.addEventListener("click", () => {
      currentLeftChartTab = "INCOME";
      btnChartTabIncome.className = "px-2.5 py-1 rounded-md font-bold text-purple-900 bg-white shadow-xs transition-all";
      btnChartTabDemo.className = "px-2.5 py-1 rounded-md font-medium text-purple-700 hover:text-purple-900 transition-all";
      renderRegionalLeftChart();
    });
  }

  if (btnChartTabFisc && btnChartTabHouse) {
    btnChartTabFisc.addEventListener("click", () => {
      currentRightChartTab = "FISC";
      btnChartTabFisc.className = "px-2.5 py-1 rounded-md font-bold text-sky-900 bg-white shadow-xs transition-all";
      btnChartTabHouse.className = "px-2.5 py-1 rounded-md font-medium text-sky-700 hover:text-sky-900 transition-all";
      renderRegionalRightChart();
    });
    btnChartTabHouse.addEventListener("click", () => {
      currentRightChartTab = "HOUSE";
      btnChartTabHouse.className = "px-2.5 py-1 rounded-md font-bold text-sky-900 bg-white shadow-xs transition-all";
      btnChartTabFisc.className = "px-2.5 py-1 rounded-md font-medium text-sky-700 hover:text-sky-900 transition-all";
      renderRegionalRightChart();
    });
  }

  // Initialize
  initMap();
  loadRegions().then(() => {
    refreshData().then(() => {
      window.scrollTo(0, 0);
    });
  });
});
