import { useState, useEffect } from 'react';
import { Upload } from 'lucide-react';

/**
 * ExternalDropBlocker - Intercepts external file drops and shows a helpful message
 * 
 * Since Tauri's native drag-drop is disabled, we need to prevent the browser's
 * default behavior (which would show file contents) and instead guide users
 * to use the Upload button.
 */
export function ExternalDropBlocker({ onUploadClick }: { onUploadClick: () => void }) {
    const [showMessage, setShowMessage] = useState(false);

    useEffect(() => {
        let hideTimeout: ReturnType<typeof setTimeout>;

        const handleDragOver = (e: DragEvent) => {
            // Check if this is an external file drag (from Finder)
            if (e.dataTransfer?.types.includes('Files')) {
                e.preventDefault();
                e.stopPropagation();
                setShowMessage(true);
                clearTimeout(hideTimeout);
            }
        };

        const handleDragLeave = (e: DragEvent) => {
            // Only hide if leaving the window entirely
            if (e.clientX <= 0 || e.clientY <= 0 ||
                e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
                hideTimeout = setTimeout(() => setShowMessage(false), 100);
            }
        };

        const handleDrop = (e: DragEvent) => {
            // Block external file drops
            if (e.dataTransfer?.types.includes('Files')) {
                e.preventDefault();
                e.stopPropagation();
                // Keep message visible briefly so user sees it
                setTimeout(() => setShowMessage(false), 2000);
            }
        };

        document.addEventListener('dragover', handleDragOver, true);
        document.addEventListener('dragleave', handleDragLeave, true);
        document.addEventListener('drop', handleDrop, true);

        return () => {
            document.removeEventListener('dragover', handleDragOver, true);
            document.removeEventListener('dragleave', handleDragLeave, true);
            document.removeEventListener('drop', handleDrop, true);
            clearTimeout(hideTimeout);
        };
    }, []);

    if (!showMessage) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center pointer-events-none">
            <div className="glass bg-telegram-surface border border-telegram-border rounded-2xl p-8 max-w-md mx-4 shadow-2xl pointer-events-auto">
                <div className="flex flex-col items-center text-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-telegram-primary/20 flex items-center justify-center">
                        <Upload className="w-8 h-8 text-telegram-primary" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-telegram-text mb-2">
                            请使用上传按钮
                        </h3>
                        <p className="text-telegram-subtext text-sm">
                            上传文件请使用工具栏中的 <strong>上传</strong> 按钮。
                            <br />
                            <span className="text-xs opacity-70 mt-2 block">
                                不支持从系统文件管理器直接拖放。
                            </span>
                        </p>
                    </div>
                    <button
                        onClick={() => {
                            setShowMessage(false);
                            onUploadClick();
                        }}
                        className="mt-2 px-6 py-2 bg-telegram-primary text-white rounded-lg font-medium hover:bg-telegram-primary/90 transition-colors"
                    >
                        打开上传对话框
                    </button>
                </div>
            </div>
        </div>
    );
}
