import React, { useEffect, useState } from 'react';
import { showTimedToast } from '../utils/toast';
import {
    createSpecFileListValue,
    isFirmwareSpecTitle,
    isImageSpecTitle,
    isUploadSpecTitle,
    parseSpecFileListValue,
} from '../utils/specFiles';

const ADJUSTER_SPEC_TITLES = [
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
const CONTROLLER_SPEC_TITLES = [
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
const toSpecTitleByType = (activeType, index) => {
    if (activeType === 'controller') {
        return CONTROLLER_SPEC_TITLES[index] || `사양${index + 1}`;
    }
    return ADJUSTER_SPEC_TITLES[index] || `사양${index + 1}`;
};
const createSpecTemplates = (activeType) => [
    ...Array.from({ length: 12 }, (_, index) => ({
        title: toSpecTitleByType(activeType, index)
    })),
    { title: activeType === 'controller' ? '제어기 이미지' : '조절기 이미지', fullWidth: true },
    { title: '펌웨어 파일', fullWidth: true },
    { title: '비고', fullWidth: true }
];

const AddSpecPopup = ({ onAddModel, onClose, type = "조절기", activeType = 'adjuster', onSwitchType }) => {
    const [productName, setProductName] = useState('');
    const [siteName, setSiteName] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [toastVisible, setToastVisible] = useState(false);
    const [specs, setSpecs] = useState(createSpecTemplates(activeType).map((item) => ({ ...item, details: '' })));

    useEffect(() => {
        setSpecs((prevSpecs) => {
            const nextTemplates = createSpecTemplates(activeType).filter((template) => template.fullWidth);
            const prevNormalSpecs = prevSpecs.filter((spec) => !spec.fullWidth);
            const normalSpecs = prevNormalSpecs.map((spec, index) => ({
                ...spec,
                title: toSpecTitleByType(activeType, index),
            }));
            const fullWidthSpecs = nextTemplates.map((template) => {
                const matchingTitle = template.title === '펌웨어 파일' || template.title === '비고'
                    ? template.title
                    : prevSpecs.find((spec) => spec.fullWidth && (spec.title === '조절기 이미지' || spec.title === '제어기 이미지'))?.title;
                const existing = prevSpecs.find((spec) => spec.title === matchingTitle || spec.title === template.title);
                return { ...template, details: existing ? existing.details : '' };
            });

            return [...normalSpecs, ...fullWidthSpecs];
        });
    }, [activeType]);

    const updateSpec = (index, value) => {
        const newSpecs = [...specs];
        newSpecs[index].details = value;
        setSpecs(newSpecs);
    };

    const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('파일 읽기 실패'));
        reader.readAsDataURL(file);
    });

    const handleSpecFileChange = (index, kind) => async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) {
            return;
        }

        if (kind === 'firmware' && files.some((file) => !file.name.toLowerCase().endsWith('.hex'))) {
            showErrorToast('.HEX 파일만 업로드할 수 있습니다.');
            e.target.value = '';
            return;
        }

        try {
            const existing = parseSpecFileListValue(specs[index]?.details);
            const appended = await Promise.all(files.map(async (file) => ({
                kind,
                name: file.name,
                mimeType: file.type,
                dataUrl: await readFileAsDataUrl(file),
                description: '',
            })));
            const merged = [...existing, ...appended];
            updateSpec(index, createSpecFileListValue({ files: merged }));
        } catch (error) {
            showErrorToast('파일을 읽는 중 오류가 발생했습니다.');
        }
        e.target.value = '';
    };

    const clearSpecFile = (index, fileIndex) => {
        const existing = parseSpecFileListValue(specs[index]?.details);
        const next = existing.filter((_, idx) => idx !== fileIndex);
        updateSpec(index, next.length > 0 ? createSpecFileListValue({ files: next }) : '');
    };

    const updateFirmwareDescription = (index, fileIndex, description) => {
        const existing = parseSpecFileListValue(specs[index]?.details);
        const target = existing[fileIndex];
        if (!target || target.kind !== 'firmware') {
            return;
        }
        const next = existing.map((file, idx) => (idx === fileIndex ? { ...file, description } : file));
        updateSpec(index, createSpecFileListValue({ files: next }));
    };

    const handleAddSpecField = () => {
        setSpecs((prevSpecs) => {
            const firstFullWidthIndex = prevSpecs.findIndex((spec) => spec.fullWidth);
            const specCount = prevSpecs.filter((spec) => !spec.fullWidth).length;
            const newSpec = {
                title: toSpecTitleByType(activeType, specCount),
                details: ''
            };

            if (firstFullWidthIndex === -1) {
                return [...prevSpecs, newSpec];
            }

            return [
                ...prevSpecs.slice(0, firstFullWidthIndex),
                newSpec,
                ...prevSpecs.slice(firstFullWidthIndex)
            ];
        });
    };

    const handleDeleteSpecField = () => {
        setSpecs((prevSpecs) => {
            const specOnly = prevSpecs.filter((spec) => !spec.fullWidth);
            const fixedFields = prevSpecs.filter((spec) => spec.fullWidth);

            if (specOnly.length <= 12) {
                return prevSpecs;
            }

            const nextSpecs = specOnly.slice(0, -1);
            return [...nextSpecs, ...fixedFields];
        });
    };

    const showErrorToast = (message) => {
        showTimedToast({
            setMessage: setErrorMessage,
            setVisible: setToastVisible,
            message,
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!siteName.trim() || !productName.trim()) {
            showErrorToast('현장명과 제품명을 모두 입력해야 완료할 수 있습니다.');
            return;
        }

        setToastVisible(false);
        setErrorMessage('');

        const isSaved = await onAddModel({ name: productName, siteName: siteName, specs });
        if (isSaved === false) {
            showErrorToast('저장에 실패했습니다. DB 연결 상태를 확인해주세요.');
            return;
        }

        onClose();
        setProductName('');
        setSiteName('');
        setSpecs(createSpecTemplates(activeType).map((item) => ({ ...item, details: '' })));
    };

    return (
        <div className="form-page">
            <div className="form-page-header">
                <div className="form-page-title-wrap">
                    <h2>{type} 추가</h2>
                    <div className="form-switch-buttons">
                        <button
                            type="button"
                            className={`button ${activeType === 'adjuster' ? 'button-active' : ''}`}
                            onClick={() => onSwitchType && onSwitchType('adjuster')}
                        >
                            조절기
                        </button>
                        <button
                            type="button"
                            className={`button button-controller ${activeType === 'controller' ? 'button-active' : ''}`}
                            onClick={() => onSwitchType && onSwitchType('controller')}
                        >
                            제어기
                        </button>
                    </div>
                </div>
                <div className="form-header-actions">
                    <button type="button" className="button button-delete-spec" onClick={handleDeleteSpecField}>사양 삭제</button>
                    <button type="button" className="button button-add-spec" onClick={handleAddSpecField}>사양 추가</button>
                    <button type="button" className="button button-cancel" onClick={onClose}>목록으로</button>
                </div>
            </div>
            <form onSubmit={handleSubmit} className="form-page-content">
                <div className="form-fields-grid">
                    <div className="top-required-row full-width">
                        <div className="form-field">
                            <label className="field-label"><span className="required-mark">*</span>현장명</label>
                            <input
                                className="field-input"
                                type="text"
                                value={siteName}
                                onChange={(e) => setSiteName(e.target.value)}
                                placeholder="현장명을 입력해주세요."
                            />
                        </div>

                        <div className="form-field">
                            <label className="field-label"><span className="required-mark">*</span>제품명</label>
                            <input
                                className="field-input"
                                type="text"
                                value={productName}
                                onChange={(e) => setProductName(e.target.value)}
                                placeholder="제품명을 입력해주세요."
                            />
                        </div>
                    </div>

                    {specs.map((spec, i) => (
                        <div key={i} className={`form-field ${spec.fullWidth ? 'full-width' : ''}`}>
                            <label className="field-label">{spec.title}</label>
                            {isUploadSpecTitle(spec.title) ? (
                                <div className="file-field-wrap">
                                    <input
                                        className="field-input"
                                        type="file"
                                        accept={isImageSpecTitle(spec.title) ? 'image/*' : '.hex'}
                                        multiple
                                        onChange={handleSpecFileChange(i, isImageSpecTitle(spec.title) ? 'image' : 'firmware')}
                                    />
                                    {(() => {
                                        const fileInfos = parseSpecFileListValue(spec.details);
                                        if (fileInfos.length === 0) {
                                            return null;
                                        }
                                        return (
                                            <>
                                                {isImageSpecTitle(spec.title) ? (
                                                    <div className="spec-image-grid">
                                                        {fileInfos.map((fileInfo, fileIndex) => (
                                                            <div key={`${fileInfo.name}-${fileIndex}`} className="spec-image-item">
                                                                <img src={fileInfo.dataUrl} alt={fileInfo.name || spec.title} className="spec-upload-preview" />
                                                                <button type="button" className="spec-image-delete-button" onClick={() => clearSpecFile(i, fileIndex)}>×</button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    fileInfos.map((fileInfo, fileIndex) => (
                                                        <div key={`${fileInfo.name}-${fileIndex}`} className="file-selected-item">
                                                            <div className="file-selected-row">
                                                                <span className="file-selected-name">{fileInfo.name}</span>
                                                                <button type="button" className="button button-cancel file-clear-button" onClick={() => clearSpecFile(i, fileIndex)}>삭제</button>
                                                            </div>
                                                            {isFirmwareSpecTitle(spec.title) && (
                                                                <textarea
                                                                    className="field-input firmware-description-input"
                                                                    value={fileInfo.description || ''}
                                                                    onChange={(e) => updateFirmwareDescription(i, fileIndex, e.target.value)}
                                                                    placeholder="펌웨어 파일 설명을 입력해주세요."
                                                                />
                                                            )}
                                                        </div>
                                                    ))
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                            ) : (
                                <input
                                    className="field-input"
                                    type="text"
                                    value={spec.details}
                                    onChange={(e) => updateSpec(i, e.target.value)}
                                    placeholder={`${spec.title}을 입력해주세요.`}
                                />
                            )}
                        </div>
                    ))}
                </div>
                {errorMessage && (
                    <div className={`toast-popup ${toastVisible ? 'show' : ''}`}>{errorMessage}</div>
                )}
                <div className="form-actions">
                    <button type="submit" className="button">완료</button>
                    <button type="button" className="button button-cancel" onClick={onClose}>취소</button>
                </div>
            </form>
        </div>
    );
};

export default AddSpecPopup;