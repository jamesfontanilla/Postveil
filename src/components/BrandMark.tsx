export default function BrandMark({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand-mark${small ? " small" : ""}`}>
      <img src="/postveil-logo.svg" alt="Postveil" />
    </span>
  );
}
