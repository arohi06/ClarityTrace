import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Moon,
  Search,
  ShieldAlert,
  Sun,
  X,
} from 'lucide-react';

export const ClarityTraceLogo: React.FC<{ className?: string }> = ({ className = 'w-6 h-6' }) => (
  <svg
    viewBox="0 0 28 28"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="1.9" />
    <path d="M17.6 17.6L23.5 23.5" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
    <circle cx="9.5" cy="12" r="1.6" fill="currentColor" />
    <circle cx="14.5" cy="9.5" r="1.5" fill="#C4562F" className="dark:fill-[#D47A59]" />
    <circle cx="14.5" cy="14.5" r="1.5" fill="currentColor" />
    <path d="M10.9 11.3L13.1 10.2M10.9 12.7L13.1 13.8" stroke="currentColor" strokeWidth="1.3" />
  </svg>
);

export const ThemeToggle: React.FC<{ theme: 'light' | 'dark'; onToggle: () => void }> = ({
  theme,
  onToggle,
}) => (
  <button
    type="button"
    onClick={onToggle}
    aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
    title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
    className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-[#1C2620]/15 dark:border-[#F3EEE4]/15 bg-[#FAF7F0] dark:bg-[#26332C] text-[#1C2620] dark:text-[#F3EEE4] hover:bg-[#EBE4D5] dark:hover:bg-[#202B25] transition-colors shrink-0"
  >
    {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
  </button>
);

export const PrimaryButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { size?: 'sm' | 'md' | 'lg' }
> = ({ size = 'md', className = '', children, ...props }) => {
  const sizeCls =
    size === 'sm'
      ? 'h-8 px-3 text-xs'
      : size === 'lg'
      ? 'h-11 px-5 text-sm'
      : 'h-9 px-4 text-xs';
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 font-medium rounded-lg bg-[#2F5D50] hover:bg-[#254A40] text-[#FAF7F0] dark:bg-[#8DAE9B] dark:hover:bg-[#A2C0AF] dark:text-[#171F1B] disabled:opacity-55 transition-all active:scale-[0.99] whitespace-nowrap shrink-0 cursor-pointer ${sizeCls} ${className}`}
    >
      {children}
    </button>
  );
};

export const SecondaryButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { size?: 'sm' | 'md' | 'lg' }
> = ({ size = 'md', className = '', children, ...props }) => {
  const sizeCls =
    size === 'sm'
      ? 'h-8 px-3 text-xs'
      : size === 'lg'
      ? 'h-11 px-5 text-sm'
      : 'h-9 px-4 text-xs';
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 font-medium rounded-lg border border-[#1C2620]/15 dark:border-[#F3EEE4]/15 bg-[#FAF7F0] dark:bg-[#26332C] text-[#1C2620] dark:text-[#F3EEE4] hover:bg-[#EBE4D5] dark:hover:bg-[#202B25] disabled:opacity-55 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${sizeCls} ${className}`}
    >
      {children}
    </button>
  );
};

export const IconButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
  className = '',
  children,
  ...props
}) => (
  <button
    {...props}
    className={`inline-flex items-center justify-center h-9 w-9 rounded-lg border border-[#1C2620]/15 dark:border-[#F3EEE4]/15 bg-[#FAF7F0] dark:bg-[#26332C] text-[#1C2620] dark:text-[#F3EEE4] hover:bg-[#EBE4D5] dark:hover:bg-[#202B25] transition-colors shrink-0 cursor-pointer ${className}`}
  >
    {children}
  </button>
);

export const Card: React.FC<{
  id?: string;
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
  onClick?: () => void;
}> = ({ id, children, className = '', interactive = false, onClick }) => (
  <div
    id={id}
    onClick={onClick}
    className={`rounded-xl bg-[#FAF7F0] dark:bg-[#26332C] border border-[#1C2620]/12 dark:border-[#F3EEE4]/12 shadow-xs ${
      interactive
        ? 'hover:border-[#2F5D50]/40 dark:hover:border-[#8DAE9B]/40 transition-colors cursor-pointer'
        : ''
    } ${className}`}
  >
    {children}
  </div>
);

