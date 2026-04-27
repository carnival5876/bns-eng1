const FILE_MARKER = '__bnsFile';
const FILE_LIST_MARKER = '__bnsFileList';

export const IMAGE_SPEC_TITLES = new Set(['조절기 이미지', '제어기 이미지']);
export const FIRMWARE_SPEC_TITLE = '펌웨어 파일';

export const isImageSpecTitle = (title = '') => IMAGE_SPEC_TITLES.has(title);
export const isFirmwareSpecTitle = (title = '') => title === FIRMWARE_SPEC_TITLE;
export const isUploadSpecTitle = (title = '') => isImageSpecTitle(title) || isFirmwareSpecTitle(title);

export const parseSpecFileValue = (value) => {
    if (!value || typeof value !== 'string') {
        return null;
    }

    try {
        const parsed = JSON.parse(value);
        if (parsed && parsed[FILE_MARKER] === true) {
            return parsed;
        }
        return null;
    } catch (error) {
        return null;
    }
};

export const createSpecFileValue = ({ kind, name, mimeType, dataUrl, description }) => JSON.stringify({
    [FILE_MARKER]: true,
    kind,
    name: name || '',
    mimeType: mimeType || '',
    dataUrl: dataUrl || '',
    description: description || '',
});

export const parseSpecFileListValue = (value) => {
    if (!value || typeof value !== 'string') {
        return [];
    }

    try {
        const parsed = JSON.parse(value);
        if (parsed && parsed[FILE_LIST_MARKER] === true && Array.isArray(parsed.files)) {
            return parsed.files;
        }
        if (parsed && parsed[FILE_MARKER] === true) {
            return [parsed];
        }
        return [];
    } catch (error) {
        return [];
    }
};

export const createSpecFileListValue = ({ files }) => JSON.stringify({
    [FILE_LIST_MARKER]: true,
    files: Array.isArray(files) ? files : [],
});
