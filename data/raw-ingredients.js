// ================================================================
// data/raw-ingredients.js
// 한국 상용 원재료(자연식품) 큐레이티드 영양 DB (per 100g 기준).
// 식약처 식품영양성분 DB(원재료성)의 대표값 + USDA 참조.
//
// 목적:
//  - "샐러리", "닭가슴살", "사과" 같이 단일 재료를 쳤을 때
//    가공식품/요리만 잔뜩 나오는 문제 해결.
//  - 식약처 API(FoodNtrCpntDbInfo02)는 결과를 FOOD_CD 순으로 주기 때문에
//    원재료성(raw)이 뒷 페이지로 밀리는 경우가 많다 (예: 닭가슴살 → page 36).
//  - 네트워크 없이도 즉시 나오는 안정적 기준값을 제공.
//
// aliases: 오탈자/표기 변형을 허용 (샐러리 ↔ 셀러리 등).
// ================================================================

export const RAW_INGREDIENTS = [
  // ── 채소 ──────────────────────────────────────────────────────
  { name:'셀러리',      aliases:['샐러리','쎌러리'],           kcal:17,  protein:1.0, carbs:3.5, fat:0.2, fiber:1.6, sodium:80,  cat:'채소' },
  { name:'양배추',      aliases:['캐비지'],                    kcal:25,  protein:1.3, carbs:5.8, fat:0.1, fiber:2.5, sodium:18,  cat:'채소' },
  { name:'적양배추',    aliases:[],                           kcal:31,  protein:1.4, carbs:7.4, fat:0.2, fiber:2.1, sodium:27,  cat:'채소' },
  { name:'브로콜리',    aliases:[],                           kcal:34,  protein:2.8, carbs:6.6, fat:0.4, fiber:2.6, sodium:33,  cat:'채소' },
  { name:'컬리플라워',  aliases:['콜리플라워'],                kcal:25,  protein:1.9, carbs:5.0, fat:0.3, fiber:2.0, sodium:30,  cat:'채소' },
  { name:'상추',        aliases:['청상추','적상추','버터헤드'], kcal:15,  protein:1.4, carbs:2.9, fat:0.2, fiber:1.3, sodium:28,  cat:'채소' },
  { name:'양상추',      aliases:['아이스버그'],                kcal:14,  protein:0.9, carbs:3.0, fat:0.1, fiber:1.2, sodium:10,  cat:'채소' },
  { name:'로메인',      aliases:['로메인상추'],                kcal:17,  protein:1.2, carbs:3.3, fat:0.3, fiber:2.1, sodium:8,   cat:'채소' },
  { name:'시금치',      aliases:[],                           kcal:23,  protein:2.9, carbs:3.6, fat:0.4, fiber:2.2, sodium:79,  cat:'채소' },
  { name:'케일',        aliases:[],                           kcal:35,  protein:2.9, carbs:4.4, fat:1.5, fiber:4.1, sodium:53,  cat:'채소' },
  { name:'루꼴라',      aliases:['아루굴라'],                  kcal:25,  protein:2.6, carbs:3.7, fat:0.7, fiber:1.6, sodium:27,  cat:'채소' },
  { name:'당근',        aliases:['홍당무'],                    kcal:41,  protein:0.9, carbs:9.6, fat:0.2, fiber:2.8, sodium:69,  cat:'채소' },
  { name:'감자',        aliases:['감자(생)'],                  kcal:77,  protein:2.0, carbs:17.5,fat:0.1, fiber:2.2, sodium:6,   cat:'채소' },
  { name:'고구마',      aliases:[],                           kcal:86,  protein:1.6, carbs:20.1,fat:0.1, fiber:3.0, sodium:55,  cat:'채소' },
  { name:'단호박',      aliases:['늙은호박'],                  kcal:40,  protein:1.0, carbs:10.0,fat:0.1, fiber:0.5, sodium:1,   cat:'채소' },
  { name:'애호박',      aliases:['쥬키니','주키니'],           kcal:17,  protein:1.2, carbs:3.1, fat:0.3, fiber:1.0, sodium:8,   cat:'채소' },
  { name:'오이',        aliases:[],                           kcal:15,  protein:0.7, carbs:3.6, fat:0.1, fiber:0.5, sodium:2,   cat:'채소' },
  { name:'가지',        aliases:[],                           kcal:25,  protein:1.0, carbs:5.9, fat:0.2, fiber:3.0, sodium:2,   cat:'채소' },
  { name:'토마토',      aliases:[],                           kcal:18,  protein:0.9, carbs:3.9, fat:0.2, fiber:1.2, sodium:5,   cat:'채소' },
  { name:'방울토마토',  aliases:['대추토마토','체리토마토'],    kcal:20,  protein:1.0, carbs:4.0, fat:0.2, fiber:1.2, sodium:5,   cat:'채소' },
  { name:'파프리카',    aliases:['피망','벨페퍼'],             kcal:27,  protein:1.0, carbs:6.3, fat:0.3, fiber:2.1, sodium:4,   cat:'채소' },
  { name:'양파',        aliases:[],                           kcal:40,  protein:1.1, carbs:9.3, fat:0.1, fiber:1.7, sodium:4,   cat:'채소' },
  { name:'대파',        aliases:['파'],                       kcal:27,  protein:1.4, carbs:6.2, fat:0.2, fiber:1.6, sodium:4,   cat:'채소' },
  { name:'쪽파',        aliases:[],                           kcal:32,  protein:1.8, carbs:7.3, fat:0.7, fiber:2.6, sodium:16,  cat:'채소' },
  { name:'마늘',        aliases:[],                           kcal:149, protein:6.4, carbs:33.1,fat:0.5, fiber:2.1, sodium:17,  cat:'채소' },
  { name:'생강',        aliases:[],                           kcal:80,  protein:1.8, carbs:17.8,fat:0.8, fiber:2.0, sodium:13,  cat:'채소' },
  { name:'부추',        aliases:[],                           kcal:27,  protein:2.1, carbs:4.6, fat:0.5, fiber:2.7, sodium:1,   cat:'채소' },
  { name:'미나리',      aliases:[],                           kcal:17,  protein:2.1, carbs:3.0, fat:0.1, fiber:1.4, sodium:21,  cat:'채소' },
  { name:'깻잎',        aliases:['들깻잎'],                    kcal:37,  protein:3.8, carbs:6.7, fat:0.5, fiber:5.5, sodium:8,   cat:'채소' },
  { name:'청양고추',    aliases:[],                           kcal:40,  protein:2.0, carbs:8.8, fat:0.4, fiber:1.5, sodium:9,   cat:'채소' },
  { name:'풋고추',      aliases:['고추'],                     kcal:40,  protein:2.0, carbs:8.8, fat:0.4, fiber:1.5, sodium:9,   cat:'채소' },
  { name:'무',          aliases:['무우'],                     kcal:18,  protein:0.6, carbs:4.1, fat:0.1, fiber:1.6, sodium:21,  cat:'채소' },
  { name:'콩나물',      aliases:[],                           kcal:30,  protein:5.0, carbs:2.0, fat:1.4, fiber:1.5, sodium:3,   cat:'채소' },
  { name:'숙주',        aliases:['숙주나물'],                  kcal:30,  protein:3.0, carbs:5.9, fat:0.2, fiber:1.8, sodium:6,   cat:'채소' },
  { name:'배추',        aliases:['알배추'],                    kcal:13,  protein:1.5, carbs:2.2, fat:0.2, fiber:1.2, sodium:9,   cat:'채소' },
  { name:'열무',        aliases:[],                           kcal:20,  protein:2.0, carbs:3.5, fat:0.2, fiber:2.6, sodium:40,  cat:'채소' },
  { name:'아스파라거스',aliases:[],                           kcal:20,  protein:2.2, carbs:3.9, fat:0.1, fiber:2.1, sodium:2,   cat:'채소' },
  { name:'표고버섯',    aliases:[],                           kcal:34,  protein:2.2, carbs:6.8, fat:0.5, fiber:2.5, sodium:9,   cat:'채소' },
  { name:'양송이버섯',  aliases:['양송이'],                    kcal:22,  protein:3.1, carbs:3.3, fat:0.3, fiber:1.0, sodium:5,   cat:'채소' },
  { name:'느타리버섯',  aliases:['느타리'],                    kcal:33,  protein:3.3, carbs:6.1, fat:0.4, fiber:2.3, sodium:18,  cat:'채소' },
  { name:'팽이버섯',    aliases:['팽이'],                      kcal:37,  protein:2.7, carbs:7.8, fat:0.3, fiber:2.7, sodium:3,   cat:'채소' },
  { name:'새송이버섯',  aliases:['새송이'],                    kcal:35,  protein:2.5, carbs:6.0, fat:0.2, fiber:2.0, sodium:18,  cat:'채소' },
  { name:'비트',        aliases:['비트뿌리'],                  kcal:43,  protein:1.6, carbs:9.6, fat:0.2, fiber:2.8, sodium:78,  cat:'채소' },
  { name:'연근',        aliases:[],                           kcal:66,  protein:1.6, carbs:16.0,fat:0.1, fiber:3.1, sodium:40,  cat:'채소' },
  { name:'우엉',        aliases:[],                           kcal:72,  protein:1.5, carbs:17.3,fat:0.2, fiber:3.3, sodium:5,   cat:'채소' },
  { name:'도라지',      aliases:[],                           kcal:72,  protein:2.4, carbs:15.6,fat:0.1, fiber:6.6, sodium:3,   cat:'채소' },
  { name:'아보카도',    aliases:[],                           kcal:160, protein:2.0, carbs:8.5, fat:14.7,fiber:6.7, sodium:7,   cat:'채소' },

  // ── 과일 ──────────────────────────────────────────────────────
  { name:'사과',        aliases:['부사','홍옥'],               kcal:52,  protein:0.3, carbs:13.8,fat:0.2, fiber:2.4, sodium:1,   cat:'과일' },
  { name:'배',          aliases:['신고배'],                    kcal:57,  protein:0.4, carbs:15.2,fat:0.1, fiber:3.1, sodium:1,   cat:'과일' },
  { name:'바나나',      aliases:[],                           kcal:89,  protein:1.1, carbs:22.8,fat:0.3, fiber:2.6, sodium:1,   cat:'과일' },
  { name:'포도',        aliases:['거봉','샤인머스캣'],         kcal:67,  protein:0.6, carbs:17.0,fat:0.4, fiber:0.9, sodium:2,   cat:'과일' },
  { name:'딸기',        aliases:[],                           kcal:32,  protein:0.7, carbs:7.7, fat:0.3, fiber:2.0, sodium:1,   cat:'과일' },
  { name:'블루베리',    aliases:[],                           kcal:57,  protein:0.7, carbs:14.5,fat:0.3, fiber:2.4, sodium:1,   cat:'과일' },
  { name:'수박',        aliases:[],                           kcal:30,  protein:0.6, carbs:7.6, fat:0.2, fiber:0.4, sodium:1,   cat:'과일' },
  { name:'참외',        aliases:[],                           kcal:34,  protein:0.8, carbs:8.2, fat:0.2, fiber:0.9, sodium:16,  cat:'과일' },
  { name:'복숭아',      aliases:['백도','황도'],               kcal:39,  protein:0.9, carbs:9.5, fat:0.3, fiber:1.5, sodium:0,   cat:'과일' },
  { name:'자두',        aliases:['푸룬'],                     kcal:46,  protein:0.7, carbs:11.4,fat:0.3, fiber:1.4, sodium:0,   cat:'과일' },
  { name:'체리',        aliases:[],                           kcal:63,  protein:1.1, carbs:16.0,fat:0.2, fiber:2.1, sodium:0,   cat:'과일' },
  { name:'오렌지',      aliases:[],                           kcal:47,  protein:0.9, carbs:11.8,fat:0.1, fiber:2.4, sodium:0,   cat:'과일' },
  { name:'귤',          aliases:['만다린','한라봉'],           kcal:53,  protein:0.8, carbs:13.3,fat:0.3, fiber:1.8, sodium:2,   cat:'과일' },
  { name:'레몬',        aliases:[],                           kcal:29,  protein:1.1, carbs:9.3, fat:0.3, fiber:2.8, sodium:2,   cat:'과일' },
  { name:'자몽',        aliases:[],                           kcal:42,  protein:0.8, carbs:10.7,fat:0.1, fiber:1.6, sodium:0,   cat:'과일' },
  { name:'키위',        aliases:[],                           kcal:61,  protein:1.1, carbs:14.7,fat:0.5, fiber:3.0, sodium:3,   cat:'과일' },
  { name:'파인애플',    aliases:[],                           kcal:50,  protein:0.5, carbs:13.1,fat:0.1, fiber:1.4, sodium:1,   cat:'과일' },
  { name:'망고',        aliases:[],                           kcal:60,  protein:0.8, carbs:15.0,fat:0.4, fiber:1.6, sodium:1,   cat:'과일' },
  { name:'감',          aliases:['단감'],                     kcal:70,  protein:0.6, carbs:18.6,fat:0.2, fiber:3.6, sodium:1,   cat:'과일' },
  { name:'홍시',        aliases:['연시'],                     kcal:66,  protein:0.6, carbs:17.0,fat:0.2, fiber:3.3, sodium:1,   cat:'과일' },

  // ── 육류/가금류 ───────────────────────────────────────────────
  { name:'닭가슴살',    aliases:['닭가슴'],                   kcal:106, protein:23.0,carbs:0,   fat:1.2, fiber:0,   sodium:52,  cat:'육류' },
  { name:'닭안심',      aliases:['닭안심살'],                  kcal:109, protein:23.2,carbs:0,   fat:1.6, fiber:0,   sodium:65,  cat:'육류' },
  { name:'닭다리살',    aliases:['닭다리','닭허벅지'],         kcal:164, protein:19.0,carbs:0,   fat:9.3, fiber:0,   sodium:85,  cat:'육류' },
  { name:'닭날개',      aliases:[],                           kcal:203, protein:18.3,carbs:0,   fat:13.8,fiber:0,   sodium:86,  cat:'육류' },
  { name:'닭고기',      aliases:['통닭'],                     kcal:153, protein:20.0,carbs:0,   fat:8.0, fiber:0,   sodium:70,  cat:'육류' },
  { name:'소고기',      aliases:['쇠고기','한우'],             kcal:200, protein:22.0,carbs:0,   fat:13.0,fiber:0,   sodium:55,  cat:'육류' },
  { name:'소고기 안심', aliases:['안심'],                     kcal:192, protein:21.2,carbs:0,   fat:11.0,fiber:0,   sodium:55,  cat:'육류' },
  { name:'소고기 등심', aliases:['등심'],                     kcal:263, protein:20.0,carbs:0,   fat:20.0,fiber:0,   sodium:58,  cat:'육류' },
  { name:'우둔살',      aliases:['우둔'],                     kcal:140, protein:21.9,carbs:0,   fat:5.2, fiber:0,   sodium:55,  cat:'육류' },
  { name:'양지',        aliases:['소양지'],                   kcal:224, protein:20.0,carbs:0,   fat:16.0,fiber:0,   sodium:58,  cat:'육류' },
  { name:'차돌박이',    aliases:[],                           kcal:330, protein:15.0,carbs:0,   fat:30.0,fiber:0,   sodium:65,  cat:'육류' },
  { name:'돼지고기',    aliases:[],                           kcal:242, protein:27.0,carbs:0,   fat:14.0,fiber:0,   sodium:62,  cat:'육류' },
  { name:'삼겹살',      aliases:['삼겹','오겹살'],             kcal:379, protein:14.0,carbs:0,   fat:35.0,fiber:0,   sodium:60,  cat:'육류' },
  { name:'목살',        aliases:['돼지목살'],                  kcal:180, protein:20.0,carbs:0,   fat:11.0,fiber:0,   sodium:60,  cat:'육류' },
  { name:'앞다리살',    aliases:['전지'],                     kcal:210, protein:20.0,carbs:0,   fat:14.0,fiber:0,   sodium:65,  cat:'육류' },
  { name:'뒷다리살',    aliases:['후지'],                     kcal:175, protein:21.0,carbs:0,   fat:9.0, fiber:0,   sodium:60,  cat:'육류' },
  { name:'오리고기',    aliases:['오리'],                     kcal:201, protein:19.0,carbs:0,   fat:13.0,fiber:0,   sodium:74,  cat:'육류' },
  { name:'양고기',      aliases:['양'],                       kcal:294, protein:25.0,carbs:0,   fat:21.0,fiber:0,   sodium:72,  cat:'육류' },

  // ── 해산물/수산 ───────────────────────────────────────────────
  { name:'연어',        aliases:['생연어'],                    kcal:208, protein:20.4,carbs:0,   fat:13.4,fiber:0,   sodium:59,  cat:'수산' },
  { name:'참치',        aliases:['다랑어'],                    kcal:144, protein:23.3,carbs:0,   fat:4.9, fiber:0,   sodium:39,  cat:'수산' },
  { name:'고등어',      aliases:[],                           kcal:205, protein:18.6,carbs:0,   fat:13.9,fiber:0,   sodium:90,  cat:'수산' },
  { name:'갈치',        aliases:[],                           kcal:149, protein:18.5,carbs:0,   fat:7.5, fiber:0,   sodium:75,  cat:'수산' },
  { name:'삼치',        aliases:[],                           kcal:146, protein:20.1,carbs:0,   fat:6.6, fiber:0,   sodium:60,  cat:'수산' },
  { name:'꽁치',        aliases:[],                           kcal:180, protein:20.0,carbs:0,   fat:10.0,fiber:0,   sodium:85,  cat:'수산' },
  { name:'명태',        aliases:['생태','동태'],               kcal:77,  protein:17.3,carbs:0,   fat:0.7, fiber:0,   sodium:92,  cat:'수산' },
  { name:'대구',        aliases:[],                           kcal:82,  protein:17.8,carbs:0,   fat:0.7, fiber:0,   sodium:54,  cat:'수산' },
  { name:'광어',        aliases:['넙치'],                     kcal:91,  protein:19.2,carbs:0,   fat:1.2, fiber:0,   sodium:60,  cat:'수산' },
  { name:'우럭',        aliases:[],                           kcal:94,  protein:19.5,carbs:0,   fat:1.5, fiber:0,   sodium:65,  cat:'수산' },
  { name:'새우',        aliases:['흰다리새우','대하'],         kcal:99,  protein:24.0,carbs:0.2, fat:0.3, fiber:0,   sodium:111, cat:'수산' },
  { name:'오징어',      aliases:[],                           kcal:92,  protein:15.6,carbs:3.1, fat:1.4, fiber:0,   sodium:44,  cat:'수산' },
  { name:'문어',        aliases:[],                           kcal:82,  protein:14.9,carbs:2.2, fat:1.0, fiber:0,   sodium:230, cat:'수산' },
  { name:'낙지',        aliases:[],                           kcal:74,  protein:15.5,carbs:0,   fat:0.7, fiber:0,   sodium:310, cat:'수산' },
  { name:'조개',        aliases:['바지락'],                    kcal:74,  protein:12.8,carbs:2.6, fat:1.0, fiber:0,   sodium:220, cat:'수산' },
  { name:'굴',          aliases:['생굴'],                      kcal:81,  protein:9.5, carbs:4.9, fat:2.3, fiber:0,   sodium:106, cat:'수산' },
  { name:'홍합',        aliases:[],                           kcal:86,  protein:11.9,carbs:3.7, fat:2.2, fiber:0,   sodium:286, cat:'수산' },
  { name:'전복',        aliases:[],                           kcal:96,  protein:17.1,carbs:4.5, fat:0.7, fiber:0,   sodium:110, cat:'수산' },
  { name:'게',          aliases:['꽃게'],                     kcal:83,  protein:18.1,carbs:0,   fat:0.8, fiber:0,   sodium:395, cat:'수산' },
  { name:'멸치',        aliases:['생멸치'],                    kcal:131, protein:20.4,carbs:0,   fat:4.8, fiber:0,   sodium:104, cat:'수산' },

  // ── 달걀/유제품 ───────────────────────────────────────────────
  { name:'계란',        aliases:['달걀'],                      kcal:143, protein:12.6,carbs:0.7, fat:9.5, fiber:0,   sodium:124, cat:'달걀/유제품' },
  { name:'계란 흰자',   aliases:['달걀흰자','난백'],           kcal:52,  protein:10.9,carbs:0.7, fat:0.2, fiber:0,   sodium:166, cat:'달걀/유제품' },
  { name:'계란 노른자', aliases:['달걀노른자','난황'],         kcal:322, protein:15.9,carbs:3.6, fat:26.5,fiber:0,   sodium:48,  cat:'달걀/유제품' },
  { name:'우유',        aliases:['흰우유'],                    kcal:60,  protein:3.2, carbs:4.8, fat:3.3, fiber:0,   sodium:43,  cat:'달걀/유제품' },
  { name:'저지방 우유', aliases:[],                           kcal:42,  protein:3.4, carbs:5.0, fat:1.0, fiber:0,   sodium:44,  cat:'달걀/유제품' },
  { name:'두유',        aliases:[],                           kcal:43,  protein:3.3, carbs:2.6, fat:1.8, fiber:0.4, sodium:30,  cat:'달걀/유제품' },
  { name:'요거트',      aliases:['요구르트','플레인요거트'],   kcal:61,  protein:3.5, carbs:4.7, fat:3.3, fiber:0,   sodium:46,  cat:'달걀/유제품' },
  { name:'그릭요거트',  aliases:[],                           kcal:59,  protein:10.0,carbs:3.6, fat:0.4, fiber:0,   sodium:36,  cat:'달걀/유제품' },
  { name:'치즈',        aliases:['체다치즈','슬라이스치즈'],   kcal:402, protein:25.0,carbs:1.3, fat:33.1,fiber:0,   sodium:621, cat:'달걀/유제품' },
  { name:'모짜렐라',    aliases:['모짜렐라치즈'],              kcal:280, protein:28.0,carbs:3.1, fat:17.1,fiber:0,   sodium:373, cat:'달걀/유제품' },
  { name:'파마산',      aliases:['파마산치즈','파르미지아노'], kcal:392, protein:35.8,carbs:3.2, fat:25.8,fiber:0,   sodium:1529,cat:'달걀/유제품' },
  { name:'크림치즈',    aliases:[],                           kcal:342, protein:6.2, carbs:4.1, fat:34.0,fiber:0,   sodium:321, cat:'달걀/유제품' },
  { name:'버터',        aliases:[],                           kcal:717, protein:0.9, carbs:0.1, fat:81.1,fiber:0,   sodium:11,  cat:'달걀/유제품' },

  // ── 곡물/두류 ─────────────────────────────────────────────────
  { name:'백미',        aliases:['쌀','흰쌀'],                 kcal:358, protein:6.7, carbs:79.5,fat:0.7, fiber:0.3, sodium:1,   cat:'곡물' },
  { name:'현미',        aliases:[],                           kcal:362, protein:7.4, carbs:77.2,fat:2.7, fiber:3.5, sodium:4,   cat:'곡물' },
  { name:'찹쌀',        aliases:[],                           kcal:374, protein:7.0, carbs:82.0,fat:1.0, fiber:0.6, sodium:2,   cat:'곡물' },
  { name:'보리',        aliases:['압맥','엿기름'],             kcal:354, protein:12.5,carbs:73.5,fat:2.3, fiber:17.3,sodium:12,  cat:'곡물' },
  { name:'귀리',        aliases:['오트','오트밀','오트쌀'],    kcal:389, protein:16.9,carbs:66.3,fat:6.9, fiber:10.6,sodium:2,   cat:'곡물' },
  { name:'퀴노아',      aliases:[],                           kcal:368, protein:14.1,carbs:64.2,fat:6.1, fiber:7.0, sodium:5,   cat:'곡물' },
  { name:'옥수수',      aliases:['콘','스위트콘'],             kcal:86,  protein:3.3, carbs:19.0,fat:1.4, fiber:2.7, sodium:15,  cat:'곡물' },
  { name:'밀가루',      aliases:['박력분','강력분','중력분'],  kcal:364, protein:10.3,carbs:76.3,fat:1.0, fiber:2.7, sodium:2,   cat:'곡물' },
  { name:'식빵',        aliases:[],                           kcal:266, protein:7.6, carbs:49.0,fat:3.3, fiber:2.4, sodium:490, cat:'곡물' },
  { name:'두부',        aliases:['연두부','부침두부'],         kcal:76,  protein:8.1, carbs:1.9, fat:4.8, fiber:0.3, sodium:7,   cat:'두류' },
  { name:'순두부',      aliases:[],                           kcal:55,  protein:6.0, carbs:1.5, fat:3.2, fiber:0.1, sodium:10,  cat:'두류' },
  { name:'콩',          aliases:['대두','백태'],               kcal:400, protein:36.0,carbs:30.0,fat:19.0,fiber:9.3, sodium:2,   cat:'두류' },
  { name:'병아리콩',    aliases:['이집트콩'],                  kcal:378, protein:20.5,carbs:62.9,fat:6.0, fiber:12.2,sodium:7,   cat:'두류' },
  { name:'렌틸콩',      aliases:['렌즈콩'],                    kcal:353, protein:24.6,carbs:63.4,fat:1.1, fiber:10.7,sodium:6,   cat:'두류' },
  { name:'검정콩',      aliases:['흑태','서리태'],             kcal:385, protein:34.0,carbs:32.0,fat:18.0,fiber:16.0,sodium:15,  cat:'두류' },
  { name:'팥',          aliases:[],                           kcal:339, protein:20.0,carbs:62.0,fat:0.5, fiber:7.7, sodium:5,   cat:'두류' },

  // ── 견과/씨앗 ─────────────────────────────────────────────────
  { name:'아몬드',      aliases:[],                           kcal:579, protein:21.2,carbs:21.6,fat:49.9,fiber:12.5,sodium:1,   cat:'견과' },
  { name:'호두',        aliases:[],                           kcal:654, protein:15.2,carbs:13.7,fat:65.2,fiber:6.7, sodium:2,   cat:'견과' },
  { name:'땅콩',        aliases:['낙화생'],                    kcal:567, protein:25.8,carbs:16.1,fat:49.2,fiber:8.5, sodium:18,  cat:'견과' },
  { name:'캐슈넛',      aliases:['캐슈'],                     kcal:553, protein:18.2,carbs:30.2,fat:43.9,fiber:3.3, sodium:12,  cat:'견과' },
  { name:'마카다미아',  aliases:[],                           kcal:718, protein:7.9, carbs:13.8,fat:75.8,fiber:8.6, sodium:5,   cat:'견과' },
  { name:'피스타치오',  aliases:[],                           kcal:560, protein:20.2,carbs:27.2,fat:45.3,fiber:10.6,sodium:1,   cat:'견과' },
  { name:'해바라기씨',  aliases:[],                           kcal:584, protein:20.8,carbs:20.0,fat:51.5,fiber:8.6, sodium:9,   cat:'견과' },
  { name:'호박씨',      aliases:[],                           kcal:559, protein:30.2,carbs:10.7,fat:49.0,fiber:6.0, sodium:7,   cat:'견과' },
  { name:'참깨',        aliases:['깨'],                       kcal:573, protein:17.7,carbs:23.4,fat:49.7,fiber:11.8,sodium:11,  cat:'견과' },
  { name:'들깨',        aliases:[],                           kcal:527, protein:18.0,carbs:26.7,fat:43.4,fiber:10.0,sodium:1,   cat:'견과' },
  { name:'잣',          aliases:[],                           kcal:673, protein:13.7,carbs:13.1,fat:68.4,fiber:3.7, sodium:2,   cat:'견과' },
];

