import { Cloud, ExternalLink, LogOut, Mail, RefreshCw, Save, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { CloudDocumentSummary } from "../cloud/supabase";

interface CloudDialogProps {
  configured: boolean;
  userEmail: string | null;
  documents: CloudDocumentSummary[];
  activeDocumentId: string | null;
  loading: boolean;
  onClose: () => void;
  onSendLogin: (email: string) => Promise<void>;
  onSignOut: () => Promise<void>;
  onSaveCurrent: () => Promise<void>;
  onOpenDocument: (id: string) => Promise<void>;
  onDeleteDocument: (id: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function CloudDialog({
  configured,
  userEmail,
  documents,
  activeDocumentId,
  loading,
  onClose,
  onSendLogin,
  onSignOut,
  onSaveCurrent,
  onOpenDocument,
  onDeleteDocument,
  onRefresh
}: CloudDialogProps) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 6000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const run = async (action: () => Promise<void>, successMessage = "") => {
    setBusy(true);
    setMessage("");
    try {
      await action();
      if (successMessage) setMessage(successMessage);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal-card cloud-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="云端文档"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">CLOUD WORKSPACE</p>
            <h2>云端文档</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </header>

        {!configured ? (
          <div className="cloud-empty">
            <Cloud size={28} />
            <h3>尚未配置 Supabase</h3>
            <p>需要设置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY 后才能启用云端文档。</p>
          </div>
        ) : !userEmail ? (
          <div className="cloud-login">
            <div className="cloud-login-icon"><Mail size={24} /></div>
            <h3>邮箱登录</h3>
            <p>输入邮箱后，Supabase 会发送一封登录邮件。点击邮件中的链接即可登录。</p>
            <div className="cloud-login-row">
              <input
                type="email"
                value={email}
                placeholder="you@example.com"
                onChange={(event) => setEmail(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && email.trim()) {
                    void run(async () => {
                      await onSendLogin(email.trim());
                      setMessage("登录链接已发送，请检查邮箱。");
                    });
                  }
                }}
              />
              <button
                type="button"
                className="primary-button"
                disabled={busy || !email.trim()}
                onClick={() =>
                  void run(async () => {
                    await onSendLogin(email.trim());
                    setMessage("登录链接已发送，请检查邮箱。");
                  })
                }
              >
                <Mail size={15} /> 发送登录链接
              </button>
            </div>
            <p className="cloud-help">首次使用会自动创建账号。</p>
          </div>
        ) : (
          <>
            <div className="cloud-account-bar">
              <div>
                <span className="cloud-account-label">已登录</span>
                <strong>{userEmail}</strong>
              </div>
              <button type="button" className="ghost-button" onClick={() => void run(onSignOut)} disabled={busy}>
                <LogOut size={14} /> 退出
              </button>
            </div>

            <div className="cloud-actions">
              <button type="button" className="primary-button" disabled={busy} onClick={() => void run(onSaveCurrent, "当前文档已同步到云端。")}>
                <Save size={15} /> {activeDocumentId ? "同步当前文档" : "保存当前文档"}
              </button>
              <button type="button" className="secondary-button" disabled={busy || loading} onClick={() => void run(onRefresh)}>
                <RefreshCw size={14} /> 刷新列表
              </button>
            </div>

            <div className="cloud-document-list">
              {loading ? <div className="cloud-empty-small">正在加载云端文档…</div> : null}
              {!loading && documents.length === 0 ? <div className="cloud-empty-small">还没有云端文档。</div> : null}
              {documents.map((document) => (
                <article className={`cloud-document-item${document.id === activeDocumentId ? " is-active" : ""}`} key={document.id}>
                  <button type="button" className="cloud-document-main" onClick={() => void run(() => onOpenDocument(document.id))}>
                    <span className="cloud-document-title">{document.title || "未命名文档"}</span>
                    <span className="cloud-document-time">{formatDate(document.updated_at)}</span>
                    {document.id === activeDocumentId ? <span className="cloud-active-badge">当前</span> : <ExternalLink size={13} />}
                  </button>
                  <button
                    type="button"
                    className="template-delete"
                    title="删除云端文档"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(`确定删除“${document.title || "未命名文档"}”吗？`)) {
                        void run(() => onDeleteDocument(document.id));
                      }
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </article>
              ))}
            </div>
          </>
        )}

        {message ? <div className="cloud-message">{message}</div> : null}
      </section>
    </div>
  );
}
