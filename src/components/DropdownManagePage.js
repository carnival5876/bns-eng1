import React, { useMemo, useState } from 'react';
import { ALL_KNOWN_TEXT_SPEC_TITLES } from '../constants/specTitles';

const API_BASE = process.env.REACT_APP_API_BASE_URL
    || `${window.location.protocol}//${window.location.hostname}:4000/api`;
const JSON_HEADERS = { 'Content-Type': 'application/json' };

const DropdownManagePage = ({
    currentUserName,
    specDropdownOptions,
    onOptionsChange,
    showAppToast,
}) => {
    const [selectedTitle, setSelectedTitle] = useState(() => ALL_KNOWN_TEXT_SPEC_TITLES[0] || '');
    const [newValue, setNewValue] = useState('');
    const [busy, setBusy] = useState(false);

    const titleChoices = useMemo(() => {
        const fromDb = [...new Set(specDropdownOptions.map((o) => o.specTitle).filter(Boolean))];
        return [...new Set([...ALL_KNOWN_TEXT_SPEC_TITLES, ...fromDb])]
            .sort((a, b) => a.localeCompare(b, 'ko'));
    }, [specDropdownOptions]);

    const rowsForTitle = useMemo(() => {
        return specDropdownOptions
            .filter((o) => o.specTitle === selectedTitle)
            .sort((a, b) => (
                (a.sortOrder || 0) - (b.sortOrder || 0)
                || String(a.optionValue || '').localeCompare(String(b.optionValue || ''), 'ko')
            ));
    }, [specDropdownOptions, selectedTitle]);

    const reload = async () => {
        const res = await fetch(`${API_BASE}/spec-dropdown-options`);
        if (!res.ok) {
            throw new Error('목록을 불러오지 못했습니다.');
        }
        const data = await res.json();
        onOptionsChange(Array.isArray(data) ? data : []);
    };

    const handleAdd = async (e) => {
        e.preventDefault();
        const trimmed = newValue.trim();
        if (!selectedTitle) {
            showAppToast('사양 항목을 선택해주세요.', 'error');
            return;
        }
        if (!trimmed) {
            showAppToast('추가할 옵션 값을 입력해주세요.', 'error');
            return;
        }
        setBusy(true);
        try {
            const res = await fetch(`${API_BASE}/spec-dropdown-options`, {
                method: 'POST',
                headers: JSON_HEADERS,
                body: JSON.stringify({
                    requesterName: currentUserName,
                    specTitle: selectedTitle,
                    optionValue: trimmed,
                }),
            });
            if (res.status === 409) {
                showAppToast('이미 등록된 옵션입니다.', 'error');
                return;
            }
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || '추가에 실패했습니다.');
            }
            setNewValue('');
            showAppToast('옵션이 추가되었습니다.', 'success');
            await reload();
        } catch (err) {
            showAppToast(err.message || '추가에 실패했습니다.', 'error');
        } finally {
            setBusy(false);
        }
    };

    const handleDelete = async (id) => {
        const ok = window.confirm('이 옵션을 삭제할까요?');
        if (!ok) {
            return;
        }
        setBusy(true);
        try {
            const res = await fetch(`${API_BASE}/spec-dropdown-options/${id}`, {
                method: 'DELETE',
                headers: JSON_HEADERS,
                body: JSON.stringify({ requesterName: currentUserName }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || '삭제에 실패했습니다.');
            }
            showAppToast('삭제되었습니다.', 'success');
            await reload();
        } catch (err) {
            showAppToast(err.message || '삭제에 실패했습니다.', 'error');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="placeholder-page dropdown-manage-page">
            <h3>드롭다운 관리</h3>
            <p className="dropdown-manage-help">
                제품 등록·리스트 수정 시 사양 입력란에 표시되는 선택 목록을 사양 항목(제목)별로 관리합니다.
                이미지·펌웨어·비고 항목은 파일 업로드이므로 여기서 다루지 않습니다.
            </p>

            <form className="dropdown-manage-add-form" onSubmit={handleAdd}>
                <div className="dropdown-manage-row">
                    <label className="dropdown-manage-label">사양 항목</label>
                    <select
                        className="field-input dropdown-manage-title-select"
                        value={selectedTitle}
                        onChange={(e) => setSelectedTitle(e.target.value)}
                        disabled={busy}
                    >
                        {titleChoices.map((t) => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </select>
                </div>
                <div className="dropdown-manage-row">
                    <label className="dropdown-manage-label">옵션 값</label>
                    <input
                        className="field-input"
                        type="text"
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                        placeholder="목록에 추가할 값"
                        disabled={busy}
                    />
                    <button type="submit" className="button" disabled={busy}>
                        {busy ? '처리중...' : '추가'}
                    </button>
                </div>
            </form>

            <div className="dropdown-manage-list-wrap">
                <h4>{selectedTitle || '—'} — 등록된 옵션</h4>
                {rowsForTitle.length === 0 ? (
                    <p className="dropdown-manage-empty">등록된 옵션이 없습니다. 위에서 추가해주세요.</p>
                ) : (
                    <ul className="dropdown-manage-option-list">
                        {rowsForTitle.map((row) => (
                            <li key={row.id} className="dropdown-manage-option-item">
                                <span className="dropdown-manage-option-text">{row.optionValue}</span>
                                <button
                                    type="button"
                                    className="button button-cancel model-edit-button"
                                    onClick={() => handleDelete(row.id)}
                                    disabled={busy}
                                >
                                    삭제
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default DropdownManagePage;
