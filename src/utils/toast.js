export const showTimedToast = ({
    setMessage,
    setVisible,
    message,
    visibleDelay = 10,
    hideDelay = 1700,
    clearDelay = 2000,
    onBeforeShow,
    onAfterClear,
}) => {
    if (onBeforeShow) {
        onBeforeShow();
    }
    setMessage(message);
    setVisible(false);
    setTimeout(() => setVisible(true), visibleDelay);
    setTimeout(() => setVisible(false), hideDelay);
    setTimeout(() => {
        setMessage('');
        if (onAfterClear) {
            onAfterClear();
        }
    }, clearDelay);
};
