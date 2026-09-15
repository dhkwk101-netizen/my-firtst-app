/**
 * compare_manager.js
 * 지자체 1:1 및 다중 비교 모드 (Compare Mode) 전용 독립 모듈
 * 전국 230개 지자체 중 2개 지자체(기본: 서울 강남구 vs 경기 화성시)를 선택하여
 * 5대 종합 역량 레이더 차트, 15개년 오버레이 시계열 차트, 17개 지표 맞대결 스펙 테이블을 렌더링합니다.
 */

(function () {
  "use strict";

  // State
  let allRegions = [];
  let regionA = "KR_11680"; // 서울특별시 강남구 (기본값)
  let regionB = "KR_41590"; // 경기도 화성시 (기본값)
  let timeseriesIndicator = "LOCAL_TAX_TOTAL_PER_CAPITA"; // 1인당 지방세 (기본값)

  let radarChartInstance = null;
  let timeseriesChartInstance = null;

  let cachedDashboardA = null;
  let cachedDashboardB = null;
  let cachedSeriesData = null;

  // 17 Indicators Definitions across 4 Pillars
  const COMPARE_INDICATORS = [
    // 1. 🏛️ 지방세 세입 & 부유도
    {
      category: "TAX",
      categoryLabel: "🏛️ 지방세 세입 & 부유도",
      key: "LOCAL_TAX_TOTAL_PER_CAPITA",
      name: "1인당 지방세 세입",
      unit: "원",
      lowerIsBetter: false,
      format: (v) => formatWon(v),
      extract: (d) => d?.kpis?.pillar4_fiscalCapacity?.perCapitaTax || d?.kpis?.perCapitaTax,
    },
    {
      category: "TAX",
      categoryLabel: "🏛️ 지방세 세입 & 부유도",
      key: "ACQUISITION_TAX",
      name: "취득세 세입액 (부동산 매매)",
      unit: "천원",
      lowerIsBetter: false,
      format: (v) => formatThousandWon(v),
      extract: (d) => d?.kpis?.pillar3_housingAssets?.acquisitionTax,
    },
    {
      category: "TAX",
      categoryLabel: "🏛️ 지방세 세입 & 부유도",
      key: "PROPERTY_TAX",
      name: "재산세 세입액 (보유 자산가치)",
      unit: "원",
      lowerIsBetter: false,
      format: (v) => formatWon(v),
      extract: (d) => d?.kpis?.pillar3_housingAssets?.propertyTax,
    },
    {
      category: "TAX",
      categoryLabel: "🏛️ 지방세 세입 & 부유도",
      key: "LOCAL_INCOME_TAX",
      name: "지방소득세 세입액",
      unit: "원",
      lowerIsBetter: false,
      format: (v) => formatWon(v),
      extract: (d) => {
        const row = d?.table?.[0];
        return { value: row?.localIncomeTax, year: row?.year };
      },
    },
    // 2. 💰 지자체 재정 자립도
    {
      category: "FISCAL",
      categoryLabel: "💰 지자체 재정",
      key: "FISCAL_INDEPENDENCE",
      name: "재정자립도",
      unit: "%",
      lowerIsBetter: false,
      format: (v) => (v !== null && v !== undefined ? `${Number(v).toFixed(1)}%` : "-"),
      extract: (d) => d?.kpis?.pillar4_fiscalCapacity?.fiscalIndependence || d?.kpis?.fiscalIndependence,
    },
    {
      category: "FISCAL",
      categoryLabel: "💰 지자체 재정",
      key: "LOCAL_TAX_TOTAL",
      name: "지방세 총 세입액 (자체세수)",
      unit: "원",
      lowerIsBetter: false,
      format: (v) => formatWon(v),
      extract: (d) => d?.kpis?.pillar4_fiscalCapacity?.localTaxTotal || d?.kpis?.localTaxTotal,
    },
    // 3. 👥 인구 동향 & 소멸 지표
    {
      category: "DEMOGRAPHY",
      categoryLabel: "👥 인구 동향 & 소멸 지표",
      key: "POPULATION",
      name: "주민등록인구",
      unit: "명",
      lowerIsBetter: false,
      format: (v) => (v !== null && v !== undefined ? `${Number(v).toLocaleString()}명` : "-"),
      extract: (d) => d?.kpis?.pillar1_demography?.population || d?.kpis?.population,
    },
    {
      category: "DEMOGRAPHY",
      categoryLabel: "👥 인구 동향 & 소멸 지표",
      key: "NET_MIGRATION",
      name: "연간 순이동인구 (전입-전출)",
      unit: "명",
      lowerIsBetter: false,
      format: (v) => (v !== null && v !== undefined ? `${v > 0 ? "+" : ""}${Number(v).toLocaleString()}명` : "-"),
      extract: (d) => d?.kpis?.pillar1_demography?.netMigration || d?.kpis?.netMigration,
    },
    {
      category: "DEMOGRAPHY",
      categoryLabel: "👥 인구 동향 & 소멸 지표",
      key: "NET_MIGRATION_RATE",
      name: "순이동률",
      unit: "%",
      lowerIsBetter: false,
      format: (v) => (v !== null && v !== undefined ? `${v > 0 ? "+" : ""}${Number(v).toFixed(2)}%` : "-"),
      extract: (d) => ({ value: d?.kpis?.pillar1_demography?.netMigration?.rate, year: d?.kpis?.pillar1_demography?.year }),
    },
    {
      category: "DEMOGRAPHY",
      categoryLabel: "👥 인구 동향 & 소멸 지표",
      key: "TOTAL_FERTILITY_RATE",
      name: "합계출산율",
      unit: "명",
      lowerIsBetter: false,
      format: (v) => (v !== null && v !== undefined ? `${Number(v).toFixed(3)}명` : "-"),
      extract: (d) => d?.kpis?.pillar1_demography?.fertilityRate,
    },
    {
      category: "DEMOGRAPHY",
      categoryLabel: "👥 인구 동향 & 소멸 지표",
      key: "ELDERLY_POPULATION_RATIO",
      name: "고령인구 비율",
      unit: "%",
      lowerIsBetter: true, // 낮을수록 젊고 역동적인 인구구조
      format: (v) => (v !== null && v !== undefined ? `${Number(v).toFixed(1)}%` : "-"),
      extract: (d) => d?.kpis?.pillar1_demography?.elderlyRatio,
    },
    // 4. 💼 소득 & 일자리 (국세청 연말정산 & 통계청)
    {
      category: "ECONOMY",
      categoryLabel: "💼 소득 & 일자리",
      key: "AVERAGE_WAGE",
      name: "주민 1인당 평균 연봉 (실제 소득)",
      unit: "원",
      lowerIsBetter: false,
      format: (v) => formatWon(v),
      extract: (d) => d?.kpis?.pillar2_incomeJobs?.averageWage || d?.kpis?.averageWage,
    },
    {
      category: "ECONOMY",
      categoryLabel: "💼 소득 & 일자리",
      key: "CORPORATE_TOTAL_PAYROLL",
      name: "관내 기업 총급여액 (일자리 규모)",
      unit: "원",
      lowerIsBetter: false,
      format: (v) => formatWon(v),
      extract: (d) => d?.kpis?.pillar2_incomeJobs?.corporatePayroll || d?.kpis?.corporatePayroll,
    },
    {
      category: "ECONOMY",
      categoryLabel: "💼 소득 & 일자리",
      key: "WITHHOLDING_TAX",
      name: "원천징수세액 (국세 기여도)",
      unit: "원",
      lowerIsBetter: false,
      format: (v) => formatWon(v),
      extract: (d) => d?.kpis?.pillar2_incomeJobs?.withholdingTax || d?.kpis?.withholdingTax,
    },
    {
      category: "ECONOMY",
      categoryLabel: "💼 소득 & 일자리",
      key: "WORKPLACE_WAGE_EARNERS",
      name: "사업장 근로자수 (일자리 수)",
      unit: "명",
      lowerIsBetter: false,
      format: (v) => (v !== null && v !== undefined ? `${Number(v).toLocaleString()}명` : "-"),
      extract: (d) => d?.kpis?.pillar2_incomeJobs?.workplaceWorkers,
    },
    {
      category: "ECONOMY",
      categoryLabel: "💼 소득 & 일자리",
      key: "LOCAL_INCOME_TAX_PER_CAPITA",
      name: "1인당 지방소득세",
      unit: "원",
      lowerIsBetter: false,
      format: (v) => formatWon(v),
      extract: (d) => d?.kpis?.pillar2_incomeJobs?.pcIncomeTax,
    },
    {
      category: "ECONOMY",
      categoryLabel: "💼 소득 & 일자리",
      key: "BUSINESS_ESTABLISHMENTS",
      name: "가동 사업체 수",
      unit: "개",
      lowerIsBetter: false,
      format: (v) => (v !== null && v !== undefined ? `${Number(v).toLocaleString()}개` : "-"),
      extract: (d) => d?.kpis?.pillar2_incomeJobs?.businesses || d?.kpis?.businesses,
    },
  ];

  // Helper: Format large Korean won amounts into 조, 억, 만원
  function formatWon(val) {
    if (val === null || val === undefined || isNaN(val)) return "-";
    const num = Number(val);
    const abs = Math.abs(num);
    const sign = num < 0 ? "-" : "";

    if (abs >= 1e12) {
      const jo = Math.floor(abs / 1e12);
      const eok = Math.round((abs % 1e12) / 1e8);
      return eok > 0 ? `${sign}${jo}조 ${eok.toLocaleString()}억원` : `${sign}${jo}조원`;
    }
    if (abs >= 1e8) {
      const eok = (abs / 1e8).toFixed(1);
      return `${sign}${Number(eok).toLocaleString()}억원`;
    }
    if (abs >= 1e4) {
      const man = Math.round(abs / 1e4);
      return `${sign}${man.toLocaleString()}만원`;
    }
    return `${sign}${Math.round(abs).toLocaleString()}원`;
  }

  function formatThousandWon(val) {
    if (val === null || val === undefined || isNaN(val)) return "-";
    return formatWon(Number(val) * 1000);
  }

  // Recommended Presets
  const PRESETS = [
    { name: "강남 vs 화성", sub: "수도권 부유 vs 신성장 거점", a: "KR_11680", b: "KR_41590" },
    { name: "해운대 vs 수성", sub: "영남권 양대 주거·교육 1번지", a: "KR_26350", b: "KR_27260" },
    { name: "성남 vs 수원", sub: "경기 남부 메가시티 맞대결", a: "KR_41130", b: "KR_41110" },
    { name: "마포 vs 성동", sub: "한강변 주거·상업 신흥 벨트", a: "KR_11440", b: "KR_11200" },
    { name: "신안 vs 군위", sub: "지방 소멸위기 지역 살림 비교", a: "KR_46910", b: "KR_27720" },
  ];

  // Load Regions List
  async function initRegions() {
    if (allRegions.length > 0) return;
    try {
      const res = await fetch("/api/regions");
      const data = await res.json();
      allRegions = (data.regions || []).filter((r) => !r.regionKey.startsWith("TEST_"));
      allRegions.sort((a, b) => {
        const provA = a.provinceName || "";
        const provB = b.provinceName || "";
        if (provA !== provB) return provA.localeCompare(provB, "ko");
        return (a.name || "").localeCompare(b.name || "", "ko");
      });
      populateRegionSelects();
    } catch (e) {
      console.error("[CompareManager] Failed to load regions:", e);
    }
  }

  function populateRegionSelects() {
    const selectA = document.getElementById("compare-select-a");
    const selectB = document.getElementById("compare-select-b");
    if (!selectA || !selectB) return;

    selectA.innerHTML = "";
    selectB.innerHTML = "";

    // Group by province
    const grouped = {};
    allRegions.forEach((r) => {
      const prov = r.provinceName || "기타";
      if (!grouped[prov]) grouped[prov] = [];
      grouped[prov].push(r);
    });

    Object.keys(grouped).forEach((prov) => {
      const optgroupA = document.createElement("optgroup");
      optgroupA.label = prov;
      const optgroupB = document.createElement("optgroup");
      optgroupB.label = prov;

      grouped[prov].forEach((r) => {
        const optA = document.createElement("option");
        optA.value = r.regionKey;
        optA.textContent = `${r.provinceName ? r.provinceName.slice(0, 2) + " " : ""}${r.name}`;
        if (r.regionKey === regionA) optA.selected = true;
        optgroupA.appendChild(optA);

        const optB = document.createElement("option");
        optB.value = r.regionKey;
        optB.textContent = `${r.provinceName ? r.provinceName.slice(0, 2) + " " : ""}${r.name}`;
        if (r.regionKey === regionB) optB.selected = true;
        optgroupB.appendChild(optB);
      });

      selectA.appendChild(optgroupA);
      selectB.appendChild(optgroupB);
    });

    selectA.value = regionA;
    selectB.value = regionB;
  }

  // Fetch all comparative data concurrently
  async function loadCompareData() {
    const loader = document.getElementById("compare-loading-indicator");
    if (loader) loader.classList.remove("hidden");

    try {
      const [resA, resB, resSeries] = await Promise.all([
        fetch(`/api/regional_dashboard?regionId=${regionA}`).then((r) => r.json()),
        fetch(`/api/regional_dashboard?regionId=${regionB}`).then((r) => r.json()),
        fetch(`/api/series?indicatorId=${timeseriesIndicator}&regionId=${regionA},${regionB}&from=2010&to=2024`).then((r) => r.json()),
      ]);

      cachedDashboardA = resA;
      cachedDashboardB = resB;
      cachedSeriesData = resSeries;

      renderAll();
    } catch (err) {
      console.error("[CompareManager] Data fetch error:", err);
    } finally {
      if (loader) loader.classList.add("hidden");
    }
  }

  // Render All Compare Components
  function renderAll() {
    if (!cachedDashboardA || !cachedDashboardB) return;

    renderHeaderBadges();
    renderScoreboard();
    renderRadarChart();
    renderTimeseriesChart();
    render17Table();
  }

  // 1. Header Badges & Info Cards
  function renderHeaderBadges() {
    const regA = cachedDashboardA.region || {};
    const regB = cachedDashboardB.region || {};

    const nameAEl = document.getElementById("compare-header-name-a");
    const nameBEl = document.getElementById("compare-header-name-b");
    const fullAEl = document.getElementById("compare-header-full-a");
    const fullBEl = document.getElementById("compare-header-full-b");

    if (nameAEl) nameAEl.textContent = regA.name || "지자체 A";
    if (nameBEl) nameBEl.textContent = regB.name || "지자체 B";
    if (fullAEl) fullAEl.textContent = regA.fullName || "";
    if (fullBEl) fullBEl.textContent = regB.fullName || "";

    // Archetype verdict tags
    const diagA = cachedDashboardA.diagnosis || {};
    const diagB = cachedDashboardB.diagnosis || {};
    const diagTagA = document.getElementById("compare-diag-tag-a");
    const diagTagB = document.getElementById("compare-diag-tag-b");

    if (diagTagA) {
      diagTagA.textContent = diagA.verdictTitle || "진단 요약";
      diagTagA.className = `px-2 py-0.5 rounded text-[11px] font-bold border ${diagA.verdictClass || "bg-sky-50 text-sky-800 border-sky-300"}`;
    }
    if (diagTagB) {
      diagTagB.textContent = diagB.verdictTitle || "진단 요약";
      diagTagB.className = `px-2 py-0.5 rounded text-[11px] font-bold border ${diagB.verdictClass || "bg-amber-50 text-amber-800 border-amber-300"}`;
    }
  }

  // 2. Scoreboard Banner
  function renderScoreboard() {
    let winsA = 0;
    let winsB = 0;
    let draws = 0;

    COMPARE_INDICATORS.forEach((ind) => {
      const dataA = ind.extract(cachedDashboardA);
      const dataB = ind.extract(cachedDashboardB);
      const valA = dataA?.value;
      const valB = dataB?.value;

      if (valA !== null && valA !== undefined && valB !== null && valB !== undefined) {
        if (valA === valB) {
          draws++;
        } else if (ind.lowerIsBetter) {
          if (valA < valB) winsA++;
          else winsB++;
        } else {
          if (valA > valB) winsA++;
          else winsB++;
        }
      }
    });

    const regAName = cachedDashboardA.region?.name || "지자체 A";
    const regBName = cachedDashboardB.region?.name || "지자체 B";

    const scoreAEl = document.getElementById("scoreboard-wins-a");
    const scoreBEl = document.getElementById("scoreboard-wins-b");
    const scoreTitleEl = document.getElementById("scoreboard-verdict-text");

    if (scoreAEl) scoreAEl.textContent = `${winsA}승`;
    if (scoreBEl) scoreBEl.textContent = `${winsB}승`;

    if (scoreTitleEl) {
      if (winsA > winsB) {
        scoreTitleEl.innerHTML = `총 17개 핵심 지표 중 <strong class="text-sky-400 font-bold">${regAName}</strong>이(가) <strong class="text-sky-300">${winsA}개 부문에서 우세</strong>를 점하고 있습니다.`;
      } else if (winsB > winsA) {
        scoreTitleEl.innerHTML = `총 17개 핵심 지표 중 <strong class="text-amber-400 font-bold">${regBName}</strong>이(가) <strong class="text-amber-300">${winsB}개 부문에서 우세</strong>를 점하고 있습니다.`;
      } else {
        scoreTitleEl.innerHTML = `<strong class="text-slate-200">${regAName}</strong>과(와) <strong class="text-slate-200">${regBName}</strong>이(가) 각각 <strong>${winsA}승</strong>으로 호각세를 이루고 있습니다.`;
      }
    }
  }

  // 3. 5-Axis Radar Chart
  function renderRadarChart() {
    const canvas = document.getElementById("compare-radar-chart");
    if (!canvas) return;

    const regAName = cachedDashboardA.region?.name || "지자체 A";
    const regBName = cachedDashboardB.region?.name || "지자체 B";

    const scoresA = cachedDashboardA.radarScores || {};
    const scoresB = cachedDashboardB.radarScores || {};

    const labels = ["재정자립도", "1인당 지방세", "인구규모", "합계출산율", "사업체수"];
    const dataValsA = [
      scoresA.fiscalIndependence !== undefined ? scoresA.fiscalIndependence : 50,
      scoresA.perCapitaTax !== undefined ? scoresA.perCapitaTax : 50,
      scoresA.population !== undefined ? scoresA.population : 50,
      scoresA.fertilityRate !== undefined ? scoresA.fertilityRate : 50,
      scoresA.businesses !== undefined ? scoresA.businesses : 50,
    ];
    const dataValsB = [
      scoresB.fiscalIndependence !== undefined ? scoresB.fiscalIndependence : 50,
      scoresB.perCapitaTax !== undefined ? scoresB.perCapitaTax : 50,
      scoresB.population !== undefined ? scoresB.population : 50,
      scoresB.fertilityRate !== undefined ? scoresB.fertilityRate : 50,
      scoresB.businesses !== undefined ? scoresB.businesses : 50,
    ];

    if (radarChartInstance) {
      radarChartInstance.destroy();
    }

    const ctx = canvas.getContext("2d");
    radarChartInstance = new Chart(ctx, {
      type: "radar",
      data: {
        labels: labels,
        datasets: [
          {
            label: regAName,
            data: dataValsA,
            fill: true,
            backgroundColor: "rgba(2, 132, 199, 0.22)",
            borderColor: "#0284c7",
            pointBackgroundColor: "#0284c7",
            pointBorderColor: "#ffffff",
            pointHoverBackgroundColor: "#ffffff",
            pointHoverBorderColor: "#0284c7",
            pointRadius: 4,
            pointHoverRadius: 6,
            borderWidth: 2.5,
          },
          {
            label: regBName,
            data: dataValsB,
            fill: true,
            backgroundColor: "rgba(245, 158, 11, 0.22)",
            borderColor: "#f59e0b",
            pointBackgroundColor: "#f59e0b",
            pointBorderColor: "#ffffff",
            pointHoverBackgroundColor: "#ffffff",
            pointHoverBorderColor: "#f59e0b",
            pointRadius: 4,
            pointHoverRadius: 6,
            borderWidth: 2.5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 600,
        },
        scales: {
          r: {
            angleLines: {
              color: "rgba(148, 163, 184, 0.25)",
              lineWidth: 1,
            },
            grid: {
              color: "rgba(148, 163, 184, 0.2)",
              circular: true,
            },
            suggestedMin: 0,
            suggestedMax: 100,
            ticks: {
              stepSize: 20,
              backdropColor: "transparent",
              color: "#94a3b8",
              font: { size: 10, family: "JetBrains Mono" },
            },
            pointLabels: {
              font: { size: 12, weight: "bold", family: "Inter" },
              color: "#334155",
            },
          },
        },
        plugins: {
          legend: {
            position: "top",
            labels: {
              font: { weight: "bold", size: 12, family: "Inter" },
              usePointStyle: true,
              pointStyle: "circle",
              padding: 15,
            },
          },
          tooltip: {
            backgroundColor: "rgba(15, 23, 42, 0.92)",
            titleFont: { size: 12, weight: "bold" },
            bodyFont: { size: 12 },
            padding: 10,
            callbacks: {
              label: function (ctx) {
                const label = ctx.dataset.label || "";
                const val = ctx.raw || 0;
                const topPct = (100 - val).toFixed(1);
                return `${label}: 전국 상위 ${topPct}% (백분위 ${val}점)`;
              },
            },
          },
        },
      },
    });
  }

  // 4. 15-Year Timeseries Line Overlay Chart
  function renderTimeseriesChart() {
    const canvas = document.getElementById("compare-timeseries-chart");
    if (!canvas) return;

    const regAName = cachedDashboardA.region?.name || "지자체 A";
    const regBName = cachedDashboardB.region?.name || "지자체 B";

    const vals = cachedSeriesData?.values || [];
    const unit = cachedSeriesData?.source?.unit || "";

    // Years 2010 to 2024
    const startYr = cachedSeriesData?.startYear || 2010;
    const endYr = cachedSeriesData?.endYear || 2024;
    const years = [];
    for (let y = startYr; y <= endYr; y++) years.push(String(y));

    const mapA = {};
    const mapB = {};
    vals.forEach((v) => {
      if (v.regionKey === regionA) mapA[v.period] = v.value;
      if (v.regionKey === regionB) mapB[v.period] = v.value;
    });

    const seriesDataA = years.map((y) => (mapA[y] !== undefined ? mapA[y] : null));
    const seriesDataB = years.map((y) => (mapB[y] !== undefined ? mapB[y] : null));

    if (timeseriesChartInstance) {
      timeseriesChartInstance.destroy();
    }

    const ctx = canvas.getContext("2d");
    timeseriesChartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels: years,
        datasets: [
          {
            label: regAName,
            data: seriesDataA,
            borderColor: "#0284c7",
            backgroundColor: "rgba(2, 132, 199, 0.08)",
            pointBackgroundColor: "#0284c7",
            pointBorderColor: "#ffffff",
            pointHoverBackgroundColor: "#ffffff",
            pointHoverBorderColor: "#0284c7",
            pointRadius: 4,
            pointHoverRadius: 6,
            borderWidth: 2.5,
            tension: 0.25,
            fill: true,
          },
          {
            label: regBName,
            data: seriesDataB,
            borderColor: "#f59e0b",
            backgroundColor: "rgba(245, 158, 11, 0.08)",
            pointBackgroundColor: "#f59e0b",
            pointBorderColor: "#ffffff",
            pointHoverBackgroundColor: "#ffffff",
            pointHoverBorderColor: "#f59e0b",
            pointRadius: 4,
            pointHoverRadius: 6,
            borderWidth: 2.5,
            tension: 0.25,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false,
        },
        scales: {
          x: {
            grid: { color: "rgba(241, 245, 249, 0.8)" },
            ticks: {
              color: "#64748b",
              font: { size: 11, family: "JetBrains Mono" },
            },
          },
          y: {
            grid: { color: "rgba(226, 232, 240, 0.8)" },
            ticks: {
              color: "#64748b",
              font: { size: 11, family: "JetBrains Mono" },
              callback: function (val) {
                if (unit === "%") return `${val}%`;
                if (val >= 1e8) return `${(val / 1e8).toFixed(0)}억`;
                if (val >= 1e4) return `${(val / 1e4).toFixed(0)}만`;
                return Number(val).toLocaleString();
              },
            },
          },
        },
        plugins: {
          legend: {
            position: "top",
            labels: {
              font: { weight: "bold", size: 12, family: "Inter" },
              usePointStyle: true,
              pointStyle: "circle",
              padding: 15,
            },
          },
          tooltip: {
            backgroundColor: "rgba(15, 23, 42, 0.92)",
            titleFont: { size: 12, weight: "bold" },
            bodyFont: { size: 12 },
            padding: 10,
            callbacks: {
              label: function (ctx) {
                const label = ctx.dataset.label || "";
                const val = ctx.raw;
                if (val === null || val === undefined) return `${label}: 자료 없음`;
                if (unit === "%") return `${label}: ${Number(val).toFixed(2)}%`;
                return `${label}: ${formatWon(val)} (${Number(val).toLocaleString()} ${unit})`;
              },
            },
          },
        },
      },
    });
  }

  // 5. 17-Indicator Head-to-Head Table
  function render17Table() {
    const tbody = document.getElementById("compare-table-tbody");
    if (!tbody) return;

    const regAName = cachedDashboardA.region?.name || "지자체 A";
    const regBName = cachedDashboardB.region?.name || "지자체 B";

    let currentCategory = "";
    let html = "";

    COMPARE_INDICATORS.forEach((ind) => {
      // Category group header row
      if (ind.category !== currentCategory) {
        currentCategory = ind.category;
        html += `
          <tr class="bg-sky-50/70 border-y border-sky-200">
            <td colspan="7" class="py-2 px-3 text-xs font-bold text-sky-950 flex items-center gap-1.5">
              <span>${ind.categoryLabel}</span>
            </td>
          </tr>
        `;
      }

      const itemA = ind.extract(cachedDashboardA);
      const itemB = ind.extract(cachedDashboardB);

      const valA = itemA?.value;
      const valB = itemB?.value;
      const rankA = itemA?.rank;
      const rankB = itemB?.rank;
      const topPctA = itemA?.topPct;
      const topPctB = itemB?.topPct;
      const year = itemA?.year || itemB?.year || cachedDashboardA.baselineYear || 2024;

      // Determine winner
      let winner = "DRAW";
      let diffText = "-";
      let ratioText = "";

      if (valA !== null && valA !== undefined && valB !== null && valB !== undefined) {
        const diff = valA - valB;
        if (valA === valB) {
          winner = "DRAW";
          diffText = "동일";
        } else if (ind.lowerIsBetter) {
          winner = valA < valB ? "A" : "B";
        } else {
          winner = valA > valB ? "A" : "B";
        }

        // Format difference
        if (ind.unit === "%") {
          diffText = `${diff > 0 ? "+" : ""}${diff.toFixed(2)}%p`;
        } else {
          diffText = ind.format(diff);
        }

        if (valB !== 0 && Math.abs(valB) > 0.0001) {
          const ratio = (valA / valB).toFixed(1);
          if (ratio !== "1.0") {
            ratioText = `(${ratio}배)`;
          }
        }
      }

      const isWinA = winner === "A";
      const isWinB = winner === "B";

      const bgA = isWinA ? "bg-sky-50/90 font-bold text-sky-950" : "text-slate-700";
      const bgB = isWinB ? "bg-amber-50/90 font-bold text-amber-950" : "text-slate-700";

      let winnerBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-medium text-slate-500 bg-slate-100">호각</span>`;
      if (isWinA) {
        winnerBadge = `<span class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[11px] font-bold text-sky-800 bg-sky-100 border border-sky-300 shadow-xs">
          🏆 ${regAName} 우세
        </span>`;
      } else if (isWinB) {
        winnerBadge = `<span class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[11px] font-bold text-amber-800 bg-amber-100 border border-amber-300 shadow-xs">
          🏆 ${regBName} 우세
        </span>`;
      }

      html += `
        <tr class="border-b border-slate-100 hover:bg-slate-50/80 transition-colors text-xs">
          <td class="py-2.5 px-3 font-semibold text-slate-800 whitespace-nowrap">
            <div class="flex items-center gap-1.5">
              <span>${ind.name}</span>
              ${ind.lowerIsBetter ? `<span class="text-[10px] text-emerald-600 bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200">낮을수록 우세</span>` : ""}
            </div>
          </td>
          <td class="py-2.5 px-2 text-center text-slate-400 font-mono text-[11px] whitespace-nowrap">
            ${year}년
          </td>
          <td class="py-2.5 px-2 text-center text-slate-400 text-[11px] whitespace-nowrap">
            ${ind.unit}
          </td>
          <td class="py-2.5 px-3 text-right ${bgA} border-l border-slate-100 font-mono">
            <div class="text-[13px] font-bold">${ind.format(valA)}</div>
            ${rankA ? `<div class="text-[10px] text-sky-700 font-sans font-medium">전국 ${rankA}위 (상위 ${topPctA}%)</div>` : ""}
          </td>
          <td class="py-2.5 px-3 text-right ${bgB} border-l border-slate-100 font-mono">
            <div class="text-[13px] font-bold">${ind.format(valB)}</div>
            ${rankB ? `<div class="text-[10px] text-amber-700 font-sans font-medium">전국 ${rankB}위 (상위 ${topPctB}%)</div>` : ""}
          </td>
          <td class="py-2.5 px-3 text-right text-slate-500 font-mono text-[11px] border-l border-slate-100 whitespace-nowrap">
            <span>${diffText}</span> <span class="text-[10px] text-slate-400">${ratioText}</span>
          </td>
          <td class="py-2.5 px-3 text-center border-l border-slate-100 whitespace-nowrap">
            ${winnerBadge}
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  }

  // Event Handlers
  function bindEvents() {
    const selectA = document.getElementById("compare-select-a");
    const selectB = document.getElementById("compare-select-b");
    const btnSwap = document.getElementById("btn-compare-swap");
    const indicatorSelect = document.getElementById("compare-indicator-select");

    if (selectA) {
      selectA.addEventListener("change", (e) => {
        regionA = e.target.value;
        loadCompareData();
      });
    }

    if (selectB) {
      selectB.addEventListener("change", (e) => {
        regionB = e.target.value;
        loadCompareData();
      });
    }

    if (btnSwap) {
      btnSwap.addEventListener("click", () => {
        const tmp = regionA;
        regionA = regionB;
        regionB = tmp;

        if (selectA) selectA.value = regionA;
        if (selectB) selectB.value = regionB;

        loadCompareData();
      });
    }

    if (indicatorSelect) {
      indicatorSelect.addEventListener("change", async (e) => {
        timeseriesIndicator = e.target.value;
        const res = await fetch(`/api/series?indicatorId=${timeseriesIndicator}&regionId=${regionA},${regionB}&from=2010&to=2024`).then((r) => r.json());
        cachedSeriesData = res;
        renderTimeseriesChart();
      });
    }

    // Preset buttons binding
    document.querySelectorAll(".compare-preset-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const a = btn.getAttribute("data-a");
        const b = btn.getAttribute("data-b");
        if (a && b) {
          regionA = a;
          regionB = b;
          if (selectA) selectA.value = regionA;
          if (selectB) selectB.value = regionB;
          loadCompareData();
        }
      });
    });
  }

  // Public API
  window.CompareManager = {
    init: async function () {
      await initRegions();
      bindEvents();
      loadCompareData();
    },
    activate: function () {
      if (!cachedDashboardA) {
        this.init();
      } else {
        setTimeout(() => {
          if (radarChartInstance) radarChartInstance.resize();
          if (timeseriesChartInstance) timeseriesChartInstance.resize();
        }, 80);
      }
    },
    setRegions: function (newA, newB) {
      regionA = newA;
      regionB = newB;
      const selectA = document.getElementById("compare-select-a");
      const selectB = document.getElementById("compare-select-b");
      if (selectA) selectA.value = regionA;
      if (selectB) selectB.value = regionB;
      loadCompareData();
    },
  };

  // Auto initialize on DOM ready
  document.addEventListener("DOMContentLoaded", () => {
    window.CompareManager.init();
  });
})();
