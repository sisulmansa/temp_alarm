export function renderHtml({ locationName, homeUrl, patrolUrl }) {
  const safeHomeUrl = homeUrl || "#";
  const safePatrolUrl = patrolUrl || "";

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
    <meta name="theme-color" content="#17324d" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <title>외기온도 알람 · ${locationName}</title>

    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" />

    <style>
      body {
        background-color: #eef2f5;
        font-family: -apple-system, BlinkMacSystemFont, 'Noto Sans KR', 'Segoe UI', sans-serif;
        color: #2c3e50;
        padding-bottom: calc(36px + env(safe-area-inset-bottom));
      }
      .app-container {
        max-width: 720px;
        margin: 0 auto;
      }
      .header-bar {
        background-color: #17324d;
        z-index: 1020;
        padding-top: calc(14px + env(safe-area-inset-top));
      }
      .panel-card {
        background: #ffffff;
        border-radius: 14px;
        padding: 18px;
        margin-bottom: 14px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
      }

      /* 알람 발동 시 상단 고정 + 붉은 테두리 깜빡임 강조 카드 */
      @keyframes alertPulse {
        0%, 100% {
          border-color: #dc3545;
          box-shadow: 0 0 0 0 rgba(220, 53, 69, 0.45), 0 6px 18px rgba(220, 53, 69, 0.22);
        }
        50% {
          border-color: #ff6b7a;
          box-shadow: 0 0 0 8px rgba(220, 53, 69, 0), 0 6px 18px rgba(220, 53, 69, 0.35);
        }
      }
      .active-alert-wrap {
        position: sticky;
        top: calc(68px + env(safe-area-inset-top));
        z-index: 1010;
        margin-bottom: 16px;
      }
      .active-alert-card {
        background: #fff5f5;
        border: 3px solid #dc3545;
        border-radius: 16px;
        padding: 18px;
        animation: alertPulse 1.3s ease-in-out infinite;
      }
      .active-alert-title {
        font-size: 1.5rem;
        font-weight: 800;
        color: #b02a37;
        line-height: 1.3;
        word-break: keep-all;
      }

      /* 현재 온도 표시 카드 */
      .temp-hero {
        background: linear-gradient(135deg, #17324d 0%, #234b73 100%);
        color: #ffffff;
        border-radius: 14px;
        padding: 18px;
        margin-bottom: 14px;
        box-shadow: 0 4px 12px rgba(23, 50, 77, 0.18);
      }
      .temp-value {
        font-size: 2.6rem;
        font-weight: 800;
        letter-spacing: -1px;
        line-height: 1.1;
      }

      /* 마스터 스위치(휴무일 일시정지) 카드 */
      .master-card {
        border-left: 5px solid #34c759;
        transition: border-color 0.25s, background-color 0.25s;
      }
      .master-card.paused {
        border-left-color: #adb5bd;
        background-color: #f8f9fa;
      }

      /* 개별 알람 카드 */
      .alarm-card {
        background: #ffffff;
        border-radius: 12px;
        padding: 16px;
        margin-bottom: 12px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
        border-left: 4px solid #3498db;
        transition: opacity 0.2s, border-color 0.2s;
      }
      .alarm-card.disabled {
        opacity: 0.58;
        border-left-color: #adb5bd;
      }
      .alarm-card.triggered {
        border: 2px solid #dc3545;
        border-left: 6px solid #dc3545;
        background: #fff9f9;
      }
      .threshold-badge {
        display: inline-block;
        background: #e8f4fd;
        color: #0d6efd;
        font-weight: 800;
        font-size: 14px;
        padding: 4px 10px;
        border-radius: 8px;
      }
      .alarm-card.triggered .threshold-badge {
        background: #f8d7da;
        color: #b02a37;
      }

      /* iOS 스타일 토글 스위치 */
      .switch {
        position: relative;
        display: inline-block;
        width: 48px;
        height: 26px;
        margin-bottom: 0;
        flex-shrink: 0;
      }
      .switch input {
        opacity: 0;
        width: 0;
        height: 0;
      }
      .slider {
        position: absolute;
        cursor: pointer;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: #ccc;
        transition: 0.3s;
      }
      .slider:before {
        position: absolute;
        content: "";
        height: 22px;
        width: 22px;
        left: 2px;
        bottom: 2px;
        background-color: #ffffff;
        transition: 0.3s;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
      }
      input:checked + .slider {
        background-color: #34c759;
      }
      input:checked + .slider:before {
        transform: translateX(22px);
      }
      .slider.round {
        border-radius: 34px;
      }
      .slider.round:before {
        border-radius: 50%;
      }

      /* 온도 빠른 선택 칩 */
      .preset-chip {
        border-radius: 999px;
        font-size: 13px;
        font-weight: 700;
        padding: 5px 12px;
      }

      /* 하단 토스트 메시지 */
      .toast-box {
        position: fixed;
        left: 50%;
        bottom: calc(20px + env(safe-area-inset-bottom));
        transform: translateX(-50%);
        background: rgba(23, 50, 77, 0.94);
        color: #ffffff;
        padding: 10px 18px;
        border-radius: 999px;
        font-size: 13.5px;
        font-weight: 600;
        z-index: 2000;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        display: none;
        white-space: nowrap;
      }
    </style>
  </head>
  <body>
    <div class="app-container">
      <!-- 상단 네이비 헤더 -->
      <header class="header-bar text-white px-3 pb-3 sticky-top shadow-sm">
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <h1 class="h5 fw-bold mb-0">🌡️ 외기온도 알람</h1>
            <div class="small text-white-50" style="font-size: 12px;">${locationName} (자동감시 21·00·03·06시)</div>
          </div>
          <a id="homeBtn" href="${safeHomeUrl}" class="btn btn-outline-light btn-sm rounded-pill px-3 py-1 fw-bold" style="font-size: 12px;">
            Home
          </a>
        </div>
      </header>

      <main class="p-3">
        <!-- 1. 발동된 알람 강조 카드 (알람 발생 시 상단 고정·깜빡임) -->
        <div id="activeAlertWrap" class="active-alert-wrap d-none">
          <div class="active-alert-card">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <span id="alertBadge" class="badge bg-danger px-2 py-1">🚨 외기온도 경보 발동</span>
              <small id="alertTime" class="text-danger fw-semibold" style="font-size: 12px;"></small>
            </div>
            <div id="alertTitle" class="active-alert-title mb-2"></div>
            <div id="alertDetail" class="small text-dark mb-3" style="line-height: 1.5;"></div>
            <div class="d-grid gap-2">
              <a id="patrolBtn" href="${safePatrolUrl || "#"}" class="btn btn-danger fw-bold py-2 shadow-sm">
                🌡️ 겨울철 새벽 온도순찰 로드맵 이동
              </a>
              <button type="button" class="btn btn-outline-dark fw-bold py-2 bg-white" onclick="ackAlert()">
                ✅ 확인 완료 (강조 해제)
              </button>
            </div>
          </div>
        </div>

        <!-- 2. 마곡동 현재 외기온도 & 수동 새로고침 / 테스트 알림 카드 -->
        <section class="temp-hero">
          <div class="d-flex justify-content-between align-items-start mb-2">
            <div>
              <div class="small opacity-75">📍 ${locationName} 현재 외기온도</div>
              <div id="currentTemp" class="temp-value mt-1">--.-℃</div>
            </div>
            <span id="statusPill" class="badge rounded-pill bg-success bg-opacity-75 px-3 py-2" style="font-size: 12px;">
              감시 대기
            </span>
          </div>
          <div id="tempMeta" class="small opacity-75 mb-3" style="font-size: 12px;">
            기상청 데이터를 불러오는 중...
          </div>
          <div class="row g-2">
            <div class="col-6">
              <button id="refreshTempBtn" type="button" class="btn btn-light w-100 fw-bold btn-sm py-2" style="color: #17324d;" onclick="refreshTemp(true)">
                🔄 온도 새로고침
              </button>
            </div>
            <div class="col-6">
              <button id="testAlertBtn" type="button" class="btn btn-warning w-100 fw-bold btn-sm py-2 text-dark" onclick="sendTestAlert()">
                🔔 테스트 알림 발송
              </button>
            </div>
          </div>
        </section>

        <!-- 3. 휴무일용 전체 알람 일시정지 (마스터 스위치) -->
        <section id="masterCard" class="panel-card master-card">
          <div class="d-flex justify-content-between align-items-center">
            <div>
              <div class="fw-bold" style="font-size: 15px;">
                전체 알람 감시
                <span id="masterBadge" class="badge bg-success ms-1" style="font-size: 11px;">작동 중</span>
              </div>
              <div id="masterDesc" class="text-muted mt-1" style="font-size: 12.5px;">
                21시 · 00시 · 03시 · 06시 정각에 설정 온도 이하 시 긴급 알림
              </div>
            </div>
            <label class="switch ms-3" aria-label="전체 알람 감시 마스터 스위치">
              <input id="masterSwitch" type="checkbox" checked onchange="toggleMaster(this.checked)" />
              <span class="slider round"></span>
            </label>
          </div>
        </section>

        <!-- 4. 알람 목록 헤더 & + 추가 버튼 -->
        <div class="d-flex justify-content-between align-items-center mb-2 mt-3 px-1">
          <h2 class="h6 fw-bold mb-0" style="color: #17324d;">
            ⏰ 설정된 온도 알람 (<span id="alarmCount">0</span> / 5)
          </h2>
          <button id="addAlarmBtn" type="button" class="btn btn-primary btn-sm rounded-pill px-3 fw-bold shadow-sm" style="background-color: #17324d; border-color: #17324d;" onclick="openAddModal()">
            + 추가
          </button>
        </div>

        <!-- 알람 목록 렌더링 영역 -->
        <div id="alarmList"></div>

        <!-- 안내 푸터 -->
        <div class="text-center text-muted mt-4" style="font-size: 12px; line-height: 1.6;">
          • 여러 알람 조건이 동시에 충족되면 <b>가장 낮은 온도 1개</b>만 발송<br />
          • 아이폰 Bark 긴급 알림(무음·수면 돌파 / 30초 연속 벨소리)<br />
          <p style="margin-top:8px">&copy; Designed by AnSangHyun 2026</p>
        </div>
      </main>
    </div>

    <!-- 알람 추가/수정 모달 -->
    <div class="modal fade" id="alarmModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-0 rounded-4 shadow">
          <div class="modal-header text-white rounded-top-4" style="background-color: #17324d;">
            <h5 id="modalTitle" class="modal-title h6 fw-bold">➕ 새 온도 알람 추가</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="닫기"></button>
          </div>
          <div class="modal-body p-3">
            <input type="hidden" id="editAlarmId" value="" />

            <div class="mb-3">
              <label for="alarmTitleInput" class="form-label fw-bold small">알람 타이틀</label>
              <input type="text" id="alarmTitleInput" class="form-control" maxlength="40" placeholder="예: 동파 주의 · 새벽 온도순찰" />
            </div>

            <div class="mb-3">
              <label for="alarmThresholdInput" class="form-label fw-bold small">알람 기준 온도 (℃ 이하일 때 발송)</label>
              <div class="input-group">
                <input type="number" id="alarmThresholdInput" class="form-control fw-bold" step="0.5" min="-40" max="50" placeholder="-5" />
                <span class="input-group-text fw-bold">℃ 이하</span>
              </div>
              <div class="d-flex flex-wrap gap-2 mt-2">
                <button type="button" class="btn btn-outline-secondary preset-chip" onclick="setPresetTemp(0)">0℃</button>
                <button type="button" class="btn btn-outline-secondary preset-chip" onclick="setPresetTemp(-3)">-3℃</button>
                <button type="button" class="btn btn-outline-primary preset-chip" onclick="setPresetTemp(-5)">-5℃</button>
                <button type="button" class="btn btn-outline-danger preset-chip" onclick="setPresetTemp(-10)">-10℃</button>
                <button type="button" class="btn btn-outline-danger preset-chip" onclick="setPresetTemp(-15)">-15℃</button>
              </div>
            </div>

            <div class="mb-2">
              <label for="alarmSoundSelect" class="form-label fw-bold small">아이폰(Bark) 알람벨 선택</label>
              <select id="alarmSoundSelect" class="form-select">
                <option value="alarm" selected>🔔 기본 알람벨 (Alarm · 권장)</option>
                <option value="bell">벨소리 (Bell)</option>
                <option value="electronic">전자음 (Electronic)</option>
                <option value="horn">경적음 (Horn)</option>
                <option value="sherwoodforest">셔우드 숲 (Sherwood Forest)</option>
                <option value="telegraph">전신음 (Telegraph)</option>
                <option value="calypso">칼립소 (Calypso)</option>
                <option value="chime">차임벨 (Chime)</option>
                <option value="pulse">펄스 (Pulse)</option>
                <option value="minuet">미뉴에트 (Minuet)</option>
                <option value="tiptoes">팁토즈 (Tiptoes)</option>
                <option value="update">업데이트 (Update)</option>
                <option value="noir">느와르 (Noir)</option>
                <option value="newmail">새 메일 (New Mail)</option>
                <option value="gotosleep">취침음 (Go To Sleep)</option>
                <option value="multiwayinvitation">초대음 (Multiway Invitation)</option>
              </select>
              <div class="form-text" style="font-size: 12px;">
                기본 알람벨(Alarm)이 기본값으로 적용되며, Bark 앱 내장 벨소리 중 선택할 수 있습니다.
              </div>
            </div>
          </div>
          <div class="modal-footer border-0 pt-0">
            <button type="button" class="btn btn-light fw-bold" data-bs-dismiss="modal">취소</button>
            <button id="saveAlarmBtn" type="button" class="btn btn-primary fw-bold px-4" style="background-color: #17324d; border-color: #17324d;" onclick="saveAlarm()">
              저장
            </button>
          </div>
        </div>
      </div>
    </div>

    <div id="toastBox" class="toast-box"></div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
    <script>
      const PATROL_URL = ${JSON.stringify(safePatrolUrl)};
      const HOME_URL = ${JSON.stringify(homeUrl || "")};
      const SOUND_LABELS = {
        alarm: "기본 알람벨",
        bell: "벨소리",
        electronic: "전자음",
        horn: "경적음",
        sherwoodforest: "셔우드 숲",
        telegraph: "전신음",
        calypso: "칼립소",
        chime: "차임벨",
        pulse: "펄스",
        minuet: "미뉴에트",
        tiptoes: "팁토즈",
        update: "업데이트",
        noir: "느와르",
        newmail: "새 메일",
        gotosleep: "취침음",
        multiwayinvitation: "초대음"
      };

      let appState = {
        masterEnabled: true,
        alarms: [],
        activeAlert: null,
        lastCheck: null
      };
      let alarmModal = null;
      let toastTimer = null;

      function showToast(msg) {
        const box = document.getElementById("toastBox");
        box.textContent = msg;
        box.style.display = "block";
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () {
          box.style.display = "none";
        }, 2600);
      }

      function escapeHtml(str) {
        return String(str)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }

      async function apiRequest(url, options) {
        const res = await fetch(url, options || {});
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || "요청 처리에 실패했습니다.");
        }
        return data;
      }

      function renderTemp() {
        const tempEl = document.getElementById("currentTemp");
        const metaEl = document.getElementById("tempMeta");
        const lc = appState.lastCheck;

        if (!lc || typeof lc.temp !== "number") {
          tempEl.textContent = "--.-℃";
          metaEl.textContent = "새로고침 버튼을 눌러 기상청 최신 기온을 불러오세요.";
          return;
        }

        tempEl.textContent = lc.temp.toFixed(1) + "℃";
        metaEl.innerHTML =
          "관측기준: " + lc.observedAt + " (" + lc.source + ") <br>확인: " + (lc.checkedAt || "");
      }

      function renderActiveAlert() {
        const wrap = document.getElementById("activeAlertWrap");
        const alertObj = appState.activeAlert;

        if (!alertObj) {
          wrap.classList.add("d-none");
          return;
        }

        wrap.classList.remove("d-none");
        document.getElementById("alertBadge").textContent = alertObj.isTest
          ? "🔔 테스트 경보 발동"
          : "🚨 외기온도 경보 발동";
        document.getElementById("alertTime").textContent = alertObj.triggeredAt || "";
        document.getElementById("alertTitle").textContent = alertObj.title || "";
        document.getElementById("alertDetail").innerHTML =
          "현재 마곡동 외기온도 <strong class='text-danger'>" +
          Number(alertObj.currentTemp).toFixed(1) +
          "℃</strong> (설정 기준: <strong>" +
          alertObj.threshold +
          "℃ 이하</strong>)<br><span class='text-muted'>" +
          escapeHtml(alertObj.observedAt || "") +
          "</span>";

        const patrolBtn = document.getElementById("patrolBtn");
        if (!PATROL_URL) {
          patrolBtn.classList.add("d-none");
        } else {
          patrolBtn.classList.remove("d-none");
          patrolBtn.href = PATROL_URL;
        }
      }

      function renderMaster() {
        const enabled = Boolean(appState.masterEnabled);
        const card = document.getElementById("masterCard");
        const badge = document.getElementById("masterBadge");
        const desc = document.getElementById("masterDesc");
        const sw = document.getElementById("masterSwitch");
        const pill = document.getElementById("statusPill");

        sw.checked = enabled;
        if (enabled) {
          card.classList.remove("paused");
          badge.className = "badge bg-success ms-1";
          badge.textContent = "작동 중";
          desc.textContent = "21시 · 00시 · 03시 · 06시 정각에 설정 온도 이하 시 긴급 알림";
          pill.className = "badge rounded-pill bg-success bg-opacity-75 px-3 py-2";
          pill.textContent = "자동 감시 ON";
        } else {
          card.classList.add("paused");
          badge.className = "badge bg-secondary ms-1";
          badge.textContent = "휴무일 일시정지";
          desc.textContent = "전체 알람이 일시정지되었습니다. 출근 시 다시 켜주세요.";
          pill.className = "badge rounded-pill bg-secondary px-3 py-2";
          pill.textContent = "일시정지됨";
        }
      }

      function renderAlarms() {
        const listEl = document.getElementById("alarmList");
        const countEl = document.getElementById("alarmCount");
        const addBtn = document.getElementById("addAlarmBtn");
        const alarms = appState.alarms || [];

        countEl.textContent = String(alarms.length);
        addBtn.disabled = alarms.length >= 5;
        addBtn.textContent = alarms.length >= 5 ? "최대 5개 완료" : "+ 추가";

        if (alarms.length === 0) {
          listEl.innerHTML =
            "<div class='panel-card text-center py-4 text-muted'>" +
            "<div style='font-size: 28px;'>🔕</div>" +
            "<div class='fw-bold mt-2 text-dark'>등록된 온도 알람이 없습니다.</div>" +
            "<div class='small mt-1'>우측 상단 <b>+ 추가</b> 버튼을 눌러 최대 5개까지 설정하세요.</div>" +
            "</div>";
          return;
        }

        const sorted = alarms.slice().sort(function (a, b) {
          return b.threshold - a.threshold;
        });

        const triggeredId = appState.activeAlert ? appState.activeAlert.alarmId : null;
        let html = "";

        sorted.forEach(function (alarm) {
          const isTriggered = triggeredId === alarm.id;
          const cardClass =
            "alarm-card" +
            (!alarm.enabled ? " disabled" : "") +
            (isTriggered ? " triggered" : "");
          const soundLabel = SOUND_LABELS[alarm.sound] || "기본 알람벨";

          html +=
            "<div class='" + cardClass + "'>" +
            "  <div class='d-flex justify-content-between align-items-start gap-2'>" +
            "    <div class='flex-grow-1'>" +
            "      <div class='d-flex align-items-center flex-wrap gap-2 mb-1'>" +
            "        <span class='threshold-badge'>" + alarm.threshold + "℃ 이하</span>" +
            (isTriggered ? "<span class='badge bg-danger'>발동 중</span>" : "") +
            "        <span class='badge bg-light text-secondary border' style='font-size: 11px;'>🔔 " + escapeHtml(soundLabel) + "</span>" +
            "      </div>" +
            "      <div class='fw-bold mt-1' style='font-size: 16px; color: #17324d;'>" + escapeHtml(alarm.title) + "</div>" +
            "    </div>" +
            "    <label class='switch' aria-label='알람 활성 토글'>" +
            "      <input type='checkbox' " + (alarm.enabled ? "checked" : "") + " onchange='toggleAlarm(\\\"" + alarm.id + "\\\", this.checked)' />" +
            "      <span class='slider round'></span>" +
            "    </label>" +
            "  </div>" +
            "  <div class='d-flex justify-content-end gap-2 mt-3 pt-2 border-top'>" +
            "    <button type='button' class='btn btn-outline-secondary btn-sm px-3' style='font-size: 12px;' onclick='openEditModal(\\\"" + alarm.id + "\\\")'>수정</button>" +
            "    <button type='button' class='btn btn-outline-danger btn-sm px-3' style='font-size: 12px;' onclick='deleteAlarm(\\\"" + alarm.id + "\\\")'>삭제</button>" +
            "  </div>" +
            "</div>";
        });

        listEl.innerHTML = html;
      }

      function renderAll() {
        renderActiveAlert();
        renderTemp();
        renderMaster();
        renderAlarms();
      }

      async function loadInitialState() {
        try {
          const data = await apiRequest("/api/state");
          appState = data.state;
          renderAll();
          await refreshTemp(false);
        } catch (err) {
          showToast("상태 불러오기 실패: " + err.message);
        }
      }

      async function refreshTemp(notify) {
        const btn = document.getElementById("refreshTempBtn");
        btn.disabled = true;
        btn.textContent = "조회 중...";
        try {
          const data = await apiRequest("/api/temp");
          appState.lastCheck = data.lastCheck;
          renderTemp();
          if (notify) showToast("마곡동 최신 기온을 갱신했습니다.");
        } catch (err) {
          document.getElementById("tempMeta").textContent = "조회 오류: " + err.message;
          if (notify) showToast("기온 조회 실패: " + err.message);
        } finally {
          btn.disabled = false;
          btn.textContent = "🔄 온도 새로고침";
        }
      }

      async function toggleMaster(enabled) {
        try {
          const data = await apiRequest("/api/master", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ masterEnabled: enabled })
          });
          appState = data.state;
          renderMaster();
          showToast(enabled ? "전체 알람 감시를 켰습니다." : "휴무일 전체 알람을 일시정지했습니다.");
        } catch (err) {
          showToast("변경 실패: " + err.message);
          renderMaster();
        }
      }

      function setPresetTemp(val) {
        document.getElementById("alarmThresholdInput").value = String(val);
      }

      function openAddModal() {
        if ((appState.alarms || []).length >= 5) {
          showToast("알람은 최대 5개까지 등록할 수 있습니다.");
          return;
        }
        document.getElementById("editAlarmId").value = "";
        document.getElementById("modalTitle").textContent = "➕ 새 온도 알람 추가";
        document.getElementById("alarmTitleInput").value = "";
        document.getElementById("alarmThresholdInput").value = "-5";
        document.getElementById("alarmSoundSelect").value = "alarm";
        alarmModal.show();
      }

      function openEditModal(id) {
        const target = (appState.alarms || []).find(function (a) {
          return a.id === id;
        });
        if (!target) return;

        document.getElementById("editAlarmId").value = target.id;
        document.getElementById("modalTitle").textContent = "✏️ 온도 알람 수정";
        document.getElementById("alarmTitleInput").value = target.title;
        document.getElementById("alarmThresholdInput").value = String(target.threshold);
        document.getElementById("alarmSoundSelect").value = target.sound || "alarm";
        alarmModal.show();
      }

      async function saveAlarm() {
        const id = document.getElementById("editAlarmId").value;
        const title = document.getElementById("alarmTitleInput").value.trim();
        const thresholdRaw = document.getElementById("alarmThresholdInput").value;
        const sound = document.getElementById("alarmSoundSelect").value;

        if (!title) {
          alert("알람 타이틀을 입력해 주세요.");
          return;
        }
        if (thresholdRaw === "" || isNaN(Number(thresholdRaw))) {
          alert("기준 온도를 숫자로 입력해 주세요.");
          return;
        }

        const btn = document.getElementById("saveAlarmBtn");
        btn.disabled = true;

        try {
          const url = id ? "/api/alarms/" + encodeURIComponent(id) : "/api/alarms";
          const method = id ? "PUT" : "POST";
          const data = await apiRequest(url, {
            method: method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: title,
              threshold: Number(thresholdRaw),
              sound: sound
            })
          });
          appState = data.state;
          renderAll();
          alarmModal.hide();
          showToast(id ? "알람을 수정했습니다." : "새 알람을 저장했습니다.");
        } catch (err) {
          alert(err.message);
        } finally {
          btn.disabled = false;
        }
      }

      async function toggleAlarm(id, enabled) {
        try {
          const data = await apiRequest("/api/alarms/" + encodeURIComponent(id), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled: enabled })
          });
          appState = data.state;
          renderAlarms();
          showToast(enabled ? "알람을 활성화했습니다." : "알람을 비활성화했습니다.");
        } catch (err) {
          showToast("변경 실패: " + err.message);
          renderAlarms();
        }
      }

      async function deleteAlarm(id) {
        if (!confirm("이 온도 알람을 삭제하시겠습니까?")) return;
        try {
          const data = await apiRequest("/api/alarms/" + encodeURIComponent(id), {
            method: "DELETE"
          });
          appState = data.state;
          renderAll();
          showToast("알람을 삭제했습니다.");
        } catch (err) {
          showToast("삭제 실패: " + err.message);
        }
      }

      async function sendTestAlert() {
        const btn = document.getElementById("testAlertBtn");
        btn.disabled = true;
        btn.textContent = "발송 중...";
        try {
          const data = await apiRequest("/api/test", { method: "POST" });
          appState = data.state;
          renderAll();
          window.scrollTo({ top: 0, behavior: "smooth" });
          showToast("아이폰으로 긴급 테스트 알림을 보냈습니다.");
        } catch (err) {
          alert("테스트 발송 실패: " + err.message);
        } finally {
          btn.disabled = false;
          btn.textContent = "🔔 테스트 알림 발송";
        }
      }

      async function ackAlert() {
        try {
          const data = await apiRequest("/api/ack", { method: "POST" });
          appState = data.state;
          renderAll();
          showToast("경보 확인 완료 · 평상시 화면으로 복귀했습니다.");
        } catch (err) {
          showToast("해제 실패: " + err.message);
        }
      }

      document.addEventListener("DOMContentLoaded", function () {
        alarmModal = new bootstrap.Modal(document.getElementById("alarmModal"));
        const homeBtn = document.getElementById("homeBtn");
        if (!HOME_URL) {
          homeBtn.addEventListener("click", function (e) {
            e.preventDefault();
            showToast("wrangler.jsonc의 HOME_URL을 설정해 주세요.");
          });
        }
        loadInitialState();
      });
    </script>
  </body>
</html>`;
}