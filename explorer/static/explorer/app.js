document.addEventListener("DOMContentLoaded", () => {
  let taxChart = null;
  let popChart = null;
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
  const regionSelect = document.getElementById("region-select");
  const regionSearch = document.getElementById("region-search");
  const regionSearchClear = document.getElementById("region-search-clear");
  const searchCountBadge = document.getElementById("search-count-badge");
  const yearSelect = document.getElementById("year-select");
  const indicatorSelect = document.getElementById("indicator-select");
  const liveStatus = document.getElementById("live-status");

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
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
      maxZoom: 18,
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

      // Default selection: Gangnam-gu (KR_11680)
      const gangnam = allRegions.find(r => r.regionKey === "KR_11680");
      if (gangnam) {
        regionSelect.value = gangnam.regionKey;
      } else if (allRegions.length > 0) {
        regionSelect.value = allRegions[0].regionKey;
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

    searchCountBadge.textContent = `${filtered.length}개 자치단체`;
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

    // Retain previous selection if still available, or pick first matching
    const hasCurrent = filtered.some(r => r.regionKey === currentVal);
    if (hasCurrent) {
      regionSelect.value = currentVal;
    } else if (filtered.length > 0) {
      regionSelect.value = filtered[0].regionKey;
    }
  }

  // Format numbers nicely
  function formatNumber(val) {
    if (val === null || val === undefined) return "-";
    return Number(val).toLocaleString();
  }

  function getIndicatorUnit(indKey) {
    if (indKey === "ACQUISITION_TAX_PER_CAPITA") return "원/인";
    if (indKey === "ACQUISITION_TAX") return "원";
    if (indKey === "POPULATION") return "명";
    return "";
  }

  // Render Charts
  function renderCharts(taxData, popData) {
    cachedTaxSeries = taxData;
    cachedPopSeries = popData;

    const labels = taxData.map(d => `${d.period}년`);
    const taxValues = taxData.map(d => d.value);
    const popValues = popData.map(d => d.value);

    // 1. Tax Chart
    const taxCtx = document.getElementById("tax-chart").getContext("2d");
    if (taxChart) taxChart.destroy();
    taxChart = new Chart(taxCtx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [{
          label: "취득세 세입액 (원)",
          data: taxValues,
          borderColor: "#38bdf8",
          backgroundColor: "rgba(56, 189, 248, 0.12)",
          borderWidth: 2.5,
          fill: true,
          tension: 0.25,
          pointBackgroundColor: "#38bdf8",
          pointRadius: 3.5,
          pointHoverRadius: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(15, 23, 42, 0.9)",
            borderColor: "rgba(56, 189, 248, 0.3)",
            borderWidth: 1,
            titleFont: { family: "Inter", weight: "bold" },
            bodyFont: { family: "JetBrains Mono" },
            callbacks: {
              label: ctx => `취득세: ${Number(ctx.parsed.y).toLocaleString()} 원`
            }
          }
        },
        scales: {
          x: { grid: { color: "rgba(51, 65, 85, 0.3)" }, ticks: { color: "#94a3b8" } },
          y: {
            grid: { color: "rgba(51, 65, 85, 0.3)" },
            ticks: {
              color: "#94a3b8",
              callback: v => (v >= 100000000 ? `${(v / 100000000).toFixed(0)}억원` : v.toLocaleString())
            }
          },
        },
      },
    });

    // 2. Population Chart
    const popCtx = document.getElementById("population-chart").getContext("2d");
    if (popChart) popChart.destroy();
    popChart = new Chart(popCtx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [{
          label: "주민등록 인구 (명)",
          data: popValues,
          borderColor: "#c084fc",
          backgroundColor: "rgba(168, 85, 247, 0.12)",
          borderWidth: 2.5,
          fill: true,
          tension: 0.25,
          pointBackgroundColor: "#c084fc",
          pointRadius: 3.5,
          pointHoverRadius: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(15, 23, 42, 0.9)",
            borderColor: "rgba(168, 85, 247, 0.3)",
            borderWidth: 1,
            titleFont: { family: "Inter", weight: "bold" },
            bodyFont: { family: "JetBrains Mono" },
            callbacks: {
              label: ctx => `인구: ${Number(ctx.parsed.y).toLocaleString()} 명`
            }
          }
        },
        scales: {
          x: { grid: { color: "rgba(51, 65, 85, 0.3)" }, ticks: { color: "#94a3b8" } },
          y: {
            grid: { color: "rgba(51, 65, 85, 0.3)" },
            ticks: {
              color: "#94a3b8",
              callback: v => (v >= 10000 ? `${(v / 10000).toFixed(0)}만명` : v.toLocaleString())
            }
          },
        },
      },
    });
  }

  // Update Selected District Hero Banner
  function updateHeroBanner(currentRegion, year, indKey) {
    if (!currentRegion) return;

    heroProvinceTag.textContent = currentRegion.provinceName || "대한민국";
    heroRegionName.textContent = currentRegion.name;
    heroRegionKey.textContent = `(${currentRegion.regionKey})`;
    heroYear.textContent = year;

    // Find rank in allRankings
    const found = allRankings.find(r => r.regionKey === currentRegion.regionKey);
    const indUnit = getIndicatorUnit(indKey);
    const indName = indKey === "ACQUISITION_TAX_PER_CAPITA" ? "1인당 취득세" : indKey === "ACQUISITION_TAX" ? "취득세 총세입" : "주민등록 인구";

    if (found && found.rank) {
      heroNationalRank.textContent = `${found.rank}위`;
      const valStr = formatNumber(Math.round(found.value));
      const totalCount = allRankings.filter(r => r.value !== null).length;
      const topPct = ((found.rank / totalCount) * 100).toFixed(1);

      heroDesc.innerHTML = `${year}년 기준 전국 ${totalCount}개 기초자치단체 중 <strong>${indName} 전국 ${found.rank}위</strong> (상위 ${topPct}%, ${valStr} ${indUnit})`;
    } else {
      heroNationalRank.textContent = "-";
      heroDesc.textContent = `${year}년 해당 지표 데이터 분석 준비 중`;
    }
  }

  // Render High-Density Ranking Table with Search & Scope
  function renderRankings() {
    const tbody = document.querySelector("#ranking-table tbody");
    const currentRegionKey = regionSelect.value;
    const selectedRegion = allRegions.find(r => r.regionKey === currentRegionKey);
    const currentProvCode = selectedRegion ? selectedRegion.provinceCode : "";

    let displayed = [...allRankings];

    // Filter by Scope
    if (currentScope === "PROVINCE" && currentProvCode) {
      displayed = displayed.filter(r => r.regionKey.startsWith(currentProvCode));
      // Re-assign localized rank within province
      displayed.sort((a, b) => (b.value || 0) - (a.value || 0));
      displayed.forEach((r, idx) => {
        r.displayRank = r.value !== null ? idx + 1 : null;
      });
      rankingTitle.textContent = `${selectedRegion ? selectedRegion.provinceName : "시·도"} 내 순위표`;
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
      const valStr = r.value !== null ? formatNumber(Math.round(r.value)) : "-";

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

      tbody.appendChild(tr);
    });

    // Auto-scroll to selected row
    const activeRow = tbody.querySelector(".selected-row");
    if (activeRow) {
      activeRow.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  // Select a region programmatically
  function selectRegionByKey(targetKey) {
    const target = allRegions.find(r => r.regionKey === targetKey);
    if (!target) return;

    // If province filter doesn't match, update province filter
    if (provinceSelect.value && target.provinceCode !== provinceSelect.value) {
      provinceSelect.value = "";
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
    const year = yearSelect.value;
    const indKey = indicatorSelect.value;

    document.getElementById("map-year-label").textContent = year;
    document.getElementById("kpi-year-tax").textContent = year;
    document.getElementById("kpi-year-pop").textContent = year;
    document.getElementById("kpi-year-derived").textContent = year;

    const currentRegion = allRegions.find(r => r.regionKey === regionKey);

    try {
      // 1. Fetch Series for current district
      if (regionKey) {
        const [taxRes, popRes] = await Promise.all([
          fetch(`/api/series?regionId=${encodeURIComponent(regionKey)}&indicatorId=ACQUISITION_TAX&from=2010&to=2024`, { signal }),
          fetch(`/api/series?regionId=${encodeURIComponent(regionKey)}&indicatorId=POPULATION&from=2010&to=2024`, { signal })
        ]);

        const taxJson = await taxRes.json();
        const popJson = await popRes.json();

        renderCharts(taxJson.values || [], popJson.values || []);

        // Update KPIs
        const currentTax = (taxJson.values || []).find(v => v.period === year);
        const currentPop = (popJson.values || []).find(v => v.period === year);

        document.getElementById("kpi-tax-val").textContent =
          currentTax && currentTax.value !== null ? `${Number(currentTax.value).toLocaleString()} 원` : "-";
        document.getElementById("kpi-pop-val").textContent =
          currentPop && currentPop.value !== null ? `${Number(currentPop.value).toLocaleString()} 명` : "-";

        if (currentTax && currentPop && currentPop.value > 0) {
          const perCapita = Math.round(currentTax.value / currentPop.value);
          document.getElementById("kpi-derived-val").textContent = `${perCapita.toLocaleString()} 원/인`;
        } else {
          document.getElementById("kpi-derived-val").textContent = "-";
        }
      }

      // 2. Fetch Rankings
      const rankRes = await fetch(`/api/rankings?indicatorId=${encodeURIComponent(indKey)}&year=${encodeURIComponent(year)}`, { signal });
      const rankJson = await rankRes.json();
      allRankings = rankJson.rankings || [];

      // Update Hero Banner and Ranking Table
      updateHeroBanner(currentRegion, year, indKey);
      renderRankings();

      // Update Leaflet Map Layer
      if (rankJson.boundaryVersion) {
        await updateMapLayer(rankJson.boundaryVersion, allRankings);
      }

      if (liveStatus) {
        liveStatus.textContent = `${currentRegion ? currentRegion.fullName : ''} ${year}년 데이터가 성공적으로 갱신되었습니다.`;
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("Dashboard refresh failed:", err);
      }
    }
  }

  // Update Map Layer
  async function updateMapLayer(boundaryUrl, rankings) {
    try {
      const res = await fetch(boundaryUrl);
      if (!res.ok) return;
      const geojson = await res.json();

      const rankMap = new Map(rankings.map(row => [row.featureKey, row]));

      if (geoLayer) {
        mapInstance.removeLayer(geoLayer);
      }

      geoLayer = L.geoJSON(geojson, {
        style: feature => {
          const row = rankMap.get(feature.properties.featureKey);
          const hasVal = row && row.value !== null;
          return {
            fillColor: hasVal ? "#38bdf8" : "#64748b",
            weight: 1.5,
            opacity: 1,
            color: "#1e293b",
            fillOpacity: hasVal ? 0.75 : 0.2,
          };
        },
        onEachFeature: (feature, layer) => {
          const row = rankMap.get(feature.properties.featureKey);
          const name = feature.properties.name || feature.properties.featureKey;
          const valStr = row && row.value !== null ? `${Number(row.value).toLocaleString()} ${getIndicatorUnit(indicatorSelect.value)}` : "데이터 없음";
          const rankStr = row && row.rank ? `${row.rank}위` : "-";
          layer.bindTooltip(`
            <div style="font-family: Inter, sans-serif; font-size: 0.85rem; padding: 2px;">
              <strong>${name}</strong><br>
              <span style="color: #94a3b8;">전국 순위:</span> <strong>${rankStr}</strong><br>
              <span style="color: #38bdf8;">지표값:</span> ${valStr}
            </div>
          `);

          layer.on("click", () => {
            if (row && row.regionKey) {
              selectRegionByKey(row.regionKey);
            }
          });
        },
      }).addTo(mapInstance);
    } catch (err) {
      console.warn("Boundary layer update warning:", err);
    }
  }

  // Event Listeners
  provinceSelect.addEventListener("change", () => {
    renderRegionOptions();
    const selectedProv = provinceSelect.value;
    if (selectedProv && PROVINCE_COORDS[selectedProv]) {
      mapInstance.flyTo(PROVINCE_COORDS[selectedProv].center, PROVINCE_COORDS[selectedProv].zoom, { duration: 1 });
    } else {
      mapInstance.flyTo(NATIONAL_VIEW.center, NATIONAL_VIEW.zoom, { duration: 1 });
    }
    refreshData();
  });

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

  yearSelect.addEventListener("change", refreshData);
  indicatorSelect.addEventListener("change", refreshData);

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

  btnZoomRegion.addEventListener("click", () => {
    zoomToRegion(regionSelect.value);
  });

  // Initialize
  initMap();
  loadRegions().then(() => {
    refreshData();
  });
});
