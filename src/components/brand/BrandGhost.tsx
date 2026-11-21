import "@/styles/brand-ghost.css";

/** Ceyo's ghost mark in the version that stays visible on the current theme (dark or light). */
export function BrandGhost({ size = 40, className = "" }: { size?: number; className?: string }) {
  const src = size > 96 ? 512 : 192;
  return (
    <span className={`brand-ghost ${className}`} style={{ width: size, height: size }} aria-hidden>
      <img className="brand-ghost-dark" src={`/brand/ceyo-ghost-dark-${src}.png`} alt="" width={size} height={size} draggable={false} />
      <img className="brand-ghost-light" src={`/brand/ceyo-ghost-light-${src}.png`} alt="" width={size} height={size} draggable={false} />
    </span>
  );
}
