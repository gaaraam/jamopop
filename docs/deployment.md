# 배포 설정

운영 서비스와 DB는 그대로 사용합니다. 저장소 공개가 DB 이전·초기화를 의미하지 않습니다.

## GitHub 설정

`production` Environment를 만들고 가능하면 gaaraam의 승인과 main 브랜치 제한을 설정합니다. main 직접 변경을 제한하고 CI의 `checks` 성공과 PR 검토를 요구하세요.

Repository Variables:
- `WORKER_NAME`: `play`
- `D1_DATABASE_NAME`: 기존 운영 DB 이름
- `D1_DATABASE_ID`: 기존 운영 DB ID
- `CLOUDFLARE_ACCOUNT_ID`: 기존 계정 ID
- `DEPLOY_ENABLED`: 설정과 최초 검증을 완료한 뒤 `true`

production Environment Secret:
- `CLOUDFLARE_API_TOKEN`: 해당 계정의 Worker 배포에 필요한 최소 권한으로 발급한 토큰. Wrangler 개인 OAuth 토큰을 복사하지 마세요.

Google OAuth, 세션 서명, Sites 연결 등의 기존 Worker secrets는 유지하며 GitHub에 복사할 필요가 없습니다.

main의 검증이 통과하고 DEPLOY_ENABLED=true인 경우 배포합니다. 공개 PR에는 배포 비밀키를 제공하지 않습니다. 토큰 등록 전에도 PR 검증은 동작합니다.

## DB 변경

현재 운영 DB는 `0023_skin_shop.sql`까지 적용된 기준입니다. 과거 SQL을 자동으로 재실행하지 않습니다. `deploy-schema.json`은 이 기준의 파일 해시 목록이며, SQL이 달라지면 배포 스크립트가 중단합니다.

새 SQL은 별도 검토·백업·로컬 검증 후 운영에 적용합니다. 운영 적용이 확인된 뒤에만 기준 목록을 갱신하세요. 이 파일을 바꾸는 PR은 운영 DB 적용 증거를 포함해야 합니다. 코드 배포에 파괴적 DB 변경을 묶지 마세요.

## 롤백

Cloudflare에서 직전 Worker 버전으로 롤백할 수 있습니다. DB는 코드 롤백으로 되돌아가지 않으므로 새 스키마는 이전 코드와 호환되게 추가합니다. 신규 DB로 실수 배포되지 않도록 빌드 대상과 배포 환경 변수를 검사합니다.
