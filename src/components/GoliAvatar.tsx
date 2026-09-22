import Image from "next/image";

interface GoliAvatarProps {
  size?: number;
  className?: string;
  priority?: boolean;
}

export default function GoliAvatar({ size = 40, className = "", priority = false }: GoliAvatarProps) {
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-visible ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Image
        src="/mascotas/goli.png"
        alt=""
        width={size * 2}
        height={size * 2}
        priority={priority}
        className="h-full w-full max-w-none object-contain drop-shadow-[0_10px_10px_rgba(0,0,0,0.5)] [filter:drop-shadow(0_2px_1px_rgba(255,255,255,0.22))_drop-shadow(0_10px_9px_rgba(15,23,42,0.72))]"
      />
    </span>
  );
}
