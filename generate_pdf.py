#!/usr/bin/env python3
"""Dosimetry 웹 애플리케이션 개발 플랜 - PDF 문서 생성"""

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm, cm
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer,
    PageBreak, KeepTogether
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os

# ── 한글 폰트 등록 ──
# macOS 시스템 폰트
font_paths = [
    ("/System/Library/Fonts/AppleSDGothicNeo.ttc", "AppleSD"),
    ("/System/Library/Fonts/Supplemental/AppleGothic.ttf", "AppleGothic"),
    ("/Library/Fonts/Arial Unicode.ttf", "ArialUnicode"),
]

FONT_NAME = "Helvetica"  # fallback
for path, name in font_paths:
    if os.path.exists(path):
        try:
            pdfmetrics.registerFont(TTFont(name, path))
            FONT_NAME = name
            break
        except:
            continue

# ── 스타일 설정 ──
styles = getSampleStyleSheet()

TITLE_STYLE = ParagraphStyle(
    "CustomTitle", parent=styles["Title"],
    fontName=FONT_NAME, fontSize=22, spaceAfter=20,
    textColor=colors.HexColor("#2F5496")
)

H1_STYLE = ParagraphStyle(
    "H1", parent=styles["Heading1"],
    fontName=FONT_NAME, fontSize=16, spaceBefore=16, spaceAfter=10,
    textColor=colors.HexColor("#2F5496"),
    borderWidth=0, borderColor=colors.HexColor("#2F5496"),
    borderPadding=0
)

H2_STYLE = ParagraphStyle(
    "H2", parent=styles["Heading2"],
    fontName=FONT_NAME, fontSize=13, spaceBefore=12, spaceAfter=6,
    textColor=colors.HexColor("#4472C4")
)

BODY_STYLE = ParagraphStyle(
    "CustomBody", parent=styles["Normal"],
    fontName=FONT_NAME, fontSize=9, leading=13, spaceAfter=4
)

SMALL_STYLE = ParagraphStyle(
    "Small", parent=styles["Normal"],
    fontName=FONT_NAME, fontSize=8, leading=10
)

CELL_STYLE = ParagraphStyle(
    "Cell", parent=styles["Normal"],
    fontName=FONT_NAME, fontSize=8, leading=11
)

HEADER_BG = colors.HexColor("#2F5496")
SUB_HEADER_BG = colors.HexColor("#4472C4")
CATEGORY_BG = colors.HexColor("#D6E4F0")
LIGHT_BG = colors.HexColor("#F2F7FC")


def P(text, style=CELL_STYLE):
    return Paragraph(text, style)


def make_table(headers, data, col_widths=None, has_categories=False):
    """Create a styled table."""
    table_data = [[P(h, CELL_STYLE) for h in headers]]
    category_rows = []

    for i, row in enumerate(data):
        if has_categories and row.get("is_category"):
            table_data.append([P(f"<b>{row['label']}</b>", CELL_STYLE)] + [P("")] * (len(headers) - 1))
            category_rows.append(i + 1)
        elif has_categories:
            table_data.append([P(str(v), CELL_STYLE) for v in row["cols"]])
        else:
            table_data.append([P(str(v), CELL_STYLE) for v in row])

    if col_widths is None:
        col_widths = [170 * mm / len(headers)] * len(headers)

    t = Table(table_data, colWidths=col_widths, repeatRows=1)

    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), HEADER_BG),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CCCCCC")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]

    # alternate row colors
    for i in range(1, len(table_data)):
        if i in category_rows:
            style_cmds.append(("BACKGROUND", (0, i), (-1, i), CATEGORY_BG))
            style_cmds.append(("SPAN", (0, i), (-1, i)))
        elif i % 2 == 0:
            style_cmds.append(("BACKGROUND", (0, i), (-1, i), LIGHT_BG))

    t.setStyle(TableStyle(style_cmds))
    return t


# ── PDF 생성 ──
output_path = "/Users/ws_eric/Documents/rumi/Dosimetry_개발플랜.pdf"
doc = SimpleDocTemplate(
    output_path, pagesize=A4,
    leftMargin=15 * mm, rightMargin=15 * mm,
    topMargin=20 * mm, bottomMargin=20 * mm
)

