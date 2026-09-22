import Image from "next/image";

interface GoliAvatarProps {
  size?: number;
  className?: string;
  priority?: boolean;
}

export default function GoliAvatar({ size = 40, className = "", priority = false }: GoliAvatarProps) {
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-b from-sky-300/25 to-blue-700/25 ring-1 ring-white/15 ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Image
        src="/mascotas/goli.png"
        alt=""
        width={size * 2}
        height={size * 2}
        priority={priority}
        className="h-[118%] w-[118%] max-w-none object-contain object-top"
      />
    </span>
  );
}
