import { useCallback, useRef } from 'react';
import { showFileDialogFallback, pickWithFallback } from '../utils';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useConfirm } from '../context/ConfirmContext';
import { TelegramFile } from '../types';

export function useFileOperations(
    activeFolderId: number | null,
    selectedIds: number[],
    setSelectedIds: (ids: number[]) => void,
    displayedFiles: TelegramFile[],
    queueBulkDownload?: (files: TelegramFile[], folderId: number | null) => void,
) {
    const queryClient = useQueryClient();
    const { confirm } = useConfirm();

    // Refs to keep callbacks stable even when selection/file list changes
    const selectedIdsRef = useRef(selectedIds);
    selectedIdsRef.current = selectedIds;
    const displayedFilesRef = useRef(displayedFiles);
    displayedFilesRef.current = displayedFiles;

    const handleDelete = useCallback(async (id: number) => {
        if (!await confirm({ title: "删除文件", message: "确定要删除这个文件吗？", confirmText: "删除", variant: 'danger' })) return;
        try {
            await invoke('cmd_delete_file', { messageId: id, folderId: activeFolderId });
            await invoke('cmd_delete_image_thumbnail', { messageId: id }).catch(() => {});
            queryClient.invalidateQueries({ queryKey: ['files', activeFolderId] });
            toast.success("文件已删除");
        } catch (e) {
            toast.error(`删除失败：${e}`);
        }
    }, [activeFolderId, confirm, queryClient]);

    const handleBulkDelete = useCallback(async () => {
        const ids = selectedIdsRef.current;
        if (ids.length === 0) return;
        if (!await confirm({ title: "删除文件", message: `确定要删除这 ${ids.length} 个文件吗？`, confirmText: "全部删除", variant: 'danger' })) return;

        let success = 0;
        let fail = 0;
        for (const id of ids) {
            try {
                await invoke('cmd_delete_file', { messageId: id, folderId: activeFolderId });
                await invoke('cmd_delete_image_thumbnail', { messageId: id }).catch(() => {});
                success++;
            } catch {
                fail++;
            }
        }
        setSelectedIds([]);
        queryClient.invalidateQueries({ queryKey: ['files', activeFolderId] });
        if (success > 0) toast.success(`已删除 ${success} 个文件。`);
        if (fail > 0) toast.error(`${fail} 个文件删除失败。`);
    }, [activeFolderId, confirm, queryClient, setSelectedIds]);

    const handleBulkDownload = useCallback(async () => {
        const ids = selectedIdsRef.current;
        if (ids.length === 0) return;
        const currentFiles = displayedFilesRef.current;
        const targetFiles = currentFiles.filter((f) => ids.includes(f.id));
        if (targetFiles.length === 0) return;
        if (queueBulkDownload) {
            queueBulkDownload(targetFiles, activeFolderId);
            setSelectedIds([]);
            return;
        }
        // Fallback: direct download if queue not provided
        const downloadToDir = async (dirPath: string) => {
            let successCount = 0;
            const sep = dirPath.includes('\\') ? '\\' : '/';
            for (const file of targetFiles) {
                const filePath = dirPath.endsWith(sep) ? `${dirPath}${file.name}` : `${dirPath}${sep}${file.name}`;
                try {
                    await invoke('cmd_download_file', { req: { message_id: file.id, save_path: filePath, folder_id: activeFolderId } });
                    successCount++;
                } catch (e) { }
            }
            toast.success(`已下载 ${successCount} 个文件。`);
            setSelectedIds([]);
        };
        try {
            const dirPath = await pickWithFallback(
                () => open({ directory: true, multiple: false, title: "选择下载位置" }),
                () => handleBulkDownload(),
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
            await downloadToDir(dirPath);
        } catch (e) {
            toast.error(`批量下载失败：${e}`);
        }
    }, [activeFolderId, setSelectedIds, queueBulkDownload]);

    const handleBulkMove = useCallback(async (targetFolderId: number | null, onSuccess?: () => void) => {
        const ids = selectedIdsRef.current;
        if (ids.length === 0) return;
        try {
            await invoke('cmd_move_files', {
                messageIds: ids,
                sourceFolderId: activeFolderId,
                targetFolderId: targetFolderId
            });
            toast.success(`已移动 ${ids.length} 个文件。`);
            queryClient.invalidateQueries({ queryKey: ['files', activeFolderId] });
            setSelectedIds([]);
            if (onSuccess) onSuccess();
        } catch {
            toast.error('移动文件失败');
        }
    }, [activeFolderId, queryClient, setSelectedIds]);

    const handleDownloadFolder = useCallback(async () => {
        const files = displayedFilesRef.current;
        if (files.length === 0) {
            toast.info("文件夹为空。");
            return;
        }
        if (queueBulkDownload) {
            queueBulkDownload(files, activeFolderId);
            return;
        }
        // Fallback: direct download if queue not provided
        const downloadToDir = async (dirPath: string) => {
            let successCount = 0;
            toast.info(`正在下载文件夹内容（${files.length} 个文件）...`);
            const sep = dirPath.includes('\\') ? '\\' : '/';
            for (const file of files) {
                const filePath = dirPath.endsWith(sep) ? `${dirPath}${file.name}` : `${dirPath}${sep}${file.name}`;
                try {
                    await invoke('cmd_download_file', { req: { message_id: file.id, save_path: filePath, folder_id: activeFolderId } });
                    successCount++;
                } catch (e) { }
            }
            toast.success(`文件夹下载完成：${successCount} 个文件。`);
        };
        try {
            const dirPath = await pickWithFallback(
                () => import('@tauri-apps/plugin-dialog').then(d => d.open({
                    directory: true, multiple: false, title: "下载文件夹到..."
                })),
                () => handleDownloadFolder(),
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
            await downloadToDir(dirPath);
        } catch (e) {
            toast.error("出错：" + e);
        }
    }, [activeFolderId, queueBulkDownload]);

    const handleGlobalSearch = useCallback(async (query: string) => {
        try {
            return await invoke<TelegramFile[]>('cmd_search_global', { query });
        } catch {
            return [];
        }
    }, []);

    return {
        handleDelete,
        handleBulkDelete,
        handleBulkDownload,
        handleBulkMove,
        handleDownloadFolder,
        handleGlobalSearch,
    };
}
