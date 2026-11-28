// src/users.js
// 당직 근무자(수신자)별 알림 키 관리 파일
//
// [항목 안내]
// - id: 각 사용자를 구분하는 고유 ID (영문/숫자, 중복 금지)
// - name: 웹 화면에 표시될 이름
// - platform: "iphone" (Bark 앱) 또는 "android" (ntfy 앱)
// - key: 아이폰은 Bark Device Key, 안드로이드는 ntfy 주제(Topic) 이름
// - defaultEnabled: 초기 ON/OFF 상태 (true: 켜짐, false: 꺼짐)
// - defaultMode: 초기 알림 방식 ("vibrate": 진동만, "low": 작게, "medium": 보통, "high": 크게)

export const USERS = [
  {
    id: "worker_1",
    name: "안상현",
    platform: "iphone",
    key: "hEy8zQaMHVdGVLVLdHUL7m",
    defaultEnabled: true,
    defaultMode: "vibrate"
  },
  {
    id: "worker_2",
    name: "근무자 2 (iPhone)",
    platform: "iphone",
    key: "여기에_두번째_아이폰_BARK_KEY_입력",
    defaultEnabled: true,
    defaultMode: "vibrate"
  }
  // 갤럭시(ntfy) 사용자를 추가할 때는 아래 주석(//)을 풀고 입력하세요.
  // ,{
  //   id: "worker_3",
  //   name: "근무자 3 (Galaxy)",
  //   platform: "android",
  //   key: "여기에_NTFY_TOPIC_입력",
  //   defaultEnabled: false,
  //   defaultMode: "vibrate"
  // }
];