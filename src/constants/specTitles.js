export const ADJUSTER_SPEC_TITLES = [
    'PCB ver.',
    'Micom ver.',
    'LCD',
    '터치 가스켓',
    '터치IC',
    '사출',
    '플레이트',
    '환기',
    '에어컨',
    '커넥터',
];

export const CONTROLLER_SPEC_TITLES = [
    'PCB ver.',
    'Micom ver.',
    'TRANS, SMPS',
    '홈넷',
    '보일러',
    '에어컨',
    '누수',
    '구동기 전압',
    '구동기 사양',
    '비상 스위치',
    '커넥터',
];

export const toSpecTitleByType = (type, index) => {
    if (type === 'controller') {
        return CONTROLLER_SPEC_TITLES[index] || `사양${index + 1}`;
    }
    return ADJUSTER_SPEC_TITLES[index] || `사양${index + 1}`;
};

/** 제품등록·리스트 수정과 동일한 사양 항목(이미지/펌웨어/비고 제외) — 드롭다운 관리 선택용 */
export const ALL_KNOWN_TEXT_SPEC_TITLES = Array.from(
    new Set([...ADJUSTER_SPEC_TITLES, ...CONTROLLER_SPEC_TITLES])
).sort((a, b) => a.localeCompare(b, 'ko'));
