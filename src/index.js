import { renderHtml } from "./ui.js";

const LOCATION = {
  name: "서울시 강서구 마곡중앙10로 30",
  shortName: "LG 사이언스파크",
  nx: 57,
  ny: 127,
  gridCols: 149,
  gridRows: 253
};

const KV_STATE_KEY = "app_state";
const MAX_ALARMS = 5;
const TEMP_CACHE_TTL_MS = 3 * 60 * 1000; // 웹 1분 자동갱신용 기상청 3분 캐시
const KMA_TIMEOUT_MS = 4500;
const PUSH_TIMEOUT_MS = 6000;

const ALLOWED_SOUNDS = new Set([
  "alarm",
  "bell",
  "calypso",
  "chime",
  "electronic",
  "gotosleep",
  "horn",
  "minuet",
  "multiwayinvitation",
  "newmail",
  "noir",
  "pulse",
  "sherwoodforest",
  "telegraph",
  "tiptoes",
  "update"
]);

const DEFAULT_STATE = {
  masterEnabled: true,
  alarms: [],
  activeAlert: null,
  lastCheck: null,
  appOrigin: ""
};

// ============================================================================
// 공통 유틸리티
// ============================================================================

function getKstDate(offsetMinutes = 0) {
  return new Date(Date.now() + (9 * 60 + offsetMinutes) * 60 * 1000);
}

function formatKstDateTime(dateObj) {
  const yyyy = dateObj.getUTCFullYear();
  const mm = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dateObj.getUTCDate()).padStart(2, "0");
  const hh = String(dateObj.getUTCHours()).padStart(2, "0");
  const mi = String(dateObj.getUTCMinutes()).padStart(2, "0");
  const ss = String(dateObj.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function formatKmaParts(dateObj) {
  const yyyy = dateObj.getUTCFullYear();
  const mm = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dateObj.getUTCDate()).padStart(2, "0");
  const hh = String(dateObj.getUTCHours()).padStart(2, "0");
  return {
    baseDate: `${yyyy}${mm}${dd}`,
    baseTime: `${hh}00`,
    ymdh: `${yyyy}${mm}${dd}${hh}`,
    label: `${yyyy}-${mm}-${dd} ${hh}:00`
  };
}

function formatTempRange(minTemp, maxTemp) {
  return `${minTemp}℃ ~ ${maxTemp}℃`;
}

