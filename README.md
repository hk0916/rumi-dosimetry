# Dosimetry - 방사선 선량 측정 웹 애플리케이션

방사선 선량계(Dosimeter)와 게이트웨이(Gateway)를 관리하고, 실시간 모니터링 및 선량 분석을 수행하는 웹 기반 시스템입니다.

## 기술 스택

| 구분 | 기술 |
|------|------|
| Frontend | React 19, Vite 6, Ant Design 5, ECharts, React Router, i18next |
| Backend | Fastify, Prisma ORM, TypeScript, WebSocket |
| Database | MySQL 8.0 |
| Infra | Docker Compose |

## 주요 기능

### 장치 관리
- 선량계(Dosimeter) 등록/수정/삭제, 상태(온라인/오프라인), 배터리, 전압 확인
- 게이트웨이(Gateway) 등록/수정/삭제, 네트워크 설정(IPv4, DNS), BLE RSSI 임계값, LED 설정

### 데이터 모니터링
- WebSocket 기반 실시간 전압 데이터 모니터링 (ECharts 차트)
- 히스토리 데이터 조회 (기간별 필터: 최근 1시간~7일)
- CSV 내보내기
- Mock 데이터 생성 기능 (개발/테스트용)

### 캘리브레이션
- 디바이스별 날짜/시간 범위 데이터 Import
- 필터 적용 (SMA, EMA, Median, Kalman)
- 누적 선량/전달 선량 계산
- CF Factor 산출 및 저장

### 캘리브레이션 관리
- 저장된 캘리브레이션 이력 조회
- 디바이스별 필터링
- 이름 변경 및 삭제

### 데이터 분석
- Calibration(CF Factor) 기반 선량 분석
- 방사선 종류(ICRP 103 가중인자) 및 장기 선택
- 흡수 선량(Absorbed Dose), 등가 선량(Equivalent Dose), 유효 선량(Effective Dose) 계산
- 전체 범위 / 부분 범위 분석
- 분석 이력 저장

### OTA 업데이트
- 펌웨어 등록 (이름, 버전, 대상 유형, 파일 정보, 체크섬)
- 다중 대상(게이트웨이/디바이스) 동시 배포
- JSON 파라미터 전달 (BLE 필터값 조정, LED 설정 등)
- 작업 상태 추적 (pending → in_progress → success/failed)
- 실패 작업 재시도

### 사용자 관리
- 로그인/로그아웃 (JWT 인증)
- 비밀번호 변경
- 역할: admin, super_admin

### 다국어 지원
- 한국어 / 영어 전환

## 시작하기

### 사전 요구사항
- Docker Desktop
- Git

### 설치 및 실행

```bash
git clone https://github.com/hk0916/dosimetry.git
cd dosimetry/dosimetry
```

`.env` 파일을 생성합니다:

```env
DATABASE_URL="mysql://root:rootpassword@db:3306/dosimetry"
MYSQL_ROOT_PASSWORD=rootpassword
MYSQL_DATABASE=dosimetry
JWT_SECRET=your-secret-key
```

Docker Compose로 실행합니다:

```bash
docker compose up --build -d
```

### 접속 정보

| 서비스 | URL |
|--------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:4000 |
| MySQL | localhost:3306 |

### 기본 계정

| 역할 | ID | PW |
|------|------|------|
| 관리자 | admin | admin1234 |
| 최고관리자 | superadmin | admin1234 |

## 프로젝트 구조

```
dosimetry/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma      # DB 스키마 정의
│   │   ├── seed.ts            # 초기 데이터 시드
│   │   └── init.sql           # MySQL 초기화
│   └── src/
│       ├── index.ts           # Fastify 서버 엔트리
│       ├── middleware/
│       │   └── auth.ts        # JWT 인증 미들웨어
│       ├── routes/
│       │   ├── auth.ts        # 로그인/인증
│       │   ├── devices.ts     # 선량계 CRUD
│       │   ├── gateways.ts    # 게이트웨이 CRUD
│       │   ├── users.ts       # 사용자 관리
│       │   ├── data.ts        # 센서 데이터 조회
│       │   ├── monitoring.ts  # WebSocket 모니터링
│       │   ├── calibrations.ts # 캘리브레이션
│       │   ├── analysis.ts    # 데이터 분석
│       │   ├── ota.ts         # OTA 업데이트
│       │   └── mock.ts        # Mock 데이터 생성
│       └── lib/               # 유틸리티
├── frontend/
│   └── src/
│       ├── App.tsx            # 라우팅
│       ├── main.tsx           # 엔트리
│       ├── components/
│       │   └── layout/
│       │       └── MainLayout.tsx  # 사이드바 + 헤더
│       ├── pages/
│       │   ├── LoginPage.tsx
│       │   ├── DevicePage.tsx
│       │   ├── MonitoringPage.tsx
│       │   ├── CalibrationPage.tsx
│       │   ├── ManageCalibrationPage.tsx
│       │   ├── DataAnalysisPage.tsx
│       │   ├── OtaPage.tsx
│       │   └── UserSettingsPage.tsx
│       └── i18n/              # 다국어 (ko, en)
├── scripts/                   # 유틸리티 스크립트
├── docker-compose.yml
└── .env
```

## API 엔드포인트

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | /api/auth/login | 로그인 |
| GET | /api/devices | 선량계 목록 |
| POST | /api/devices | 선량계 등록 |
| DELETE | /api/devices/:id | 선량계 삭제 |
| GET | /api/gateways | 게이트웨이 목록 |
| POST | /api/gateways | 게이트웨이 등록 |
| PUT | /api/gateways/:id/settings | 게이트웨이 설정 변경 |
| DELETE | /api/gateways/:id | 게이트웨이 삭제 |
| GET | /api/data | 센서 데이터 조회 |
| WS | /ws/live | 실시간 모니터링 |
| GET | /api/calibrations | 캘리브레이션 목록 |
| POST | /api/calibrations | 캘리브레이션 저장 |
| GET | /api/analysis | 분석 결과 조회 |
| POST | /api/analysis | 분석 실행 |
| GET | /api/ota/firmwares | 펌웨어 목록 |
| POST | /api/ota/firmwares | 펌웨어 등록 |
| DELETE | /api/ota/firmwares/:id | 펌웨어 삭제 |
| GET | /api/ota/tasks | OTA 작업 목록 |
| POST | /api/ota/tasks | OTA 작업 생성 |
| PUT | /api/ota/tasks/:id/status | OTA 상태 업데이트 |
| POST | /api/ota/tasks/:id/retry | OTA 재시도 |
| GET | /api/users | 사용자 목록 |
| PUT | /api/users/:id/password | 비밀번호 변경 |
| POST | /api/mock/start | Mock 데이터 생성 시작 |
| POST | /api/mock/stop | Mock 데이터 생성 중지 |
| GET | /api/health | 헬스체크 |

## DB 스키마

주요 테이블:

- **workspaces** - 워크스페이스
- **users** - 사용자 (admin, super_admin)
- **devices** - 선량계
- **gateways** - 게이트웨이 (네트워크/BLE 설정 포함)
- **sensor_data** - 센서 측정 데이터
- **calibrations** - 캘리브레이션 결과 (필터, 누적선량, CF Factor)
- **analysis_results** - 선량 분석 결과 (흡수/등가/유효 선량)
- **ota_firmwares** - OTA 펌웨어 정보
- **ota_tasks** - OTA 작업 이력 및 상태
- **radiation_weighting_factors** - 방사선 가중인자 (ICRP 103)
- **tissue_weighting_factors** - 조직 가중인자 (ICRP 103)