story = []
page_width = A4[0] - 30 * mm  # usable width

# ═══════════════════════════════════════════
# 표지
# ═══════════════════════════════════════════
story.append(Spacer(1, 80 * mm))
story.append(Paragraph("DOSIMETRY", ParagraphStyle(
    "Cover1", fontName=FONT_NAME, fontSize=36, alignment=TA_CENTER,
    textColor=colors.HexColor("#2F5496"), leading=44, spaceAfter=0
)))
story.append(Spacer(1, 12 * mm))
story.append(Paragraph("웹 애플리케이션 개발 플랜", ParagraphStyle(
    "Cover2", fontName=FONT_NAME, fontSize=24, alignment=TA_CENTER,
    textColor=colors.HexColor("#333333"), leading=32, spaceAfter=0
)))
story.append(Spacer(1, 30 * mm))
story.append(Paragraph("시스템 기능정의서 기반 분석", ParagraphStyle(
    "Cover3", fontName=FONT_NAME, fontSize=14, alignment=TA_CENTER,
    textColor=colors.HexColor("#666666"), leading=20, spaceAfter=0
)))
story.append(Spacer(1, 4 * mm))
story.append(Paragraph("요구사항 정의 | 화면 설계 | DB 설계 | 시스템 설계", ParagraphStyle(
    "Cover4", fontName=FONT_NAME, fontSize=11, alignment=TA_CENTER,
    textColor=colors.HexColor("#888888"), leading=16
)))
story.append(PageBreak())

# ═══════════════════════════════════════════
# 목차
# ═══════════════════════════════════════════
story.append(Paragraph("목차", H1_STYLE))
toc_items = [
    "1. 요구사항 정의",
    "    1-1. 인증/사용자 관리",
    "    1-2. 디바이스 관리",
    "    1-3. Data Monitoring",
    "    1-4. Calibration (교정)",
    "    1-5. Manage Calibration",
    "    1-6. Data Analysis",
    "2. 화면 설계 (UI/UX)",
    "    2-1. 전체 레이아웃",
    "    2-2. 화면별 흐름",
    "    2-3. 화면 상세 정의",
    "3. DB 설계",
    "    3-1. ERD 주요 테이블",
    "    3-2. 테이블 관계",
    "4. 시스템 설계",
    "    4-1. 아키텍처",
    "    4-2. 기술 스택",
    "    4-3. API 엔드포인트",
    "    4-4. 핵심 계산 로직",
    "5. 개발 로드맵",
]
for item in toc_items:
    indent = "&nbsp;&nbsp;&nbsp;&nbsp;" if item.startswith("    ") else ""
    text = item.strip()
    if not item.startswith("    "):
        story.append(Paragraph(f"<b>{text}</b>", BODY_STYLE))
    else:
        story.append(Paragraph(f"{indent}{text}", BODY_STYLE))

story.append(PageBreak())

# ═══════════════════════════════════════════
# 1. 요구사항 정의
# ═══════════════════════════════════════════
story.append(Paragraph("1. 요구사항 정의", H1_STYLE))

# 1-1
story.append(Paragraph("1-1. 인증/사용자 관리", H2_STYLE))
t = make_table(
    ["기능", "설명", "우선순위"],
    [
        ["로그인/로그아웃", "ID/PW 기반 인증, 세션 관리", "P1"],
        ["사용자 CRUD", "사용자 추가/수정/삭제, 역할 관리 (관리자/최고관리자)", "P5"],
        ["내 프로필", "사용자 이름, 권한, 그룹 확인 및 비밀번호 변경", "P5"],
        ["워크스페이스 설정", "워크스페이스 단위 관리", "P5"],
    ],
    col_widths=[35 * mm, 105 * mm, 20 * mm]
)
story.append(t)
story.append(Spacer(1, 8 * mm))

