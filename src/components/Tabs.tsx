import Link from "next/link";

export type TabItem = {
  label: string;
  value: string;
  href: string;
};

export function Tabs({
  items,
  active,
  rightSlot,
}: {
  items: TabItem[];
  active: string;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div className="tabs-bar">
      <div className="tabs">
        {items.map((tab) => (
          <Link key={tab.value} href={tab.href} className={`tab ${active === tab.value ? "active" : ""}`}>
            {tab.label}
          </Link>
        ))}
      </div>
      {rightSlot && <div className="tabs-right-slot">{rightSlot}</div>}
    </div>
  );
}
