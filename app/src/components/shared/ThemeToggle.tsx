import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

export function ThemeToggle() {
    const { theme, toggleTheme } = useTheme();

    return (
        <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-telegram-hover transition-colors group relative"
            title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
        >
            {theme === 'dark' ? (
                <Sun className="w-5 h-5 text-telegram-subtext group-hover:text-telegram-primary transition-colors" />
            ) : (
                <Moon className="w-5 h-5 text-telegram-subtext group-hover:text-telegram-primary transition-colors" />
            )}
            <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-[10px] bg-telegram-surface px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 border border-telegram-border shadow-lg">
                {theme === 'dark' ? '浅色模式' : '深色模式'}
            </span>
        </button>
    );
}