# 1-2
story.append(Paragraph("1-2. 디바이스 관리", H2_STYLE))
t = make_table(
    ["기능", "설명", "우선순위"],
    [
        ["Dosimeter 목록", "Device Name, Status, Device Type, MAC Address, Battery, RSSI, Voltage, Uptime 테이블 (페이지네이션)", "P1"],
        ["Dosimeter CRUD", "디바이스 추가/상세보기(모달)/수정(Setting)/삭제", "P1"],
        ["Gateway 목록", "Gateway 디바이스 목록 (Device Name, Status, Type, MAC, Server IP, Uptime)", "P1"],
        ["Gateway 상세/설정", "[Device] MAC, Type, ServerIP, Status, Uptime, URL, IPv4모드, BLE RSSI, Device/BLE FW, LED\n[Setting] 네트워크, Interface, LED, BLE RSSI, Device FW Upload, BLE FW Upload", "P1"],
    ],
    col_widths=[35 * mm, 105 * mm, 20 * mm]
)
story.append(t)
story.append(Spacer(1, 8 * mm))

# 1-3
story.append(Paragraph("1-3. Data Monitoring (실시간 모니터링)", H2_STYLE))
t = make_table(
    ["기능", "설명", "우선순위"],
    [
        ["디바이스 선택", "드롭다운으로 Dosimeter 선택", "P2"],
        ["실시간 차트", "선택된 디바이스의 Voltage(mV) vs Time 실시간 스트리밍 차트", "P2"],
        ["Start/Stop", "모니터링 시작/중지 제어", "P2"],
    ],
    col_widths=[35 * mm, 105 * mm, 20 * mm]
)
story.append(t)
story.append(Spacer(1, 8 * mm))

# 1-4
story.append(Paragraph("1-4. Calibration (교정)", H2_STYLE))
t = make_table(
    ["기능", "설명", "우선순위"],
    [
        ["데이터 조회", "디바이스 선택 + 날짜/시간 범위 지정 → Import Data", "P3"],
        ["스무딩 필터", "Median, Arithmetic Mean, Geometric Mean, Least Square, Envelope, Bezier (6종)", "P3"],
        ["Window Size / Baseline", "필터 윈도우 사이즈 및 베이스라인 값 설정", "P3"],
        ["차트 렌더링", "Original(파랑) + Filtered(초록, 원본-baseline) 차트 동시 표시", "P3"],
        ["누적선량 계산", "Start~End Time 구간의 V·s 적분값(Cumulative Dose) 계산", "P3"],
        ["CF Factor 산출", "Delivered Dose(cGy) 입력 → CF Factor(mV/cGy) 자동 계산 및 저장", "P3"],
    ],
    col_widths=[35 * mm, 105 * mm, 20 * mm]
)
story.append(t)
story.append(Spacer(1, 8 * mm))

# 1-5
story.append(Paragraph("1-5. Manage Calibration (교정 관리)", H2_STYLE))
t = make_table(
    ["기능", "설명", "우선순위"],
    [
        ["CF Factor 목록", "저장된 Calibration Factor 목록 조회", "P4"],
        ["상세 조회", "누적 선량, 필터 세팅, 차트 재확인", "P4"],
        ["수정/삭제", "저장된 교정 데이터 관리", "P4"],
    ],
    col_widths=[35 * mm, 105 * mm, 20 * mm]
)
story.append(t)
story.append(Spacer(1, 8 * mm))

# 1-6
story.append(Paragraph("1-6. Data Analysis (데이터 분석)", H2_STYLE))
t = make_table(
    ["기능", "설명", "우선순위"],
    [
        ["방사선 종류 선택", "Photon, Electron & Muon, Proton, Neutron, Alpha Particle/Fission Fragment/Heavy Ion", "P4"],
        ["대상 장기 선택", "Breast, Colon, Stomach, Lung, Gonads, Bladder, Liver, Esophagus, Thyroid, Bone Surface, Brain, Salivary Glands, Skin, Residual Tissues", "P4"],
        ["범위 설정", "Full Range 또는 Sub Range(사용자 지정 시간 구간)", "P4"],
        ["선량 계산", "Cumulative Dose(누적선량), Absorbed Dose(흡수선량), Equivalent Dose(등가선량), Effective Dose(유효선량)", "P4"],
        ["Export", ".csv 파일 다운로드", "P4"],
    ],
    col_widths=[35 * mm, 105 * mm, 20 * mm]
)
story.append(t)
story.append(PageBreak())

