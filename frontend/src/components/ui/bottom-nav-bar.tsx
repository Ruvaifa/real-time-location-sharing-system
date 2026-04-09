"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "../../lib/utils";

const MOBILE_LABEL_WIDTH = 72;

export type NavItem = {
  id: string;
  label: string;
  icon: React.ElementType;
};

type BottomNavBarProps = {
  className?: string;
  items: NavItem[];
  defaultActiveIndex?: number;
  onTabChange?: (index: number) => void;
  stickyBottom?: boolean;
};

export function BottomNavBar({
  className,
  items,
  defaultActiveIndex = 0,
  onTabChange,
  stickyBottom = false,
}: BottomNavBarProps) {
  const [activeIndex, setActiveIndex] = useState(defaultActiveIndex);

  useEffect(() => {
    setActiveIndex(defaultActiveIndex);
  }, [defaultActiveIndex]);

  const handleTabClick = (index: number) => {
    setActiveIndex(index);
    if (onTabChange) {
      onTabChange(index);
    }
  };

  return (
    <motion.nav
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      role="navigation"
      aria-label="Bottom Navigation"
      className={cn(
        "bottom-nav-bar",
        stickyBottom && "bottom-nav-bar-sticky",
        className,
      )}
    >
      {items.map((item, idx) => {
        const Icon = item.icon;
        const isActive = activeIndex === idx;

        return (
          <motion.button
            key={item.id}
            whileTap={{ scale: 0.97 }}
            className={cn(
              "bottom-nav-button",
              isActive ? "bottom-nav-button-active" : "bottom-nav-button-inactive"
            )}
            onClick={() => handleTabClick(idx)}
            aria-label={item.label}
            type="button"
          >
            <Icon
              size={20}
              strokeWidth={2}
              aria-hidden
              style={{ transition: "color 0.2s" }}
            />

            <motion.div
              initial={false}
              animate={{
                width: isActive ? `${MOBILE_LABEL_WIDTH}px` : "0px",
                opacity: isActive ? 1 : 0,
                marginLeft: isActive ? "8px" : "0px",
              }}
              transition={{
                width: { type: "spring", stiffness: 350, damping: 32 },
                opacity: { duration: 0.19 },
                marginLeft: { duration: 0.19 },
              }}
              className="overflow-hidden flex items-center"
              style={{ overflow: "hidden", display: "flex", alignItems: "center" }}
            >
              <span
                className={cn(
                  "bottom-nav-label",
                  isActive ? "bottom-nav-label-active" : "bottom-nav-label-inactive"
                )}
                title={item.label}
              >
                {item.label}
              </span>
            </motion.div>
          </motion.button>
        );
      })}
    </motion.nav>
  );
}

export default BottomNavBar;