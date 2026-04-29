import React, { useEffect, useState } from 'react';
import { showTimedToast } from '../utils/toast';
import {
    createSpecFileListValue,
    isFirmwareSpecTitle,
    isImageSpecTitle,
    isUploadSpecTitle,
    parseSpecFileListValue,
} from '../utils/specFiles';
import { toSpecTitleByType } from '../constants/specTitles';
import { SIDO_OPTIONS, getDongOptions, getGugunOptions } from '../constants/koreaRegions';
import SpecDropdownSelect from './SpecDropdownSelect';

const ITEMS_PER_PAGE = 25;
const API_BASE = process.env.REACT_APP_API_BASE_URL
    || `${window.location.protocol}//${window.location.hostname}:4000/api`;
const JSON_HEADERS = {
    'Content-Type': 'application/json'
};
const normalizeSpecsByType = (type, specs = []) => {
    let nonFullIndex = 0;
    return specs.map((spec) => {
        if (spec.fullWidth) {
            return { ...spec };
        }
        const next = {
            ...spec,
            title: toSpecTitleByType(type, nonFullIndex),
        };
        nonFullIndex += 1;
        return next;
    });
};

const SpecList = ({
    models = [],
    onUpdateModel,
    onDeleteModel,
    onApproveModel,
    onRejectModel,
    canEditProduct = false,
    canViewDetail = true,
    canDownloadFirmware = true,
    showTypeFilter = false,
    typeFilters = { adjuster: true, controller: true },
    onToggleTypeFilter,
    editRequest = null,
    onEditRequestHandled,
    currentUserName = '',
    allowPendingExpand = false,
    showReviewMeta = false,
    renderCollapsedExtra,
    specDropdownOptions = [],
}) => {
    const [expandedModelId, setExpandedModelId] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [editingModelId, setEditingModelId] = useState(null);
    const [editingDraft, setEditingDraft] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
    const [toastVisible, setToastVisible] = useState(false);
    const [toastType, setToastType] = useState('error');
    const [lightboxImage, setLightboxImage] = useState(null);
    const [pendingScrollModelId, setPendingScrollModelId] = useState(null);

    const totalPages = Math.max(1, Math.ceil(models.length / ITEMS_PER_PAGE));
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const pagedModels = models.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
            setExpandedModelId(null);
        }
    }, [currentPage, totalPages]);

    useEffect(() => {
        if (!editRequest || !editRequest.key || !canEditProduct || editingModelId) {
            return;
        }
        const matchById = editRequest.id
            ? models.find((model) => Number(model.id) === Number(editRequest.id))
            : null;
        const match = matchById || models.find((model) => (
            String(model.siteName || '').trim() === String(editRequest.siteName || '').trim()
            && String(model.name || '').trim() === String(editRequest.productName || '').trim()
            && (!editRequest.type || String(model.type || '').trim() === String(editRequest.type || '').trim())
        ));
        if (match) {
            const matchIndex = models.findIndex((model) => model.id === match.id);
            if (matchIndex >= 0) {
                const targetPage = Math.floor(matchIndex / ITEMS_PER_PAGE) + 1;
                if (targetPage !== currentPage) {
                    setCurrentPage(targetPage);
                }
            }
            startEdit(match);
            setPendingScrollModelId(match.id);
            if (typeof onEditRequestHandled === 'function') {
                onEditRequestHandled(editRequest.key);
            }
        }
    }, [editRequest, models, canEditProduct, editingModelId, currentPage]);

    useEffect(() => {
        if (!pendingScrollModelId) {
            return;
        }
        if (!pagedModels.some((model) => model.id === pendingScrollModelId)) {
            return;
        }
        const raf = window.requestAnimationFrame(() => {
            const targetEl = document.getElementById(`model-row-${pendingScrollModelId}`);
            if (targetEl) {
                targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            setPendingScrollModelId(null);
        });
        return () => window.cancelAnimationFrame(raf);
    }, [pendingScrollModelId, pagedModels]);

    const writeClientLog = async ({ actionType, targetType, targetId, description, metadata }) => {
        let userName = currentUserName;

        if (!userName) {
            try {
                const raw = localStorage.getItem('bns-user');
                if (raw) {
                    const parsed = JSON.parse(raw);
                    userName = parsed?.name || '';
                }
            } catch (e) {
                // ignore
            }
        }

        if (!userName) {
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/logs/event`, {
                method: 'POST',
                headers: JSON_HEADERS,
                body: JSON.stringify({
                    requesterName: userName,
                    actionType,
                    targetType,
                    targetId,
                    description,
                    metadata,
                })
            });
            if (!res.ok) {
                console.error('[SpecList] 로그 저장 실패:', res.status, actionType);
            }
        } catch (error) {
            console.error('[SpecList] 로그 fetch 오류:', error);
        }
    };

    const toggleExpand = (modelId) => {
        if (editingModelId && editingModelId !== modelId) {
            showToast('리스트 수정 중에는 다른 리스트를 선택할 수 없습니다.', 'error');
            return;
        }
        if (editingModelId && editingModelId === modelId) {
            return;
        }

        const selectedModel = models.find((item) => item.id === modelId);
        if (!canViewDetail) {
            showToast('세부사항 열람 권한이 없습니다 관리자에게 문의 바랍니다.', 'error');
            return;
        }
        if (selectedModel?.reviewStatus === 'pending' && !allowPendingExpand) {
            return;
        }

        
        const nextExpanded = expandedModelId === modelId ? null : modelId;
        setExpandedModelId(nextExpanded);

        if (nextExpanded) {
            const model = models.find((item) => item.id === modelId);
            writeClientLog({
                actionType: 'list_detail_view',
                targetType: 'product',
                targetId: modelId,
                description: '세부사항 확인',
                metadata: {
                    siteName: model?.siteName || '',
                    productName: model?.name || '',
                },
            });
        }
    };

    const startEdit = (model) => {
        if (!canEditProduct) {
            showToast('리스트 수정 권한이 없습니다.', 'error');
            return;
        }
        if (model?.reviewStatus === 'pending') {
            showToast('검토 승인중인 항목은 수정할 수 없습니다.', 'error');
            return;
        }

        setEditingModelId(model.id);
        setExpandedModelId(model.id);
        const nextSpecs = normalizeSpecsByType(model.type, model.specs || []);
        setEditingDraft({
            id: model.id,
            siteName: model.siteName,
            name: model.name,
            type: model.type,
            sido: model.sido || '',
            gugun: model.gugun || '',
            dong: model.dong || '',
            detailAddress: model.detailAddress || '',
            specs: nextSpecs,
        });
    };

    const cancelEdit = () => {
        setEditingModelId(null);
        setEditingDraft(null);
        setIsSaving(false);
        setIsDeleting(false);
    };

    const showToast = (message, type = 'error') => {
        setToastType(type);
        showTimedToast({
            setMessage: setToastMessage,
            setVisible: setToastVisible,
            message,
        });
    };

    const saveEdit = async () => {
        if (!editingDraft || !onUpdateModel) {
            return;
        }

        setIsSaving(true);
        const ok = await onUpdateModel(editingDraft);
        setIsSaving(false);

        if (ok) {
            cancelEdit();
            setExpandedModelId(null);
            showToast('수정이 완료되었습니다.', 'success');
        } else {
            showToast('수정 저장에 실패했습니다.', 'error');
        }
    };

    const deleteModel = async (modelId) => {
        if (!onDeleteModel) {
            return;
        }

        const okToDelete = window.confirm('삭제 요청을 올리시겠습니까? 승인 완료 후 실제 삭제됩니다.');
        if (!okToDelete) {
            return;
        }

        setIsDeleting(true);
        const ok = await onDeleteModel(modelId);
        setIsDeleting(false);

        if (ok) {
            cancelEdit();
            setExpandedModelId(null);
            showToast('삭제 요청이 등록되었습니다. 승인 후 삭제됩니다.', 'success');
        } else {
            showToast('삭제 요청에 실패했습니다.', 'error');
        }
    };

    const updateDraftField = (field, value) => {
        setEditingDraft((prev) => ({ ...prev, [field]: value }));
    };

    const updateDraftSpec = (specIndex, value) => {
        setEditingDraft((prev) => {
            const nextSpecs = [...prev.specs];
            nextSpecs[specIndex] = { ...nextSpecs[specIndex], details: value };
            return { ...prev, specs: nextSpecs };
        });
    };

    const updateDraftSpecFile = (specIndex, kind) => (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) {
            return;
        }

        if (kind === 'firmware' && files.some((file) => !file.name.toLowerCase().endsWith('.hex'))) {
            showToast('.HEX 파일만 업로드할 수 있습니다.', 'error');
            e.target.value = '';
            return;
        }

        const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('파일 읽기 실패'));
            reader.readAsDataURL(file);
        });

        Promise.all(files.map(async (file) => ({
            kind,
            name: file.name,
            mimeType: file.type,
            dataUrl: await readFileAsDataUrl(file),
            description: '',
        })))
            .then((nextFiles) => {
                const existing = parseSpecFileListValue(editingDraft?.specs?.[specIndex]?.details);
                updateDraftSpec(specIndex, createSpecFileListValue({ files: [...existing, ...nextFiles] }));
            })
            .catch(() => {
                showToast('파일을 읽는 중 오류가 발생했습니다.', 'error');
            });
        e.target.value = '';
    };

    const clearDraftSpecFile = (specIndex, fileIndex) => {
        const existing = parseSpecFileListValue(editingDraft?.specs?.[specIndex]?.details);
        const next = existing.filter((_, idx) => idx !== fileIndex);
        updateDraftSpec(specIndex, next.length > 0 ? createSpecFileListValue({ files: next }) : '');
    };

    const updateDraftFirmwareDescription = (specIndex, fileIndex, description) => {
        const existing = parseSpecFileListValue(editingDraft?.specs?.[specIndex]?.details);
        const target = existing[fileIndex];
        if (!target || target.kind !== 'firmware') {
            return;
        }
        const next = existing.map((file, idx) => (idx === fileIndex ? { ...file, description } : file));
        updateDraftSpec(specIndex, createSpecFileListValue({ files: next }));
    };

    const addDraftSpec = () => {
        setEditingDraft((prev) => {
            if (!prev) {
                return prev;
            }

            const firstFullWidthIndex = prev.specs.findIndex((spec) => spec.fullWidth);
            const specCount = prev.specs.filter((spec) => !spec.fullWidth).length;
            const newSpec = {
                title: toSpecTitleByType(prev.type, specCount),
                details: '',
                fullWidth: false
            };

            if (firstFullWidthIndex === -1) {
                return { ...prev, specs: [...prev.specs, newSpec] };
            }

            return {
                ...prev,
                specs: [
                    ...prev.specs.slice(0, firstFullWidthIndex),
                    newSpec,
                    ...prev.specs.slice(firstFullWidthIndex)
                ]
            };
        });
    };

    const removeDraftSpec = () => {
        setEditingDraft((prev) => {
            if (!prev) {
                return prev;
            }

            const nonFullSpecs = prev.specs.filter((spec) => !spec.fullWidth);
            if (nonFullSpecs.length <= 1) {
                showToast('최소 1개의 사양은 유지되어야 합니다.', 'error');
                return prev;
            }

            const removeIndex = [...prev.specs]
                .map((spec, index) => ({ spec, index }))
                .filter((item) => !item.spec.fullWidth)
                .map((item) => item.index)
                .pop();

            if (removeIndex === undefined) {
                return prev;
            }

            return {
                ...prev,
                specs: prev.specs.filter((_, index) => index !== removeIndex),
            };
        });
    };

    const movePage = (page) => {
        if (page < 1 || page > totalPages) {
            return;
        }

        setCurrentPage(page);
        setExpandedModelId(null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        writeClientLog({
            actionType: 'list_page_move',
            targetType: 'list_page',
            targetId: page,
            description: `리스트 페이지 이동(${page})`,
        });
    };

    const getTypeLabel = (type) => {
        return type === 'adjuster' ? '조절기' : '제어기';
    };

    const getReviewChangeMap = (model) => {
        const map = new Map();
        if (!showReviewMeta || model?.reviewEventType !== 'update' || !Array.isArray(model?.reviewDiff)) {
            return map;
        }
        model.reviewDiff.forEach((change) => {
            map.set(change.field, change);
        });
        return map;
    };

    const formatReviewChangeText = (change) => (
        `변경전 : ${String(change?.before || '-')} / 변경후 : ${String(change?.after || '-')}`
    );

    return (
        <div className="model-list-section">
            <div className="model-list-head">
                <h3>사양 관리</h3>
                {showTypeFilter && (
                    <div className="type-filter-buttons">
                        <button
                            type="button"
                            className={`button type-filter-button adjuster ${typeFilters.adjuster ? '' : 'off'}`}
                            onClick={() => onToggleTypeFilter && onToggleTypeFilter('adjuster')}
                        >
                            조절기
                        </button>
                        <button
                            type="button"
                            className={`button type-filter-button controller ${typeFilters.controller ? '' : 'off'}`}
                            onClick={() => onToggleTypeFilter && onToggleTypeFilter('controller')}
                        >
                            제어기
                        </button>
                    </div>
                )}
            </div>
            {models.length === 0 && (
                <div className="empty-list-message">표시할 제품이 없습니다.</div>
            )}
            {pagedModels.map((model) => (
                <div id={`model-row-${model.id}`} key={model.id || `${model.siteName}-${model.name}`}>
                    <div className="model-name" style={{display:"flex"}} onClick={() => toggleExpand(model.id)}>
                        <span className={`model-type-badge ${getTypeLabel(model.type)}`}>{getTypeLabel(model.type)}</span>
                        {allowPendingExpand && model.reviewStatus === 'pending' && (
                            <>
                                <span className="review-dot" />
                                <span className="review-event-chip">
                                    {model.reviewEventType === 'create'
                                        ? '신규 등록'
                                        : model.reviewEventType === 'delete'
                                            ? '삭제 대기중'
                                            : '기존 수정'}
                                </span>
                            </>
                        )}
                        <div style={{width:"35%"}}>현장명: {editingModelId === model.id ? editingDraft?.siteName : model.siteName}</div>
                        <div>모델명: {editingModelId === model.id ? editingDraft?.name : model.name}</div>
                        {(canEditProduct || allowPendingExpand) && (
                            <div className="model-actions" onClick={(e) => e.stopPropagation()}>
                                {model.reviewStatus === 'pending' && !allowPendingExpand && (
                                    <span className="review-pending-label">
                                        {model.reviewEventType === 'delete' ? '삭제 승인 대기중' : '검토 승인중'}
                                    </span>
                                )}
                                {canEditProduct && editingModelId === model.id ? (
                                    <>
                                        <button className="button button-add-spec model-edit-button" onClick={addDraftSpec} disabled={isSaving}>사양 추가</button>
                                        <button className="button button-cancel model-edit-button" onClick={removeDraftSpec} disabled={isSaving || isDeleting}>사양 제거</button>
                                        <button className="button model-edit-button" onClick={saveEdit} disabled={isSaving || isDeleting}>{isSaving ? '저장중...' : '저장'}</button>
                                        <button className="button button-cancel model-edit-button" onClick={() => deleteModel(model.id)} disabled={isSaving || isDeleting}>{isDeleting ? '삭제중...' : '삭제'}</button>
                                        <button className="button button-cancel model-edit-button" onClick={cancelEdit} disabled={isSaving || isDeleting}>취소</button>
                                    </>
                                ) : allowPendingExpand ? (
                                    <>
                                        <button className="button model-edit-button" onClick={() => toggleExpand(model.id)}>
                                            {expandedModelId === model.id ? '상세 닫기' : '상세 보기'}
                                        </button>
                                        {expandedModelId === model.id && typeof onRejectModel === 'function' && (
                                            <button className="button button-cancel model-edit-button" onClick={() => onRejectModel(model.id)}>승인 거부</button>
                                        )}
                                        {expandedModelId === model.id && typeof onApproveModel === 'function' && (
                                            <button className="button model-edit-button" onClick={() => onApproveModel(model.id)}>최종 승인</button>
                                        )}
                                    </>
                                ) : (
                                    <button className="button model-edit-button" onClick={() => startEdit(model)}>수정</button>
                                )}
                            </div>
                        )}
                    </div>
                    {typeof renderCollapsedExtra === 'function' && expandedModelId !== model.id && (
                        <div className="model-collapsed-extra">
                            {renderCollapsedExtra(model)}
                        </div>
                    )}
                    {expandedModelId === model.id && (
                        <>
                            {(() => {
                                const reviewChangeMap = getReviewChangeMap(model);
                                const siteChange = reviewChangeMap.get('siteName');
                                const nameChange = reviewChangeMap.get('productName');
                                if (!showReviewMeta || model.reviewEventType !== 'update' || (!siteChange && !nameChange)) {
                                    return null;
                                }
                                return (
                                    <div className="edit-top-row review-top-row">
                                        {siteChange && (
                                            <div className="spec-input">
                                                <label>
                                                    <span className="spec-changed-dot" />
                                                    현장명
                                                </label>
                                                <div className="review-inline-change">{formatReviewChangeText(siteChange)}</div>
                                            </div>
                                        )}
                                        {nameChange && (
                                            <div className="spec-input">
                                                <label>
                                                    <span className="spec-changed-dot" />
                                                    모델명
                                                </label>
                                                <div className="review-inline-change">{formatReviewChangeText(nameChange)}</div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                            {editingModelId === model.id && (
                                <div className="top-required-row spec-edit-top-row">
                                    <div className="form-field">
                                        <label className="field-label">현장명</label>
                                        <input
                                            className="field-input"
                                            type="text"
                                            value={editingDraft?.siteName || ''}
                                            onChange={(e) => updateDraftField('siteName', e.target.value)}
                                        />
                                    </div>
                                    <div className="form-field">
                                        <label className="field-label">모델명</label>
                                        <input
                                            className="field-input"
                                            type="text"
                                            value={editingDraft?.name || ''}
                                            onChange={(e) => updateDraftField('name', e.target.value)}
                                        />
                                    </div>
                                    <div className="form-field">
                                        <label className="field-label">시/도</label>
                                        <select
                                            className="field-input"
                                            value={editingDraft?.sido || ''}
                                            onChange={(e) => {
                                                updateDraftField('sido', e.target.value);
                                                updateDraftField('gugun', '');
                                                updateDraftField('dong', '');
                                            }}
                                        >
                                            <option value="">시/도</option>
                                            {SIDO_OPTIONS.map((item) => (
                                                <option key={item} value={item}>{item}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-field">
                                        <label className="field-label">구/군</label>
                                        <select
                                            className="field-input"
                                            value={editingDraft?.gugun || ''}
                                            onChange={(e) => {
                                                updateDraftField('gugun', e.target.value);
                                                updateDraftField('dong', '');
                                            }}
                                            disabled={!editingDraft?.sido}
                                        >
                                            <option value="">구/군</option>
                                            {getGugunOptions(editingDraft?.sido || '').map((item) => (
                                                <option key={item} value={item}>{item}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-field">
                                        <label className="field-label">동/읍/면</label>
                                        <select
                                            className="field-input"
                                            value={editingDraft?.dong || ''}
                                            onChange={(e) => updateDraftField('dong', e.target.value)}
                                            disabled={!editingDraft?.sido || !editingDraft?.gugun}
                                        >
                                            <option value="">동/읍/면</option>
                                            {getDongOptions(editingDraft?.sido || '', editingDraft?.gugun || '').map((item) => (
                                                <option key={item} value={item}>{item}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-field full-width">
                                        <label className="field-label">상세주소</label>
                                        <input
                                            className="field-input"
                                            type="text"
                                            value={editingDraft?.detailAddress || ''}
                                            onChange={(e) => updateDraftField('detailAddress', e.target.value)}
                                            placeholder="지번주소 또는 도로명 주소"
                                        />
                                    </div>
                                </div>
                            )}
                            {showReviewMeta && model.reviewStatus === 'pending' && (
                                <div className="review-diff-wrap">
                                    <h4>
                                        {model.reviewEventType === 'create'
                                            ? '신규 등록 항목'
                                            : model.reviewEventType === 'delete'
                                                ? '삭제 대기중 항목'
                                                : '수정전 / 수정후 비교'}
                                    </h4>
                                    {model.reviewEventType === 'update' ? (
                                        Array.isArray(model.reviewDiff) && model.reviewDiff.length > 0 ? (
                                            <ul className="review-diff-list">
                                                {model.reviewDiff.map((change, index) => (
                                                    <li key={`${change.field}-${index}`}>
                                                        <span className="review-diff-label">{change.label}:</span> {formatReviewChangeText(change)}
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <p>변경 내역 정보가 없습니다.</p>
                                        )
                                    ) : model.reviewEventType === 'delete' ? (
                                        <p>삭제 승인 요청된 리스트입니다. 최종 승인 시 실제로 삭제됩니다.</p>
                                    ) : (
                                        <p>신규 생성된 리스트입니다.</p>
                                    )}
                                </div>
                            )}
                            {showReviewMeta && (
                                <div className="review-request-type-text">
                                    요청 유형: {model.reviewEventType === 'create' ? '리스트 등록' : model.reviewEventType === 'delete' ? '리스트 삭제' : '리스트 수정'}
                                </div>
                            )}
                            <div className={editingModelId === model.id ? 'form-fields-grid spec-edit-fields-grid' : 'spec-view-grid'}>
                            {(editingModelId === model.id ? editingDraft?.specs || [] : model.specs).map((spec, specIndex) => (
                                <div
                                    key={specIndex}
                                    className={editingModelId === model.id
                                        ? `form-field ${spec.fullWidth ? 'full-width' : ''}`
                                        : `spec-view-item ${spec.fullWidth ? 'full-width' : ''}`}
                                >
                                    <label className={editingModelId === model.id ? 'field-label' : ''}>
                                        {showReviewMeta && model.reviewEventType === 'update' && Array.isArray(model.reviewDiff) && model.reviewDiff.some((change) => change.field === `spec:${spec.title}`) && (
                                            <span className="spec-changed-dot" />
                                        )}
                                        {spec.title}
                                    </label>
                                    {isUploadSpecTitle(spec.title) ? (
                                        <div className={`spec-file-view ${editingModelId === model.id ? '' : 'spec-view-file-box'}`}>
                                            {(() => {
                                                const fileInfos = parseSpecFileListValue(spec.details);
                                                return (
                                                    <>
                                                        {fileInfos.some((file) => file.kind === 'image') && (
                                                            <div className="spec-image-grid">
                                                                {fileInfos.map((file, idx) => ({ file, idx }))
                                                                    .filter((item) => item.file.kind === 'image')
                                                                    .map(({ file, idx }) => (
                                                                    <div key={`${file.name}-${idx}`} className="spec-image-item">
                                                                        <img
                                                                            src={file.dataUrl}
                                                                            alt={file.name || spec.title}
                                                                            className="spec-upload-preview"
                                                                            onClick={() => setLightboxImage({ src: file.dataUrl, alt: file.name || spec.title })}
                                                                        />
                                                                        {editingModelId === model.id && (
                                                                            <button
                                                                                type="button"
                                                                                className="spec-image-delete-button"
                                                                                onClick={() => clearDraftSpecFile(specIndex, idx)}
                                                                            >
                                                                                ×
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                        {fileInfos.filter((file) => file.kind === 'firmware').map((file, idx) => (
                                                            <div key={`${file.name}-${idx}`} className="spec-firmware-row-wrap">
                                                                <div className="spec-firmware-row">
                                                                    <span className="spec-firmware-name">{file.name}</span>
                                                                    {canDownloadFirmware && (
                                                                        <a
                                                                            className="button spec-download-button"
                                                                            href={file.dataUrl}
                                                                            download={file.name}
                                                                            target="_blank"
                                                                            rel="noreferrer"
                                                                        >
                                                                            다운로드
                                                                        </a>
                                                                    )}
                                                                </div>
                                                                {file.description && (
                                                                    <div className="spec-firmware-tooltip">
                                                                        {file.description}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                        {fileInfos.length === 0 && <span className="spec-file-empty">업로드된 파일 없음</span>}
                                                        {showReviewMeta && model.reviewEventType === 'update' && (() => {
                                                            const change = (model.reviewDiff || []).find((item) => item.field === `spec:${spec.title}`);
                                                            if (!change) {
                                                                return null;
                                                            }
                                                            return (
                                                                <div className="review-inline-change">
                                                                    {formatReviewChangeText(change)}
                                                                </div>
                                                            );
                                                        })()}
                                                    </>
                                                );
                                            })()}
                                            {editingModelId === model.id && (
                                                <div className="spec-file-actions">
                                                    <input
                                                        type="file"
                                                        accept={isImageSpecTitle(spec.title) ? 'image/*' : '.hex'}
                                                        multiple
                                                        onChange={updateDraftSpecFile(specIndex, isImageSpecTitle(spec.title) ? 'image' : 'firmware')}
                                                    />
                                                </div>
                                            )}
                                            {editingModelId === model.id && isFirmwareSpecTitle(spec.title) && (() => {
                                                const parsedFiles = parseSpecFileListValue((editingDraft?.specs || [])[specIndex]?.details);
                                                if (parsedFiles.length === 0) {
                                                    return null;
                                                }
                                                return parsedFiles.map((file, fileIndex) => (
                                                    <div key={`${file.name}-${fileIndex}`} className="firmware-edit-row">
                                                        <div className="file-selected-row">
                                                            <span className="file-selected-name">{file.name}</span>
                                                            <button type="button" className="button button-cancel model-edit-button" onClick={() => clearDraftSpecFile(specIndex, fileIndex)}>삭제</button>
                                                        </div>
                                                        <textarea
                                                            className="field-input firmware-description-input"
                                                            value={file.description || ''}
                                                            onChange={(e) => updateDraftFirmwareDescription(specIndex, fileIndex, e.target.value)}
                                                            placeholder="펌웨어 파일 설명을 입력해주세요."
                                                        />
                                                    </div>
                                                ));
                                            })()}
                                        </div>
                                    ) : editingModelId === model.id ? (
                                        <>
                                            <SpecDropdownSelect
                                                className="field-input"
                                                specTitle={spec.title}
                                                value={spec.details}
                                                onChange={(v) => updateDraftSpec(specIndex, v)}
                                                options={specDropdownOptions}
                                                disabled={false}
                                            />
                                            {showReviewMeta && model.reviewEventType === 'update' && (() => {
                                                const change = (model.reviewDiff || []).find((item) => item.field === `spec:${spec.title}`);
                                                if (!change) {
                                                    return null;
                                                }
                                                return (
                                                    <div className="review-inline-change">
                                                        {formatReviewChangeText(change)}
                                                    </div>
                                                );
                                            })()}
                                        </>
                                    ) : (
                                        <div className="spec-view-value">{spec.details || '-'}</div>
                                    )}
                                </div>
                            ))}
                        </div>
                        </>
                    )}
                </div>
            ))}

            {totalPages > 1 && (
                <div className="pagination-wrap">
                    <button className="pagination-button" onClick={() => movePage(currentPage - 1)} disabled={currentPage === 1}>이전</button>
                    {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                        <button
                            key={page}
                            className={`pagination-button ${page === currentPage ? 'active' : ''}`}
                            onClick={() => movePage(page)}
                        >
                            {page}
                        </button>
                    ))}
                    <button className="pagination-button" onClick={() => movePage(currentPage + 1)} disabled={currentPage === totalPages}>다음</button>
                </div>
            )}

            {toastMessage && (
                <div className={`toast-popup ${toastVisible ? 'show' : ''} ${toastType === 'success' ? 'toast-success' : 'toast-error'}`}>{toastMessage}</div>
            )}
            {lightboxImage && (
                <div className="lightbox-backdrop" onClick={() => setLightboxImage(null)}>
                    <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
                        <button className="lightbox-close" onClick={() => setLightboxImage(null)}>×</button>
                        <img src={lightboxImage.src} alt={lightboxImage.alt} className="lightbox-image" />
                    </div>
                </div>
            )}
        </div>
    );
};

export default SpecList;