# ═══════════════════════════════════════════
# 2. 화면 설계
# ═══════════════════════════════════════════
story.append(Paragraph("2. 화면 설계 (UI/UX)", H1_STYLE))

story.append(Paragraph("2-1. 전체 레이아웃", H2_STYLE))
layout_desc = """
<b>Header:</b> 로고 (Dosimetry), 사용자 설정 버튼<br/>
<b>Sidebar (왼쪽 네비게이션):</b> Device | Data Monitoring | Calibration | Manage Calibration | Data Analysis<br/>
<b>Main Content:</b> 선택된 메뉴에 따른 컨텐츠 영역<br/>
<b>Device 탭 구조:</b> Dosimeter 탭 / Gateway 탭
"""
story.append(Paragraph(layout_desc, BODY_STYLE))
story.append(Spacer(1, 6 * mm))

story.append(Paragraph("2-2. 사용자 플로우", H2_STYLE))
flow_desc = """
Login → [인증 성공] → Device 목록 (기본 랜딩 페이지)<br/><br/>
• <b>Device:</b> Dosimeter 탭 → 테이블 → 행 클릭 → 상세 모달 / Gateway 탭 → 행 클릭 → 상세/설정 모달<br/>
• <b>Data Monitoring:</b> 디바이스 선택 → Start → 실시간 Voltage 차트<br/>
• <b>Calibration:</b> 디바이스/날짜 선택 → Import Data → 필터/윈도우/베이스라인 Apply → Start/End Time → 누적선량 → Delivered Dose → CF Factor → Save<br/>
• <b>Manage Calibration:</b> CF Factor 목록 → 선택 시 차트 + 세팅값 확인<br/>
• <b>Data Analysis:</b> 방사선 종류 + 장기 선택 → Full/Sub Range → Calculate → 4종 선량 결과 → Export CSV
"""
story.append(Paragraph(flow_desc, BODY_STYLE))
story.append(Spacer(1, 6 * mm))

story.append(Paragraph("2-3. 화면 상세 정의", H2_STYLE))
t = make_table(
    ["화면명", "URL 경로", "주요 컴포넌트", "사용자 액션"],
    [
        ["Login", "/login", "로고, ID/PW 입력, 로그인 버튼", "ID/PW 입력 → 로그인"],
        ["Device\n(Dosimeter)", "/dosimetry/device\n(Dosimeter 탭)", "테이블(Name, Status, Type, MAC,\nBattery, RSSI, Voltage, Uptime)\n페이지네이션, Add Device 버튼", "행 클릭 → 상세 모달\nAdd Device → 추가"],
        ["Device\n(Gateway)", "/dosimetry/device\n(Gateway 탭)", "[Device 탭] MAC, Type, ServerIP,\nStatus, Uptime, Server URL,\nIPv4모드, BLE RSSI Threshold,\nDevice FW, BLE FW, LED\n[Setting 탭] 네트워크, Interface,\nLED, BLE RSSI, FW Upload", "행 클릭 → Device 탭(조회)\nSetting 탭 → 설정 변경\nFW Upload → 펌웨어 업로드"],
        ["User 설정", "Setting 모달", "내 프로필, 사용자 목록,\n계정 및 보안", "프로필/비밀번호 변경\n사용자 추가/삭제"],
        ["Data\nMonitoring", "/dosimetry/\ndata-monitoring", "디바이스 드롭다운,\nStart/Stop 버튼,\nVoltage vs Time 실시간 차트", "디바이스 선택\n→ Start → 차트 표시"],
        ["Calibration", "/dosimetry/\ncalibration", "Header: Filter, Window Size,\nBaseline, Apply\n차트: Original + Filtered\nFooter: 시간/선량/결과", "Import → 필터 Apply\n→ 적분 계산\n→ CF Factor Save"],
        ["Manage\nCalibration", "/dosimetry/\nmanage-calibration", "CF Factor 목록 테이블\n차트 + 세팅값 표시", "CF Factor 선택\n→ 상세 확인"],
        ["Data\nAnalysis", "/dosimetry/\ndata-analysis", "Header: Filter/Baseline/Apply\n방사선/장기 드롭다운\n차트, Footer: Calculate/Export", "방사선+장기 선택\n→ Calculate\n→ Export CSV"],
    ],
    col_widths=[22 * mm, 28 * mm, 55 * mm, 55 * mm]
)
story.append(t)

