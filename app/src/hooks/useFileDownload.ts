import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { save, open } from '@tauri-apps/plugin-dialog';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { toast } from 'sonner';
import { DownloadItem, TelegramFile } from '../types';
import { isAndroidPlatform, showFileDialogFallback, pickWithFallback } from '../utils';
import { useSettings } from '../context/SettingsContext';
import type { Store } from '@tauri-apps/plugin-store';

interface ProgressPayload {
    id: string;
    percent: number;
    uploaded_bytes: number;
    total_bytes: number;
    speed_bytes_per_sec: number;
}

export function useFileDownload(store: Store | null) {
    const [downloadQueue, setDownloadQueue] = useState<DownloadItem[]>([]);
    const [initialized, setInitialized] = useState(false);
    const cancelledRef = useRef<Set<string>>(new Set());
    const activeCountRef = useRef(0);
    const { settings } = useSettings();

    // Listen for progress events from Rust
    useEffect(() => {
        let unlisten: UnlistenFn | undefined;
        listen<ProgressPayload>('download-progress', (event) => {
            setDownloadQueue(q => q.map(i =>
                i.id === event.payload.id ? {
                    ...i,
                    progress: event.payload.percent,
                    downloadedBytes: event.payload.uploaded_bytes,
                    totalBytes: event.payload.total_bytes,
                    speedBytesPerSec: event.payload.speed_bytes_per_sec,
                } : i
            ));
        }).then(fn => { unlisten = fn; });
        return () => { unlisten?.(); };
    }, []);

    // Load saved queue on mount
    useEffect(() => {
        if (!store || initialized) return;
        store.get<DownloadItem[]>('downloadQueue').then((saved) => {
            if (saved && saved.length > 0) {
                const pending = saved.filter(i => i.status === 'pending');
                if (pending.length > 0) {
                    setDownloadQueue(pending);
                    toast.info(`已恢复 ${pending.length} 个待下载任务`);
                }
            }
            setInitialized(true);
        });
    }, [store, initialized]);

    // Save queue when it changes (only pending items)
    useEffect(() => {
        if (!store || !initialized) return;
        const pending = downloadQueue.filter(i => i.status === 'pending');
        store.set('downloadQueue', pending).then(() => store.save());
    }, [store, downloadQueue, initialized]);

    // Process up to maxConcurrentDownloads in parallel
    useEffect(() => {
        const maxConcurrent = settings.maxConcurrentDownloads || 1;
        const available = maxConcurrent - activeCountRef.current;
        if (available <= 0) return;
        const pendingItems = downloadQueue.filter(i => i.status === 'pending').slice(0, available);
        for (const item of pendingItems) {
            processItem(item);
        }
    }, [downloadQueue, settings.maxConcurrentDownloads]);

    const processItem = async (item: DownloadItem) => {
        activeCountRef.current++;
        setDownloadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'downloading', progress: 0 } : i));

        try {
            // On Android, skip the save dialog entirely — the Rust backend handles saving
            // to public Downloads via MediaStore. Passing the original filename ensures the
            // correct file extension is preserved instead of getting a numeric document ID.
            let savePath: string | null = item.savePath || null;
            if (!savePath) {
                if (isAndroidPlatform) {
                    savePath = item.filename;
                } else {
                    savePath = await pickWithFallback(
                        () => save({ defaultPath: item.filename }),
                        () => {
                            setDownloadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'pending' as const, error: undefined } : i));
                        },
                        { errorTitle: '保存对话框打开失败' },
                    );
                    if (!savePath) {
                        setDownloadQueue(q => q.filter(i => i.id !== item.id));
                        activeCountRef.current--;
                        return;
                    }
                }
            }

            await invoke('cmd_download_file', {
                req: {
                    message_id: item.messageId,
                    save_path: savePath,
                    folder_id: item.folderId,
                    transfer_id: item.id
                }
            });

            if (cancelledRef.current.has(item.id)) {
                cancelledRef.current.delete(item.id);
            } else {
                setDownloadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'success', progress: 100 } : i));
                toast.success(`已下载：${item.filename}`);
            }
        } catch (e) {
            if (!cancelledRef.current.has(item.id)) {
                const errMsg = String(e);
                if (errMsg.includes('Transfer cancelled')) {
                    setDownloadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'cancelled' } : i));
                } else {
                    setDownloadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'error', error: errMsg } : i));
                    toast.error(`下载失败：${item.filename}`);
                }
            } else {
                cancelledRef.current.delete(item.id);
            }
        } finally {
            activeCountRef.current--;
        }
    };

    const queueDownload = (messageId: number, filename: string, folderId: number | null) => {
        const newItem: DownloadItem = {
            id: Math.random().toString(36).substr(2, 9),
            messageId,
            filename,
            folderId,
            status: 'pending'
        };
        setDownloadQueue(prev => [...prev, newItem]);
    };

    const queueBulkDownload = async (files: TelegramFile[], folderId: number | null) => {
        // On Android, skip the directory picker — the Rust backend handles saving
        // to public Downloads via MediaStore. Don't set savePath so processItem
        // falls through to item.filename.
        if (isAndroidPlatform) {
            const newItems: DownloadItem[] = files.map(file => ({
                id: Math.random().toString(36).substr(2, 9),
                messageId: file.id,
                filename: file.name,
                folderId,
                status: 'pending' as const,
            }));
            setDownloadQueue(prev => [...prev, ...newItems]);
            toast.info(`正在下载 ${files.length} 个文件到“下载”目录`);
            return;
        }

        const enqueueFiles = (dir: string) => {
            const separator = dir.includes('\\') ? '\\' : '/';
            const newItems: DownloadItem[] = files.map(file => ({
                id: Math.random().toString(36).substr(2, 9),
                messageId: file.id,
                filename: file.name,
                folderId,
                status: 'pending' as const,
                savePath: dir.endsWith(separator) ? `${dir}${file.name}` : `${dir}${separator}${file.name}`
            }));
            setDownloadQueue(prev => [...prev, ...newItems]);
            toast.info(`已将 ${files.length} 个文件加入下载队列`);
        };

        const dirPath = await pickWithFallback(
            () => open({ directory: true, multiple: false, title: "选择下载位置" }),
            () => queueBulkDownload(files, folderId),
            {
                errorTitle: '文件夹选择器打开失败',
                onBrowserPicker: async () => {
                    const paths = await showFileDialogFallback({ directory: true, multiple: false });
                    if (paths.length === 0) return null;
                    const sep = paths[0].includes('\\') ? '\\' : '/';
                    return paths[0].substring(0, paths[0].lastIndexOf(sep));
                },
            },
        );
        if (!dirPath) return;

        enqueueFiles(dirPath);
    };

    const clearFinished = () => {
        setDownloadQueue(q => q.filter(i => i.status !== 'success'));
    };

    const cancelAll = () => {
        setDownloadQueue(q => {
            const downloading = q.find(i => i.status === 'downloading');
            if (downloading) {
                cancelledRef.current.add(downloading.id);
                invoke('cmd_cancel_transfer', { transferId: downloading.id }).catch(() => {});
            }
            return q
                .filter(i => i.status !== 'pending')
                .map(i => i.status === 'downloading' ? { ...i, status: 'cancelled' as const } : i);
        });
        toast.info('已取消所有下载');
    };

    const cancelItem = (id: string) => {
        setDownloadQueue(q => {
            const item = q.find(i => i.id === id);
            if (item?.status === 'downloading') {
                cancelledRef.current.add(id);
                invoke('cmd_cancel_transfer', { transferId: id }).catch(() => {});
                return q.map(i => i.id === id ? { ...i, status: 'cancelled' as const } : i);
            }
            if (item?.status === 'pending') {
                return q.filter(i => i.id !== id);
            }
            return q;
        });
    };

    const retryItem = (id: string) => {
        setDownloadQueue(q => q.map(i =>
            i.id === id && (i.status === 'error' || i.status === 'cancelled')
                ? { ...i, status: 'pending' as const, error: undefined, progress: undefined, downloadedBytes: undefined, totalBytes: undefined, speedBytesPerSec: undefined }
                : i
        ));
    };

    return {
        downloadQueue,
        queueDownload,
        queueBulkDownload,
        clearFinished,
        cancelAll,
        cancelItem,
        retryItem,
    };
}