export const MetricCard: React.FC<{
  label: string;
  value: string | number;
  detail: string;
  tone?: 'neutral' | 'positive' | 'warning' | 'critical';
}> = ({ label, value, detail, tone = 'neutral' }) => {
  const toneCls =
    tone === 'positive'
      ? 'text-[#2F5D50] dark:text-[#8DAE9B]'
      : tone === 'warning'
      ? 'text-[#B9822A] dark:text-[#D7A44E]'
      : tone === 'critical'
      ? 'text-[#C4562F] dark:text-[#D47A59]'
      : 'text-[#1C2620] dark:text-[#F3EEE4]';

  return (
    <Card className="p-5">
      <div className="text-xs font-medium text-[#6B7268] dark:text-[#B3BDB3]">{label}</div>
      <div className={`mt-2 text-2xl sm:text-3xl font-semibold font-mono tabular-nums ${toneCls}`}>
        {value}
      </div>
      <div className="mt-1.5 text-xs text-[#6B7268] dark:text-[#B3BDB3]">{detail}</div>
    </Card>
  );
};

export const TextInput: React.FC<
  React.InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }
> = ({ label, hint, id, className = '', ...props }) => (
  <div>
    {label && (
      <label htmlFor={id} className="block text-xs font-medium text-[#1C2620] dark:text-[#F3EEE4] mb-1.5">
        {label}
      </label>
    )}
    <input
      id={id}
      {...props}
      className={`w-full h-10 px-3.5 text-sm rounded-lg border border-[#1C2620]/18 dark:border-[#F3EEE4]/18 bg-[#FAF7F0] dark:bg-[#171F1B] text-[#1C2620] dark:text-[#F3EEE4] placeholder:text-[#6B7268] dark:placeholder:text-[#B3BDB3]/70 focus:outline-none focus:ring-2 focus:ring-[#2F5D50] dark:focus:ring-[#8DAE9B] transition-colors ${className}`}
    />
    {hint && <p className="mt-1.5 text-xs text-[#6B7268] dark:text-[#B3BDB3]">{hint}</p>}
  </div>
);

export const SearchField: React.FC<{
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
}> = ({ value, onChange, placeholder = 'Search...', className = '' }) => (
  <div className={`relative ${className}`}>
    <Search className="w-4 h-4 text-[#6B7268] dark:text-[#B3BDB3] absolute left-3 top-2.5 pointer-events-none" />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full h-9 pl-9 pr-3 text-xs rounded-lg border border-[#1C2620]/18 dark:border-[#F3EEE4]/18 bg-[#FAF7F0] dark:bg-[#171F1B] text-[#1C2620] dark:text-[#F3EEE4] placeholder:text-[#6B7268] dark:placeholder:text-[#B3BDB3]/70 focus:outline-none focus:ring-2 focus:ring-[#2F5D50] dark:focus:ring-[#8DAE9B]"
    />
  </div>
);

export const SelectField: React.FC<
  React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string }
> = ({ label, id, className = '', children, ...props }) => (
  <div>
    {label && (
      <label htmlFor={id} className="block text-xs font-medium text-[#1C2620] dark:text-[#F3EEE4] mb-1.5">
        {label}
      </label>
    )}
    <select
      id={id}
      {...props}
      className={`w-full h-10 px-3 text-xs sm:text-sm rounded-lg border border-[#1C2620]/18 dark:border-[#F3EEE4]/18 bg-[#FAF7F0] dark:bg-[#171F1B] text-[#1C2620] dark:text-[#F3EEE4] focus:outline-none focus:ring-2 focus:ring-[#2F5D50] dark:focus:ring-[#8DAE9B] ${className}`}
    >
      {children}
    </select>
  </div>
);