story.append(Spacer(1, 6 * mm))
story.append(Paragraph("2-4. 핵심 UI 컴포넌트", H2_STYLE))
components = """
• <b>차트:</b> Voltage vs Time 라인 차트 — Original(파랑), Filtered(초록), Baseline(노랑)<br/>
• <b>필터 툴바:</b> Filter Type 드롭다운 + Window Size 입력 + Baseline 입력 + Apply 버튼<br/>
• <b>Footer 계산영역:</b> Start Time / End Time / Cumulative Dose / Delivered Dose / Result(CF Factor)<br/>
• <b>디바이스 테이블:</b> 페이지네이션 + Status 색상 (Online=초록, Offline=회색)<br/>
• <b>설정 모달:</b> Account(내 계정), 사용자 탭, 그룹 탭
"""
story.append(Paragraph(components, BODY_STYLE))
story.append(PageBreak())

# ═══════════════════════════════════════════
# 3. DB 설계
# ═══════════════════════════════════════════
story.append(Paragraph("3. DB 설계", H1_STYLE))

story.append(Paragraph("3-1. 테이블 관계", H2_STYLE))
relations = """
• workspaces 1:N → users, devices, gateways<br/>
• devices 1:N → sensor_data, calibrations<br/>
• users 1:N → calibrations<br/>
• calibrations 1:N → analysis_results<br/>
• radiation_weighting_factors, tissue_weighting_factors: 참조 테이블
"""
story.append(Paragraph(relations, BODY_STYLE))
story.append(Spacer(1, 6 * mm))

story.append(Paragraph("3-2. ERD 주요 테이블", H2_STYLE))

