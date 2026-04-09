import { Moon, Sun, Map } from "lucide-react";
import { LimelightNav, NavItem } from "./limelight-nav";

const navItems: NavItem[] = [
  { id: "dark", icon: <Moon />, label: "Dark" },
  { id: "light", icon: <Sun />, label: "Light" },
  { id: "voyager", icon: <Map />, label: "Voyager" },
];

export function LimelightNavDemo() {
  return <LimelightNav items={navItems} />;
}
