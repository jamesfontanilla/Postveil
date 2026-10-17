import { useState } from "react";
import { initials, avatarGradient } from "../lib/format";

export default function SenderAvatar({
  name,
  email,
  avatarUrl,
  large = false,
}: {
  name: string;
  email: string;
  avatarUrl?: string | null;
  large?: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <div
      className={`avatar ${large ? "large-avatar" : "row-avatar"} ${avatarUrl && !imageFailed ? "avatar-image" : ""}`}
      style={avatarUrl && !imageFailed ? undefined : avatarGradient(email)}
      aria-label={`${name} profile picture`}
    >
      {avatarUrl && !imageFailed ? (
        <img
          src={avatarUrl}
          alt=""
          width={large ? 37 : 29}
          height={large ? 37 : 29}
          onError={() => setImageFailed(true)}
        />
      ) : (
        initials(name || email)
      )}
    </div>
  );
}