db_tables = [
    ("users (사용자)", [
        ["id", "BIGINT", "PK, AUTO_INCREMENT", "사용자 고유 ID"],
        ["username", "VARCHAR(50)", "UNIQUE, NOT NULL", "로그인 ID"],
        ["password_hash", "VARCHAR(255)", "NOT NULL", "암호화된 비밀번호"],
        ["name", "VARCHAR(100)", "", "사용자 이름"],
        ["role", "ENUM", "", "admin / super_admin"],
        ["account_type", "VARCHAR(50)", "", "계정 타입"],
        ["group_name", "VARCHAR(100)", "", "소속 그룹"],
        ["workspace_id", "BIGINT", "FK → workspaces", "워크스페이스 ID"],
        ["created_at / updated_at", "DATETIME", "", "생성/수정 일시"],
    ]),
    ("workspaces (워크스페이스)", [
        ["id", "BIGINT", "PK, AUTO_INCREMENT", "고유 ID"],
        ["name", "VARCHAR(100)", "", "워크스페이스 이름"],
        ["created_at", "DATETIME", "", "생성일시"],
    ]),
    ("devices (Dosimeter)", [
        ["id", "BIGINT", "PK, AUTO_INCREMENT", "디바이스 고유 ID"],
        ["device_name", "VARCHAR(100)", "NOT NULL", "디바이스 이름"],
        ["device_type", "VARCHAR(50)", "", "Skin Dosimeter 등"],
        ["mac_address", "VARCHAR(17)", "UNIQUE", "MAC 주소"],
        ["status", "ENUM", "DEFAULT 'offline'", "online / offline"],
        ["battery / rssi / voltage", "INT / DECIMAL", "", "배터리(%), RSSI(dBm), 전압(mV)"],
        ["uptime", "DATETIME", "", "최근 online 시간"],
        ["workspace_id", "BIGINT", "FK → workspaces", "워크스페이스 ID"],
    ]),
    ("gateways (Gateway)", [
        ["id", "BIGINT", "PK, AUTO_INCREMENT", "Gateway 고유 ID"],
        ["device_name / type / mac", "VARCHAR", "NOT NULL / UNIQUE", "기본 정보"],
        ["status", "ENUM", "", "online / offline"],
        ["server_ip / url", "VARCHAR(255)", "", "서버 접속 정보"],
        ["ipv4_mode", "ENUM", "DEFAULT 'manual'", "IPv4 모드: manual / auto"],
        ["ip / subnet / gateway_ip", "VARCHAR(45)", "", "네트워크 설정"],
        ["dns_main / dns_sub", "VARCHAR(45)", "", "DNS 설정"],
        ["interface_type", "VARCHAR(50)", "", "인터페이스"],
        ["led_enabled", "BOOLEAN", "DEFAULT true", "LED On/Off 설정"],
        ["ble_rssi_threshold", "INT", "", "BLE RSSI 임계값"],
        ["device_fw_version", "VARCHAR(50)", "", "Device 펌웨어 버전"],
        ["ble_fw_version", "VARCHAR(50)", "", "BLE 펌웨어 버전"],
    ]),
    ("sensor_data (센서 원시 데이터)", [
        ["id", "BIGINT", "PK, AUTO_INCREMENT", "데이터 고유 ID"],
        ["device_id", "BIGINT", "FK → devices, INDEX", "디바이스 ID"],
        ["timestamp", "DATETIME(3)", "NOT NULL, INDEX", "측정 시간 (ms 정밀도)"],
        ["voltage", "DECIMAL(10,4)", "", "측정 전압 (mV)"],
    ]),
    ("calibrations (Calibration 결과)", [
        ["id", "BIGINT", "PK, AUTO_INCREMENT", "교정 고유 ID"],
        ["device_id / user_id", "BIGINT", "FK", "디바이스 / 사용자"],
        ["date", "DATE", "", "교정 날짜"],
        ["filter_type", "ENUM", "", "median/arithmetic_mean/geometric_mean/least_square/envelope/bezier"],
        ["window_size / baseline", "INT / DECIMAL", "", "필터 설정값"],
        ["start_time / end_time", "DATETIME(3)", "", "계산 구간"],
        ["cumulative_dose", "DECIMAL(15,4)", "", "누적선량 (V·s)"],
        ["delivered_dose", "DECIMAL(10,4)", "", "전달선량 (cGy)"],
        ["cf_factor", "DECIMAL(10,4)", "", "CF Factor (mV/cGy)"],
        ["cf_name", "VARCHAR(100)", "", "저장 이름"],
    ]),
    ("analysis_results (분석 결과)", [
        ["id", "BIGINT", "PK, AUTO_INCREMENT", "분석 결과 고유 ID"],
        ["calibration_id / user_id", "BIGINT", "FK", "교정 / 사용자"],
        ["radiation_source", "ENUM", "", "방사선 종류"],
        ["target_organ", "VARCHAR(50)", "", "대상 장기"],
        ["range_type", "ENUM", "", "full / sub"],
        ["cumulative_dose", "DECIMAL(15,6)", "", "누적선량"],
        ["absorbed_dose", "DECIMAL(15,6)", "", "흡수선량 (Gy)"],
        ["equivalent_dose", "DECIMAL(15,6)", "", "등가선량 (Sv)"],
        ["effective_dose", "DECIMAL(15,6)", "", "유효선량 (Sv)"],
    ]),
    ("radiation_weighting_factors / tissue_weighting_factors (가중치)", [
        ["id", "BIGINT", "PK, AUTO_INCREMENT", "고유 ID"],
        ["radiation_source / organ_name", "VARCHAR(50)", "", "방사선 종류 / 장기"],
        ["weighting_factor", "DECIMAL(10,6)", "", "가중치 (wR / wT)"],
    ]),
]

for tbl_name, cols in db_tables:
    story.append(Paragraph(f"<b>{tbl_name}</b>", BODY_STYLE))
    t = make_table(
        ["컬럼명", "데이터 타입", "제약조건", "설명"],
        cols,
        col_widths=[35 * mm, 28 * mm, 35 * mm, 62 * mm]
    )
    story.append(t)
    story.append(Spacer(1, 5 * mm))

story.append(PageBreak())

# ═══════════════════════════════════════════
# 4. 시스템 설계
# ═══════════════════════════════════════════
story.append(Paragraph("4. 시스템 설계", H1_STYLE))

