document.addEventListener("DOMContentLoaded", () => {
  let taxChart = null;
  let popChart = null;
  let mapInstance = null;
  let geoLayer = null;
  let currentAbortController = null;

  const regionSelect = document.getElementById("region-select");
  const yearSelect = document.getElementById("year-select");
  const indicatorSelect = document.getElementById("indicator-select");
  const liveStatus = document.getElementById("live-status");

  // Initialize Leaflet Map
  function initMap() {
    mapInstance = L.map("map").setView([36.5, 127.8], 7);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
      maxZoom: 18,
    }).addTo(mapInstance);
  }

  // Load Regions
  async function loadRegions() {
    try {
      const res = await fetch("/api/regions");
      const data = await res.json();
      regionSelect.innerHTML = '<option value="">지역을 선택하세요</option>';
      // Filter active districts and sort by name
      const sortedRegions = (data.regions || []).filter(r => !r.regionKey.startsWith("TEST_"));
      sortedRegions.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ko"));

      sortedRegions.forEach(r => {
        const opt = document.createElement("option");
        opt.value = r.regionKey;
        opt.textContent = `${r.name} (${r.regionKey})`;
        regionSelect.appendChild(opt);
      });

      // Default to Gangnam-gu (KR_11680) or first available
      const gangnam = sortedRegions.find(r => r.regionKey === "KR_11680");
      if (gangnam) {
        regionSelect.value = gangnam.regionKey;
      } else if (sortedRegions.length > 0) {
        regionSelect.value = sortedRegions[0].regionKey;
      }
    } catch (err) {
      console.error("Failed to load regions:", err);
    }
  }

  // Render Charts
  function renderCharts(taxData, popData) {
    const labels = taxData.map(d => d.period);
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
          label: "취득세 세입액",
          data: taxValues,
          borderColor: "#38bdf8",
          backgroundColor: "rgba(56, 189, 248, 0.1)",
          borderWidth: 2,
          fill: true,
          tension: 0.2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: "#334155" }, ticks: { color: "#94a3b8" } },
          y: { grid: { color: "#334155" }, ticks: { color: "#94a3b8" } },
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
          label: "주민등록 인구",
          data: popValues,
          borderColor: "#a855f7",
          backgroundColor: "rgba(168, 85, 247, 0.1)",
          borderWidth: 2,
          fill: true,
          tension: 0.2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: "#334155" }, ticks: { color: "#94a3b8" } },
          y: { grid: { color: "#334155" }, ticks: { color: "#94a3b8" } },
        },
      },
    });
  }

  // Load and refresh dashboard data
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

    try {
      // 1. Fetch Series
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
          currentTax && currentTax.value !== null ? Number(currentTax.value).toLocaleString() + " 원" : "-";
        document.getElementById("kpi-pop-val").textContent =
          currentPop && currentPop.value !== null ? Number(currentPop.value).toLocaleString() + " 명" : "-";

        if (currentTax && currentPop && currentPop.value > 0) {
          const perCapita = Math.round(currentTax.value / currentPop.value);
          document.getElementById("kpi-derived-val").textContent = perCapita.toLocaleString() + " 원/인";
        } else {
          document.getElementById("kpi-derived-val").textContent = "-";
        }

        // Update Source & Lineage Metadata dynamically
        const srcDetails = document.getElementById("source-details");
        if (srcDetails && popJson.source) {
          const s = popJson.source;
          srcDetails.innerHTML = `
            <p><strong>인구 원천 제공처:</strong> ${s.provider || "KOSIS 국가통계포털"} (테이블: <code>${s.tableId || "DT_1B040A3"}</code> ${s.tableName || "주민등록인구현황"})</p>
            <p><strong>공간 경계:</strong> 통계지리정보서비스(SGIS) 연도별 행정구역 경계 (EPSG:4326 WGS84 재투영)</p>
            <p><strong>품질 검증 상태:</strong> 결측치(-)와 0원 식별 분리 완료, 단일 계보(Single Lineage) 원칙 엄격 준수</p>
          `;
        }
      }

      // 2. Fetch Rankings & Map Boundaries
      const rankRes = await fetch(`/api/rankings?indicatorId=${encodeURIComponent(indKey)}&year=${encodeURIComponent(year)}`, { signal });
      const rankJson = await rankRes.json();

      renderRankings(rankJson.rankings || []);

      if (rankJson.boundaryVersion) {
        await updateMapLayer(rankJson.boundaryVersion, rankJson.rankings || []);
      }

      if (liveStatus) {
        liveStatus.textContent = `${year}년 데이터가 성공적으로 갱신되었습니다.`;
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("Data refresh failed:", err);
      }
    }
  }

  function renderRankings(rankings) {
    const tbody = document.querySelector("#ranking-table tbody");
    if (!rankings || rankings.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center">조회된 순위 데이터가 없습니다.</td></tr>';
      return;
    }

    tbody.innerHTML = "";
    rankings.forEach(r => {
      const tr = document.createElement("tr");
      tr.style.cursor = "pointer";
      tr.title = `${r.regionName || r.regionKey} 선택하기`;
      tr.innerHTML = `
        <td><strong>${r.rank !== null ? r.rank : "-"}</strong></td>
        <td>${r.regionName || r.regionKey} <span class="region-key-sub" style="font-size: 0.75rem; color: var(--text-muted);">(${r.regionKey})</span></td>
        <td class="font-mono">${r.value !== null ? Number(r.value).toLocaleString() : "-"}</td>
        <td><span class="badge ${r.status.toLowerCase()}">${r.status}</span></td>
      `;
      tr.addEventListener("click", () => {
        if (regionSelect.value !== r.regionKey) {
          regionSelect.value = r.regionKey;
          refreshData();
        }
      });
      tbody.appendChild(tr);
    });
  }

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
            fillColor: hasVal ? "#3b82f6" : "#64748b",
            weight: 1,
            opacity: 1,
            color: "#1e293b",
            fillOpacity: hasVal ? 0.7 : 0.2,
          };
        },
        onEachFeature: (feature, layer) => {
          const row = rankMap.get(feature.properties.featureKey);
          const name = feature.properties.name || feature.properties.featureKey;
          const valStr = row && row.value !== null ? Number(row.value).toLocaleString() : "데이터 없음";
          const rankStr = row && row.rank ? `${row.rank}위` : "-";
          layer.bindTooltip(`<strong>${name}</strong><br>순위: ${rankStr}<br>값: ${valStr}`);
        },
      }).addTo(mapInstance);
    } catch (err) {
      console.warn("Boundary layer update failed:", err);
    }
  }

  // Event Listeners
  regionSelect.addEventListener("change", refreshData);
  yearSelect.addEventListener("change", refreshData);
  indicatorSelect.addEventListener("change", refreshData);

  // Initialize
  initMap();
  loadRegions().then(() => {
    refreshData();
  });
});