// canonical → { aliases, kcal, protein, ... }
let _reverseIdx = null;
function _buildIdx() {
  if (_reverseIdx) return _reverseIdx;
  const m = new Map();
  for (const it of RAW_INGREDIENTS) {
    m.set(it.name.toLowerCase(), it);
    for (const a of it.aliases) m.set(a.toLowerCase(), it);
  }
  _reverseIdx = m;
  return m;
}

/**
 * 원재료 검색 (로컬 큐레이티드 DB).
 * - 정확 일치(이름/별칭) → score 100
 * - 시작 일치           → score 90
 * - 포함                → score 70
 * 결과는 {id, name, defaultWeight, unit, kcal, protein, fat, carbs, sodium, _source} 형태로 매핑.
 */
export function searchRawIngredients(query) {
  if (!query) return [];
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const idx = _buildIdx();

  // exact (normalized) hit first
  const exact = idx.get(q);
  const scored = [];
  const seen = new Set();

  const push = (it, score) => {
    if (!it || seen.has(it.name)) return;
    seen.add(it.name);
    scored.push({ it, score });
  };

  if (exact) push(exact, 100);

  for (const it of RAW_INGREDIENTS) {
    const nm = it.name.toLowerCase();
    if (seen.has(it.name)) continue;
    if (nm === q) push(it, 100);
    else if (nm.startsWith(q)) push(it, 90);
    else if (q.startsWith(nm) && nm.length >= 2) push(it, 85);
    else if (nm.includes(q)) push(it, 75);
    else if (it.aliases.some(a => {
      const la = a.toLowerCase();
      return la === q || la.startsWith(q) || la.includes(q) || q.includes(la);
    })) push(it, 80);
  }

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, 12).map(({ it }) => ({
    id: 'raw_' + encodeURIComponent(it.name),
    name: it.name,
    unit: '100g',
    defaultWeight: 100,
    kcal: it.kcal,
    protein: it.protein,
    fat: it.fat,
    carbs: it.carbs,
    fiber: it.fiber,
    sodium: it.sodium,
    _source: '원재료(큐레이티드)',
    _category: it.cat,
  }));
}
