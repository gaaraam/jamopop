# 자음모음팝 · Jamopop

한글 자모로 즐기는 멀티플레이 단어 게임입니다.

- 일반전·아이템전·스피드전, 개인 도전
- 채팅·친구·초대, 레벨·칭호·콩알친구들·스킨
- React / Vinext / Cloudflare Workers / D1

## 로컬 실행

Node.js 24를 설치한 뒤 실행합니다.

```sh
npm ci
npm run dev
```

http://127.0.0.1:5173 에 접속합니다. 처음 실행하면 빌드와 **로컬 전용 DB** 구성이 진행됩니다. 게스트로 방을 만들고 플레이할 수 있습니다. 수정 후 다시 실행하면 재빌드됩니다. 로컬 데이터는 `.wrangler/state`에 보관됩니다.

Google 로그인과 기존 Sites 기록 연결은 운영 도메인에 묶여 있습니다. 로컬에서 운영 계정·DB를 연결하지 마세요. 인증 관련 동작은 테스트로 검증합니다.

## 검증

```sh
npm run check:public
npm test
npm run typecheck
npm run build
```

## 기여와 배포

[기여 안내](CONTRIBUTING.md) · [배포 설정](docs/deployment.md) · [보안 제보](SECURITY.md)

공개 저장소에는 운영 DB, 사용자 기록, 로그인 비밀키, 과거 개발 폴더의 Git 이력을 포함하지 않습니다. 사전 데이터의 출처·라이선스는 `public/dictionaries/NOTICE.txt`와 `SOURCE.txt`를 확인해 주세요. 프로젝트 전체의 별도 오픈소스 라이선스는 아직 정하지 않았습니다.
