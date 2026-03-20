import { invoke } from '@tauri-apps/api/core';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useConfirm } from '../context/ConfirmContext';
import { TelegramFile } from '../types';

export function useFileOperations(
    activeFolderId: number | null,
    selectedIds: number[],
    setSelectedIds: (ids: number[]) => void,
    displayedFiles: TelegramFile[]
) {
    const queryClient = useQueryClient();
    const { confirm } = useConfirm();

    const handleDelete = async (id: number) => {
        if (!await confirm({ title: "删除文件", message: "确定要删除此文件吗？", confirmText: "删除", variant: 'danger' })) return;
        try {
            await invoke('cmd_delete_file', { messageId: id, folderId: activeFolderId });
            queryClient.invalidateQueries({ queryKey: ['files', activeFolderId] });
            toast.success("文件已删除");
        } catch (e) {
            toast.error(`删除失败：${e}`);
        }
    }

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;
        if (!await confirm({ title: "删除文件", message: `确定要删除这 ${selectedIds.length} 个文件吗？`, confirmText: "全部删除", variant: 'danger' })) return;

        let success = 0;
        let fail = 0;
        for (const id of selectedIds) {
            try {
                await invoke('cmd_delete_file', { messageId: id, folderId: activeFolderId });
                success++;
            } catch {
                fail++;
            }
        }
        setSelectedIds([]);
        queryClient.invalidateQueries({ queryKey: ['files', activeFolderId] });
        if (success > 0) toast.success(`已删除 ${success} 个文件。`);
        if (fail > 0) toast.error(`有 ${fail} 个文件删除失败。`);
    }

    const handleDownload = async (id: number, name: string) => {
        try {
            const savePath = await import('@tauri-apps/plugin-dialog').then(d => d.save({
                defaultPath: name,
            }));
            if (!savePath) return;
            toast.info(`开始下载：${name}`);
            await invoke('cmd_download_file', { messageId: id, savePath, folderId: activeFolderId });
            toast.success(`下载完成：${name}`);
        } catch (e) {
            toast.error(`下载失败：${e}`);
        }
    }

    const handleBulkDownload = async () => {
        if (selectedIds.length === 0) return;
        try {
            const dirPath = await import('@tauri-apps/plugin-dialog').then(d => d.open({
                directory: true, multiple: false, title: "选择下载位置"
            }));
            if (!dirPath) return;
            let successCount = 0;
            const targetFiles = displayedFiles.filter((f) => selectedIds.includes(f.id));
            toast.info(`开始批量下载 ${targetFiles.length} 个文件...`);

            for (const file of targetFiles) {
                const filePath = `${dirPath}/${file.name}`;
                try {
                    await invoke('cmd_download_file', { messageId: file.id, savePath: filePath, folderId: activeFolderId });
                    successCount++;
                } catch (e) { }
            }
            toast.success(`已下载 ${successCount} 个文件。`);
            setSelectedIds([]);
        } catch (e) {
            toast.error(`批量下载失败：${e}`);
        }
    }

    const handleBulkMove = async (targetFolderId: number | null, onSuccess?: () => void) => {
        if (selectedIds.length === 0) return;
        try {
            await invoke('cmd_move_files', {
                messageIds: selectedIds,
                sourceFolderId: activeFolderId,
                targetFolderId: targetFolderId
            });
            toast.success(`已移动 ${selectedIds.length} 个文件。`);
            queryClient.invalidateQueries({ queryKey: ['files', activeFolderId] });
            setSelectedIds([]);
            if (onSuccess) onSuccess();
        } catch {
            toast.error('移动文件失败');
        }
    };

    const handleDownloadFolder = async () => {
        if (displayedFiles.length === 0) {
            toast.info("文件夹为空。");
            return;
        }
        try {
            const dirPath = await import('@tauri-apps/plugin-dialog').then(d => d.open({
                directory: true, multiple: false, title: "选择文件夹下载位置..."
            }));
            if (!dirPath) return;
            let successCount = 0;
            toast.info(`正在下载文件夹内容（${displayedFiles.length} 个文件）...`);
            for (const file of displayedFiles) {
                const filePath = `${dirPath}/${file.name}`;
                try {
                    await invoke('cmd_download_file', { messageId: file.id, savePath: filePath, folderId: activeFolderId });
                    successCount++;
                } catch (e) { }
            }
            toast.success(`文件夹下载完成：${successCount} 个文件。`);
        } catch (e) {
            toast.error("错误：" + e);
        }
    }

    return {
        handleDelete,
        handleBulkDelete,
        handleDownload,
        handleBulkDownload,
        handleBulkMove,
        handleDownloadFolder,
        handleGlobalSearch: async (query: string) => {
            try {
                return await invoke<TelegramFile[]>('cmd_search_global', { query });
            } catch {
                return [];
            }
        }
    };
}
