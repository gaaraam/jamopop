# Cloudflare 자동 배포

GitHub는 코드·PR 검토를, Cloudflare Workers Builds는 검증·배포를 담당합니다.

## 협업 순서

1. 동료가 브랜치 또는 포크에서 PR을 올립니다.
2. 코드 소유자인 gaaraam이 검토하고 승인한 뒤 직접 Merge합니다. 자동 병합하지 않습니다.
3. main 변경을 Cloudflare가 받아 검증하고 성공했을 때 기존 play Worker에 배포합니다.
4. 검사 또는 빌드 실패 시 기존 배포가 계속 서비스됩니다.

GitHub는 자신이 작성한 PR의 자기 승인을 허용하지 않습니다. 소유자 본인 PR은 다른 검토자가 필요하거나 관리자의 명시적 병합 판단이 필요합니다. 에이전트가 대신 승인·병합하지 않습니다.

## 기존 Worker 연결 설정

Workers & Pages → play → Settings → Builds에서 gaaraam/jamopop을 연결합니다.

- Production branch: main
- Root directory: 저장소 루트
- Build command: `npm run check:public && npm test && npm run typecheck && npm run build` (저장소의 `npm run ci`와 동일)
- Deploy command: npm run deploy
- 비운영 브랜치 자동 배포: 끔 (운영 DB와 로그인 정보 공유 방지)
- Node.js: 24 (.node-version)

Build variables:
- NODE_VERSION: 24
- WORKER_NAME: play
- D1_DATABASE_NAME: 기존 운영 DB 이름
- D1_DATABASE_ID: 기존 운영 DB ID
- CLOUDFLARE_ACCOUNT_ID: 기존 계정 ID

빌드용 API 인증은 Cloudflare의 Builds 연결 설정에서 관리합니다. 운영 Google 로그인 키와 기존 기록 연결 키는 기존 Worker secrets에 유지합니다. GitHub Secret에 복사하지 않습니다.

GitHub Actions 워크플로는 수동 실행용으로만 남깁니다. main의 필수 검사에 실행 불가능한 GitHub Actions checks를 남기지 않습니다. PR 검토·코드 소유자 승인·대화 해결 요건은 유지합니다. 현재 구성의 자동 테스트는 main 병합 후 배포 직전에 실행됩니다. PR에서의 사전 테스트는 기여자가 로컬에서 실행합니다.

## DB 변경과 롤백

기존 운영 DB를 그대로 연결하며 초기화하거나 마이그레이션을 자동 실행하지 않습니다. 운영 기준은 deploy-schema.json을 확인합니다(2026-10-19: 0032_product_metrics.sql까지). deploy-schema.json과 SQL 해시가 다르면 배포를 중단합니다. 새 SQL은 백업·검토·운영 적용 확인 후에만 기준 목록을 갱신합니다.

코드 롤백은 Cloudflare의 직전 배포 버전으로 수행합니다. DB는 코드 롤백으로 되돌아가지 않으므로 스키마 변경은 이전 코드와 호환되게 추가합니다.
