import React from "react";
import { ExternalLink } from "lucide-react";

export interface RibbonGroupProps {
  id: string;
  title: string;
  dialogLauncherId?: string;
  onLaunchDialog?: () => void;
  children: React.ReactNode;
}

export const RibbonGroup: React.FC<RibbonGroupProps> = ({
  id,
  title,
  dialogLauncherId,
  onLaunchDialog,
  children,
}) => {
  return (
    <div className="pdocs-ribbon-group" data-group-id={id}>
      <div className="pdocs-ribbon-group-content">{children}</div>
      <div className="pdocs-ribbon-group-title-row">
        <span className="pdocs-ribbon-group-title">{title}</span>
        {dialogLauncherId && onLaunchDialog && (
          <button
            type="button"
            className="pdocs-ribbon-dialog-launcher"
            title={`Open ${title} Settings`}
            onClick={(e) => {
              e.stopPropagation();
              onLaunchDialog();
            }}
          >
            <ExternalLink size={10} />
          </button>
        )}
      </div>
    </div>
  );
};