export const SegmentedTabs: React.FC<{
  items: Array<{ id: string; label: string }>;
  activeId: string;
  onChange: (id: string) => void;
}> = ({ items, activeId, onChange }) => (
  <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-lg bg-[#EBE4D5] dark:bg-[#202B25] border border-[#1C2620]/10 dark:border-[#F3EEE4]/10">
    {items.map((item) => {
      const active = item.id === activeId;
      return (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
            active
              ? 'bg-[#FAF7F0] dark:bg-[#26332C] text-[#1C2620] dark:text-[#F3EEE4] shadow-xs'
              : 'text-[#6B7268] dark:text-[#B3BDB3] hover:text-[#1C2620] dark:hover:text-[#F3EEE4]'
          }`}
        >
          {item.label}
        </button>
      );
    })}
  </div>
);

export const SeverityText: React.FC<{ severity: string }> = ({ severity }) => {
  const s = severity.toLowerCase();
  if (s === 'critical' || s === 'high') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold uppercase text-[#C4562F] dark:text-[#D47A59] whitespace-nowrap">
        <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
        <span>{s}</span>
      </span>
    );
  }
  if (s === 'medium') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold uppercase text-[#B9822A] dark:text-[#D7A44E] whitespace-nowrap">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        <span>{s}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-mono uppercase text-[#6B7268] dark:text-[#B3BDB3] whitespace-nowrap">
      <Info className="w-3.5 h-3.5 shrink-0" />
      <span>{s}</span>
    </span>
  );
};

export const StatusText: React.FC<{ status: string }> = ({ status }) => {
  const s = status.toLowerCase();
  if (s === 'completed' || s === 'consistent' || s === 'resolved') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-[#2F5D50] dark:text-[#8DAE9B] capitalize whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        <span>{s}</span>
      </span>
    );
  }
  if (s === 'failed' || s === 'potential_inconsistency') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-[#C4562F] dark:text-[#D47A59] capitalize whitespace-nowrap">
        <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
        <span>{s.replace(/_/g, ' ')}</span>
      </span>
    );
  }
  if (s === 'inconclusive' || s === 'running' || s === 'acknowledged') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-[#B9822A] dark:text-[#D7A44E] capitalize whitespace-nowrap">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        <span>{s}</span>
      </span>
    );
  }
  return <span className="text-xs text-[#6B7268] dark:text-[#B3BDB3] capitalize">{s}</span>;
};

export const ErrorBanner: React.FC<{ message: string; onDismiss?: () => void }> = ({
  message,
  onDismiss,
}) => (
  <div
    role="alert"
    className="p-3.5 rounded-lg bg-[#C4562F]/10 dark:bg-[#D47A59]/15 border border-[#C4562F]/30 dark:border-[#D47A59]/30 text-xs text-[#8C381B] dark:text-[#F4B49D] flex items-start justify-between gap-3"
  >
    <div className="flex items-start gap-2">
      <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
    {onDismiss && (
      <button type="button" onClick={onDismiss} aria-label="Dismiss error" className="shrink-0 opacity-70 hover:opacity-100">
        <X className="w-4 h-4" />
      </button>
    )}
  </div>
);

export const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}> = ({ icon, title, description, action }) => (
  <Card className="p-10 text-center">
    <div className="mx-auto w-fit text-[#6B7268] dark:text-[#B3BDB3]">{icon}</div>
    <h2 className="mt-3 text-lg font-semibold text-[#1C2620] dark:text-[#F3EEE4]">{title}</h2>
    <p className="mt-1.5 text-sm text-[#6B7268] dark:text-[#B3BDB3] max-w-md mx-auto">{description}</p>
    {action && <div className="mt-5 flex justify-center gap-3 flex-wrap">{action}</div>}
  </Card>
);

export const LoadingSkeleton: React.FC<{ rows?: number }> = ({ rows = 3 }) => (
  <div className="space-y-4">
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="h-24 rounded-xl bg-[#EBE4D5]/70 dark:bg-[#202B25] border border-[#1C2620]/10 dark:border-[#F3EEE4]/10 animate-pulse"
        />
      ))}
    </div>
    {Array.from({ length: rows }).map((_, i) => (
      <div
        key={i}
        className="h-20 rounded-xl bg-[#EBE4D5]/70 dark:bg-[#202B25] border border-[#1C2620]/10 dark:border-[#F3EEE4]/10 animate-pulse"
      />
    ))}
  </div>
);

export const ModalDialog: React.FC<{
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ open, title, onClose, children }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-[#171F1B]/60 backdrop-blur-[1px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 w-full max-w-2xl rounded-xl bg-[#FAF7F0] dark:bg-[#26332C] border border-[#1C2620]/15 dark:border-[#F3EEE4]/15 shadow-xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-[#1C2620]/12 dark:border-[#F3EEE4]/12 flex items-center justify-between">
          <h3 className="text-base font-semibold text-[#1C2620] dark:text-[#F3EEE4]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1 text-[#6B7268] dark:text-[#B3BDB3] hover:text-[#1C2620] dark:hover:text-[#F3EEE4]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 max-h-[75vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

export const ToastBanner: React.FC<{
  message: string | null;
  tone?: 'success' | 'error';
  onDismiss: () => void;
}> = ({ message, tone = 'success', onDismiss }) => {
  if (!message) return null;
  return (
    <div className="fixed bottom-5 right-5 z-50 max-w-sm">
      <div
        className={`px-4 py-3 rounded-lg border shadow-md flex items-center gap-2.5 text-xs font-medium ${
          tone === 'error'
            ? 'bg-[#FAF7F0] dark:bg-[#26332C] border-[#C4562F] text-[#C4562F] dark:text-[#D47A59]'
            : 'bg-[#FAF7F0] dark:bg-[#26332C] border-[#2F5D50] text-[#2F5D50] dark:text-[#8DAE9B]'
        }`}
      >
        {tone === 'error' ? <ShieldAlert className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
        <span>{message}</span>
        <button type="button" onClick={onDismiss} className="ml-2 opacity-70 hover:opacity-100" aria-label="Close notification">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export const ConsentBarChart: React.FC<{
  data: Array<{
    stateKey: string;
    label: string;
    totalRequests: number;
    trackerRequests: number;
    cookies: number;
  }>;
  title?: string;
  subtitle?: string;
}> = ({
  data,
  title = 'Website Activity by Visitor Choice',
  subtitle = 'Comparing total connections, tracking activity, and cookies across each consent choice',
}) => {
  const maxVal = Math.max(
    1,
    ...data.map((d) => Math.max(d.totalRequests, d.trackerRequests, d.cookies))
  );

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h3 className="text-base font-semibold text-[#1C2620] dark:text-[#F3EEE4]">{title}</h3>
          <p className="text-xs text-[#6B7268] dark:text-[#B3BDB3] mt-0.5">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-[#6B7268] dark:text-[#B3BDB3]">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#2F5D50] dark:bg-[#8DAE9B]" />
            Page Connections
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#C4562F] dark:bg-[#D47A59]" />
            Tracking Signals
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#B9822A] dark:bg-[#D7A44E]" />
            Cookies
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {data.map((row) => (
          <div key={row.stateKey} className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-medium text-[#1C2620] dark:text-[#F3EEE4]">{row.label}</span>
              <span className="font-mono tabular-nums text-[#6B7268] dark:text-[#B3BDB3]">
                {row.totalRequests} connections · {row.trackerRequests} tracking · {row.cookies} cookies
              </span>
            </div>
            <div className="space-y-1.5">
              <div className="h-2 rounded-full bg-[#EBE4D5] dark:bg-[#202B25] overflow-hidden">
                <div
                  className="h-full bg-[#2F5D50] dark:bg-[#8DAE9B] transition-all duration-300"
                  style={{ width: `${Math.round((row.totalRequests / maxVal) * 100)}%` }}
                />
              </div>
              <div className="h-2 rounded-full bg-[#EBE4D5] dark:bg-[#202B25] overflow-hidden">
                <div
                  className="h-full bg-[#C4562F] dark:bg-[#D47A59] transition-all duration-300"
                  style={{ width: `${Math.round((row.trackerRequests / maxVal) * 100)}%` }}
                />
              </div>
              <div className="h-2 rounded-full bg-[#EBE4D5] dark:bg-[#202B25] overflow-hidden">
                <div
                  className="h-full bg-[#B9822A] dark:bg-[#D7A44E] transition-all duration-300"
                  style={{ width: `${Math.round((row.cookies / maxVal) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};
