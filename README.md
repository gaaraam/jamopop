# 자음모음팝 · Jamopop

**자음·모음으로 추리하고, 콩알친구들과 함께 노는 한글 단어 게임.**

> [!IMPORTANT]
> **기여 전 [CONTRIBUTING.md](CONTRIBUTING.md)를 먼저 읽어 주세요.**
> 게임 규칙·기존 기록 보존·UI 기준·검증·PR 작성 원칙을 정리했습니다. 사람과 AI 코딩 도구 모두 같은 기준을 사용합니다.

[게임 시작하기](https://play.jamopop.workers.dev/) · [개발 안내](docs/development.md) · [진행 중인 작업](https://github.com/gaaraam/jamopop/issues/13) · [문제 제보](https://github.com/gaaraam/jamopop/issues)

## 어떤 게임인가요?

기본은 **자모 5칸 · 다섯 번의 시도 · 방 공통 5분**. `바람 → ㅂ ㅏ ㄹ ㅏ ㅁ`처럼 풀어 쓴 자모를 입력하고 색상 단서로 정답을 찾습니다.

| 🟩 초록 | 🟨 노랑 | ⬜ 회색 |
| --- | --- | --- |
| 자모·위치 모두 일치 | 자모는 있지만 다른 위치 | 없거나 정답의 개수를 초과 |

Google 로그인 또는 게스트로 시작할 수 있습니다. 게스트는 쿠키를 잃으면 기존 기록에 다시 접근하기 어려울 수 있습니다.

| 플레이 | 내용 |
| --- | --- |
| **방 대전** | 일반전·아이템전·주제별 스피드전, 채팅·응원·그림 힌트·관전 |
| **개인 도전** | 단어가 사라진 콩알 아파트를 복구하고 전용 스킨 해금 |
| **성장·꾸미기** | 레벨·칭호·골드, 캐릭터 스킨과 참가자 카드 스킨 |
| **콩알이의 집** | 가구 배치·돌보기·친밀도 보상, 친구의 저장된 집 방문 |

친구·방 초대, 비밀번호 방, 다크 모드, 작은 창용 엑셀 모드도 지원합니다. 집 방문은 비동기이며 실시간 합방은 아닙니다.

## 로컬 실행

**Node.js 24 · npm · Git**이 필요합니다. 운영 계정이나 비밀키 없이 로컬 게스트로 플레이할 수 있습니다.

```sh
git clone https://github.com/gaaraam/jamopop.git
cd jamopop
npm ci
npm run dev
```

**http://127.0.0.1:5173** 에서 확인합니다. 첫 실행은 빌드와 로컬 DB 준비를 포함합니다. 현재 HMR을 지원하지 않으므로 소스 수정 후 서버를 재시작합니다. 데이터는 `.wrangler/state`에 유지됩니다.

## 개발과 운영

**React + TypeScript · Vinext + Vite · Cloudflare Workers + D1**을 사용합니다. 동기화는 현재 적응형 주기 조회이며, 운영 DB는 로컬 개발과 분리합니다.

| 문서 | 찾을 내용 |
| --- | --- |
| **[기여 지침](CONTRIBUTING.md)** | 제품·디자인 기준, 데이터 보존, 검증, PR |
| [개발 안내](docs/development.md) | 명령어, 문제 해결, 구조도, 기능별 코드 위치 |
| [디자인 체계](docs/design-system.md) · [글꼴](docs/typography.md) | 공통 컴포넌트·간격·색·타이포그래피 |
| [배포·복구](docs/deployment.md) | Cloudflare 자동 배포와 운영 DB 변경 |
| [공개 서비스 준비](https://github.com/gaaraam/jamopop/issues/13) | 우선순위별 하위 작업 이슈 |
| [보안 제보](SECURITY.md) | 취약점 비공개 제보 방법 |

작업 브랜치에서 PR을 만들고 운영자가 검토·병합합니다. `main` 병합 후 Cloudflare가 검사·빌드·배포를 실행합니다. **운영 DB 마이그레이션은 자동 실행하지 않습니다.**

## 데이터·라이선스

운영 DB·사용자 기록·인증 비밀키는 포함하지 않습니다. 사전 이용 조건은 [NOTICE](public/dictionaries/NOTICE.txt)와 [SOURCE](public/dictionaries/SOURCE.txt)를 확인해 주세요.

**프로젝트 전체의 오픈소스 라이선스는 아직 정하지 않았습니다.** 저장소 공개가 코드·캐릭터·스킨의 자유로운 재배포나 상업적 사용 허가를 뜻하지 않습니다.

[개인정보처리방침](https://play.jamopop.workers.dev/privacy) · [이용약관](https://play.jamopop.workers.dev/terms) · [문의](https://play.jamopop.workers.dev/support)