function parseCsvList(rawValue) {
  return String(rawValue || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function maskSecret(val) {
  if (!val) return "(empty)";
  if (val.length <= 4) return `****(len:${val.length})`;
  return `${val.slice(0, 3)}***${val.slice(-2)}(len:${val.length})`;
}

// 타임아웃이 보장되는 안전한 fetch 래퍼
async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error(`응답 시간 초과 (${timeoutMs}ms)`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

// ============================================================================
// 상태(KV) 관리 및 알람 데이터 검증
// ============================================================================

function normalizeAlarm(a) {
  if (typeof a.minTemp === "number" && typeof a.maxTemp === "number") {
    return a;
  }
  const legacyMax = typeof a.threshold === "number" ? a.threshold : -5;
  return {
    ...a,
    minTemp: Math.min(-40, legacyMax),
    maxTemp: legacyMax
  };
}

function normalizeActiveAlert(alertObj) {
  if (!alertObj) return null;
  if (typeof alertObj.minTemp === "number" && typeof alertObj.maxTemp === "number") {
    return alertObj;
  }
  const legacyMax = typeof alertObj.threshold === "number" ? alertObj.threshold : -5;
  return {
    ...alertObj,
    minTemp: Math.min(-40, legacyMax),
    maxTemp: legacyMax
  };
}

function parseTempRange(minRaw, maxRaw) {
  if (
    minRaw === "" || minRaw === null || minRaw === undefined ||
    maxRaw === "" || maxRaw === null || maxRaw === undefined
  ) {
    return { error: "최저 온도와 최고 온도를 모두 입력해 주세요." };
  }

  const minTemp = Number(minRaw);
  const maxTemp = Number(maxRaw);

  if (Number.isNaN(minTemp) || Number.isNaN(maxTemp)) {
    return { error: "온도는 숫자로 입력해 주세요." };
  }
  if (minTemp < -40 || minTemp > 50 || maxTemp < -40 || maxTemp > 50) {
    return { error: "온도는 -40℃ ~ 50℃ 범위 안에서 입력해 주세요." };
  }
  if (minTemp > maxTemp) {
    return { error: "최저 온도는 최고 온도보다 작거나 같아야 합니다." };
  }

  return { minTemp, maxTemp };
}

function findOverlappingAlarm(alarms, minTemp, maxTemp, excludeId = null) {
  return alarms.find((a) => {
    if (excludeId && a.id === excludeId) return false;
    return minTemp <= a.maxTemp && maxTemp >= a.minTemp;
  });
}

function pickMatchedAlarm(alarms, currentTemp) {
  const matched = alarms.filter(
    (a) =>
      a.enabled &&
      typeof a.minTemp === "number" &&
      typeof a.maxTemp === "number" &&
      currentTemp >= a.minTemp &&
      currentTemp <= a.maxTemp
  );
  if (matched.length === 0) return null;

  matched.sort((a, b) => a.minTemp - b.minTemp || a.maxTemp - b.maxTemp);
  return matched[0];
}

async function loadState(env) {
  const raw = await env.ALARM_KV.get(KV_STATE_KEY, "json");
  if (!raw) return structuredClone(DEFAULT_STATE);
  return {
    masterEnabled: typeof raw.masterEnabled === "boolean" ? raw.masterEnabled : true,
    alarms: Array.isArray(raw.alarms) ? raw.alarms.map(normalizeAlarm) : [],
    activeAlert: normalizeActiveAlert(raw.activeAlert),
    lastCheck: raw.lastCheck || null,
    appOrigin: raw.appOrigin || ""
  };
}

async function saveState(env, state) {
  await env.ALARM_KV.put(KV_STATE_KEY, JSON.stringify(state));
}

// ============================================================================
// 기상청 API허브 외기온도 조회 (타임아웃 + 자동 폴백)
// ============================================================================

function parseDfsGridTemp(text) {
  const cleaned = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .join(" ");

  const tokens = cleaned.split(/[\s,]+/).filter(Boolean);
  const totalNeeded = LOCATION.gridCols * LOCATION.gridRows; // 37,697
  if (tokens.length < totalNeeded) {
    throw new Error(`격자 데이터 개수 부족 (${tokens.length})`);
  }

  const idx = (LOCATION.ny - 1) * LOCATION.gridCols + (LOCATION.nx - 1);
  const val = parseFloat(tokens[idx]);
  if (Number.isNaN(val) || val <= -90) {
    throw new Error(`결측 격자값 (${tokens[idx]})`);
  }
  return val;
}

// 1순위: 초단기실황 JSON
async function fetchFromTyp02Json(authKey) {
  const offsets = [0, -60];
  let lastError = "";

  for (const offsetMin of offsets) {
    const parts = formatKmaParts(getKstDate(offsetMin));
    const url =
      `https://apihub.kma.go.kr/api/typ02/openApi/VilageFcstInfoService_2.0/getUltraSrtNcst` +
      `?pageNo=1&numOfRows=10&dataType=JSON` +
      `&base_date=${parts.baseDate}&base_time=${parts.baseTime}` +
      `&nx=${LOCATION.nx}&ny=${LOCATION.ny}` +
      `&authKey=${encodeURIComponent(authKey)}`;

    const res = await fetchWithTimeout(url, {}, 3500);
    if (!res.ok) {
      lastError = `typ02 HTTP ${res.status}`;
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        throw new Error(lastError);
      }
      continue;
    }

    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      lastError = "typ02 JSON 파싱 실패";
      continue;
    }

    const resultCode = json?.response?.header?.resultCode;
    const items = json?.response?.body?.items?.item;
    if (resultCode === "00" && Array.isArray(items)) {
      const t1h = items.find((item) => item.category === "T1H");
      if (t1h && t1h.obsrValue !== undefined) {
        const temp = parseFloat(t1h.obsrValue);
        if (!Number.isNaN(temp) && temp > -90) {
          return {
            temp,
            observedAt: parts.label,
            source: "초단기실황(API허브)"
          };
        }
      }
    }
    lastError = json?.response?.header?.resultMsg || "데이터 미발표";
  }

  throw new Error(lastError || "초단기실황 조회 실패");
}

// 2순위: 초단기실황 격자
async function fetchFromTyp01OdamGrid(authKey) {
  const offsets = [0, -60];
  let lastError = "";

  for (const offsetMin of offsets) {
    const parts = formatKmaParts(getKstDate(offsetMin));
    const url =
      `https://apihub.kma.go.kr/api/typ01/cgi-bin/url/nph-dfs_odam_grd` +
      `?tmfc=${parts.ymdh}&vars=T1H&authKey=${encodeURIComponent(authKey)}`;

    const res = await fetchWithTimeout(url, {}, KMA_TIMEOUT_MS);
    if (!res.ok) {
      lastError = `odam_grd HTTP ${res.status}`;
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        throw new Error(lastError);
      }
      continue;
    }

    const text = await res.text();
    try {
      const temp = parseDfsGridTemp(text);
      return {
        temp,
        observedAt: parts.label,
        source: "초단기실황 격자(API허브)"
      };
    } catch (err) {
      lastError = err.message;
    }
  }

  throw new Error(lastError || "초단기실황 격자 조회 실패");
}