story.append(Paragraph("4-1. 시스템 아키텍처", H2_STYLE))
arch_desc = """
<b>[Dosimeter Devices]</b> —BLE→ <b>[Gateway]</b> —WiFi/HTTP POST→ <b>[REST API Server]</b> ↔ <b>[MySQL DB]</b><br/>
<b>[Web Client (Browser)]</b> ↔ <b>[REST API Server]</b> (HTTP/WebSocket)
"""
story.append(Paragraph(arch_desc, BODY_STYLE))
story.append(Spacer(1, 6 * mm))

story.append(Paragraph("4-2. 기술 스택", H2_STYLE))
t = make_table(
    ["레이어", "기술", "대안", "선정 이유"],
    [
        ["Frontend", "React + TypeScript", "Vue.js, Angular", "차트 라이브러리 풍부, 컴포넌트 재사용"],
        ["차트", "Apache ECharts", "Recharts, Chart.js", "실시간 스트리밍 + 대용량 렌더링"],
        ["UI", "Ant Design", "MUI, Chakra UI", "관리 화면에 적합한 컴포넌트"],
        ["Backend", "Node.js (Fastify)", "Express, Spring Boot", "REST API, 비동기 처리"],
        ["실시간", "WebSocket (Socket.io)", "SSE", "실시간 차트 지원"],
        ["DB", "MySQL", "PostgreSQL", "기존 명세에서 MySQL 명시"],
        ["ORM", "Prisma", "TypeORM, Sequelize", "타입 안전, 마이그레이션"],
        ["인증", "JWT + bcrypt", "Session 기반", "Stateless REST에 적합"],
        ["수학", "math.js + 서버사이드", "-", "스무딩, 적분, 선량 계산"],
    ],
    col_widths=[22 * mm, 38 * mm, 35 * mm, 65 * mm]
)
story.append(t)
story.append(Spacer(1, 6 * mm))

story.append(Paragraph("4-3. API 엔드포인트", H2_STYLE))

api_data = [
    {"is_category": True, "label": "인증"},
    {"cols": ["POST", "/api/auth/login", "로그인", "JWT 토큰 반환"]},
    {"cols": ["POST", "/api/auth/logout", "로그아웃", ""]},
    {"is_category": True, "label": "사용자"},
    {"cols": ["GET", "/api/users", "사용자 목록 조회", ""]},
    {"cols": ["POST", "/api/users", "사용자 추가", ""]},
    {"cols": ["PUT", "/api/users/:id", "사용자 수정", ""]},
    {"cols": ["DELETE", "/api/users/:id", "사용자 삭제", ""]},
    {"is_category": True, "label": "Dosimeter 디바이스"},
    {"cols": ["GET", "/api/devices", "디바이스 목록", "페이지네이션"]},
    {"cols": ["POST", "/api/devices", "디바이스 추가", ""]},
    {"cols": ["GET", "/api/devices/:id", "디바이스 상세", ""]},
    {"cols": ["PUT", "/api/devices/:id", "디바이스 수정", ""]},
    {"cols": ["DELETE", "/api/devices/:id", "디바이스 삭제", ""]},
    {"is_category": True, "label": "Gateway"},
    {"cols": ["GET", "/api/gateways", "Gateway 목록", ""]},
    {"cols": ["GET", "/api/gateways/:id", "Gateway 상세", ""]},
    {"cols": ["PUT", "/api/gateways/:id/settings", "Gateway 설정 변경", "네트워크/BLE/LED"]},
    {"cols": ["POST", "/api/gateways/:id/firmware/device", "Device FW 업로드", "multipart/form-data"]},
    {"cols": ["POST", "/api/gateways/:id/firmware/ble", "BLE FW 업로드", "multipart/form-data"]},
    {"is_category": True, "label": "데이터 수집/조회"},
    {"cols": ["POST", "/api/data/ingest", "센서 데이터 수신", "Gateway 호출"]},
    {"cols": ["GET", "/api/sensor-data", "센서 데이터 조회", "?deviceId&start&end"]},
    {"cols": ["WS", "/ws/monitoring/:deviceId", "실시간 모니터링", "WebSocket"]},
    {"is_category": True, "label": "Calibration"},
    {"cols": ["POST", "/api/calibrations/calculate", "스무딩+적분 계산", "필터 파라미터"]},
    {"cols": ["POST", "/api/calibrations", "CF Factor 저장", ""]},
    {"cols": ["GET", "/api/calibrations", "Calibration 목록", ""]},
    {"cols": ["GET", "/api/calibrations/:id", "Calibration 상세", ""]},
    {"cols": ["DELETE", "/api/calibrations/:id", "Calibration 삭제", ""]},
    {"is_category": True, "label": "Data Analysis"},
    {"cols": ["POST", "/api/analysis/calculate", "선량 계산", "방사선/장기/범위"]},
    {"cols": ["GET", "/api/analysis/export", "CSV 내보내기", "?id="]},
    {"is_category": True, "label": "참조 데이터"},
    {"cols": ["GET", "/api/reference/radiation-factors", "방사선 가중치", ""]},
    {"cols": ["GET", "/api/reference/tissue-factors", "조직 가중치", ""]},
]

