import { cn } from "@/lib/utils";
import Image from "next/image";

export function Logo({ className, compact = false, size }: { className?: string; compact?: boolean; size?: number }) {
  const imgSize = size || (compact ? 40 : 50);
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Image 
        src="/logo.jpeg" 
        alt="Irman Trading Company Logo" 
        width={imgSize} 
        height={imgSize} 
        className="object-contain"
        priority
      />
      {!compact && (
        <div className="leading-tight">
          <div className="font-bold text-[#003882] text-lg tracking-wide">IRMAN</div>
          <div className="text-[10px] tracking-[0.2em] font-bold text-[#268a35] uppercase">
            Trading
          </div>
        </div>
      )}
    </div>
  );
}