// 3순위: 단기예보 격자
function getLatestShrtTmfc() {
  const ref = getKstDate(-15);
  const hour = ref.getUTCHours();
  const baseHours = [2, 5, 8, 11, 14, 17, 20, 23];

  let selectedHour = null;
  for (const h of baseHours) {
    if (h <= hour) selectedHour = h;
  }

  if (selectedHour === null) {
    const prevDay = new Date(ref.getTime() - 24 * 60 * 60 * 1000);
    const yyyy = prevDay.getUTCFullYear();
    const mm = String(prevDay.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(prevDay.getUTCDate()).padStart(2, "0");
    return `${yyyy}${mm}${dd}23`;
  }

  const yyyy = ref.getUTCFullYear();
  const mm = String(ref.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(ref.getUTCDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}${String(selectedHour).padStart(2, "0")}`;
}

async function fetchFromTyp01ShrtGrid(authKey) {
  const tmfc = getLatestShrtTmfc();
  const parts = formatKmaParts(getKstDate(0));
  const url =
    `https://apihub.kma.go.kr/api/typ01/cgi-bin/url/nph-dfs_shrt_grd` +
    `?tmfc=${tmfc}&tmef=${parts.ymdh}&vars=TMP&authKey=${encodeURIComponent(authKey)}`;

  const res = await fetchWithTimeout(url, {}, KMA_TIMEOUT_MS);
  if (!res.ok) {
    throw new Error(`shrt_grd HTTP ${res.status}`);
  }

  const text = await res.text();
  const temp = parseDfsGridTemp(text);
  return {
    temp,
    observedAt: parts.label,
    source: "단기예보 격자(API허브)"
  };
}

async function fetchMagokTemp(env) {
  const authKey = (env.KMA_API_KEY || "").trim();
  if (!authKey) {
    throw new Error("Cloudflare Secret에 KMA_API_KEY가 등록되지 않았습니다.");
  }

  const errors = [];
  for (const fn of [fetchFromTyp02Json, fetchFromTyp01OdamGrid, fetchFromTyp01ShrtGrid]) {
    try {
      const result = await fn(authKey);
      return {
        ...result,
        checkedAt: formatKstDateTime(getKstDate()),
        fetchedAtMs: Date.now()
      };
    } catch (err) {
      errors.push(err.message);
    }
  }

  throw new Error(`기상청 데이터 조회 실패 (${errors.join(" / ")})`);
}

// ============================================================================
// 긴급 알림 발송 (아이폰 Bark + 안드로이드 ntfy)
// ============================================================================

async function pushToBark(deviceKey, { title, body, sound, clickUrl }) {
  const startedAt = Date.now();
  const payload = {
    device_key: deviceKey,
    title,
    body,
    level: "critical",
    volume: 10,
    call: "1",
    sound: ALLOWED_SOUNDS.has(sound) ? sound : "alarm",
    group: "magok-temp-alarm"
  };

  if (clickUrl) {
    payload.url = clickUrl;
  }

  const res = await fetchWithTimeout(
    "https://api.day.app/push",
    {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload)
    },
    PUSH_TIMEOUT_MS
  );

  const resText = await res.text();
  let parsed = null;
  try {
    parsed = JSON.parse(resText);
  } catch {
    // JSON이 아닌 응답은 HTTP 상태로만 판정
  }

  if (!res.ok || (parsed && parsed.code !== undefined && parsed.code !== 200)) {
    throw new Error(`Bark 발송 실패 (HTTP ${res.status}): ${parsed?.message || resText}`);
  }

  return {
    channel: "bark",
    target: maskSecret(deviceKey),
    ok: true,
    ms: Date.now() - startedAt
  };
}

async function pushToNtfy(rawTopic, { title, body, clickUrl }) {
  const startedAt = Date.now();
  const topic = rawTopic
    .replace(/^https?:\/\/ntfy\.sh\//i, "")
    .replace(/^\/+|\/+$/g, "")
    .trim();

  if (!topic) {
    throw new Error("ntfy 토픽 이름이 비어 있습니다.");
  }

  const payload = {
    topic,
    title,
    message: body,
    priority: 5
  };

  if (clickUrl) {
    payload.click = clickUrl;
  }

  const res = await fetchWithTimeout(
    "https://ntfy.sh",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "User-Agent": "magok-temp-alarm/2.0"
      },
      body: JSON.stringify(payload)
    },
    PUSH_TIMEOUT_MS
  );

  const resText = await res.text();
  if (!res.ok) {
    throw new Error(`ntfy 발송 실패 (HTTP ${res.status}): ${resText}`);
  }

  return {
    channel: "ntfy",
    target: maskSecret(topic),
    ok: true,
    ms: Date.now() - startedAt
  };
}

