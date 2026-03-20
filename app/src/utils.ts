export function formatBytes(bytes: number, decimals = 2) {
    if (!+bytes) return '0 字节';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['字节', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
