import { cloneElement, type ReactElement, useLayoutEffect, useRef, useState } from "react";

export type NavItem = {
  id: string | number;
  icon: ReactElement;
  label?: string;
  onClick?: () => void;
};

type LimelightNavProps = {
  items: NavItem[];
  defaultActiveIndex?: number;
  onTabChange?: (index: number) => void;
  className?: string;
  limelightClassName?: string;
  iconContainerClassName?: string;
  iconClassName?: string;
};

export const LimelightNav = ({
  items,
  defaultActiveIndex = 0,
  onTabChange,
  className,
  limelightClassName,
  iconContainerClassName,
  iconClassName,
}: LimelightNavProps) => {
  const [activeIndex, setActiveIndex] = useState(defaultActiveIndex);
  const [isReady, setIsReady] = useState(false);
  const navItemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const limelightRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (items.length === 0) return;

    const limelight = limelightRef.current;
    const activeItem = navItemRefs.current[activeIndex];

    if (limelight && activeItem) {
      const newLeft =
        activeItem.offsetLeft + activeItem.offsetWidth / 2 - limelight.offsetWidth / 2;
      limelight.style.left = `${newLeft}px`;

      if (!isReady) {
        window.setTimeout(() => setIsReady(true), 50);
      }
    }
  }, [activeIndex, isReady, items]);

  if (items.length === 0) {
    return null;
  }

  const handleItemClick = (index: number, itemOnClick?: () => void) => {
    setActiveIndex(index);
    onTabChange?.(index);
    itemOnClick?.();
  };

  return (
    <nav className={`limelight-nav ${className ?? ""}`}>
      {items.map(({ id, icon, label, onClick }, index) => (
        <button
          type="button"
          key={id}
          ref={(el) => {
            navItemRefs.current[index] = el;
          }}
          className={`limelight-item ${iconContainerClassName ?? ""}`}
          onClick={() => handleItemClick(index, onClick)}
          aria-label={label}
        >
          {cloneElement(icon, {
            className: `limelight-icon ${
              activeIndex === index ? "limelight-icon-active" : "limelight-icon-inactive"
            } ${icon.props.className ?? ""} ${iconClassName ?? ""}`,
          })}
        </button>
      ))}

      <div
        ref={limelightRef}
        className={`limelight-glow ${isReady ? "limelight-glow-ready" : ""} ${limelightClassName ?? ""}`}
        style={{ left: "-999px" }}
      >
        <div className="limelight-beam" />
      </div>
    </nav>
  );
};