async function sendAlerts(env, { alarm, temp, observedAt, origin, isTest = false }) {
  const barkKeys = parseCsvList(env.BARK_KEY);
  const ntfyTopics = parseCsvList(env.NTFY_TOPIC);

  if (barkKeys.length === 0 && ntfyTopics.length === 0) {
    throw new Error("Cloudflare Secret에 BARK_KEY 또는 NTFY_TOPIC이 등록되지 않았습니다.");
  }

  const rangeText = formatTempRange(alarm.minTemp, alarm.maxTemp);

  const title = isTest
    ? `🔔 [테스트] ${alarm.title}`
    : `🚨 ${alarm.title} (${LOCATION.shortName} ${temp}℃)`;

  const body = isTest
    ? `현재 ${LOCATION.shortName} 외기온도 ${temp}℃ (설정구간: ${rangeText})\n기준시각: ${observedAt} · 터치하여 강조 화면을 확인하세요.`
    : `현재 ${LOCATION.shortName} 외기온도 ${temp}℃ (설정구간: ${rangeText})\n기준시각: ${observedAt} · 터치하여 확인 및 순찰 로드맵 이동`;

  const clickUrl = origin ? `${origin}/?alert=${encodeURIComponent(alarm.id)}` : "";

  const tasks = [
    ...barkKeys.map((key) =>
      pushToBark(key, { title, body, sound: alarm.sound, clickUrl }).catch((err) => ({
        channel: "bark",
        target: maskSecret(key),
        ok: false,
        error: err.message
      }))
    ),
    ...ntfyTopics.map((topic) =>
      pushToNtfy(topic, { title, body, clickUrl }).catch((err) => ({
        channel: "ntfy",
        target: maskSecret(topic),
        ok: false,
        error: err.message
      }))
    )
  ];

  const results = await Promise.all(tasks);
  const succeeded = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  // Cloudflare Real-time logs에서 발송 상태를 즉시 판별할 수 있도록 기록
  console.log(
    "[ALERT_DELIVERY]",
    JSON.stringify({
      isTest,
      barkConfigured: barkKeys.length,
      ntfyConfigured: ntfyTopics.length,
      results
    })
  );

  if (succeeded.length === 0) {
    throw new Error(failed.map((f) => f.error).join(" / ") || "알림 발송 실패");
  }

  return {
    barkConfigured: barkKeys.length,
    ntfyConfigured: ntfyTopics.length,
    succeeded: succeeded.length,
    failed: failed.length,
    results
  };
}

