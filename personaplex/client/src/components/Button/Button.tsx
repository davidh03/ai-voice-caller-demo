import { FC } from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>; 
export const Button: FC<ButtonProps> = ({ children, className, ...props }) => {
  return (
    <button
      className={`rounded-xl shadow-sm disabled:opacity-50 disabled:cursor-not-allowed bg-[#3551F2] hover:bg-[#1a35d4] active:bg-[#0f25b0] text-white font-semibold py-2 px-4 transition-all ${className ?? ""}`}
      {...props}
    >
      {children}
    </button>
  );
};
