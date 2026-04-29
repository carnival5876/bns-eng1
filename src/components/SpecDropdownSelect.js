import React, { useMemo } from 'react';

/**
 * 사양 제목별 서버에 등록된 옵션으로 드롭다운 표시.
 * DB에 없는 기존 값은 "(기존값)" 옵션으로 유지해 선택 상태가 깨지지 않게 함.
 */
const SpecDropdownSelect = ({
    specTitle,
    value,
    onChange,
    options = [],
    disabled = false,
    className = '',
}) => {
    const sorted = useMemo(() => {
        const forTitle = options.filter((o) => o.specTitle === specTitle);
        return [...forTitle].sort((a, b) => (
            (a.sortOrder || 0) - (b.sortOrder || 0)
            || String(a.optionValue || '').localeCompare(String(b.optionValue || ''), 'ko')
        ));
    }, [options, specTitle]);

    const optionValues = useMemo(() => new Set(sorted.map((o) => o.optionValue)), [sorted]);
    const raw = value == null ? '' : String(value);
    const hasLegacy = raw !== '' && !optionValues.has(raw);

    const selectValue = hasLegacy ? raw : raw;

    return (
        <select
            className={className}
            value={selectValue}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
        >
            <option value="">선택</option>
            {hasLegacy && (
                <option value={raw}>{`(기존값) ${raw}`}</option>
            )}
            {sorted.map((o) => (
                <option key={o.id} value={o.optionValue}>{o.optionValue}</option>
            ))}
        </select>
    );
};

export default SpecDropdownSelect;