// ============================================================================
// Cloudflare Workers 엔트리포인트
// ============================================================================

export default {
  // Cron 정각 자동 실행 (KST 21:00, 00:00, 03:00, 06:00)
  async scheduled(event, env, ctx) {
    const state = await loadState(env);

    let tempInfo;
    try {
      tempInfo = await fetchMagokTemp(env);
      state.lastCheck = tempInfo;
    } catch (err) {
      console.error("[CRON] 기온 조회 실패:", err.message);
      return;
    }

    if (!state.masterEnabled) {
      await saveState(env, state);
      return;
    }

    const matchedAlarm = pickMatchedAlarm(state.alarms, tempInfo.temp);
    if (!matchedAlarm) {
      await saveState(env, state);
      return;
    }

    const origin = (env.APP_URL || state.appOrigin || "").replace(/\/$/, "");
    try {
      await sendAlerts(env, {
        alarm: matchedAlarm,
        temp: tempInfo.temp,
        observedAt: tempInfo.observedAt,
        origin,
        isTest: false
      });

      state.activeAlert = {
        alarmId: matchedAlarm.id,
        title: matchedAlarm.title,
        minTemp: matchedAlarm.minTemp,
        maxTemp: matchedAlarm.maxTemp,
        sound: matchedAlarm.sound || "alarm",
        currentTemp: tempInfo.temp,
        observedAt: `${tempInfo.observedAt} · ${tempInfo.source}`,
        triggeredAt: formatKstDateTime(getKstDate()),
        isTest: false
      };
    } catch (err) {
      console.error("[CRON] 알림 발송 실패:", err.message);
    }

    await saveState(env, state);
  },

  // 웹 UI 및 REST API 처리
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    try {
      // 1) 메인 웹 화면 렌더링
      if (pathname === "/" && method === "GET") {
        const state = await loadState(env);
        if (state.appOrigin !== url.origin) {
          state.appOrigin = url.origin;
          ctx.waitUntil(saveState(env, state));
        }

        const html = renderHtml({
          locationName: LOCATION.name,
          homeUrl: env.HOME_URL || "",
          // patrolUrl: env.PATROL_URL || ""
          patrolUrl: ""
        });

        return new Response(html, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store"
          }
        });
      }

      // 2) 전체 상태 조회
      if (pathname === "/api/state" && method === "GET") {
        const state = await loadState(env);
        return jsonResponse({ ok: true, state });
      }

      // 3) 외기온도 조회 (3분 이내 재요청은 캐시로 즉시 응답 -> 기상청 지연·부하 방지)
      if (pathname === "/api/temp" && method === "GET") {
        const state = await loadState(env);
        const prev = state.lastCheck;
        const isCacheFresh =
          prev &&
          typeof prev.temp === "number" &&
          typeof prev.fetchedAtMs === "number" &&
          Date.now() - prev.fetchedAtMs < TEMP_CACHE_TTL_MS;

        if (isCacheFresh) {
          return jsonResponse({
            ok: true,
            lastCheck: {
              ...prev,
              checkedAt: formatKstDateTime(getKstDate())
            },
            activeAlert: state.activeAlert
          });
        }

        const tempInfo = await fetchMagokTemp(env);
        const shouldSaveKv =
          !prev ||
          prev.temp !== tempInfo.temp ||
          prev.observedAt !== tempInfo.observedAt ||
          !prev.fetchedAtMs ||
          Date.now() - prev.fetchedAtMs >= TEMP_CACHE_TTL_MS ||
          state.appOrigin !== url.origin;

        state.lastCheck = tempInfo;
        state.appOrigin = url.origin;

        if (shouldSaveKv) {
          await saveState(env, state);
        }

        return jsonResponse({
          ok: true,
          lastCheck: tempInfo,
          activeAlert: state.activeAlert
        });
      }

      // 4) 휴무일 마스터 스위치 토글
      if (pathname === "/api/master" && method === "POST") {
        const body = await request.json();
        const state = await loadState(env);
        state.masterEnabled = Boolean(body.masterEnabled);
        await saveState(env, state);
        return jsonResponse({ ok: true, state });
      }

      // 5) 알람 신규 추가 (최대 5개, 구간 중복 방지)
      if (pathname === "/api/alarms" && method === "POST") {
        const body = await request.json();
        const state = await loadState(env);

        if (state.alarms.length >= MAX_ALARMS) {
          return jsonResponse(
            { ok: false, error: `알람은 최대 ${MAX_ALARMS}개까지만 등록할 수 있습니다.` },
            400
          );
        }

        const title = String(body.title || "").trim();
        if (!title) {
          return jsonResponse({ ok: false, error: "알람 타이틀을 입력해 주세요." }, 400);
        }

        const parsed = parseTempRange(body.minTemp, body.maxTemp);
        if (parsed.error) {
          return jsonResponse({ ok: false, error: parsed.error }, 400);
        }

        const overlap = findOverlappingAlarm(state.alarms, parsed.minTemp, parsed.maxTemp);
        if (overlap) {
          return jsonResponse(
            {
              ok: false,
              error: `기존 알람("${overlap.title}", ${formatTempRange(overlap.minTemp, overlap.maxTemp)})과 온도 구간이 겹칩니다. 겹치지 않게 입력해 주세요.`
            },
            400
          );
        }

        const sound = ALLOWED_SOUNDS.has(body.sound) ? body.sound : "alarm";
        const newAlarm = {
          id: `alm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          title,
          minTemp: parsed.minTemp,
          maxTemp: parsed.maxTemp,
          sound,
          enabled: true,
          createdAt: formatKstDateTime(getKstDate())
        };

        state.alarms.push(newAlarm);
        await saveState(env, state);
        return jsonResponse({ ok: true, alarm: newAlarm, state });
      }

      // 6) 개별 알람 수정 / 토글 / 삭제
      if (pathname.startsWith("/api/alarms/")) {
        const id = decodeURIComponent(pathname.slice("/api/alarms/".length));
        const state = await loadState(env);
        const idx = state.alarms.findIndex((a) => a.id === id);

        if (idx === -1) {
          return jsonResponse({ ok: false, error: "해당 알람을 찾을 수 없습니다." }, 404);
        }

        if (method === "PUT") {
          const body = await request.json();
          const target = state.alarms[idx];

          if (body.title !== undefined) {
            const title = String(body.title).trim();
            if (!title) {
              return jsonResponse({ ok: false, error: "알람 타이틀을 입력해 주세요." }, 400);
            }
            target.title = title;
          }

          if (body.minTemp !== undefined || body.maxTemp !== undefined) {
            const nextMin = body.minTemp !== undefined ? body.minTemp : target.minTemp;
            const nextMax = body.maxTemp !== undefined ? body.maxTemp : target.maxTemp;
            const parsed = parseTempRange(nextMin, nextMax);
            if (parsed.error) {
              return jsonResponse({ ok: false, error: parsed.error }, 400);
            }

            const overlap = findOverlappingAlarm(
              state.alarms,
              parsed.minTemp,
              parsed.maxTemp,
              id
            );
            if (overlap) {
              return jsonResponse(
                {
                  ok: false,
                  error: `기존 알람("${overlap.title}", ${formatTempRange(overlap.minTemp, overlap.maxTemp)})과 온도 구간이 겹칩니다. 겹치지 않게 입력해 주세요.`
                },
                400
              );
            }

            target.minTemp = parsed.minTemp;
            target.maxTemp = parsed.maxTemp;
            delete target.threshold;
          }

          if (body.sound !== undefined) {
            target.sound = ALLOWED_SOUNDS.has(body.sound) ? body.sound : "alarm";
          }
          if (body.enabled !== undefined) {
            target.enabled = Boolean(body.enabled);
          }

          await saveState(env, state);
          return jsonResponse({ ok: true, state });
        }

        if (method === "DELETE") {
          state.alarms.splice(idx, 1);
          if (state.activeAlert?.alarmId === id) {
            state.activeAlert = null;
          }
          await saveState(env, state);
          return jsonResponse({ ok: true, state });
        }
      }

      // 7) 강조 카드 확인 완료 (강조 해제)
      if (pathname === "/api/ack" && method === "POST") {
        const state = await loadState(env);
        state.activeAlert = null;
        await saveState(env, state);
        return jsonResponse({ ok: true, state });
      }

      // 8) 수동 테스트 알림 발송 (저장된 기온 즉시 사용 -> 1초 내 완료)
      if (pathname === "/api/test" && method === "POST") {
        const state = await loadState(env);
        let tempInfo = state.lastCheck;

        if (!tempInfo || typeof tempInfo.temp !== "number") {
          try {
            tempInfo = await fetchMagokTemp(env);
            state.lastCheck = tempInfo;
          } catch {
            tempInfo = {
              temp: -5.0,
              observedAt: formatKstDateTime(getKstDate()).slice(0, 16),
              source: "임시 테스트값"
            };
          }
        }

        const matchedNow = pickMatchedAlarm(state.alarms, tempInfo.temp);
        const enabledAlarms = state.alarms
          .filter((a) => a.enabled)
          .sort((a, b) => a.minTemp - b.minTemp);

        const sampleAlarm = matchedNow || enabledAlarms[0] || state.alarms[0] || {
          id: "test_alarm",
          title: "동파 주의 테스트 알람",
          minTemp: -10,
          maxTemp: -5,
          sound: "alarm"
        };

        state.appOrigin = url.origin;

        const delivery = await sendAlerts(env, {
          alarm: sampleAlarm,
          temp: tempInfo.temp,
          observedAt: tempInfo.observedAt,
          origin: url.origin,
          isTest: true
        });

        state.activeAlert = {
          alarmId: sampleAlarm.id,
          title: sampleAlarm.title,
          minTemp: sampleAlarm.minTemp,
          maxTemp: sampleAlarm.maxTemp,
          sound: sampleAlarm.sound || "alarm",
          currentTemp: tempInfo.temp,
          observedAt: `${tempInfo.observedAt} · ${tempInfo.source}`,
          triggeredAt: formatKstDateTime(getKstDate()),
          isTest: true
        };

        await saveState(env, state);
        return jsonResponse({ ok: true, state, delivery });
      }

      return jsonResponse({ ok: false, error: "Not Found" }, 404);
    } catch (err) {
      return jsonResponse({ ok: false, error: err.message || "서버 오류" }, 500);
    }
  }
};