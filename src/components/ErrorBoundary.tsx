import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error.message || 'حدث خطأ غير متوقع في التطبيق.',
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('App ErrorBoundary caught error:', error, errorInfo);
  }

  private handleReload = () => {
    this.setState({ hasError: false, errorMessage: '' });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      let friendlyMsg = 'حدث خطأ أثناء معالجة البيانات. يرجى المحاولة مرة أخرى.';
      if (this.state.errorMessage.includes('Quota exceeded')) {
        friendlyMsg = 'تم الوصول إلى الحد اليومي المجاني لقاعدة البيانات. سيتم إعادة تعيين الحصة غداً.';
      } else if (this.state.errorMessage.includes('Missing or insufficient permissions')) {
        friendlyMsg = 'ليست لديك الصلاحية الكافية لتنفيذ هذا الإجراء.';
      }

      return (
        <div
          dir="rtl"
          className="min-h-screen bg-[#0B0B0E] text-[#F5F2EB] flex items-center justify-center p-6"
        >
          <div className="max-w-md w-full bg-[#141419] border border-[#27272F] rounded-2xl p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto text-red-400">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold">تنبيه النظام</h2>
            <p className="text-sm text-[#A6A196] leading-relaxed">{friendlyMsg}</p>
            <button
              onClick={this.handleReload}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#D4A853] text-[#0B0B0E] font-semibold text-sm hover:bg-[#E0B96B] transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>إعادة تحميل المنصة</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
