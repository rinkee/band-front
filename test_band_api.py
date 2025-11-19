import requests
import json

# 1. 요청할 URL (기본 주소)
url = "https://api-kr.band.us/v2.0.0/get_posts_and_announcements"

# 2. Query String 파라미터 (URL 뒤에 붙어있던 ?ts=... 부분)
params = {
    "ts": "1763537945601",
    "band_no": "100229430",
    "resolution_type": "4",
    "order_by": "commented_at_desc"
}

# 3. 핵심 헤더 정보 (이게 없으면 403 Forbidden이나 400 Error가 뜹니다)
headers = {
    # 브라우저인 척 속이는 정보
    "User-Agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36",

    # 어디서 요청을 보냈는지 (중요)
    "Referer": "https://www.band.us/band/100229430/post",
    "Origin": "https://www.band.us",

    # API 키 (앱 식별자)
    "akey": "bbc59b0b5f7a1c6efe950f6236ccda35",

    # 보안 서명 (가장 까다로운 부분, 타임스탬프나 내용이 바뀌면 이것도 바뀌어야 함)
    "md": "KQvBMds83Y6jdvCY+2Aab7GYMkVkcM4mHZQBkgNqfMo=",

    # 인증 쿠키 (로그인 세션 정보)
    "Cookie": 'BBC=bU1RHQW7QgB9hgF6dMsb1o; di=web-AAAAABiEN57OwUWJiDQAZmUh1sPnrrndJzq--4Hq-1APABTfrXKMWbyxVzYmSjKY4e0ajA; language=ko; band_session=ZQIAALrCdAMGJZ9nm1OKRp6pR_jY0DKNQw2UV011HX1aK4jMLzod8qdJeAQ4ldhP1K0gFWr6JQpZPhsqncU1hiFNY4t299Nbusr1sVLETdUUGCqM; as="68727e33:nGdOnv9rT7IUQeWrcvuEwrg4U7i2ElBNcGJ4VeOx44I="; ai="251307d,19aa44ab083"',

    # 기타 필수 헤더
    "accept": "application/json, text/javascript, */*; q=0.01",
    "accept-language": "ko",
    "x-band-client-type": "web"
}

# 4. 요청 보내기
try:
    response = requests.get(url, params=params, headers=headers)

    # 5. 결과 확인
    if response.status_code == 200:
        data = response.json()
        print("요청 성공!")
        # 데이터 예쁘게 출력 (한글 깨짐 방지)
        print(json.dumps(data, indent=4, ensure_ascii=False))
    else:
        print(f"요청 실패. 상태 코드: {response.status_code}")
        print("응답 내용:", response.text)

except Exception as e:
    print(f"에러 발생: {e}")
