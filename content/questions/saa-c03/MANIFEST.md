# SAA-C03 500문제 팩 매니페스트 (#134)

> 정본 도메인 코드: `security`(150) · `resilience`(130) · `performance`(120) · `cost-optimization`(100).
> 각 팩은 25문항(예외: res-06 5문항, perf-05 20문항). 파일 경로: `content/questions/saa-c03/<packId>.json`.
> ID는 `saa-<sec|res|perf|cost>-NNNN` 형식. 팩별 범위를 지켜 중복 ID를 만들지 않는다.

| 팩 | 도메인 | 문항 수 | ID 범위 | 주제 |
| --- | --- | ---: | --- | --- |
| sec-01 | security | 25 | saa-sec-0001..0025 | IAM 사용자/그룹/역할/정책, 최소 권한, 정책 평가, 권한 경계, identity vs resource policy |
| sec-02 | security | 25 | saa-sec-0026..0050 | Organizations/SCP, 계정 격리, IAM Identity Center/SSO, 페더레이션, 교차 계정 접근 |
| sec-03 | security | 25 | saa-sec-0051..0075 | KMS, 저장/전송 암호화, ACM/TLS, Secrets Manager/Parameter Store, CloudHSM |
| sec-04 | security | 25 | saa-sec-0076..0100 | VPC 보안: 보안 그룹/NACL, VPC 엔드포인트/PrivateLink, SSM Session Manager, WAF/Shield/Firewall Manager |
| sec-05 | security | 25 | saa-sec-0101..0125 | S3 보안: 버킷 정책/Block Public Access/presigned URL/Object Lock/액세스 포인트, Macie, RDS·DynamoDB 암호화/IAM 인증 |
| sec-06 | security | 25 | saa-sec-0126..0150 | CloudTrail/Config/GuardDuty/Security Hub/Inspector/Detective/Access Analyzer, 로깅·사고 대응 |
| res-01 | resilience | 25 | saa-res-0001..0025 | Multi-AZ/고가용성, ELB 헬스 체크, Auto Scaling, Route 53 헬스 체크/페일오버 |
| res-02 | resilience | 25 | saa-res-0026..0050 | DR 전략: backup & restore, pilot light, warm standby, multi-site, RTO/RPO |
| res-03 | resilience | 25 | saa-res-0051..0075 | AWS Backup, RDS PITR/스냅샷, EBS 스냅샷, S3 버전관리/CRR/Object Lock, FSx |
| res-04 | resilience | 25 | saa-res-0076..0100 | SQS/SNS/EventBridge, DLQ, 멱등성, 재시도/백오프, Step Functions |
| res-05 | resilience | 25 | saa-res-0101..0125 | DynamoDB 글로벌 테이블/백업/PITR, Aurora 글로벌 DB/복제본, ElastiCache, Kinesis |
| res-06 | resilience | 5 | saa-res-0126..0130 | Lambda 재시도/destinations, 컨테이너, 멀티 리전 네트워크, Global Accelerator, 장애 조치 테스트 |
| perf-01 | performance | 25 | saa-perf-0001..0025 | EC2 인스턴스 패밀리/placement group/Graviton, Lambda 메모리·동시성, ECS/EKS 스케일링 |
| perf-02 | performance | 25 | saa-perf-0026..0050 | EBS 볼륨/IOPS, instance store, S3 성능(multipart/Transfer Acceleration/byte-range), EFS/FSx |
| perf-03 | performance | 25 | saa-perf-0051..0075 | RDS 읽기 복제본, Aurora Serverless/복제본, DynamoDB 파티셔닝/hot key/DAX/adaptive capacity, ElastiCache |
| perf-04 | performance | 25 | saa-perf-0076..0100 | CloudFront 캐싱/OAC, Global Accelerator, Route 53 라우팅, VPC 네트워킹, LB 유형/알고리즘 |
| perf-05 | performance | 20 | saa-perf-0101..0120 | Kinesis/Firehose/MSK, Glue/Athena/OpenSearch, Step Functions, 스트리밍·분석 성능 |
| cost-01 | cost-optimization | 25 | saa-cost-0001..0025 | On-Demand/Reserved/Savings Plans/Spot, 가격 모델 선택 |
| cost-02 | cost-optimization | 25 | saa-cost-0026..0050 | S3 스토리지 클래스/수명주기/Intelligent-Tiering, EBS gp2/gp3/스냅샷, EFS/FSx, 데이터 전송 비용 |
| cost-03 | cost-optimization | 25 | saa-cost-0051..0075 | 라이트사이징, Compute Optimizer, Graviton, 오토스케일링, RDS 예약/Aurora Serverless, DynamoDB 용량 모드 |
| cost-04 | cost-optimization | 25 | saa-cost-0076..0100 | Cost Explorer/Budgets/비용 할당 태그/CUR, Trusted Advisor, NAT Gateway vs 엔드포인트, 유휴 리소스 |

## 생성 규칙 (모든 팩 공통)
- 한국어 본문·해설, AWS 서비스명은 영문 유지. 실제 기출/덤프 복제 금지, 독자적 시나리오.
- 보기 4개(A~D). 단일 정답 위주, 팩당 복수 정답 0~3개.
- 단일 정답의 위치를 팩 안에서 A/B/C/D에 고르게 분배(각 위치 5~7개). 정답 보기를 유독 길게 쓰지 않는다(다른 보기 중앙값의 1.6배 이하).
- 해설은 1~2문장(최대 3문장). `.!?`로 문장 수를 세므로 서비스명 뒤 마침표 남용 금지.
- `sourceUrls`는 실제 `https://docs.aws.amazon.com/…` 페이지만. 존재하지 않는 URL을 만들지 않는다.
- `optionSetHash`는 작성하지 않는다(검증기 `--emit`이 계산).
- 팩 파일은 `{ "packId": "...", "examCode": "saa-c03", "items": [...] }` 형식. 각 item은 `questionId`, `domainCode`, `stem`, `explanation`, `sourceUrls`, `answerOptionKeys`, `options`.
- 같은 팩·다른 팩과 stem/option set이 중복되지 않게 한다.
- 500문제 전량 사람 검수 전에는 "검수 완료"로 표시하지 않는다.