t = make_table(
    ["메서드", "엔드포인트", "설명", "비고"],
    api_data,
    col_widths=[18 * mm, 55 * mm, 42 * mm, 45 * mm],
    has_categories=True
)
story.append(t)
story.append(Spacer(1, 6 * mm))

story.append(Paragraph("4-4. 핵심 계산 로직", H2_STYLE))
t = make_table(
    ["단계", "수식", "단위", "설명"],
    [
        ["1. 누적선량", "∫(Start→End) [smoothed_voltage - baseline] dt", "V·s", "스무딩 전압 - 베이스라인의 시간 적분"],
        ["2. CF Factor", "Cumulative Dose / Delivered Dose", "mV·s/cGy", "누적선량 ÷ 전달선량"],
        ["3. 흡수선량", "Cumulative Dose / CF Factor", "Gy", "실제 흡수된 방사선량"],
        ["4. 등가선량", "Absorbed Dose × wR", "Sv", "방사선 가중치 적용"],
        ["5. 유효선량", "Equivalent Dose × wT", "Sv", "조직 가중치 적용"],
    ],
    col_widths=[22 * mm, 55 * mm, 25 * mm, 58 * mm]
)
story.append(t)
story.append(PageBreak())

# ═══════════════════════════════════════════
# 5. 개발 로드맵
# ═══════════════════════════════════════════
story.append(Paragraph("5. 개발 로드맵", H1_STYLE))

t = make_table(
    ["Phase", "범위", "주요 작업", "산출물"],
    [
        ["Phase 1\n기반 구축",
         "인증 +\n디바이스 CRUD +\nDB 구축",
         "• 프로젝트 초기 세팅\n• DB 스키마 생성\n• 로그인/인증 API\n• Device CRUD API+UI\n• 레이아웃",
         "• Login 화면\n• Device 화면\n• DB 스키마\n• API 기본 구조"],
        ["Phase 2\n실시간 모니터링",
         "데이터 수집 +\n실시간 모니터링",
         "• 데이터 수신 API\n• sensor_data 적재\n• WebSocket 서버\n• Data Monitoring UI",
         "• Monitoring 화면\n• 실시간 차트\n• 데이터 파이프라인"],
        ["Phase 3\nCalibration",
         "Calibration\n전체 플로우",
         "• 스무딩 필터 6종\n• 적분 계산\n• CF Factor 산출\n• Calibration UI",
         "• Calibration 화면\n• 필터 엔진\n• CF Factor 저장"],
        ["Phase 4\n분석 기능",
         "Manage Calibration\n+ Data Analysis",
         "• Manage Cal. UI\n• 가중치 참조 테이블\n• 4종 선량 계산\n• CSV Export",
         "• Manage Cal. 화면\n• Data Analysis 화면\n• CSV 다운로드"],
        ["Phase 5\n완성",
         "사용자 관리 +\n폴리싱",
         "• 사용자 CRUD\n• 워크스페이스 관리\n• 권한 기반 접근제어\n• UI/UX 마무리\n• 배포 설정",
         "• Setting 모달\n• 사용자 관리\n• 최종 배포본"],
    ],
    col_widths=[25 * mm, 28 * mm, 50 * mm, 50 * mm]
)
story.append(t)

# ── Build PDF ──
doc.build(story)
print(f"PDF saved: {output_path}")
