export default function BrandMark({ small = false, size }: { small?: boolean; size?: number }) {
  return (
    <span className={`brand-mark${small ? " small" : ""}`} style={size ? { width: size, height: size, display: "inline-flex", alignItems: "center" } : undefined}>
      <img src="/postveil-logo.svg" alt="Postveil" style={size ? { width: size, height: size } : undefined} />
    </span>
  );
}
