import { Keyboard, X } from "lucide-react";

export default function KeyboardShortcutsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      onClick={onClose}
    >
      <div className="mail-ribbon-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="mail-ribbon-modal-header">
          <h3 id="shortcuts-title">
            <Keyboard size={18} /> Keyboard shortcuts
          </h3>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog">
            <X size={16} />
          </button>
        </div>
        <div className="mail-ribbon-modal-body">
          <div className="shortcuts-grid">
            <div className="shortcut-group">
              <h4>Actions</h4>
              <div className="shortcut-row">
                <kbd>C</kbd>
                <span>Compose new email</span>
              </div>
              <div className="shortcut-row">
                <kbd>E</kbd>
                <span>Archive selected message</span>
              </div>
              <div className="shortcut-row">
                <kbd>#</kbd> / <kbd>Del</kbd>
                <span>Delete message to trash</span>
              </div>
              <div className="shortcut-row">
                <kbd>U</kbd>
                <span>Mark as read / unread</span>
              </div>
              <div className="shortcut-row">
                <kbd>S</kbd>
                <span>Star / Flag message</span>
              </div>
              <div className="shortcut-row">
                <kbd>R</kbd>
                <span>Reply</span>
              </div>
              <div className="shortcut-row">
                <kbd>A</kbd>
                <span>Reply All</span>
              </div>
              <div className="shortcut-row">
                <kbd>F</kbd>
                <span>Forward message</span>
              </div>
            </div>
            <div className="shortcut-group">
              <h4>Navigation</h4>
              <div className="shortcut-row">
                <kbd>/</kbd>
                <span>Focus search bar</span>
              </div>
              <div className="shortcut-row">
                <kbd>J</kbd> / <kbd>↓</kbd>
                <span>Next message in list</span>
              </div>
              <div className="shortcut-row">
                <kbd>K</kbd> / <kbd>↑</kbd>
                <span>Previous message</span>
              </div>
              <div className="shortcut-row">
                <kbd>Enter</kbd>
                <span>Open message detail</span>
              </div>
              <div className="shortcut-row">
                <kbd>G</kbd> then <kbd>I</kbd>
                <span>Go to Inbox</span>
              </div>
              <div className="shortcut-row">
                <kbd>G</kbd> then <kbd>S</kbd>
                <span>Go to Sent</span>
              </div>
              <div className="shortcut-row">
                <kbd>Esc</kbd>
                <span>Close dialog or pane</span>
              </div>
            </div>
          </div>
        </div>
        <div className="mail-ribbon-modal-footer">
          <button className="primary-button" type="button" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
