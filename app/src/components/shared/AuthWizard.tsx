import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, Key, Lock, ArrowRight, Settings, ShieldCheck, Sun, Moon, HelpCircle, ExternalLink, X, Heart, QrCode } from "lucide-react";
import { load } from '@tauri-apps/plugin-store';
import { useTheme } from '../../context/ThemeContext';
import { open } from '@tauri-apps/plugin-shell';
import { QRCodeSVG } from 'qrcode.react';

type Step = "setup" | "phone" | "code" | "password";

function AuthThemeToggle() {
    const { theme, toggleTheme } = useTheme();
    return (
        <button
            onClick={toggleTheme}
            className="absolute top-[calc(1rem+env(safe-area-inset-top,24px))] right-4 p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors z-10"
            title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
        >
            {theme === 'dark' ? (
                <Sun className="w-5 h-5 text-white" />
            ) : (
                <Moon className="w-5 h-5 text-white" />
            )}
        </button>
    );
}
export function AuthWizard({ onLogin }: { onLogin: () => void }) {
    const isBrowser = typeof window !== 'undefined' && !('__TAURI_INTERNALS__' in window);

    if (isBrowser) {
        return (
            <div className="flex flex-col items-center justify-center h-full max-w-lg mx-auto p-8 text-center">
                <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mb-6">
                    <ShieldCheck className="w-10 h-10 text-red-500" />
                </div>
                <h1 className="text-2xl font-bold text-white mb-4">需要桌面应用</h1>
                <p className="text-gray-400 mb-6 leading-relaxed">
                    你正在浏览器中查看内部开发服务器。
                    本应用无法在此运行，因为它需要访问系统后端（Rust）。
                </p>
                <div className="p-4 bg-gray-800 rounded-xl border border-gray-700 text-sm text-gray-300">
                    请在操作系统的任务栏/程序坞中打开 <strong>Telegram Drive</strong> 窗口以继续。
                </div>
            </div>
        )
    }

    const [step, setStep] = useState<Step>("setup");
    const [loading, setLoading] = useState(false);

    const [apiId, setApiId] = useState("");
    const [apiHash, setApiHash] = useState("");

    const [phone, setPhone] = useState("");
    const [code, setCode] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [floodWait, setFloodWait] = useState<number | null>(null);
    const [showHelp, setShowHelp] = useState(false);
    const [showDonate, setShowDonate] = useState(false);
    const [loginMethod, setLoginMethod] = useState<'phone' | 'qr'>('phone');
    const isMobile = typeof navigator !== 'undefined' && /android|iphone|ipad|ipod/i.test(navigator.userAgent.toLowerCase());

    useEffect(() => {
        if (isMobile && loginMethod !== 'phone') {
            setLoginMethod('phone');
        }
    }, [isMobile, loginMethod]);
    const [qrUrl, setQrUrl] = useState<string | null>(null);
    const [qrPolling, setQrPolling] = useState(false);
    const qrPollRef = useRef<ReturnType<typeof setInterval> | null>(null);


    useEffect(() => {
        if (!floodWait) return;
        const interval = setInterval(() => {
            setFloodWait(prev => {
                if (prev === null || prev <= 1) return null;
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [floodWait]);

    useEffect(() => {
        const initStore = async () => {
            try {
                const store = await load('config.json');
                const savedId = await store.get<string>('api_id');
                const savedHash = await store.get<string>('api_hash');

                if (savedId && savedHash) {
                    setApiId(savedId);
                    setApiHash(savedHash);
                }
            } catch {
                // config not found, starting fresh
            }
        };
        initStore();
    }, []);

    const saveCredentials = async () => {
        try {
            const store = await load('config.json');
            await store.set('api_id', apiId);
            await store.set('api_hash', apiHash);
            await store.save();
        } catch {
            // store write failure, non-critical
        }
    };

    const handleSetupSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (apiId.includes(' ') || apiHash.includes(' ')) {
            setError("API ID 和 API Hash 不能包含空格，请删除所有空格。");
            return;
        }

        if (!apiId || !apiHash) {
            setError("API ID 和 API Hash 都是必填项。");
            return;
        }
        setError(null);
        await saveCredentials();
        setStep("phone");
        setLoginMethod('phone');
        setQrUrl(null);
        setQrPolling(false);
    };

    const handleQrLogin = async () => {
        setError(null);
        setLoading(true);
        try {
            const idInt = parseInt(apiId, 10);
            if (isNaN(idInt)) throw new Error("API ID 必须是数字");

            const url = await invoke<string>("cmd_auth_qr_login", {
                apiId: idInt,
                apiHash: apiHash
            });

            if (url === "__authorized__") {
                onLogin();
                return;
            }

            setQrUrl(url);
            setQrPolling(true);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    };

    // QR polling effect
    useEffect(() => {
        if (!qrPolling) {
            if (qrPollRef.current) {
                clearInterval(qrPollRef.current);
                qrPollRef.current = null;
            }
            return;
        }

        qrPollRef.current = setInterval(async () => {
            try {
                const res = await invoke<{ success: boolean; next_step?: string }>("cmd_auth_qr_poll");
                if (res.success) {
                    setQrPolling(false);
                    if (res.next_step === "password") {
                        setStep("password");
                    } else {
                        onLogin();
                    }
                }
                // If next_step === "waiting", keep polling
            } catch {
                // Polling error — keep trying silently
            }
        }, 3000);

        return () => {
            if (qrPollRef.current) {
                clearInterval(qrPollRef.current);
                qrPollRef.current = null;
            }
        };
    }, [qrPolling, apiId, apiHash]);

    const handlePhoneSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const idInt = parseInt(apiId, 10);
            if (isNaN(idInt)) throw new Error("API ID 必须是数字");

            await invoke("cmd_auth_request_code", {
                phone,
                apiId: idInt,
                apiHash: apiHash
            });
            setStep("code");
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : JSON.stringify(err);
            if (msg.includes("FLOOD_WAIT_")) {
                const parts = msg.split("FLOOD_WAIT_");
                if (parts[1]) {
                    const seconds = parseInt(parts[1]);
                    if (!isNaN(seconds)) {
                        setFloodWait(seconds);
                        return;
                    }
                }
            }
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleCodeSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const res = await invoke<{ success: boolean; next_step?: string }>("cmd_auth_sign_in", { code });
            if (res.success) {
                onLogin();
            } else if (res.next_step === "password") {
                setStep("password");
            } else {
                setError("未知错误");
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const res = await invoke<{ success: boolean; next_step?: string }>("cmd_auth_check_password", { password });
            if (res.success) {
                onLogin();
            } else {
                setError("密码验证失败。");
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="h-full w-full auth-gradient flex items-center justify-center p-6 pt-[calc(1.5rem+env(safe-area-inset-top,24px))] relative">
            <AuthThemeToggle />

            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="auth-glass p-8 rounded-3xl shadow-2xl w-full max-w-md"
            >
                <div className="text-center mb-8">
                    <div className="w-20 h-20 mb-6 mx-auto flex items-center justify-center filter drop-shadow-lg">
                        <img src="/logo.svg" alt="Logo" className="w-full h-full" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-1 tracking-tight">Telegram Drive</h1>
                    <p className="text-sm text-white/60 font-medium">自托管的安全存储</p>
                </div>

                <AnimatePresence mode="wait">
                    {floodWait ? (
                        <motion.div
                            key="flood"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-center space-y-6"
                        >
                            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto animate-pulse">
                                <span className="text-2xl">⏳</span>
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white mb-2">请求过于频繁</h2>
                                <p className="text-sm text-gray-400">Telegram 已临时限制你的操作。</p>
                                <p className="text-sm text-gray-400">请稍候再试。</p>
                            </div>

                            <div className="text-5xl font-mono items-center justify-center flex text-blue-400 font-bold">
                                {Math.floor(floodWait / 60)}:{(floodWait % 60).toString().padStart(2, '0')}
                            </div>

                            <p className="text-xs text-red-400/60 mt-4">
                                请勿重启应用，否则计时器会重置。
                            </p>
                        </motion.div>
                    ) : (
                        <>


                            {step === "setup" && (
                                <motion.form
                                    key="setup"
                                    initial={{ x: 20, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    exit={{ x: -20, opacity: 0 }}
                                    onSubmit={handleSetupSubmit}
                                    className="space-y-5"
                                >
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">API ID</label>
                                            <div className="relative">
                                                <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 auth-form-icon" />
                                                <input
                                                    type="text"
                                                    value={apiId}
                                                    onChange={(e) => setApiId(e.target.value)}
                                                    placeholder="12345678"
                                                    className="w-full glass-input rounded-xl pl-12 pr-4 py-3.5 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-all font-mono text-sm"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">API Hash</label>
                                            <div className="relative">
                                                <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 auth-form-icon" />
                                                <input
                                                    type="text"
                                                    value={apiHash}
                                                    onChange={(e) => setApiHash(e.target.value)}
                                                    placeholder="abcdef123456..."
                                                    className="w-full glass-input rounded-xl pl-12 pr-4 py-3.5 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-all font-mono text-sm"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-900/20 active:scale-[0.98]"
                                    >
                                        配置 <Settings className="w-4 h-4" />
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setShowHelp(true)}
                                        className="w-full text-xs text-blue-300 hover:text-white transition-colors flex items-center justify-center gap-1.5 py-1"
                                    >
                                        <HelpCircle className="w-3 h-3" />
                                        如何获取我的 API 凭据？
                                    </button>

                                    {import.meta.env.DEV && (
                                        <button
                                            type="button"
                                            onClick={() => onLogin()}
                                            className="w-full text-xs text-red-400/60 hover:text-red-300 transition-colors py-1"
                                        >
                                            Dev Mode
                                        </button>
                                    )}
                                </motion.form>
                            )}


                            {step === "phone" && (
                                <motion.div
                                    key="phone"
                                    initial={{ x: 20, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    exit={{ x: -20, opacity: 0 }}
                                    className="space-y-6"
                                >
                                    {/* Phone / QR Toggle */}
                                    {!isMobile && (
                                        <div className="flex rounded-xl overflow-hidden border border-white/10">
                                            <button
                                                type="button"
                                                onClick={() => { setLoginMethod('phone'); setQrUrl(null); setQrPolling(false); setError(null); }}
                                                className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-2 transition-all ${
                                                    loginMethod === 'phone'
                                                        ? 'bg-white/15 text-white'
                                                        : 'text-white/50 hover:text-white/70'
                                                }`}
                                            >
                                                <Phone className="w-4 h-4" /> 手机号码
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => { setLoginMethod('qr'); setError(null); handleQrLogin(); }}
                                                className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-2 transition-all ${
                                                    loginMethod === 'qr'
                                                        ? 'bg-white/15 text-white'
                                                        : 'text-white/50 hover:text-white/70'
                                                }`}
                                            >
                                                <QrCode className="w-4 h-4" /> 二维码
                                            </button>
                                        </div>
                                    )}

                                    {loginMethod === 'phone' ? (
                                        <form onSubmit={handlePhoneSubmit} className="space-y-6">
                                            <div className="space-y-2">
                                                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">手机号码</label>
                                                <div className="relative">
                                                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 auth-form-icon" />
                                                    <input
                                                        type="tel"
                                                        value={phone}
                                                        onChange={(e) => setPhone(e.target.value)}
                                                        placeholder="+1 234 567 8900"
                                                        className="w-full glass-input rounded-xl pl-12 pr-4 py-4 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-all text-lg tracking-wide"
                                                    />
                                                </div>
                                            </div>

                                            <div className="flex flex-col gap-3">
                                                <button
                                                    type="submit"
                                                    disabled={loading}
                                                    className="w-full bg-white text-black hover:bg-gray-100 font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {loading ? "连接中..." : <>继续 <ArrowRight className="w-5 h-5" /></>}
                                                </button>
                                                <button type="button" onClick={() => setStep("setup")} className="text-xs text-gray-500 hover:text-white transition-colors py-2">
                                                    返回配置
                                                </button>
                                            </div>
                                        </form>
                                    ) : (
                                        <div className="flex flex-col items-center gap-5">
                                            {loading && !qrUrl && (
                                                <div className="w-52 h-52 rounded-2xl bg-white/5 flex items-center justify-center">
                                                    <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                                                </div>
                                            )}
                                            {qrUrl && (
                                                <>
                                                    <div className="p-4 bg-white rounded-2xl shadow-xl">
                                                        <QRCodeSVG
                                                            value={qrUrl}
                                                            size={200}
                                                            level="M"
                                                            bgColor="#ffffff"
                                                            fgColor="#000000"
                                                        />
                                                    </div>
                                                    <div className="text-center space-y-1">
                                                        <p className="text-sm text-white/80">用你的 Telegram 应用扫码</p>
                                                        <p className="text-xs text-white/40">设置 &gt; 设备 &gt; 关联桌面设备</p>
                                                    </div>
                                                    {qrPolling && (
                                                        <div className="flex items-center gap-2 text-xs text-blue-300">
                                                            <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                                                            等待扫描...
                                                        </div>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={handleQrLogin}
                                                        className="text-xs text-white/50 hover:text-white transition-colors"
                                                    >
                                                        刷新二维码
                                                    </button>
                                                </>
                                            )}
                                            <button type="button" onClick={() => { setStep("setup"); setQrPolling(false); }} className="text-xs text-gray-500 hover:text-white transition-colors py-2">
                                                返回配置
                                            </button>
                                        </div>
                                    )}
                                </motion.div>
                            )}


                            {step === "code" && (
                                <motion.form
                                    key="code"
                                    initial={{ x: 20, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    exit={{ x: -20, opacity: 0 }}
                                    onSubmit={handleCodeSubmit}
                                    className="space-y-6"
                                >
                                    <div className="space-y-2">
                                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Telegram 验证码</label>
                                        <div className="relative">
                                            <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 auth-form-icon" />
                                            <input
                                                type="text"
                                                value={code}
                                                onChange={(e) => setCode(e.target.value)}
                                                placeholder="1 2 3 4 5"
                                                className="w-full glass-input rounded-xl pl-12 pr-4 py-4 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-all text-2xl tracking-[0.5em] font-mono text-center"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-3">
                                        <button
                                            type="submit"
                                            disabled={loading}
                                            className="w-full bg-white text-black hover:bg-gray-100 font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg active:scale-[0.98]"
                                        >
                                            {loading ? "验证中..." : "登录"}
                                        </button>
                                        <button type="button" onClick={() => setStep("phone")} className="text-xs text-gray-500 hover:text-white transition-colors py-2">
                                            更改手机号码
                                        </button>
                                    </div>
                                </motion.form>
                            )}


                            {step === "password" && (
                                <motion.form
                                    key="password"
                                    initial={{ x: 20, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    exit={{ x: -20, opacity: 0 }}
                                    onSubmit={handlePasswordSubmit}
                                    className="space-y-6"
                                >
                                    <div className="space-y-2">
                                        <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl mb-4">
                                            <p className="text-xs text-blue-300 text-center">
                                                你的账号已启用两步验证。
                                                请输入你的云密码以继续。
                                            </p>
                                        </div>
                                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">云密码</label>
                                        <div className="relative">
                                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 auth-form-icon" />
                                            <input
                                                type="password"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                placeholder="输入你的密码"
                                                className="w-full glass-input rounded-xl pl-12 pr-4 py-4 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-all text-lg"
                                                autoFocus
                                            />
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-3">
                                        <button
                                            type="submit"
                                            disabled={loading || !password}
                                            className="w-full bg-white text-black hover:bg-gray-100 font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {loading ? "验证中..." : "解锁"}
                                        </button>
                                        <button type="button" onClick={() => { setStep("code"); setPassword(""); setError(null); }} className="text-xs text-gray-500 hover:text-white transition-colors py-2">
                                            返回验证码输入
                                        </button>
                                    </div>
                                </motion.form>
                            )}
                        </>
                    )}
                </AnimatePresence>

                {error && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3"
                    >
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2 shrink-0" />
                        <p className="text-red-400 text-sm leading-snug">{error}</p>
                    </motion.div>
                )}

                <div className="mt-8 pt-4 border-t border-white/5 text-center">
                    <button
                        onClick={() => setShowDonate(true)}
                        className="text-xs text-telegram-subtext hover:text-telegram-text transition-colors flex items-center justify-center gap-1.5 mx-auto"
                    >
                        <Heart className="w-3.5 h-3.5 text-red-500/80" />
                        捐赠
                    </button>
                </div>
            </motion.div>


            <AnimatePresence>
                {showHelp && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
                        onClick={() => setShowHelp(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="glass bg-telegram-surface border border-telegram-border rounded-2xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-bold text-telegram-text">入门指南</h2>
                                <button onClick={() => setShowHelp(false)} className="p-2 hover:bg-telegram-hover rounded-lg transition-colors">
                                    <X className="w-5 h-5 text-telegram-subtext" />
                                </button>
                            </div>

                            <div className="space-y-6 text-telegram-text">
                                <div className="p-4 bg-telegram-primary/10 border border-telegram-primary/20 rounded-xl">
                                    <p className="text-sm text-telegram-subtext">
                                        <strong className="text-telegram-primary">Telegram Drive</strong> 使用你的 Telegram 账号作为安全的云存储。开始前你需要一个 Telegram 账号和 API 凭据。
                                    </p>
                                </div>

                                <div className="space-y-4">
                                    <h3 className="font-semibold flex items-center gap-2">
                                        <span className="w-6 h-6 bg-telegram-primary text-white text-xs font-bold rounded-full flex items-center justify-center">1</span>
                                        前往 Telegram 开发者门户
                                    </h3>
                                    <p className="text-sm text-telegram-subtext ml-8">
                                        访问 <button type="button" onClick={(e) => { e.preventDefault(); open('https://my.telegram.org'); }} className="text-telegram-primary underline hover:text-telegram-text cursor-pointer">my.telegram.org</button>，并用你的手机号码登录。
                                    </p>
                                </div>

                                <div className="space-y-4">
                                    <h3 className="font-semibold flex items-center gap-2">
                                        <span className="w-6 h-6 bg-telegram-primary text-white text-xs font-bold rounded-full flex items-center justify-center">2</span>
                                        创建一个新应用
                                    </h3>
                                    <p className="text-sm text-telegram-subtext ml-8">
                                        点击 <strong>"API development tools"</strong>，创建一个新应用。名称和描述可随意填写。
                                    </p>
                                </div>

                                <div className="space-y-4">
                                    <h3 className="font-semibold flex items-center gap-2">
                                        <span className="w-6 h-6 bg-telegram-primary text-white text-xs font-bold rounded-full flex items-center justify-center">3</span>
                                        复制你的凭据
                                    </h3>
                                    <p className="text-sm text-telegram-subtext ml-8">
                                        创建应用后，你会看到你的 <strong>API ID</strong>（一个数字）和 <strong>API Hash</strong>（一串字符）。复制两者，粘贴到上一屏幕的输入框中。
                                    </p>
                                </div>

                                <div className="p-4 bg-telegram-hover rounded-xl border border-telegram-border">
                                    <p className="text-xs text-telegram-subtext">
                                        <strong>🔒 隐私：</strong> 你的凭据存储在本地设备上，绝不会发送到任何第三方服务器。所有数据都直接在你和 Telegram 之间传输。
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    onClick={(e) => { e.preventDefault(); open('https://my.telegram.org'); }}
                                    className="w-full bg-telegram-primary text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-telegram-primary/90 transition-colors"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                    打开 my.telegram.org
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showDonate && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
                        onClick={() => setShowDonate(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="glass bg-telegram-surface border border-telegram-border rounded-2xl p-6 max-w-sm w-full shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="relative flex items-center justify-center mb-6">
                                <h2 className="text-xl font-bold text-telegram-text text-center">
                                    支持本项目
                                </h2>
                                <button onClick={() => setShowDonate(false)} className="absolute right-0 p-2 hover:bg-telegram-hover rounded-lg transition-colors">
                                    <X className="w-5 h-5 text-telegram-subtext" />
                                </button>
                            </div>

                            <div className="space-y-4 text-center">
                                <p className="text-sm text-telegram-subtext mb-6">
                                    如果你觉得 Telegram Drive 好用，欢迎支持它的开发！
                                </p>

                                <div className="space-y-4">
                                    <a href="#" onClick={(e) => { e.preventDefault(); open('https://www.paypal.me/Caamer20'); }} className="block hover:opacity-80 transition-opacity">
                                        <img src="https://raw.githubusercontent.com/stefan-niedermann/paypal-donate-button/master/paypal-donate-button.png" alt="使用 PayPal 捐赠" width="200" className="mx-auto" />
                                    </a>

                                    <a href="#" onClick={(e) => { e.preventDefault(); open('https://link.trustwallet.com/send?address=ltc1q6wkr5ac4u0pxx4hx7xgwn0gsaku25ws0df73rp&asset=c2'); }} className="block hover:opacity-80 transition-opacity">
                                        <img src="https://img.shields.io/badge/Donate-LTC-345D9D?style=for-the-badge&logo=litecoin&logoColor=white" alt="捐赠 LTC" className="mx-auto h-[28px]" />
                                    </a>

                                    <a href="#" onClick={(e) => { e.preventDefault(); open('https://link.trustwallet.com/send?asset=c0&address=bc1q5pt7m2fk6w0dzsnf6vvd5k6nw5k44785286ujy'); }} className="block hover:opacity-80 transition-opacity">
                                        <img src="https://img.shields.io/badge/Donate-BTC-F7931A?style=for-the-badge&logo=bitcoin&logoColor=white" alt="捐赠 BTC" className="mx-auto h-[28px]" />
                                    </a>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="fixed top-[-20%] left-[-10%] w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none -z-10" />
            <div className="fixed bottom-[-10%] right-[-10%] w-[400px] h-[400px] bg-purple-600/10 rounded-full blur-[100px] pointer-events-none -z-10" />
        </div>
    );
}
